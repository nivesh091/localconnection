-- ============================================================================
-- MIGRATION: 20261017010000_calling_schema_resilience.sql
-- PROJECT: KaamMitra / LocalConnection
-- DESCRIPTION: Calling Schema Resilience & Full Realtime Compatibility
--              Ensures all column aliases, Realtime replica identity, and signal
--              types operate without constraint violations.
-- ============================================================================

-- 1. CALLS TABLE COLUMN ALIASES FOR 100% ORM & CLIENT COMPATIBILITY
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS end_reason TEXT,
  ADD COLUMN IF NOT EXISTS ended_reason TEXT,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receiver_consent_admin_recording BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recipient_consent_admin_recording BOOLEAN DEFAULT false;

-- 2. CALL RECORDINGS COLUMN ALIASES
ALTER TABLE public.call_recordings
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_deleted_by_user BOOLEAN DEFAULT false;

-- 3. ENABLE FULL REPLICA IDENTITY FOR ACCURATE REALTIME FILTERING UNDER RLS
ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.call_signals REPLICA IDENTITY FULL;

-- 4. EXPAND CALL SIGNALS TYPE CHECK CONSTRAINT
DO $$
BEGIN
  -- Drop existing constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'call_signals_type_check'
  ) THEN
    ALTER TABLE public.call_signals DROP CONSTRAINT call_signals_type_check;
  END IF;

  -- Add updated check constraint with all signal types
  ALTER TABLE public.call_signals
    ADD CONSTRAINT call_signals_type_check
    CHECK (type IN ('offer', 'answer', 'ice_candidate', 'end', 'rejected', 'ringing', 'ready', 'ping'));
END $$;

-- 5. VERIFY PUBLICATION
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
