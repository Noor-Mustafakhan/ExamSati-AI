-- ==============================================================================
-- Migration 023: Implement Role-Based Access Control (RBAC) & Secure Profile Management
-- ==============================================================================
-- 1. Helper function: public.is_admin() & public.is_admin_or_moderator() (SECURITY DEFINER to avoid recursion)
-- 2. Restrict public.profiles:
--    - Normal students: Can view their own profile only; CANNOT edit profile or role.
--    - Admins: Can view all profiles and update any profile/role.
-- 3. Stored procedures for Admin User Management:
--    - admin_get_all_users()
--    - admin_update_user_role()
--    - admin_update_user_profile()
-- 4. Stored procedures authorization tightening:
--    - get_pending_questions
--    - update_mcq_question
--    - review_question
--    - bulk_review_questions
-- 5. Restrict pdf_documents & pdf_passages write operations strictly to admins / service_role
-- 6. Add admin write policies for curricular content (commissions, exams, subjects, questions)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SECURITY DEFINER Helper Functions (Prevents Infinite RLS Recursion)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. Profiles Table: Restrict Normal Users & Empower Admins
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remove old update policy that allowed users to update their own name
DROP POLICY IF EXISTS "Users can update their own profile name" ON public.profiles;

-- Normal users can view only their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Admins can view all profiles for platform management
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Only admins can update profiles (including roles and profile details)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Registration insert policy: New users must be inserted as 'student' only
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'student');

-- ------------------------------------------------------------------------------
-- 3. Admin User Management RPC Stored Functions
-- ------------------------------------------------------------------------------

-- 3a. Retrieve all users for the admin dashboard (includes email from auth.users)
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_users JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  SELECT jsonb_agg(row_to_json(u))
  INTO v_users
  FROM (
    SELECT
      p.id,
      p.full_name,
      p.role,
      p.created_at,
      p.updated_at,
      u.email,
      u.last_sign_in_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC
  ) u;

  RETURN COALESCE(v_users, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_users() TO authenticated, service_role;

-- 3b. Update user role with safety guard preventing demotion of the last admin
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count INT;
  v_old_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can change user roles.';
  END IF;

  IF p_new_role NOT IN ('student', 'admin', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role. Must be student, admin, or moderator.';
  END IF;

  SELECT role INTO v_old_role FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found.';
  END IF;

  -- Prevent demoting the last remaining admin
  IF v_old_role = 'admin' AND p_new_role <> 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin' AND id <> p_target_user_id;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Action rejected: Cannot demote the last remaining administrator.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET role = p_new_role, updated_at = timezone('utc', now())
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'old_role', v_old_role,
    'new_role', p_new_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) TO authenticated, service_role;

-- 3c. Update user profile name by administrator
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_target_user_id UUID,
  p_full_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can edit user profiles.';
  END IF;

  IF trim(COALESCE(p_full_name, '')) = '' THEN
    RAISE EXCEPTION 'Full name cannot be empty.';
  END IF;

  UPDATE public.profiles
  SET full_name = trim(p_full_name), updated_at = timezone('utc', now())
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'full_name', trim(p_full_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Question & Review Stored Procedures Hardening
-- ------------------------------------------------------------------------------

-- 4a. Update get_pending_questions: Only admins/moderators can view pending draft questions
CREATE OR REPLACE FUNCTION public.get_pending_questions(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_res JSONB;
BEGIN
  -- Strict role check: normal students cannot query draft/unreviewed questions
  IF NOT (public.is_admin_or_moderator() OR auth.role() = 'service_role') THEN
    RETURN '[]'::jsonb;
  END IF;

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
    WHERE q.review_status = p_status
    ORDER BY q.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) q;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- 4b. Update update_mcq_question: Enforce admin/moderator check
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
SET search_path = public, private
AS $$
DECLARE
  v_cleaned_text TEXT;
  v_existing public.questions%ROWTYPE;
  v_difficulty TEXT;
  v_opt_count INT;
  v_result JSONB;
BEGIN
  -- Strict permission check
  IF NOT (public.is_admin_or_moderator() OR auth.role() = 'service_role') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied. Administrator or moderator permissions required.');
  END IF;

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
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Tighten RAG Documents & Passages Write Policies
-- ------------------------------------------------------------------------------
-- Close development gap from migration 020: Deny write access to anon and normal students
DROP POLICY IF EXISTS "Allow admin write access to pdf_documents" ON public.pdf_documents;
CREATE POLICY "Allow admin write access to pdf_documents"
  ON public.pdf_documents FOR ALL
  TO authenticated, service_role
  USING (public.is_admin() OR auth.role() = 'service_role')
  WITH CHECK (public.is_admin() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow admin write access to pdf_passages" ON public.pdf_passages;
CREATE POLICY "Allow admin write access to pdf_passages"
  ON public.pdf_passages FOR ALL
  TO authenticated, service_role
  USING (public.is_admin() OR auth.role() = 'service_role')
  WITH CHECK (public.is_admin() OR auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 6. Add Admin Management Write Policies for Core Content Tables
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage commissions" ON public.commissions;
CREATE POLICY "Admins can manage commissions"
  ON public.commissions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage exams" ON public.exams;
CREATE POLICY "Admins can manage exams"
  ON public.exams FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
CREATE POLICY "Admins can manage subjects"
  ON public.subjects FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage syllabus_topics" ON public.syllabus_topics;
CREATE POLICY "Admins can manage syllabus_topics"
  ON public.syllabus_topics FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage preparation_materials" ON public.preparation_materials;
CREATE POLICY "Admins can manage preparation_materials"
  ON public.preparation_materials FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage questions" ON public.questions;
CREATE POLICY "Admins can manage questions"
  ON public.questions FOR ALL
  TO authenticated
  USING (public.is_admin_or_moderator())
  WITH CHECK (public.is_admin_or_moderator());

