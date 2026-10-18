-- ============================================================================
-- MIGRATION: 20261017000000_internet_calling_and_recordings.sql
-- PROJECT: KaamMitra / LocalConnection
-- DESCRIPTION: End-to-end Internet Calling, WebRTC Signaling, and Call Recordings
--              with strict Row Level Security (RLS), Storage bucket protection,
--              automated retention management, and full backward compatibility.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS & SCHEMAS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. ADD CALLING PREFERENCES TO PROFILES
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_internet_call_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS personal_call_recording_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_internet_call_enabled IS 'Controls whether user can receive Internet Calls (Default: ON)';
COMMENT ON COLUMN public.profiles.personal_call_recording_enabled IS 'Controls whether user captures personal call recording in their history (Default: ON)';

-- ----------------------------------------------------------------------------
-- 3. ADD RETENTION SETTING TO ADMIN_SETTINGS
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS call_recording_retention_days INTEGER NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.admin_settings.call_recording_retention_days IS 'Days before call audio recordings expire and are automatically purged';

-- ----------------------------------------------------------------------------
-- 4. CALLS TABLE (Tracks peer-to-peer call sessions & metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'calling' CHECK (
    status IN ('calling', 'ringing', 'connecting', 'connected', 'missed', 'rejected', 'ended', 'failed')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  ended_reason TEXT,
  caller_personal_recording BOOLEAN NOT NULL DEFAULT false,
  recipient_personal_recording BOOLEAN NOT NULL DEFAULT false,
  admin_recording_active BOOLEAN NOT NULL DEFAULT false,
  caller_consent_admin_recording BOOLEAN NOT NULL DEFAULT false,
  recipient_consent_admin_recording BOOLEAN NOT NULL DEFAULT false,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT calls_caller_diff_receiver CHECK (caller_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON public.calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_receiver_id ON public.calls(receiver_id);
CREATE INDEX IF NOT EXISTS idx_calls_conversation_id ON public.calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON public.calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls(created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. CALL SIGNALS TABLE (WebRTC Signaling Fallback)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('offer', 'answer', 'ice_candidate', 'end')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_call_signals_call_id ON public.call_signals(call_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_recipient ON public.call_signals(recipient_id);

-- ----------------------------------------------------------------------------
-- 6. CALL RECORDINGS TABLE (Audio Files, Retention & Storage Metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  recording_type TEXT NOT NULL CHECK (recording_type IN ('personal', 'admin_evidence')),
  storage_path TEXT NOT NULL UNIQUE,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'audio/webm',
  expires_at TIMESTAMPTZ NOT NULL,
  purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_call_recordings_call_id ON public.call_recordings(call_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_user_id ON public.call_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_type ON public.call_recordings(recording_type);
CREATE INDEX IF NOT EXISTS idx_call_recordings_expires_purged ON public.call_recordings(expires_at, purged_at);

-- ----------------------------------------------------------------------------
-- 7. AUTOMATED RETENTION & EXPIRY TRIGGERS
-- ----------------------------------------------------------------------------

-- Function: Compute expires_at automatically on recording insert
CREATE OR REPLACE FUNCTION public.fn_set_call_recording_expiry()
RETURNS TRIGGER AS $$
DECLARE
  v_days INTEGER;
BEGIN
  SELECT call_recording_retention_days INTO v_days
  FROM public.admin_settings
  LIMIT 1;

  IF v_days IS NULL OR v_days <= 0 THEN
    v_days := 30;
  END IF;

  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + (v_days || ' days')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_call_recording_expiry ON public.call_recordings;
CREATE TRIGGER trg_set_call_recording_expiry
  BEFORE INSERT ON public.call_recordings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_call_recording_expiry();

-- Function: Recalculate expiry dates for all active recordings when retention days setting is updated
CREATE OR REPLACE FUNCTION public.fn_update_recordings_expiry_on_retention_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.call_recording_retention_days IS DISTINCT FROM OLD.call_recording_retention_days THEN
    UPDATE public.call_recordings
    SET expires_at = created_at + (NEW.call_recording_retention_days || ' days')::INTERVAL
    WHERE purged_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_recordings_expiry_on_retention_change ON public.admin_settings;
CREATE TRIGGER trg_update_recordings_expiry_on_retention_change
  AFTER UPDATE ON public.admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_recordings_expiry_on_retention_change();

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_recordings ENABLE ROW LEVEL SECURITY;

-- 8.1 CALLS TABLE POLICIES
DROP POLICY IF EXISTS "Participants and Admin can view calls" ON public.calls;
CREATE POLICY "Participants and Admin can view calls"
  ON public.calls FOR SELECT
  USING (
    auth.uid() = caller_id OR
    auth.uid() = receiver_id OR
    public.is_admin()
  );

DROP POLICY IF EXISTS "Authenticated users can initiate calls" ON public.calls;
CREATE POLICY "Authenticated users can initiate calls"
  ON public.calls FOR INSERT
  WITH CHECK (
    auth.uid() = caller_id
  );

DROP POLICY IF EXISTS "Participants and Admin can update calls" ON public.calls;
CREATE POLICY "Participants and Admin can update calls"
  ON public.calls FOR UPDATE
  USING (
    auth.uid() = caller_id OR
    auth.uid() = receiver_id OR
    public.is_admin()
  )
  WITH CHECK (
    auth.uid() = caller_id OR
    auth.uid() = receiver_id OR
    public.is_admin()
  );

-- 8.2 CALL SIGNALS POLICIES
DROP POLICY IF EXISTS "Participants can view call signals" ON public.call_signals;
CREATE POLICY "Participants can view call signals"
  ON public.call_signals FOR SELECT
  USING (
    auth.uid() = recipient_id OR
    auth.uid() = sender_id
  );

DROP POLICY IF EXISTS "Call sender can insert signals" ON public.call_signals;
CREATE POLICY "Call sender can insert signals"
  ON public.call_signals FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
  );

-- 8.3 CALL RECORDINGS POLICIES
DROP POLICY IF EXISTS "Users can view their own personal recordings" ON public.call_recordings;
CREATE POLICY "Users can view their own personal recordings"
  ON public.call_recordings FOR SELECT
  USING (
    (recording_type = 'personal' AND auth.uid() = user_id AND purged_at IS NULL) OR
    public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert their own recordings" ON public.call_recordings;
CREATE POLICY "Users can insert their own recordings"
  ON public.call_recordings FOR INSERT
  WITH CHECK (
    (recording_type = 'personal' AND auth.uid() = user_id) OR
    (recording_type = 'admin_evidence' AND (
      public.is_admin() OR
      EXISTS (
        SELECT 1 FROM public.calls c
        WHERE c.id = call_id
          AND (c.caller_id = auth.uid() OR c.receiver_id = auth.uid())
          AND c.admin_recording_active = true
      )
    ))
  );

DROP POLICY IF EXISTS "Users can delete their personal recordings" ON public.call_recordings;
CREATE POLICY "Users can delete their personal recordings"
  ON public.call_recordings FOR DELETE
  USING (
    (recording_type = 'personal' AND auth.uid() = user_id) OR
    public.is_admin()
  );

-- ----------------------------------------------------------------------------
-- 9. STORAGE BUCKET: call-recordings CONFIGURATION & POLICIES
-- ----------------------------------------------------------------------------

-- Insert bucket if not already present (Private bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-recordings',
  'call-recordings',
  false,
  104857600, -- 100 MB max size
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

-- Storage Object Policies
DROP POLICY IF EXISTS "Users can upload their own recordings" ON storage.objects;
CREATE POLICY "Users can upload their own recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'call-recordings' AND (
      -- Path pattern: user-recordings/<auth.uid()>/...
      (storage.foldername(name))[1] = 'user-recordings' AND
      (storage.foldername(name))[2] = auth.uid()::text
    ) OR (
      -- Admin evidence uploads from call participants
      (storage.foldername(name))[1] = 'admin-evidence' AND
      auth.role() = 'authenticated'
    ) OR
    public.is_admin()
  );

DROP POLICY IF EXISTS "Users and Admins can read authorized recordings" ON storage.objects;
CREATE POLICY "Users and Admins can read authorized recordings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'call-recordings' AND (
      (
        (storage.foldername(name))[1] = 'user-recordings' AND
        (storage.foldername(name))[2] = auth.uid()::text
      ) OR
      public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Users and Admins can delete recordings" ON storage.objects;
CREATE POLICY "Users and Admins can delete recordings"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'call-recordings' AND (
      (
        (storage.foldername(name))[1] = 'user-recordings' AND
        (storage.foldername(name))[2] = auth.uid()::text
      ) OR
      public.is_admin()
    )
  );

-- ----------------------------------------------------------------------------
-- 10. REALTIME SUBSCRIPTION ENABLING
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'call_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
  END IF;
END $$;
