-- ==============================================================================
-- Migration 014: Clean and Sanitize MCQ Question Bank & Enforce Academic Standards
-- ==============================================================================
-- 1. Creates a safety backup table before modifying existing question data.
-- 2. Defines immutable helper functions: clean_question_text and is_fabricated_or_malformed_question.
-- 3. Sanitizes existing questions by stripping accidental test prefixes and internal references.
-- 4. Unpublishes and rejects fabricated syllabus notice questions.
-- 5. Handles deduplication of repeated test questions with unique timestamps.
-- 6. Enhances ingest_question_item to sanitize all future incoming questions.
-- ==============================================================================

-- 1. Safety Backup Table
CREATE TABLE IF NOT EXISTS public.questions_backup_before_cleanup AS
SELECT * FROM public.questions;

-- 2. Helper Function: Clean Question Text
CREATE OR REPLACE FUNCTION public.clean_question_text(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_res TEXT := trim(p_text);
BEGIN
  IF v_res IS NULL OR v_res = '' THEN
    RETURN '';
  END IF;

  -- Strip targeted test prefixes
  v_res := regexp_replace(v_res, '^Test\s+Review\s+Flow\s+Candidate\s*\[[^\]]+\]\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Test\s+Candidate\s*\[[^\]]+\]\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Candidate\s*\[[^\]]+\]\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Automated\s+Bulk\s+Import\s+E2E\s+Test\s+Question(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Bulk\s+Import\s+E2E\s+Test\s+Question(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Test\s+Stage\s+\d+\s+Automated\s+Ingestion(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Test\s+Stage\s+\d+(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Test\s+Automated\s+Ingestion(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Test\s+Ingestion(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Idempotent\s+Test\s+Question(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^Automated\s+Ingestion\s+Test(\s+\d+)?\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^(DEBUG|TEST|FIXTURE|SAMPLE_TEST)\s*:\s*', '', 'i');

  -- Strip trailing internal reference/notice tags
  v_res := regexp_replace(v_res, '\s*\(Ref:\s*[\d\w\s-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(Notice Ref:\s*[\d\w\s-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\[Ref:\s*[\d\w\s-]+\]\s*$', '', 'i');

  RETURN trim(v_res);
END;
$$;

-- 3. Helper Function: Detect Fabricated or Malformed Questions
CREATE OR REPLACE FUNCTION public.is_fabricated_or_malformed_question(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) < 15 THEN
    RETURN TRUE;
  END IF;

  -- Synthetic syllabus notice template check
  IF p_text ~* 'According to official syllabus notice regarding.*which standard applies to' THEN
    RETURN TRUE;
  END IF;

  -- Dangling colon before question mark check
  IF p_text ~* '\m(applies to|standard for)\s+[A-Za-z]+:\s*\?' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 4. Flag and unpublish all fabricated or malformed questions
UPDATE public.questions
SET 
  review_status = 'rejected',
  is_published = false,
  verification_status = 'community_submitted',
  updated_at = timezone('utc', now())
WHERE public.is_fabricated_or_malformed_question(question_text);

-- 5. Deduplicate duplicate test run questions before cleaning
-- Keeps the canonical row (preferring approved status, then oldest created_at)
WITH ranked_questions AS (
  SELECT 
    id,
    subject_id,
    ROW_NUMBER() OVER (
      PARTITION BY subject_id, md5(lower(public.clean_question_text(question_text)))
      ORDER BY (review_status = 'approved') DESC, created_at ASC
    ) AS rn
  FROM public.questions
  WHERE NOT public.is_fabricated_or_malformed_question(question_text)
    AND public.clean_question_text(question_text) <> ''
),
duplicates_to_remove AS (
  SELECT id FROM ranked_questions WHERE rn > 1
)
DELETE FROM public.questions
WHERE id IN (SELECT id FROM duplicates_to_remove);

-- 6. Clean Existing Canonical Questions (Preserving review_status, publication, options, and metadata)
UPDATE public.questions
SET 
  question_text = public.clean_question_text(question_text),
  updated_at = timezone('utc', now())
WHERE 
  NOT public.is_fabricated_or_malformed_question(question_text)
  AND public.clean_question_text(question_text) <> question_text;

-- 7. Enhance Ingestion RPC to sanitize future incoming questions automatically
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
  v_exam_id UUID;
  v_subject_id UUID;
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
  v_review_status TEXT;
  v_existing_id UUID;
  v_opt_count INT;
BEGIN
  IF p_question IS NULL OR jsonb_typeof(p_question) <> 'object' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', 'Item payload must be a JSON object'
    );
  END IF;

  -- Sanitize question text
  v_question_text := public.clean_question_text(COALESCE(p_question->>'question_text', ''));
  
  -- Reject malformed or fabricated questions
  IF public.is_fabricated_or_malformed_question(v_question_text) THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid',
      'error', 'Question contains synthetic notice template, internal test labels, or is malformed.'
    );
  END IF;

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
  v_review_status := CASE WHEN v_is_published THEN 'approved' ELSE 'pending' END;

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
    difficulty, question_origin, verification_status, review_status, explanation,
    source_title, source_url, source_page, is_published, created_at, updated_at
  ) VALUES (
    v_q_id, v_exam_id, v_subject_id, v_syllabus_topic_id, v_question_text, v_options,
    v_difficulty, v_origin, v_verification_status, v_review_status, v_explanation,
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
    'review_status', v_review_status,
    'difficulty', v_difficulty
  );
END;
$$;
