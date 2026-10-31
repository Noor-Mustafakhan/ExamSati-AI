-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 007: Scalable Question Ingestion & Draft/Approval Pipeline
-- Description: Adds idempotent batch ingestion RPCs, duplicate detection,
--              draft review & approval workflow functions, and metrics aggregation.
-- ====================================================================

-- 1. Ingest Single Question Item (Idempotent & Atomic with Answer Key)
CREATE OR REPLACE FUNCTION public.ingest_question_item(
  p_question JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_q_id UUID;
  v_existing_id UUID;
  v_subject_id UUID;
  v_exam_id UUID;
  v_syllabus_topic_id UUID;
  v_question_text TEXT;
  v_options JSONB;
  v_correct_opt INT;
  v_difficulty TEXT;
  v_origin TEXT;
  v_verification_status TEXT;
  v_explanation TEXT;
  v_source_title TEXT;
  v_source_url TEXT;
  v_source_page TEXT;
  v_is_published BOOLEAN;
  v_opt_count INT;
BEGIN
  -- Extract and sanitize question text
  v_question_text := trim(COALESCE(p_question->>'question_text', ''));
  IF length(v_question_text) < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', 'Question text must be at least 10 characters long'
    );
  END IF;

  -- Validate options array
  v_options := p_question->'options';
  IF v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', 'Options must be a JSON array of 4 choices'
    );
  END IF;

  v_opt_count := jsonb_array_length(v_options);
  IF v_opt_count <> 4 THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', format('Options array must have exactly 4 items, received %s', v_opt_count)
    );
  END IF;

  -- Validate correct_option
  IF p_question->>'correct_option' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', 'correct_option is required (integer 0 to 3)'
    );
  END IF;
  v_correct_opt := (p_question->>'correct_option')::INT;
  IF v_correct_opt < 0 OR v_correct_opt > 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', format('correct_option must be between 0 and 3, received %s', v_correct_opt)
    );
  END IF;

  -- Validate subject_id
  IF p_question->>'subject_id' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', 'subject_id UUID is required'
    );
  END IF;
  v_subject_id := (p_question->>'subject_id')::UUID;
  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = v_subject_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', format('Subject with ID %s not found in database', v_subject_id)
    );
  END IF;

  -- Optional foreign keys
  IF p_question->>'exam_id' IS NOT NULL THEN
    v_exam_id := (p_question->>'exam_id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = v_exam_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'invalid',
        'error', format('Exam with ID %s not found in database', v_exam_id)
      );
    END IF;
  ELSE
    v_exam_id := NULL;
  END IF;

  IF p_question->>'syllabus_topic_id' IS NOT NULL THEN
    v_syllabus_topic_id := (p_question->>'syllabus_topic_id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM public.syllabus_topics WHERE id = v_syllabus_topic_id) THEN
      v_syllabus_topic_id := NULL;
    END IF;
  ELSE
    v_syllabus_topic_id := NULL;
  END IF;

  -- Validate difficulty
  v_difficulty := COALESCE(p_question->>'difficulty', 'Moderate');
  IF v_difficulty NOT IN ('Easy', 'Moderate', 'Advanced') THEN
    v_difficulty := 'Moderate';
  END IF;

  -- Validate question origin and verification status
  v_origin := COALESCE(p_question->>'question_origin', 'ai_generated_practice');
  IF v_origin NOT IN ('official_paper', 'reviewed_question', 'community_submitted', 'ai_generated_practice') THEN
    v_origin := 'ai_generated_practice';
  END IF;

  v_verification_status := COALESCE(p_question->>'verification_status', 'practice_exercise');
  IF v_verification_status NOT IN ('official_past_paper', 'verified_citation', 'community_submitted', 'practice_exercise') THEN
    v_verification_status := 'practice_exercise';
  END IF;

  -- Extract explanation and source info
  v_explanation := trim(COALESCE(p_question->>'explanation', ''));
  IF length(v_explanation) < 5 THEN
    v_explanation := 'Comprehensive syllabus-aligned academic explanation.';
  END IF;

  v_source_title := COALESCE(p_question->>'source_title', 'Curriculum Practice Exercise');
  v_source_url := p_question->>'source_url';
  v_source_page := p_question->>'source_page';

  -- Default publication status: false for drafts / pending review
  v_is_published := COALESCE((p_question->>'is_published')::BOOLEAN, false);

  -- Duplicate Check: Check if an exact question already exists under this subject
  SELECT id INTO v_existing_id
  FROM public.questions
  WHERE subject_id = v_subject_id
    AND md5(lower(trim(question_text))) = md5(lower(v_question_text))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'duplicate',
      'question_id', v_existing_id,
      'message', 'Question already exists in question bank (deduplication hash match)'
    );
  END IF;

  -- Check by explicit ID if supplied
  IF p_question->>'id' IS NOT NULL THEN
    v_q_id := (p_question->>'id')::UUID;
    IF EXISTS (SELECT 1 FROM public.questions WHERE id = v_q_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'duplicate',
        'question_id', v_q_id,
        'message', 'Question with this UUID already exists'
      );
    END IF;
  ELSE
    v_q_id := gen_random_uuid();
  END IF;

  -- Atomic Insert into questions and private.answer_keys
  INSERT INTO public.questions (
    id, exam_id, subject_id, syllabus_topic_id, question_text, options,
    difficulty, question_origin, verification_status, explanation,
    source_title, source_url, source_page, is_published, created_at, updated_at
  ) VALUES (
    v_q_id, v_exam_id, v_subject_id, v_syllabus_topic_id, v_question_text, v_options,
    v_difficulty, v_origin, v_verification_status, v_explanation,
    v_source_title, v_source_url, v_source_page, v_is_published, timezone('utc', now()), timezone('utc', now())
  );

  INSERT INTO private.answer_keys (question_id, correct_option, created_at)
  VALUES (v_q_id, v_correct_opt, timezone('utc', now()))
  ON CONFLICT (question_id) DO UPDATE SET correct_option = v_correct_opt;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'inserted',
    'question_id', v_q_id,
    'is_published', v_is_published,
    'difficulty', v_difficulty
  );
