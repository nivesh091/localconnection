-- ============================================================================
-- KAAMMITRA — COMMENTS & MESSAGE REFERENCES MIGRATION
-- Supports:
-- 1. Public comments and threaded replies on Worker Profiles and Requirements
-- 2. Author identity with real profiles
-- 3. Dedicated 'comment-media' storage bucket for voice comments
-- 4. Granular RLS policies (Author edit/delete, Target owner delete only)
-- 5. WhatsApp-style comment references in Chat messages (nullable, non-breaking)
-- ============================================================================

-- 1. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('worker', 'requirement')),
  target_id UUID NOT NULL,
  parent_comment_id UUID,
  text TEXT,
  voice_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE,
  CONSTRAINT chk_comment_has_content CHECK (
    (text IS NOT NULL AND trim(text) <> '') OR
    (voice_storage_path IS NOT NULL AND trim(voice_storage_path) <> '')
  )
);

-- Indexes for lightning fast lookups & thread grouping
CREATE INDEX IF NOT EXISTS idx_comments_target ON public.comments (target_type, target_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON public.comments (author_id);

-- Enable RLS on comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Public read (including guests)
DROP POLICY IF EXISTS "Public read comments" ON public.comments;
CREATE POLICY "Public read comments" ON public.comments
  FOR SELECT
  USING (true);

-- INSERT Policy: Authenticated users can insert their own comments
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments;
CREATE POLICY "Authenticated users can insert comments" ON public.comments
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = author_id);

-- UPDATE Policy: Only the original author can edit their own comment
-- (Worker profile owners and Requirement owners CANNOT edit another user's comment)
DROP POLICY IF EXISTS "Authors can update own comments" ON public.comments;
CREATE POLICY "Authors can update own comments" ON public.comments
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- DELETE Policy:
-- 1. Author can delete own comment/reply
-- 2. Worker profile owner can delete any comment/reply on their worker profile
-- 3. Requirement owner can delete any comment/reply on their requirement
-- 4. Admin can delete any comment/reply
DROP POLICY IF EXISTS "Authors, target owners, and admins can delete comments" ON public.comments;
CREATE POLICY "Authors, target owners, and admins can delete comments" ON public.comments
  FOR DELETE
  USING (
    auth.uid() = author_id
    OR (target_type = 'worker' AND target_id = auth.uid())
    OR (target_type = 'requirement' AND EXISTS (
      SELECT 1 FROM public.requirements WHERE id = comments.target_id AND owner_id = auth.uid()
    ))
    OR public.is_admin()
  );

-- ----------------------------------------------------------------------------
-- 2. ADD COMMENT-REFERENCE FIELDS TO MESSAGES TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reference_type TEXT CHECK (reference_type IN ('comment', 'message')),
  ADD COLUMN IF NOT EXISTS reference_comment_id UUID,
  ADD COLUMN IF NOT EXISTS reference_preview TEXT,
  ADD COLUMN IF NOT EXISTS reference_metadata JSONB;

-- ----------------------------------------------------------------------------
-- 3. STORAGE BUCKET FOR COMMENT VOICE MEDIA
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('comment-media', 'comment-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage policies for comment-media
DROP POLICY IF EXISTS "Public can view comment-media" ON storage.objects;
CREATE POLICY "Public can view comment-media" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'comment-media');

DROP POLICY IF EXISTS "Authenticated users can upload comment-media" ON storage.objects;
CREATE POLICY "Authenticated users can upload comment-media" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'comment-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete own comment-media" ON storage.objects;
CREATE POLICY "Users can delete own comment-media" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'comment-media' AND (auth.uid() IS NOT NULL OR public.is_admin()));

-- ----------------------------------------------------------------------------
-- 4. RELOAD POSTGREST SCHEMA CACHE INSTANTLY
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
