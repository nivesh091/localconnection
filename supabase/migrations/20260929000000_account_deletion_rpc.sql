-- ============================================================================
-- KAAMMITRA: COMPLETE USER ACCOUNT DELETION RPC (Admin Security Definer)
-- Project: hhvxanktvbncyeedzzdf
-- Admin: niveshkumar1230@gmail.com
-- ============================================================================

-- 1. Ensure private mobile storage table exists with strict RLS (matches 20261002000000_security_hardening.sql)
CREATE TABLE IF NOT EXISTS public.user_private_mobile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_private_mobile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own private mobile" ON public.user_private_mobile;
CREATE POLICY "Users read own private mobile" ON public.user_private_mobile
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users update own private mobile" ON public.user_private_mobile;
CREATE POLICY "Users update own private mobile" ON public.user_private_mobile
  FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- 2. Privileged Account Deletion Function
CREATE OR REPLACE FUNCTION public.delete_user_by_admin(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
  v_target_email TEXT;
  v_admin_uuid CONSTANT UUID := '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72'::uuid;
BEGIN
  -- 1. Security Check: Caller must be authenticated admin
  -- Accepts caller if authenticated via Admin Email, Admin UUID, or public.is_admin()
  v_caller_id := auth.uid();
  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_caller_id IS NULL OR (
    v_caller_id <> v_admin_uuid 
    AND v_caller_email <> 'niveshkumar1230@gmail.com'
    AND NOT public.is_admin()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only admin can delete users');
  END IF;

  -- 2. Safety Check: Never delete the admin account
  IF target_user_id = v_admin_uuid OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = target_user_id AND lower(email) = 'niveshkumar1230@gmail.com'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot delete admin account');
  END IF;

  -- 3. Delete dependent application records
  -- Note: User-owned storage files across buckets are cleaned up via official Supabase Storage API
  -- Direct deletion from storage.objects is prohibited by Supabase triggers.
  DELETE FROM public.worker_media WHERE worker_user_id = target_user_id;
  DELETE FROM public.worker_profiles WHERE user_id = target_user_id;
  DELETE FROM public.locations WHERE user_id = target_user_id;
  DELETE FROM public.help_requests WHERE user_id = target_user_id;
  DELETE FROM public.worker_requests WHERE user_id = target_user_id;
  DELETE FROM public.admin_communication_status WHERE user_id = target_user_id;
  DELETE FROM public.admin_communication WHERE recipient_id = target_user_id;
  DELETE FROM public.message_deletions WHERE user_id = target_user_id;
  DELETE FROM public.message_media WHERE sender_id = target_user_id;
  DELETE FROM public.messages WHERE sender_id = target_user_id;
  DELETE FROM public.conversations WHERE user_1_id = target_user_id OR user_2_id = target_user_id;

  -- Resilient deletion: handle user_private_mobile safely whether table exists or not
  IF to_regclass('public.user_private_mobile') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_private_mobile WHERE user_id = $1' USING target_user_id;
  END IF;

  DELETE FROM public.profiles WHERE id = target_user_id;

  -- 4. Delete from Supabase Auth identities, sessions, and users (Eliminates Supabase Auth identity completely)
  SELECT email INTO v_target_email FROM auth.users WHERE id = target_user_id;
  DELETE FROM auth.identities WHERE user_id = target_user_id OR (v_target_email IS NOT NULL AND identity_data->>'email' = v_target_email);
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_by_admin(UUID) TO authenticated;