END;
$$;

-- 2. Ingest Question Batch (JSON Array)
CREATE OR REPLACE FUNCTION public.ingest_question_batch(
  p_batch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_item JSONB;
  v_res JSONB;
  v_total INT := 0;
  v_inserted INT := 0;
  v_duplicates INT := 0;
  v_errors JSONB := '[]'::jsonb;
  v_inserted_ids JSONB := '[]'::jsonb;
BEGIN
  IF p_batch IS NULL OR jsonb_typeof(p_batch) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Batch input must be a JSON array of question objects'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_batch)
  LOOP
    v_total := v_total + 1;
    v_res := public.ingest_question_item(v_item);

    IF (v_res->>'success')::BOOLEAN = true THEN
      v_inserted := v_inserted + 1;
      v_inserted_ids := v_inserted_ids || jsonb_build_array(v_res->>'question_id');
    ELSIF v_res->>'status' = 'duplicate' THEN
      v_duplicates := v_duplicates + 1;
    ELSE
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'index', v_total - 1,
        'question_text', substr(COALESCE(v_item->>'question_text', ''), 1, 60),
        'error', v_res->>'error'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_processed', v_total,
    'inserted_count', v_inserted,
    'duplicate_count', v_duplicates,
    'error_count', jsonb_array_length(v_errors),
    'errors', v_errors,
    'inserted_ids', v_inserted_ids
  );
END;
$$;

