-- ==============================================================================
-- Migration 018: Grant Admin Role to Project Administrators
-- ==============================================================================
-- Ensures that designated project administrators have the 'admin' role in
-- public.profiles so that review_question and other administrative operations
-- succeed without authorization errors.
-- ==============================================================================

UPDATE public.profiles
SET role = 'admin', updated_at = timezone('utc', now())
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'noormustafa20001@gmail.com'
);
