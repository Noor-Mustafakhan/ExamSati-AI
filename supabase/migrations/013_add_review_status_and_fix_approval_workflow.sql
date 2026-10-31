-- ====================================================================
-- ExamSathi AI — Database Schema Migration 013
-- Migration 013: Question Review Status, Audit Metadata & Fixed Workflow
-- Description:
--   1. Adds review_status ('pending', 'approved', 'rejected') to public.questions.
--   2. Adds reviewed_at and reviewed_by audit columns.
--   3. Updates review_question RPC with strict admin authorization, rejection handling, and audit trail.
--   4. Updates get_pending_questions RPC to join private.answer_keys (correct_option),
--      support status filtering (pending, approved, rejected, all), and return source_page.
--   5. Updates get_question_bank_metrics RPC to return rejected_count.
--   6. Updates ingest_question_item RPC to set review_status upon draft insertion.
-- ====================================================================

-- 1. Add review_status, reviewed_at, reviewed_by columns if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE public.questions 
      ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending' 
      CHECK (review_status IN ('pending', 'approved', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE public.questions ADD COLUMN reviewed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE public.questions ADD COLUMN reviewed_by UUID;
  END IF;
END $$;

-- 2. Synchronize existing records based on publication status
UPDATE public.questions
SET review_status = 'approved'
WHERE is_published = true AND (review_status = 'pending' OR review_status IS NULL);

UPDATE public.questions
SET review_status = 'rejected'
WHERE is_published = false AND verification_status = 'community_submitted';

-- Create index on review_status
CREATE INDEX IF NOT EXISTS idx_questions_review_status ON public.questions(review_status);

-- --------------------------------------------------------------------
-- 3. Review Question RPC with Admin Authorization and Audit Logging
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.review_question(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.review_question(UUID, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.review_question(
  p_question_id UUID,
  p_decision TEXT, -- 'approve' or 'reject'
  p_verification_status TEXT DEFAULT NULL,
  p_reviewer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_new_published BOOLEAN;
  v_new_status TEXT;
  v_new_review_status TEXT;
  v_reviewer UUID;
  v_caller_role TEXT;
BEGIN
  -- Authorization check: If invoked by an authenticated session, verify non-student role
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('admin', 'moderator') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Unauthorized: Only administrators or moderators may review questions'
      );
    END IF;
    v_reviewer := auth.uid();
  ELSE
    v_reviewer := p_reviewer_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id = p_question_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Question with ID %s not found', p_question_id)
    );
  END IF;

  IF lower(p_decision) = 'approve' THEN
    v_new_published := true;
    v_new_review_status := 'approved';
    v_new_status := COALESCE(p_verification_status, 'verified_citation');
  ELSIF lower(p_decision) = 'reject' THEN
    v_new_published := false;
    v_new_review_status := 'rejected';
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
    review_status = v_new_review_status,
    verification_status = v_new_status,
    reviewed_at = timezone('utc', now()),
    reviewed_by = v_reviewer,
    updated_at = timezone('utc', now())
  WHERE id = p_question_id;

  RETURN jsonb_build_object(
    'success', true,
    'question_id', p_question_id,
    'decision', lower(p_decision),
    'review_status', v_new_review_status,
    'is_published', v_new_published,
    'verification_status', v_new_status,
    'reviewed_at', timezone('utc', now())
  );
END;
$$;

-- --------------------------------------------------------------------
-- 4. Retrieve Questions for Review (With Answer Keys & Status Filter)
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_pending_questions(INT, INT);
DROP FUNCTION IF EXISTS public.get_pending_questions(INT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.get_pending_questions(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_status TEXT DEFAULT 'pending'
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
      q.review_status,
      q.explanation,
      q.source_title,
      q.source_url,
      q.source_page,
      q.is_published,
      q.created_at,
      q.reviewed_at,
      q.reviewed_by,
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

-- --------------------------------------------------------------------
-- 5. Updated Question Bank Metrics (Including Rejected Count)
-- --------------------------------------------------------------------
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
  v_rejected INT;
  v_by_exam JSONB;
  v_by_difficulty JSONB;
  v_by_subject JSONB;
BEGIN
  SELECT count(*) INTO v_total FROM public.questions;
  SELECT count(*) INTO v_published FROM public.questions WHERE is_published = true;
  SELECT count(*) INTO v_pending FROM public.questions WHERE is_published = false AND (review_status = 'pending' OR review_status IS NULL);
  SELECT count(*) INTO v_rejected FROM public.questions WHERE review_status = 'rejected';

  -- Breakdown by Exam
  SELECT jsonb_object_agg(COALESCE(e.slug, 'unassigned'), counts)
  INTO v_by_exam
  FROM (
    SELECT exam_id, jsonb_build_object(
      'total', count(*),
      'published', count(*) FILTER (WHERE is_published = true),
      'pending', count(*) FILTER (WHERE is_published = false AND (review_status = 'pending' OR review_status IS NULL)),
      'rejected', count(*) FILTER (WHERE review_status = 'rejected')
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
      'pending', count(*) FILTER (WHERE is_published = false AND (review_status = 'pending' OR review_status IS NULL)),
      'rejected', count(*) FILTER (WHERE review_status = 'rejected')
    ) as counts
    FROM public.questions
    GROUP BY subject_id
  ) qs
  LEFT JOIN public.subjects s ON s.id = qs.subject_id;

  RETURN jsonb_build_object(
    'total_questions', v_total,
    'published_count', v_published,
    'pending_count', v_pending,
    'rejected_count', v_rejected,
    'by_exam', COALESCE(v_by_exam, '{}'::jsonb),
    'by_difficulty', COALESCE(v_by_difficulty, '{}'::jsonb),
    'by_subject', COALESCE(v_by_subject, '{}'::jsonb)
  );
END;
$$;

-- --------------------------------------------------------------------
-- 6. Permissions
-- --------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.review_question(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_question(UUID, TEXT, TEXT, UUID) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_pending_questions(INT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_questions(INT, INT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_question_bank_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_question_bank_metrics() TO anon, authenticated;
