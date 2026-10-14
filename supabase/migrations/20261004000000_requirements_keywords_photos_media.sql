-- ============================================================================
-- KAAMMITRA: REQUIREMENTS MARKETPLACE ENHANCEMENTS (KEYWORDS & PHOTOS MEDIA)
-- Migration: 20261004000000_requirements_keywords_photos_media.sql
-- ============================================================================

-- 1. ADD KEYWORDS AND PHOTO STORAGE PATHS TO REQUIREMENTS TABLE
ALTER TABLE public.requirements
  ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photo_storage_paths TEXT[] DEFAULT '{}';

-- 2. CREATE GIN INDEX ON KEYWORDS FOR FAST SEARCH
CREATE INDEX IF NOT EXISTS idx_requirements_keywords ON public.requirements USING GIN (keywords);

-- 3. ENSURE ADMINS CAN DELETE ANY REQUIREMENT RECORD
DROP POLICY IF EXISTS "Admins can delete any requirement" ON public.requirements;
CREATE POLICY "Admins can delete any requirement" ON public.requirements
  FOR DELETE USING (public.is_admin());

-- 4. RELOAD POSTGREST SCHEMA CACHE INSTANTLY
NOTIFY pgrst, 'reload schema';
