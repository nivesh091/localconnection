-- ============================================================================
-- KAAMMITRA (काम मित्र) — PRODUCTION SECURITY HARDENING MIGRATION
-- Migration: 20261002000000_security_hardening.sql
-- Admin: niveshkumar1230@gmail.com
--
-- This migration hardens the six audited security boundaries:
-- 1. Profile Mobile Privacy (Database & RLS-level protection for private numbers)
-- 2. Chat Media Storage Authorization (Access restricted to conversation participants)
-- 3. Help Media Storage Authorization (Access restricted to request owner & admin)
-- 4. Worker Profile Protected Fields (Prevent self-modification of priority_points and is_active)
-- 5. Profile/Worker Media Ownership (Storage object ownership enforcement by user ID prefix)
-- 6. Message Insert Authorization (Verify sender is a legitimate conversation participant)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- POINT 1: PROFILE MOBILE NUMBER PRIVACY (Database & RLS Level)
-- ----------------------------------------------------------------------------
-- Create private storage for user mobile numbers with strict RLS
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

-- Seed existing mobile numbers into private table safely
INSERT INTO public.user_private_mobile (user_id, mobile)
SELECT id, mobile FROM public.profiles
WHERE mobile IS NOT NULL AND mobile <> ''
ON CONFLICT (user_id) DO NOTHING;

-- Database trigger to keep private mobile secure and clear public mobile when is_mobile_public = false
CREATE OR REPLACE FUNCTION public.sync_profile_mobile_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. If mobile number is provided in write, keep the private table updated
  IF NEW.mobile IS NOT NULL AND NEW.mobile <> '' THEN
    INSERT INTO public.user_private_mobile (user_id, mobile, updated_at)
    VALUES (NEW.id, NEW.mobile, now())
    ON CONFLICT (user_id) DO UPDATE SET mobile = EXCLUDED.mobile, updated_at = now();
  END IF;

  -- 2. If is_mobile_public is false, sanitize mobile in public profiles table
  IF NEW.is_mobile_public = false THEN
    NEW.mobile := NULL;
  ELSE
    -- If is_mobile_public is true and mobile is empty/null, restore from private table
    IF NEW.mobile IS NULL OR NEW.mobile = '' THEN
      SELECT mobile INTO NEW.mobile FROM public.user_private_mobile WHERE user_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_mobile_privacy ON public.profiles;
CREATE TRIGGER trg_sync_profile_mobile_privacy
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_mobile_privacy();

-- Sanitize existing rows where is_mobile_public is false
UPDATE public.profiles SET mobile = NULL WHERE is_mobile_public = false;

-- ----------------------------------------------------------------------------
-- POINT 2: CHAT MEDIA STORAGE AUTHORIZATION
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can view chat-media" ON storage.objects;
CREATE POLICY "Participants can view chat-media" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-media'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::text = split_part(name, '/', 1)
        AND auth.uid() IN (c.user_1_id, c.user_2_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can upload chat-media" ON storage.objects;
CREATE POLICY "Users can upload chat-media" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::text = split_part(name, '/', 1)
        AND auth.uid() IN (c.user_1_id, c.user_2_id)
      )
    )
  );

DROP POLICY IF EXISTS "Participants can delete chat-media" ON storage.objects;
CREATE POLICY "Participants can delete chat-media" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-media'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::text = split_part(name, '/', 1)
        AND auth.uid() IN (c.user_1_id, c.user_2_id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- POINT 3: HELP MEDIA STORAGE AUTHORIZATION
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin and uploaders can view help-media" ON storage.objects;
CREATE POLICY "Admin and uploaders can view help-media" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'help-media'
    AND (
      public.is_admin()
      OR (
        auth.uid() IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.help_requests hr
            WHERE hr.voice_storage_path = name
            AND hr.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.worker_requests wr
            WHERE wr.voice_storage_path = name
            AND wr.user_id = auth.uid()
          )
          OR split_part(name, '/', 1) = auth.uid()::text
        )
      )
    )
  );

DROP POLICY IF EXISTS "Anyone can upload help-media" ON storage.objects;
CREATE POLICY "Anyone can upload help-media" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'help-media');

DROP POLICY IF EXISTS "Admin and owners delete help-media" ON storage.objects;
CREATE POLICY "Admin and owners delete help-media" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'help-media'
    AND (
      public.is_admin()
      OR (
        auth.uid() IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.help_requests hr
            WHERE hr.voice_storage_path = name
            AND hr.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.worker_requests wr
            WHERE wr.voice_storage_path = name
            AND wr.user_id = auth.uid()
          )
          OR split_part(name, '/', 1) = auth.uid()::text
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- POINT 4: WORKER PROFILE PROTECTED FIELDS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_worker_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If caller is Admin, allow full control
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- On INSERT: enforce default non-escalated values for non-admin
  IF TG_OP = 'INSERT' THEN
    NEW.priority_points := 50;
    NEW.is_active := true;
    RETURN NEW;
  END IF;

  -- On UPDATE: protect priority_points and is_active from self-modification
  IF TG_OP = 'UPDATE' THEN
    IF NEW.priority_points IS DISTINCT FROM OLD.priority_points THEN
      NEW.priority_points := OLD.priority_points;
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      NEW.is_active := OLD.is_active;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_worker_profile_fields ON public.worker_profiles;
CREATE TRIGGER trg_protect_worker_profile_fields
BEFORE INSERT OR UPDATE ON public.worker_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_worker_profile_fields();

-- ----------------------------------------------------------------------------
-- POINT 5: PROFILE / WORKER MEDIA OWNERSHIP
-- ----------------------------------------------------------------------------
-- Profile-media storage policies:
DROP POLICY IF EXISTS "Users can upload profile-media" ON storage.objects;
CREATE POLICY "Users can upload profile-media" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

DROP POLICY IF EXISTS "Users can update profile-media" ON storage.objects;
CREATE POLICY "Users can update profile-media" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

DROP POLICY IF EXISTS "Users delete own profile-media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete profile-media" ON storage.objects;
CREATE POLICY "Users delete own profile-media" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

-- Worker-media storage policies:
DROP POLICY IF EXISTS "Workers can upload worker-media" ON storage.objects;
CREATE POLICY "Workers can upload worker-media" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'worker-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

DROP POLICY IF EXISTS "Workers can update worker-media" ON storage.objects;
CREATE POLICY "Workers can update worker-media" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'worker-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

DROP POLICY IF EXISTS "Workers can delete worker-media" ON storage.objects;
CREATE POLICY "Workers can delete worker-media" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'worker-media'
    AND auth.uid() IS NOT NULL
    AND (auth.uid()::text = split_part(name, '/', 1) OR public.is_admin())
  );

-- ----------------------------------------------------------------------------
-- POINT 6: MESSAGE INSERT AUTHORIZATION
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sender insert message" ON public.messages;
CREATE POLICY "Sender insert message" ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
        AND auth.uid() IN (c.user_1_id, c.user_2_id)
      )
    )
  );
