-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 001: Initial Core Schema & Tables
-- ====================================================================

-- 1. Create a dedicated private schema for sensitive answer keys
CREATE SCHEMA IF NOT EXISTS private;

-- Restrict direct access to private schema from anon and authenticated roles
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- 2. User Profiles Table
-- Linked directly to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin', 'moderator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Index for profile lookup
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 3. Commissions Table
CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  province TEXT NOT NULL,
  description TEXT,
  official_website TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. Exams Table
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL REFERENCES public.commissions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  department TEXT,
  category TEXT NOT NULL,
  scale TEXT NOT NULL DEFAULT 'BS-16',
  format TEXT NOT NULL DEFAULT 'One-Paper MCQ Screening',
  negative_marking TEXT NOT NULL DEFAULT '0.25 marks penalty per incorrect attempt',
  description TEXT,
  content_status TEXT NOT NULL DEFAULT 'sample_outline' CHECK (content_status IN ('official_verified', 'sample_outline', 'draft')),
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_exams_commission ON public.exams(commission_id);
CREATE INDEX IF NOT EXISTS idx_exams_category ON public.exams(category);
CREATE INDEX IF NOT EXISTS idx_exams_published ON public.exams(is_published);

-- 5. Subjects Table
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 6. Syllabus Topics Table
CREATE TABLE IF NOT EXISTS public.syllabus_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.syllabus_topics(id) ON DELETE CASCADE,
  section_title TEXT NOT NULL, -- e.g. "Part-I: English (20 Marks)"
  topic_title TEXT NOT NULL,
  description TEXT,
  source_title TEXT,
  source_url TEXT,
  source_page TEXT,
  verification_status TEXT NOT NULL DEFAULT 'reviewed_syllabus' CHECK (verification_status IN ('official_gazette', 'reviewed_syllabus', 'sample_topic')),
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_syllabus_exam ON public.syllabus_topics(exam_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_subject ON public.syllabus_topics(subject_id);

-- 7. Preparation Materials Table
CREATE TABLE IF NOT EXISTS public.preparation_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  material_type TEXT NOT NULL CHECK (material_type IN ('syllabus_summary', 'compendium', 'timeline_sheet', 'guidelines')),
  external_url TEXT,
  source_information TEXT,
  verification_status TEXT NOT NULL DEFAULT 'academic_reference',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 8. Questions Table (PUBLIC READABLE - Omits correct_answer)
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  syllabus_topic_id UUID REFERENCES public.syllabus_topics(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of 4 text options ["Option A", "Option B", "Option C", "Option D"]
  difficulty TEXT NOT NULL DEFAULT 'Moderate' CHECK (difficulty IN ('Easy', 'Moderate', 'Advanced')),
  question_origin TEXT NOT NULL DEFAULT 'reviewed_question' CHECK (question_origin IN ('official_paper', 'reviewed_question', 'community_submitted', 'ai_generated_practice')),
  verification_status TEXT NOT NULL DEFAULT 'reviewed_question' CHECK (verification_status IN ('official_past_paper', 'verified_citation', 'community_submitted', 'practice_exercise')),
  explanation TEXT, -- Academic conceptual explanation (revealed after attempt or practice check)
  source_title TEXT,
  source_url TEXT,
  source_page TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON public.questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON public.questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_published ON public.questions(is_published);

-- 9. Protected Answer Keys Table (PRIVATE SCHEMA - NEVER ACCESSIBLE DIRECTLY BY CLIENTS)
CREATE TABLE IF NOT EXISTS private.answer_keys (
  question_id UUID PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  correct_option INT NOT NULL CHECK (correct_option BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 10. Mock Tests Table
CREATE TABLE IF NOT EXISTS public.mock_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 15 CHECK (duration_minutes > 0),
  total_questions INT NOT NULL DEFAULT 10 CHECK (total_questions > 0),
  negative_marking NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 11. Mock Test Questions Mapping Table
CREATE TABLE IF NOT EXISTS public.mock_test_questions (
  mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (mock_test_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_test_questions_order ON public.mock_test_questions(mock_test_id, question_order);

-- 12. Test Attempts Table
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mock_test_id UUID NOT NULL REFERENCES public.mock_tests(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
  total_questions INT NOT NULL DEFAULT 0,
  correct_answers INT NOT NULL DEFAULT 0,
  incorrect_answers INT NOT NULL DEFAULT 0,
  unanswered_questions INT NOT NULL DEFAULT 0,
  penalty_rate NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
  score NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  accuracy INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON public.test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_mock ON public.test_attempts(mock_test_id);

-- 13. Test Attempt Answers Table
CREATE TABLE IF NOT EXISTS public.test_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option INT CHECK (selected_option IS NULL OR selected_option BETWEEN 0 AND 3),
  is_marked_for_review BOOLEAN NOT NULL DEFAULT false,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (attempt_id, question_id) -- Prevent duplicate answers for the same question within an attempt
);

CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON public.test_attempt_answers(attempt_id);

-- 14. Saved Questions (Bookmarks) Table
CREATE TABLE IF NOT EXISTS public.saved_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, question_id) -- Prevent duplicate bookmarks for the same user
);

CREATE INDEX IF NOT EXISTS idx_saved_questions_user ON public.saved_questions(user_id);

-- 15. Saved Target Exams Table
CREATE TABLE IF NOT EXISTS public.saved_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_exams_user ON public.saved_exams(user_id);

-- 16. Question Feedback / Reporting Table
CREATE TABLE IF NOT EXISTS public.reported_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
