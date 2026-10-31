-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 010: Clean Syllabus Hierarchy & Topic Grouping
-- Description: Removes redundant placeholder topics from migration 003,
--              normalizes section titles for clean presentation, and updates
--              get_exam_syllabus_breakdown RPC for clean user-friendly grouping.
-- ====================================================================

-- 1. Remove 6 obsolete placeholder topics from migration 003 (which have 0 questions)
DELETE FROM public.syllabus_topics
WHERE id IN (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000003',
  'd1000000-0000-0000-0000-000000000004',
  'd1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008'
);

-- 2. Normalize section titles in syllabus_topics for clean, consistent grouping
-- Assistant Director FIA
UPDATE public.syllabus_topics
SET section_title = 'Part-II: Professional Investigation (80 Marks)'
WHERE id IN (
  'd1000000-0000-0003-0000-000000000001',
  'd1000000-0000-0003-0000-000000000002'
);

UPDATE public.syllabus_topics
SET section_title = 'Part-II: General Intelligence (80 Marks)'
WHERE id IN (
  'd1000000-0000-0003-0000-000000000003',
  'd1000000-0000-0003-0000-000000000005',
  'd1000000-0000-0003-0000-000000000006'
);

UPDATE public.syllabus_topics
SET section_title = 'Part-I: English (20 Marks)'
WHERE id = 'd1000000-0000-0003-0000-000000000004';

-- Inspector Customs / Intelligence Officer
UPDATE public.syllabus_topics
SET section_title = 'Part-II: Professional Customs Law (80 Marks)'
WHERE id IN (
  'd1000000-0000-0001-0000-000000000001',
  'd1000000-0000-0001-0000-000000000002'
);

UPDATE public.syllabus_topics
SET section_title = 'Part-II: General Intelligence (80 Marks)'
WHERE id IN (
  'd1000000-0000-0001-0000-000000000003',
  'd1000000-0000-0001-0000-000000000005',
  'd1000000-0000-0001-0000-000000000006',
  'd1000000-0000-0001-0000-000000000007'
);

UPDATE public.syllabus_topics
SET section_title = 'Part-I: English (20 Marks)'
WHERE id = 'd1000000-0000-0001-0000-000000000004';

-- 3. Update get_exam_syllabus_breakdown RPC for clean, user-friendly grouping
CREATE OR REPLACE FUNCTION public.get_exam_syllabus_breakdown(
  p_exam_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_exam RECORD;
  v_result JSONB;
BEGIN
  -- Fetch exam blueprint
  SELECT id, slug, title, scale, department, format, negative_marking, description
  INTO v_exam
  FROM public.exams
  WHERE slug = p_exam_slug
    AND is_published = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Examination outline not found');
  END IF;

  SELECT jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'slug', v_exam.slug,
      'title', v_exam.title,
      'scale', v_exam.scale,
      'department', v_exam.department,
      'format', v_exam.format,
      'negative_marking', v_exam.negative_marking,
      'description', v_exam.description
    ),
    'sections', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'section_title', sec.section_title,
          'subject_name', sec.subject_name,
          'subject_slug', sec.subject_slug,
          'topics', sec.topics
        ) ORDER BY sec.min_display_order
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM (
    SELECT
      t.section_title,
      s.name as subject_name,
      s.slug as subject_slug,
      min(t.display_order) as min_display_order,
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'topic_title', t.topic_title,
          'description', t.description,
          'source_title', t.source_title,
          'display_order', t.display_order,
          'question_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.is_published = true
          ),
          'easy_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.difficulty = 'Easy'
              AND q.is_published = true
          ),
          'moderate_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.difficulty = 'Moderate'
              AND q.is_published = true
          ),
          'advanced_count', (
            SELECT count(*)
            FROM public.questions q
            WHERE q.syllabus_topic_id = t.id
              AND q.difficulty = 'Advanced'
              AND q.is_published = true
          )
        ) ORDER BY t.display_order
      ) as topics
    FROM public.syllabus_topics t
    JOIN public.subjects s ON s.id = t.subject_id
    WHERE t.exam_id = v_exam.id
    GROUP BY t.section_title, s.name, s.slug
  ) sec;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_exam_syllabus_breakdown(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_syllabus_breakdown(TEXT) TO anon, authenticated;
