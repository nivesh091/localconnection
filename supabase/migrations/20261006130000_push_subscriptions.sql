-- ============================================================================
-- KAAMMITRA — PUSH SUBSCRIPTIONS MIGRATION
-- Supports:
-- 1. Real Web Push subscriptions per user across multiple devices/browsers
-- 2. Secure storage of endpoint, p256dh, and auth tokens
-- 3. Strict user-level RLS policies (Users can only access their own subscriptions)
-- 4. Cascade delete on account removal
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_push_user_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Users can only see their own subscriptions
DROP POLICY IF EXISTS "Users read own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users read own push subscriptions" ON public.push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- 2. INSERT Policy: Users can insert their own subscriptions
DROP POLICY IF EXISTS "Users insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users insert own push subscriptions" ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE Policy: Users can update their own subscriptions
DROP POLICY IF EXISTS "Users update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users update own push subscriptions" ON public.push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. DELETE Policy: Users can delete their own subscriptions
DROP POLICY IF EXISTS "Users delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users delete own push subscriptions" ON public.push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

NOTIFY pgrst, 'reload schema';
