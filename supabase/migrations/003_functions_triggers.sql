-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 003: Functions, Triggers & Secure Answer Verification
-- ====================================================================

-- 1. Automatic Profile Creation Trigger on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Student Candidate'),
    'student'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Secure RPC: Verify Single Question Answer (For MCQ Practice)
-- This function allows checking a chosen answer WITHOUT exposing the full answer key table
CREATE OR REPLACE FUNCTION public.check_mcq_answer(
  p_question_id UUID,
  p_selected_option INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_correct_opt INT;
  v_explanation TEXT;
  v_source_title TEXT;
  v_is_correct BOOLEAN;
BEGIN
  -- Validate question existence and publication
  SELECT explanation, source_title
  INTO v_explanation, v_source_title
  FROM public.questions
  WHERE id = p_question_id AND is_published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found or not published';
  END IF;

  -- Query protected answer key from private schema
  SELECT correct_option
  INTO v_correct_opt
  FROM private.answer_keys
  WHERE question_id = p_question_id;

  v_is_correct := (p_selected_option = v_correct_opt);

  RETURN jsonb_build_object(
    'question_id', p_question_id,
    'is_correct', v_is_correct,
    'correct_option', v_correct_opt,
    'explanation', v_explanation,
    'source_title', v_source_title
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_mcq_answer(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_mcq_answer(UUID, INT) TO anon, authenticated;

-- 3. Secure RPC: Submit & Score Mock Test
-- Performs server-side scoring using private answer keys, enforces attempt ownership,
-- prevents duplicate submissions, and persists final score.
CREATE OR REPLACE FUNCTION public.submit_mock_test_attempt(
  p_attempt_id UUID,
  p_answers JSONB -- Array of objects: [{"question_id": "...", "selected_option": 0, "is_marked_for_review": false}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_user_id UUID;
  v_mock_test_id UUID;
  v_status TEXT;
  v_negative_marking NUMERIC(4, 2);
  v_total_questions INT;
  v_correct_count INT := 0;
  v_incorrect_count INT := 0;
  v_unanswered_count INT := 0;
  v_raw_score NUMERIC(6, 2);
  v_final_score NUMERIC(6, 2);
  v_accuracy INT := 0;
  v_item JSONB;
  v_q_id UUID;
  v_sel_opt INT;
  v_marked_review BOOLEAN;
  v_correct_opt INT;
  v_is_corr BOOLEAN;
BEGIN
  -- Authenticate caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit test attempt';
  END IF;

  -- Validate attempt ownership and status
  SELECT ta.user_id, ta.mock_test_id, ta.status, mt.negative_marking, mt.total_questions
  INTO v_user_id, v_mock_test_id, v_status, v_negative_marking, v_total_questions
  FROM public.test_attempts ta
  JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
  WHERE ta.id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test attempt not found';
  END IF;

  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this test attempt';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Test attempt has already been submitted or finalized';
  END IF;

  -- Process answers submitted in the payload
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    v_q_id := (v_item->>'question_id')::UUID;
    v_sel_opt := CASE WHEN v_item->>'selected_option' IS NOT NULL THEN (v_item->>'selected_option')::INT ELSE NULL END;
    v_marked_review := COALESCE((v_item->>'is_marked_for_review')::BOOLEAN, false);

    -- Fetch protected answer key
    SELECT correct_option INTO v_correct_opt
    FROM private.answer_keys
    WHERE question_id = v_q_id;

    IF v_sel_opt IS NULL THEN
      v_unanswered_count := v_unanswered_count + 1;
      v_is_corr := NULL;
    ELSIF v_sel_opt = v_correct_opt THEN
      v_correct_count := v_correct_count + 1;
      v_is_corr := true;
    ELSE
      v_incorrect_count := v_incorrect_count + 1;
      v_is_corr := false;
    END IF;

    -- Upsert into test_attempt_answers
    INSERT INTO public.test_attempt_answers (
      attempt_id, question_id, selected_option, is_marked_for_review, is_correct
    )
    VALUES (
      p_attempt_id, v_q_id, v_sel_opt, v_marked_review, v_is_corr
    )
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      selected_option = EXCLUDED.selected_option,
      is_marked_for_review = EXCLUDED.is_marked_for_review,
      is_correct = EXCLUDED.is_correct;
  END LOOP;

  -- If payload had fewer items than total, account for rest as unanswered
  IF (v_correct_count + v_incorrect_count + v_unanswered_count) < v_total_questions THEN
    v_unanswered_count := v_total_questions - (v_correct_count + v_incorrect_count);
  END IF;

  -- Calculate score: Correct - (Incorrect * penalty)
  v_raw_score := (v_correct_count * 1.0) - (v_incorrect_count * v_negative_marking);
  v_final_score := GREATEST(0.00, v_raw_score);

  IF (v_correct_count + v_incorrect_count) > 0 THEN
    v_accuracy := ROUND((v_correct_count::NUMERIC / (v_correct_count + v_incorrect_count)::NUMERIC) * 100);
  ELSE
    v_accuracy := 0;
  END IF;

  -- Finalize attempt
  UPDATE public.test_attempts
  SET
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    total_questions = v_total_questions,
    correct_answers = v_correct_count,
    incorrect_answers = v_incorrect_count,
    unanswered_questions = v_unanswered_count,
    penalty_rate = v_negative_marking,
    score = v_final_score,
    accuracy = v_accuracy
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'submitted',
    'total_questions', v_total_questions,
    'correct_count', v_correct_count,
    'incorrect_count', v_incorrect_count,
    'unanswered_count', v_unanswered_count,
    'score', v_final_score,
    'total_marks', v_total_questions,
    'accuracy', v_accuracy,
    'penalty_rate', v_negative_marking,
    'submitted_at', timezone('utc', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_mock_test_attempt(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mock_test_attempt(UUID, JSONB) TO authenticated;
