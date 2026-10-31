-- ==============================================================================
-- Migration 019: Add bulk_review_questions RPC for Instant Batch Approvals
-- ==============================================================================
-- Enables administrators to approve (or reject) multiple questions or all
-- pending questions in a single atomic transaction.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.bulk_review_questions(
  p_question_ids UUID[] DEFAULT NULL,
  p_decision TEXT DEFAULT 'approve',
  p_verification_status TEXT DEFAULT NULL,
  p_reviewer_id UUID DEFAULT NULL,
  p_all_pending BOOLEAN DEFAULT FALSE
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
  v_affected_count INT := 0;
BEGIN
  -- 1. Authorization check
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

  -- 2. Validate parameters
  IF NOT p_all_pending AND (p_question_ids IS NULL OR array_length(p_question_ids, 1) = 0) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No question IDs provided and p_all_pending is false'
    );
  END IF;

  -- 3. Determine status updates
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

  -- 4. Execute atomic update
  IF p_all_pending THEN
    UPDATE public.questions
    SET
      is_published = v_new_published,
      review_status = v_new_review_status,
      verification_status = v_new_status,
      reviewed_at = timezone('utc', now()),
      reviewed_by = v_reviewer,
      updated_at = timezone('utc', now())
    WHERE is_published = false AND (review_status = 'pending' OR review_status IS NULL);

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  ELSE
    UPDATE public.questions
    SET
      is_published = v_new_published,
      review_status = v_new_review_status,
      verification_status = v_new_status,
      reviewed_at = timezone('utc', now()),
      reviewed_by = v_reviewer,
      updated_at = timezone('utc', now())
    WHERE id = ANY(p_question_ids);

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'affected_count', v_affected_count,
    'decision', lower(p_decision),
    'review_status', v_new_review_status,
    'is_published', v_new_published,
    'verification_status', v_new_status,
    'reviewed_at', timezone('utc', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_review_questions(UUID[], TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_review_questions(UUID[], TEXT, TEXT, UUID, BOOLEAN) TO anon, authenticated, service_role;
