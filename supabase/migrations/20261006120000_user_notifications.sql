-- ============================================================================
-- KAAMMITRA — USER NOTIFICATIONS MIGRATION
-- Supports:
-- 1. In-app notifications for comments & replies on Worker Profiles & Requirements
-- 2. Recipient ownership & strict RLS (Users can only see & delete their own notifications)
-- 3. Visual classification (Worker vs Requirement, Comment vs Reply)
-- 4. Deep linking to target items & exact comment UUID
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('comment', 'reply')),
  target_type TEXT NOT NULL CHECK (target_type IN ('worker', 'requirement')),
  target_id UUID NOT NULL,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  comment_preview TEXT,
  has_voice BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast indexed lookups for user's notification list and unread badge count
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_lookup
  ON public.user_notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_comment_lookup
  ON public.user_notifications (comment_id);

-- Enable Row Level Security
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: A user can only view their own received notifications
DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications" ON public.user_notifications
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- 2. INSERT Policy: An authenticated user can create notifications for others
-- (sender_id must be the current authenticated user)
DROP POLICY IF EXISTS "Senders insert notifications" ON public.user_notifications;
CREATE POLICY "Senders insert notifications" ON public.user_notifications
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = sender_id);

-- 3. UPDATE Policy: Users can update their own notifications (e.g. mark is_read = true)
DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
CREATE POLICY "Users update own notifications" ON public.user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. DELETE Policy: Users can delete their own notifications
DROP POLICY IF EXISTS "Users delete own notifications" ON public.user_notifications;
CREATE POLICY "Users delete own notifications" ON public.user_notifications
  FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
