-- ============================================================================
-- KAAMMITRA: PROVIDER ACTIVATION, FLEXIBLE PRICING & MOBILE PRIVACY MIGRATION
-- Project: hhvxanktvbncyeedzzdf
-- Admin: niveshkumar1230@gmail.com
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FEATURE 1: Service Provider Activate / Deactivate by Admin
-- Adds is_active column to worker_profiles (defaults to true for all existing providers)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.worker_profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_worker_profiles_active ON public.worker_profiles(is_active);

-- Security: RPC for Admin to Activate / Deactivate a Service Provider
CREATE OR REPLACE FUNCTION public.set_worker_activation_by_admin(
  target_user_id UUID,
  new_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
  v_admin_uuid CONSTANT UUID := '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72'::uuid;
BEGIN
  -- Security: Only Admin can change activation status
  v_caller_id := auth.uid();
  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_caller_id IS NULL OR (v_caller_id <> v_admin_uuid AND v_caller_email <> 'niveshkumar1230@gmail.com') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only admin can activate or deactivate providers');
  END IF;

  -- Safety: Cannot deactivate admin account itself
  IF target_user_id = v_admin_uuid OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = target_user_id AND lower(email) = 'niveshkumar1230@gmail.com'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot deactivate admin account');
  END IF;

  -- Update activation status on worker_profiles
  UPDATE public.worker_profiles
  SET is_active = new_is_active,
      updated_at = now()
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker profile not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'is_active', new_is_active);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_worker_activation_by_admin(UUID, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. FEATURE 2: Flexible Pricing
-- Adds price_unit ('day', 'hour', 'month', 'custom') and custom_price_unit to worker_profiles
-- Existing daily prices MUST remain valid and be interpreted as Per Day
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.worker_profiles
  ADD COLUMN IF NOT EXISTS price_unit TEXT NOT NULL DEFAULT 'day';

ALTER TABLE IF EXISTS public.worker_profiles
  ADD COLUMN IF NOT EXISTS custom_price_unit TEXT;

-- ----------------------------------------------------------------------------
-- 3. FEATURE 3: Public Mobile Number ON/OFF
-- Adds is_mobile_public to profiles (defaults to true for existing profiles)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS is_mobile_public BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_mobile_public ON public.profiles(is_mobile_public);
