-- ============================================================================
-- KAAMMITRA: REQUIREMENTS MARKETPLACE ("आवश्यकताएँ") MIGRATION
-- Migration: 20261003000000_requirements_marketplace.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REQUIREMENTS TABLE
-- Separate from worker_profiles. Stores job requests posted by users seeking workers.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  short_requirement TEXT NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  place TEXT NOT NULL,
  district TEXT,
  state TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  maximum_budget NUMERIC NOT NULL CHECK (maximum_budget >= 0),
  minimum_experience_years NUMERIC CHECK (minimum_experience_years IS NULL OR minimum_experience_years >= 0),
  voice_storage_path TEXT,
  additional_info TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Essential query performance indexes
CREATE INDEX IF NOT EXISTS idx_requirements_owner ON public.requirements(owner_id);
CREATE INDEX IF NOT EXISTS idx_requirements_active ON public.requirements(is_active);
CREATE INDEX IF NOT EXISTS idx_requirements_category ON public.requirements(category);
CREATE INDEX IF NOT EXISTS idx_requirements_created ON public.requirements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requirements_coords ON public.requirements(latitude, longitude);

-- ----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) FOR REQUIREMENTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;

-- SELECT: Public can view active requirements; owners can view all their own requirements; admins can view all.
DROP POLICY IF EXISTS "Public can view active requirements" ON public.requirements;
CREATE POLICY "Public can view active requirements" ON public.requirements
  FOR SELECT USING (is_active = true OR auth.uid() = owner_id OR public.is_admin());

-- INSERT: Authenticated users can insert only with owner_id = auth.uid()
DROP POLICY IF EXISTS "Users can create own requirements" ON public.requirements;
CREATE POLICY "Users can create own requirements" ON public.requirements
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- UPDATE: Only owner or admin can update
DROP POLICY IF EXISTS "Users can update own requirements" ON public.requirements;
CREATE POLICY "Users can update own requirements" ON public.requirements
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin());

-- DELETE: Only owner or admin can delete
DROP POLICY IF EXISTS "Users can delete own requirements" ON public.requirements;
CREATE POLICY "Users can delete own requirements" ON public.requirements
  FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. STORAGE BUCKET FOR REQUIREMENT VOICE MEDIA
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('requirement-media', 'requirement-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage policies with ownership protection (Section 30 & 33)
DROP POLICY IF EXISTS "Public can view requirement-media" ON storage.objects;
CREATE POLICY "Public can view requirement-media" ON storage.objects FOR SELECT
  USING (bucket_id = 'requirement-media');

DROP POLICY IF EXISTS "Users can upload requirement-media" ON storage.objects;
CREATE POLICY "Users can upload requirement-media" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'requirement-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

DROP POLICY IF EXISTS "Users can update requirement-media" ON storage.objects;
CREATE POLICY "Users can update requirement-media" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'requirement-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

DROP POLICY IF EXISTS "Users delete own requirement-media" ON storage.objects;
CREATE POLICY "Users delete own requirement-media" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'requirement-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );
