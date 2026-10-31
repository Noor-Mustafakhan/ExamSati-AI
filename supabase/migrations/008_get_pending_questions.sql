-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 008: Administrative RPC for Retrieving Draft Pending Questions
-- ====================================================================

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
      q.source_page,
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

REVOKE ALL ON FUNCTION public.get_pending_questions(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_questions(INT, INT) TO anon, authenticated;
