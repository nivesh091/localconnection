-- ============================================================================
-- 20261014000000_reported_comments.sql
-- Comments Reporting & Moderation System
-- Allows users to flag inappropriate comments for moderator review
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reported_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'action_taken')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_reported_comments_comment_reporter UNIQUE (comment_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_reported_comments_comment_id ON public.reported_comments (comment_id);
CREATE INDEX IF NOT EXISTS idx_reported_comments_reporter_id ON public.reported_comments (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reported_comments_status ON public.reported_comments (status, created_at DESC);

ALTER TABLE public.reported_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporters and admins can view reports" ON public.reported_comments;
CREATE POLICY "Reporters and admins can view reports" ON public.reported_comments
  FOR SELECT
  USING (auth.uid() = reporter_id OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.reported_comments;
CREATE POLICY "Authenticated users can submit reports" ON public.reported_comments
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins can update reports" ON public.reported_comments;
CREATE POLICY "Admins can update reports" ON public.reported_comments
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete reports" ON public.reported_comments;
CREATE POLICY "Admins can delete reports" ON public.reported_comments
  FOR DELETE
  USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
