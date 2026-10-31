-- ==============================================================================
-- Migration 015: Deep MCQ Quality Cleanup & Extended Sanitization
-- ==============================================================================
-- 1. Creates a safety backup table: public.questions_backup_015.
-- 2. Enhances clean_question_text to strip fake case numbers, random numeric IDs,
--    benchmark/variant timestamps, test prefixes, and trailing reference tokens.
-- 3. Enhances is_fabricated_or_malformed_question to catch synthetic notice templates,
--    formulaic question stems, and statutory fallback templates.
-- 4. Deletes fabricated, synthetic, and nonsensical template questions across all statuses.
-- 5. Sanitizes remaining question text using clean_question_text.
-- 6. Deduplicates remaining records while preserving canonical approved rows.
-- ==============================================================================

-- 1. Safety Backup Table
DROP TABLE IF EXISTS public.questions_backup_015;
CREATE TABLE public.questions_backup_015 AS
SELECT * FROM public.questions;

-- 2. Enhanced clean_question_text function
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

  -- ── Test/debug prefixes ──
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

  -- ── Strip fake FPSC-style case numbers ──
  v_res := regexp_replace(v_res, '^\s*F\.\s*(?:No\.?\s*)?[\d]+-[\d]+/[\d]{4}(?:-[A-Z]+)?\s*[,;:\.\-]*\s*', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(?\s*F\.\s*(?:No\.?\s*)?[\d]+-[\d]+/[\d]{4}(?:-[A-Z]+)?\s*\)?\s*$', '', 'i');

  -- ── Strip benchmark and variant timestamps (e.g. "under benchmark 1792852456662?", "variant 1792852425602?") ──
  v_res := regexp_replace(v_res, '\s*(?:under\s+)?benchmark\s+\d{8,}\s*(\?|$)', '\1', 'i');
  v_res := regexp_replace(v_res, '\s*variant\s+\d{8,}\s*(\?|$)', '\1', 'i');

  -- ── Strip random standalone numeric ID strings ──
  v_res := regexp_replace(v_res, '^\s*Q[-_]?\d{3,}\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^\s*ID\s*:\s*[a-f0-9-]{6,}\s*:\s*', '', 'i');

  -- ── Trailing reference tags ──
  v_res := regexp_replace(v_res, '\s*\(Ref:\s*[\d\w\s-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(Notice Ref:\s*[\d\w\s-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\[Ref:\s*[\d\w\s-]+\]\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(Case\s+No\.?\s*[\d\w/-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(Notification\s+No\.?\s*[\d\w/-]+\)\s*$', '', 'i');

  RETURN trim(v_res);
END;
$$;

-- 3. Enhanced is_fabricated_or_malformed_question function
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

  -- Template fallback questions with "Regarding <Topic>, which principle applies to <Concept>?"
  IF p_text ~* '^Regarding\s+.+,\s+which\s+principle\s+applies\s+to\s+' THEN
    RETURN TRUE;
  END IF;

  -- Document ingestion template "Under the curriculum syllabus for..."
  IF p_text ~* '^Under the curriculum syllabus for\s+"' THEN
    RETURN TRUE;
  END IF;

  -- Formulaic "which standard applies to X?" (< 80 chars)
  IF p_text ~* 'which\s+standard\s+applies\s+to\s+\w+\s*\?' AND length(trim(p_text)) < 80 THEN
    RETURN TRUE;
  END IF;

  -- Fake FPSC case number combined with fake official notice
  IF p_text ~* 'F\.\s*(?:No\.?\s*)?\d+-\d+/\d{4}-[A-Z]+' AND p_text ~* 'official\s+(?:syllabus|notice|notification|gazette)' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 4. Permanently remove all fabricated, synthetic, and nonsensical template questions
DELETE FROM public.questions
WHERE public.is_fabricated_or_malformed_question(question_text)
   OR options::text ~* 'statutory mandate|discretionary procedure|administrative advisory';

-- 5. Delete rows that would collide with an existing question upon cleaning
DELETE FROM public.questions q
WHERE public.clean_question_text(q.question_text) <> q.question_text
  AND EXISTS (
    SELECT 1 FROM public.questions existing
    WHERE existing.id <> q.id
      AND existing.subject_id = q.subject_id
      AND md5(lower(trim(existing.question_text))) = md5(lower(trim(public.clean_question_text(q.question_text))))
  );

-- 6. Clean remaining canonical questions (strip benchmark timestamps, fake case numbers, etc.)
UPDATE public.questions
SET
  question_text = public.clean_question_text(question_text),
  updated_at = timezone('utc', now())
WHERE public.clean_question_text(question_text) <> question_text;

-- 6. Deduplicate remaining questions: keep canonical row, remove duplicates
WITH ranked AS (
  SELECT
    id,
    subject_id,
    ROW_NUMBER() OVER (
      PARTITION BY subject_id, md5(lower(trim(question_text)))
      ORDER BY
        (review_status = 'approved') DESC,
        (is_published = true) DESC,
        created_at ASC
    ) AS rn
  FROM public.questions
),
dupes AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.questions
WHERE id IN (SELECT id FROM dupes);
