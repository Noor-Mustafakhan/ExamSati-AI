-- ====================================================================
-- ExamSathi AI — Stage 2 Database Schema Migration
-- Migration 002: Row Level Security (RLS) Policies
-- ====================================================================

-- 1. Enable RLS on all exposed tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reported_questions ENABLE ROW LEVEL SECURITY;

-- Note: private.answer_keys is in the private schema and revoked from anon/authenticated,
-- so direct client queries fail automatically.

-- --------------------------------------------------------------------
-- PROFILES POLICIES
-- --------------------------------------------------------------------
-- Anyone authenticated can view their own profile; public cannot view private student profiles.
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can insert their own profile with role='student'
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'student');

-- Users can update their own full_name, but CANNOT change their role
CREATE POLICY "Users can update their own profile name"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

-- --------------------------------------------------------------------
-- PUBLIC CURRICULUM & CONTENT POLICIES (Read-only for public/students)
-- --------------------------------------------------------------------
-- Commissions: Anyone can read active commissions
CREATE POLICY "Anyone can view active commissions"
  ON public.commissions
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Exams: Anyone can read published exams
CREATE POLICY "Anyone can view published exams"
  ON public.exams
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Subjects: Anyone can read subjects
CREATE POLICY "Anyone can view subjects"
  ON public.subjects
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Syllabus Topics: Anyone can read syllabus topics for published exams
CREATE POLICY "Anyone can view syllabus topics"
  ON public.syllabus_topics
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id AND e.is_published = true
    )
  );

-- Preparation Materials: Anyone can read published materials
CREATE POLICY "Anyone can view published preparation materials"
  ON public.preparation_materials
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Questions: Anyone can read published questions (options and text only, answers not stored here)
CREATE POLICY "Anyone can view published questions"
  ON public.questions
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Mock Tests: Anyone can read published mock tests
CREATE POLICY "Anyone can view published mock tests"
  ON public.mock_tests
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

-- Mock Test Questions Mapping: Anyone can read mapping for published mock tests
CREATE POLICY "Anyone can view mock test questions"
  ON public.mock_test_questions
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mock_tests mt
      WHERE mt.id = mock_test_id AND mt.is_published = true
    )
  );

-- --------------------------------------------------------------------
-- STUDENT PRIVATE DATA POLICIES
-- --------------------------------------------------------------------
-- Test Attempts:
-- Students can only view their own test attempts
CREATE POLICY "Students can view their own test attempts"
  ON public.test_attempts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Students can create an in-progress attempt for themselves
CREATE POLICY "Students can start their own test attempt"
  ON public.test_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'in_progress');

-- Students cannot directly update final score or status through client UPDATE.
-- All scoring and status updates are handled via the secure RPC function.

-- Test Attempt Answers:
-- Students can view answers belonging to their own attempts
CREATE POLICY "Students can view answers for their own attempts"
  ON public.test_attempt_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.test_attempts ta
      WHERE ta.id = attempt_id AND ta.user_id = auth.uid()
    )
  );

-- Students can insert answers into their own in-progress attempts
CREATE POLICY "Students can record answers in their own in-progress attempt"
  ON public.test_attempt_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.test_attempts ta
      WHERE ta.id = attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
    )
  );

-- Students can update their selected_option and is_marked_for_review while attempt is in progress
CREATE POLICY "Students can modify answers in their own in-progress attempt"
  ON public.test_attempt_answers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.test_attempts ta
      WHERE ta.id = attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.test_attempts ta
      WHERE ta.id = attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
    )
  );

-- Saved Questions (Bookmarks):
-- Students can only view, create, and delete their own bookmarks
CREATE POLICY "Students can view their own bookmarks"
  ON public.saved_questions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Students can create their own bookmarks"
  ON public.saved_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can remove their own bookmarks"
  ON public.saved_questions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Saved Exams:
CREATE POLICY "Students can view their saved exams"
  ON public.saved_exams
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Students can save exams"
  ON public.saved_exams
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can remove saved exams"
  ON public.saved_exams
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Question Reports:
CREATE POLICY "Students can submit question reports"
  ON public.reported_questions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Students can view their own reports"
  ON public.reported_questions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