-- 3. Review & Approve/Reject Question
CREATE OR REPLACE FUNCTION public.review_question(
  p_question_id UUID,
  p_decision TEXT, -- 'approve' or 'reject'
  p_verification_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_new_published BOOLEAN;
  v_new_status TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id = p_question_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Question with ID %s not found', p_question_id)
    );
  END IF;

  IF lower(p_decision) = 'approve' THEN
    v_new_published := true;
    v_new_status := COALESCE(p_verification_status, 'verified_citation');
  ELSIF lower(p_decision) = 'reject' THEN
    v_new_published := false;
    v_new_status := COALESCE(p_verification_status, 'community_submitted');
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision must be either "approve" or "reject"'
    );
  END IF;

  UPDATE public.questions
  SET
    is_published = v_new_published,
    verification_status = v_new_status,
    updated_at = timezone('utc', now())
  WHERE id = p_question_id;

  RETURN jsonb_build_object(
    'success', true,
    'question_id', p_question_id,
    'decision', p_decision,
    'is_published', v_new_published,
    'verification_status', v_new_status
  );
END;
$$;

-- 4. Aggregate Question Bank Metrics
CREATE OR REPLACE FUNCTION public.get_question_bank_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_total INT;
  v_published INT;
  v_pending INT;
  v_by_exam JSONB;
  v_by_difficulty JSONB;
  v_by_subject JSONB;
BEGIN
  SELECT count(*) INTO v_total FROM public.questions;
  SELECT count(*) INTO v_published FROM public.questions WHERE is_published = true;
  SELECT count(*) INTO v_pending FROM public.questions WHERE is_published = false;

  -- Breakdown by Exam
  SELECT jsonb_object_agg(COALESCE(e.slug, 'unassigned'), counts)
  INTO v_by_exam
  FROM (
    SELECT exam_id, jsonb_build_object(
      'total', count(*),
      'published', count(*) FILTER (WHERE is_published = true),
      'pending', count(*) FILTER (WHERE is_published = false)
    ) as counts
    FROM public.questions
    GROUP BY exam_id
  ) q
  LEFT JOIN public.exams e ON e.id = q.exam_id;

  -- Breakdown by Difficulty
  SELECT jsonb_object_agg(difficulty, count)
  INTO v_by_difficulty
  FROM (
    SELECT difficulty, count(*) as count
    FROM public.questions
    GROUP BY difficulty
  ) d;

  -- Breakdown by Subject
  SELECT jsonb_object_agg(COALESCE(s.name, 'unassigned'), counts)
  INTO v_by_subject
  FROM (
    SELECT subject_id, jsonb_build_object(
      'total', count(*),
      'published', count(*) FILTER (WHERE is_published = true),
      'pending', count(*) FILTER (WHERE is_published = false)
    ) as counts
    FROM public.questions
    GROUP BY subject_id
  ) qs
  LEFT JOIN public.subjects s ON s.id = qs.subject_id;

  RETURN jsonb_build_object(
    'total_questions', v_total,
    'published_count', v_published,
    'pending_count', v_pending,
    'by_exam', COALESCE(v_by_exam, '{}'::jsonb),
    'by_difficulty', COALESCE(v_by_difficulty, '{}'::jsonb),
    'by_subject', COALESCE(v_by_subject, '{}'::jsonb)
  );
END;
$$;

-- 5. Retrieve Pending Questions for Review (Bypasses public RLS filter safely via RPC)
CREATE OR REPLACE FUNCTION public.get_pending_questions(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT jsonb_agg(row_to_json(q))
  INTO v_res
  FROM (
    SELECT
      q.id,
      q.question_text,
      q.options,
      q.difficulty,
      q.question_origin,
      q.verification_status,
      q.explanation,
      q.source_title,
      q.source_url,
      q.is_published,
      q.created_at,
      s.name as subject_name,
      e.title as exam_title,
      e.slug as exam_slug,
      t.topic_title
    FROM public.questions q
    LEFT JOIN public.subjects s ON s.id = q.subject_id
    LEFT JOIN public.exams e ON e.id = q.exam_id
    LEFT JOIN public.syllabus_topics t ON t.id = q.syllabus_topic_id
    WHERE q.is_published = false
    ORDER BY q.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- 6. Revoke and Grant Permissions
REVOKE ALL ON FUNCTION public.ingest_question_item(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_question_item(JSONB) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.ingest_question_batch(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_question_batch(JSONB) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.review_question(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_question(UUID, TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_question_bank_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_question_bank_metrics() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_pending_questions(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_questions(INT, INT) TO anon, authenticated;
