-- ==============================================================================
-- Migration 017: Add update_mcq_question RPC & Enhance get_pending_questions
-- ==============================================================================
-- 1. Updates get_pending_questions to return subject_id, syllabus_topic_id, exam_id.
-- 2. Creates atomic update_mcq_question RPC to update questions and answer_keys
--    while preserving review_status, is_published, question ID, and other metadata.
-- ==============================================================================

-- 1. Update get_pending_questions RPC
CREATE OR REPLACE FUNCTION public.get_pending_questions(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
      q.review_status,
      q.explanation,
      q.source_title,
      q.source_url,
      q.source_page,
      q.is_published,
      q.created_at,
      q.reviewed_at,
      q.reviewed_by,
      q.updated_at,
      q.subject_id,
      q.syllabus_topic_id,
      q.exam_id,
      ak.correct_option,
      s.name as subject_name,
      e.title as exam_title,
      e.slug as exam_slug,
      t.topic_title
    FROM public.questions q
    LEFT JOIN private.answer_keys ak ON ak.question_id = q.id
    LEFT JOIN public.subjects s ON s.id = q.subject_id
    LEFT JOIN public.exams e ON e.id = q.exam_id
    LEFT JOIN public.syllabus_topics t ON t.id = q.syllabus_topic_id
    WHERE (
      CASE 
        WHEN lower(p_status) = 'pending' THEN
          (q.is_published = false AND (q.review_status = 'pending' OR q.review_status IS NULL))
        WHEN lower(p_status) = 'approved' THEN
          (q.is_published = true AND q.review_status = 'approved')
        WHEN lower(p_status) = 'rejected' THEN
          (q.review_status = 'rejected')
        ELSE
          true
      END
    )
    ORDER BY 
      CASE WHEN lower(p_status) = 'pending' THEN q.created_at END DESC,
      CASE WHEN lower(p_status) <> 'pending' THEN COALESCE(q.reviewed_at, q.updated_at) END DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_questions TO anon, authenticated, service_role;

-- 2. Create update_mcq_question RPC
CREATE OR REPLACE FUNCTION public.update_mcq_question(
  p_question_id UUID,
  p_question_text TEXT,
  p_options JSONB,
  p_correct_option INT,
  p_explanation TEXT,
  p_subject_id UUID DEFAULT NULL,
  p_syllabus_topic_id UUID DEFAULT NULL,
  p_difficulty TEXT DEFAULT 'Moderate',
  p_source_title TEXT DEFAULT NULL,
  p_source_page TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cleaned_text TEXT;
  v_existing public.questions%ROWTYPE;
  v_difficulty TEXT;
  v_opt_count INT;
  v_result JSONB;
BEGIN
  -- 1. Check if question exists
  SELECT * INTO v_existing FROM public.questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Question not found in database.');
  END IF;

  -- 2. Clean and validate question text
  v_cleaned_text := public.clean_question_text(p_question_text);
  IF length(v_cleaned_text) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Question text must be at least 10 characters long.');
  END IF;

  -- 3. Validate options (must be JSON array of exactly 4 non-empty strings)
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Options must be a valid list of 4 choices.');
  END IF;

  v_opt_count := jsonb_array_length(p_options);
  IF v_opt_count <> 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Question must have exactly 4 options.');
  END IF;

  FOR i IN 0..3 LOOP
    IF trim(COALESCE(p_options->>i, '')) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'All 4 options (A, B, C, D) must contain non-empty text.');
    END IF;
  END LOOP;

  -- 4. Validate correct_option (must be 0, 1, 2, or 3)
  IF p_correct_option IS NULL OR p_correct_option < 0 OR p_correct_option > 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Exactly one valid correct option (A, B, C, or D) must be selected.');
  END IF;

  -- 5. Validate explanation
  IF trim(COALESCE(p_explanation, '')) = '' OR length(trim(p_explanation)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A conceptual explanation of at least 5 characters is required.');
  END IF;

  -- 6. Validate and normalize difficulty
  v_difficulty := initcap(lower(trim(COALESCE(p_difficulty, 'Moderate'))));
  IF v_difficulty NOT IN ('Easy', 'Moderate', 'Advanced') THEN
    v_difficulty := 'Moderate';
  END IF;

  -- 7. Update public.questions (preserving review_status and is_published)
  UPDATE public.questions
  SET
    question_text = v_cleaned_text,
    options = p_options,
    explanation = trim(p_explanation),
    subject_id = COALESCE(p_subject_id, subject_id),
    syllabus_topic_id = p_syllabus_topic_id,
    difficulty = v_difficulty,
    source_title = COALESCE(p_source_title, source_title),
    source_page = p_source_page,
    updated_at = NOW()
  WHERE id = p_question_id;

  -- 8. Upsert into private.answer_keys
  INSERT INTO private.answer_keys (question_id, correct_option, created_at)
  VALUES (p_question_id, p_correct_option, NOW())
  ON CONFLICT (question_id)
  DO UPDATE SET correct_option = EXCLUDED.correct_option;

  -- 9. Retrieve and return the updated question with joined relationships
  SELECT jsonb_build_object(
    'success', true,
    'question', (
      SELECT row_to_json(q_res) FROM (
        SELECT
          q.id,
          q.question_text,
          q.options,
          q.difficulty,
          q.question_origin,
          q.verification_status,
          q.review_status,
          q.explanation,
          q.source_title,
          q.source_url,
          q.source_page,
          q.is_published,
          q.created_at,
          q.reviewed_at,
          q.reviewed_by,
          q.updated_at,
          q.subject_id,
          q.syllabus_topic_id,
          q.exam_id,
          ak.correct_option,
          s.name as subject_name,
          e.title as exam_title,
          e.slug as exam_slug,
          t.topic_title
        FROM public.questions q
        LEFT JOIN private.answer_keys ak ON ak.question_id = q.id
        LEFT JOIN public.subjects s ON s.id = q.subject_id
        LEFT JOIN public.exams e ON e.id = q.exam_id
        LEFT JOIN public.syllabus_topics t ON t.id = q.syllabus_topic_id
        WHERE q.id = p_question_id
      ) q_res
    )
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A question with identical or nearly identical text already exists in this subject.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_mcq_question TO anon, authenticated, service_role;
