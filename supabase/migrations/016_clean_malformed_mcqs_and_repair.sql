-- ==============================================================================
-- Migration 016: Comprehensive MCQ Database Repair, Deduplication & Sanitization
-- ==============================================================================
-- 1. Creates a safety backup table: public.questions_backup_016.
-- 2. Enhanced clean_question_text function (HTML decoding, architecture token stripping,
--    benchmark/variant timestamps, test prefixes, punctuation repair).
-- 3. Enhanced is_fabricated_or_malformed_question function (rejects unanchored page refs,
--    fake case notice outlines, statutory fallback options).
-- 4. Creates delete_test_question helper RPC so regression tests clean up test records.
-- 5. Repairs and deduplicates specific identified malformed questions:
--    - Inverted page tables questions (repaired & deduplicated to 1 canonical row)
--    - Microkernel test questions (repaired & deduplicated to 1 canonical row)
--    - Flags/rejects unanchored "Based on page 8..." and fake case outline questions.
-- 6. Sanitizes remaining question text and deduplicates across all subjects.
-- ==============================================================================

-- 1. Safety Backup Table
DROP TABLE IF EXISTS public.questions_backup_016;
CREATE TABLE public.questions_backup_016 AS
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

  -- ── HTML extraction artifacts ──
  v_res := replace(v_res, '&#x20;', ' ');
  v_res := replace(v_res, '&#32;', ' ');
  v_res := replace(v_res, '&nbsp;', ' ');
  v_res := replace(v_res, '&#160;', ' ');
  v_res := replace(v_res, '&quot;', '"');
  v_res := replace(v_res, '&#34;', '"');
  v_res := replace(v_res, '&apos;', '''');
  v_res := replace(v_res, '&#39;', '''');
  v_res := replace(v_res, '&amp;', '&');

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

  -- ── Strip random generated architecture tokens ──
  v_res := regexp_replace(v_res, 'Under\s+virtual\s+memory\s+architecture\s+[a-z0-9]{8,14}\s*,?\s*', 'In virtual memory architecture, ', 'i');
  v_res := regexp_replace(v_res, '^Under\s+virtual\s+memory\s+architecture\s*,?\s*', 'In virtual memory architecture, ', 'i');

  -- ── Strip random test subsystem tokens ──
  v_res := regexp_replace(v_res, '\s+subsystem\s+[a-z0-9]{8,14}\s*(\?|$)', '?\1', 'i');

  -- ── Strip random standalone numeric ID strings ──
  v_res := regexp_replace(v_res, '^\s*Q[-_]?\d{3,}\s*:\s*', '', 'i');
  v_res := regexp_replace(v_res, '^\s*ID\s*:\s*[a-f0-9-]{6,}\s*:\s*', '', 'i');

  -- ── Trailing reference tags ──
  v_res := regexp_replace(v_res, '\s*\(Ref:\s*[\d\w\s-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(Notice Ref:\s*[\d\w\s-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\[Ref:\s*[\d\w\s-]+\]\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(Case\s+No\.?\s*[\d\w/-]+\)\s*$', '', 'i');
  v_res := regexp_replace(v_res, '\s*\(Notification\s+No\.?\s*[\d\w/-]+\)\s*$', '', 'i');

  -- Clean multiple spaces
  v_res := regexp_replace(v_res, '\s+', ' ', 'g');
  v_res := regexp_replace(v_res, '\s+\?', '?', 'g');

  -- Ensure ending question mark for questions starting with Interrogative words
  IF v_res ~* '^(what|which|why|how|where|when|in\s+virtual\s+memory)' AND NOT v_res ~ '[?]$' THEN
    v_res := v_res || '?';
  END IF;

  RETURN trim(v_res);
END;
$$;

-- 3. Enhanced is_fabricated_or_malformed_question
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

  -- Fake FPSC case number combined with fake official notice / guidelines
  IF p_text ~* 'F\.\s*(?:No\.?\s*)?\d+-\d+/\d{4}-[A-Z]+' AND p_text ~* '(official\s+(?:syllabus|notice|notification|gazette)|as\s+outlined\s+in)' THEN
    RETURN TRUE;
  END IF;

  -- Unanchored page references like "Based on page 8..."
  IF p_text ~* '^Based on page\s+\d+,' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 4. Helper function: delete_test_question (allows automated tests to delete temporary test questions)
CREATE OR REPLACE FUNCTION public.delete_test_question(p_question_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.questions WHERE id = p_question_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_test_question(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_test_question(UUID) TO anon, authenticated;

-- 5. Specific Question Repairs and Deduplications

-- 5a. Deduplicate Inverted Page Table Questions (retain 08a4b47c-154f-4ecd-aa86-235e928d1d71, delete duplicates)
DELETE FROM public.questions
WHERE id IN (
  '32a7394f-75ee-4f23-9522-40123fef965f',
  '2787221c-7e4a-448e-9e03-8b1aa6fe4c00'
);

UPDATE public.questions
SET
  question_text = 'In virtual memory architecture, what is the purpose of inverted page tables?',
  updated_at = timezone('utc', now())
WHERE id = '08a4b47c-154f-4ecd-aa86-235e928d1d71';

-- 5b. Deduplicate Microkernel subsystem test questions (retain 947f061e-16a3-4f84-a874-36dfb387d2db, delete duplicate)
DELETE FROM public.questions
WHERE id = 'd829d798-c593-4da8-84b3-d00ec807c25b';

UPDATE public.questions
SET
  question_text = 'What is the primary role of an operating system microkernel?',
  updated_at = timezone('utc', now())
WHERE id = '947f061e-16a3-4f84-a874-36dfb387d2db';

-- 5c. Flag / Reject irreparably unanchored or fabricated questions so they cannot enter approval queue
UPDATE public.questions
SET
  review_status = 'rejected',
  is_published = false,
  verification_status = 'community_submitted',
  updated_at = timezone('utc', now())
WHERE id IN (
  '45cf5c6f-297d-4416-bf49-8ed78a519bf7', -- Fake case outline with bogus options
  'c7960841-5d04-4749-97b4-608ba6e17945'  -- "Based on page 8..." incomplete context
);

-- Also reject any question meeting is_fabricated_or_malformed_question
UPDATE public.questions
SET
  review_status = 'rejected',
  is_published = false,
  verification_status = 'community_submitted',
  updated_at = timezone('utc', now())
WHERE public.is_fabricated_or_malformed_question(question_text)
  AND review_status <> 'rejected';

-- 6. Clean all remaining questions
-- First delete any question that would collide upon cleaning
DELETE FROM public.questions q
WHERE public.clean_question_text(q.question_text) <> q.question_text
  AND EXISTS (
    SELECT 1 FROM public.questions existing
    WHERE existing.id <> q.id
      AND existing.subject_id = q.subject_id
      AND md5(lower(trim(existing.question_text))) = md5(lower(trim(public.clean_question_text(q.question_text))))
  );

-- Update all remaining questions
UPDATE public.questions
SET
  question_text = public.clean_question_text(question_text),
  updated_at = timezone('utc', now())
WHERE public.clean_question_text(question_text) <> question_text;

-- 7. Global Deduplication: Retain highest-priority canonical row, delete duplicates
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
