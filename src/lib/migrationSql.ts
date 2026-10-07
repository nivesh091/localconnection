// Master SQL Schema Migration string for KaamMitra (काम मित्र)
// Admin: niveshkumar1230@gmail.com | Phone: 9149275779

const envSupabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
let resolvedProjectId = '';
if (envSupabaseUrl) {
  try {
    resolvedProjectId = new URL(envSupabaseUrl).hostname.split('.')[0] || '';
  } catch {
    resolvedProjectId = '';
  }
}
export const SUPABASE_PROJECT_ID = resolvedProjectId;
export const SUPABASE_SQL_EDITOR_URL = SUPABASE_PROJECT_ID
  ? `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new`
  : 'https://supabase.com/dashboard';

export const KAAMMITRA_MASTER_SCHEMA_SQL = `-- ============================================================================
-- KAAMMITRA (काम मित्र) — MASTER PRODUCTION DATABASE SCHEMA & MIGRATION
-- Single Source of Truth for Supabase Database & Storage
-- Admin: niveshkumar1230@gmail.com | Phone: 9149275779
--
-- IMPORTANT:
-- This migration initializes schema, indexes, constraints, RLS policies, and
-- storage buckets. It contains NO demo, seed, fake, or default application data.
-- Application tables start completely empty. Categories and settings are managed
-- directly via the authenticated Admin Panel in production.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked to auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT,
  profile_photo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_mobile ON public.profiles(mobile);

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES TABLE (Admin managed, 1 main level, no subcategories)
-- Starts 100% empty — categories created by Admin in production
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_hi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(is_active);

-- ----------------------------------------------------------------------------
-- 3. WORKER_PROFILES TABLE (Optional extension of an account; 1 pricing model: Per Day)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  other_category TEXT,
  experience_years NUMERIC NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  price_per_day NUMERIC NOT NULL CHECK (price_per_day >= 0),
  about_text TEXT,
  priority_points INTEGER NOT NULL DEFAULT 50 CHECK (priority_points BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.worker_profiles DROP COLUMN IF EXISTS skills;

CREATE INDEX IF NOT EXISTS idx_worker_profiles_category ON public.worker_profiles(category_id);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_priority ON public.worker_profiles(priority_points DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_price ON public.worker_profiles(price_per_day);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_experience ON public.worker_profiles(experience_years);

-- ----------------------------------------------------------------------------
-- 4. LOCATIONS TABLE (1 primary/base location per user)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  district TEXT NOT NULL,
  place TEXT NOT NULL,
  landmark TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  location_source TEXT NOT NULL DEFAULT 'manual' CHECK (location_source IN ('gps', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_user ON public.locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_place_district ON public.locations(place, district, state);
CREATE INDEX IF NOT EXISTS idx_locations_coords ON public.locations(latitude, longitude);

-- ----------------------------------------------------------------------------
-- 5. WORKER_MEDIA TABLE (Public: Max 10 photos, Exactly 1 voice recording)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'voice')),
  storage_path TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_media_worker ON public.worker_media(worker_user_id, media_type);

-- ----------------------------------------------------------------------------
-- 6. CONVERSATIONS TABLE (1 conversation per user pair, no self-chat)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_no_self_conversation CHECK (user_1_id <> user_2_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_conversation_pair
  ON public.conversations (LEAST(user_1_id, user_2_id), GREATEST(user_1_id, user_2_id));

CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON public.conversations(user_1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON public.conversations(user_2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- ----------------------------------------------------------------------------
-- 7. MESSAGES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'photo', 'video', 'voice', 'location')),
  message_text TEXT,
  media_id UUID,
  location_data JSONB,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  deleted_for_everyone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status);

-- ----------------------------------------------------------------------------
-- 8. MESSAGE_DELETIONS TABLE (For 'Delete for Me')
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_deletions (
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 9. MESSAGE_MEDIA TABLE (Private media metadata)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'voice')),
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. ADMIN_SETTINGS TABLE (Starts empty; configured dynamically by Admin)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id TEXT PRIMARY KEY,
  admin_call_enabled BOOLEAN NOT NULL DEFAULT true,
  admin_contact_number TEXT NOT NULL DEFAULT '9149275779',
  about_kaammitra_hi TEXT NOT NULL DEFAULT 'काम मित्र (KaamMitra) ग्रामीण एवं कस्बाई क्षेत्रों के कुशल कारीगरों और जरूरतमंद लोगों को जोड़ने का एक सीधा, निःशुल्क व विश्वसनीय मंच है।',
  about_kaammitra_en TEXT NOT NULL DEFAULT 'KaamMitra connects skilled village and local workers with people who need quality services without middlemen.',
  home_welcome_hi TEXT NOT NULL DEFAULT 'काम मित्र आपका स्वागत करता है',
  home_welcome_en TEXT NOT NULL DEFAULT 'Welcome to KaamMitra',
  chat_retention_days INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 11. ADMIN_COMMUNICATION TABLE (Chat for All or Specific Person)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_communication (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  send_to_all BOOLEAN NOT NULL DEFAULT false,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'media')),
  message_text TEXT,
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-user delivered/read tracking for notifications
CREATE TABLE IF NOT EXISTS public.admin_communication_status (
  communication_id UUID NOT NULL REFERENCES public.admin_communication(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_delivered BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMPTZ,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (communication_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 12. HELP_REQUESTS TABLE (Supports Guests & Authenticated Users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_request_id TEXT,
  request_type TEXT NOT NULL DEFAULT 'voice_help',
  name TEXT,
  mobile TEXT,
  voice_storage_path TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_help_requests_status ON public.help_requests(status, created_at DESC);

-- ----------------------------------------------------------------------------
-- 13. WORKER_REQUESTS TABLE ("क्या आपको वर्कर मिल गया? No" requests)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_request_id TEXT,
  name TEXT,
  mobile TEXT,
  voice_storage_path TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  other_category TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_requests_status ON public.worker_requests(status, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_communication ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_communication_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_requests ENABLE ROW LEVEL SECURITY;

-- Helper function: Is Current User Admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT (auth.jwt() ->> 'email') = 'niveshkumar1230@gmail.com';
$$;

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Public read profiles" ON public.profiles;
CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users delete own profile" ON public.profiles;
CREATE POLICY "Users delete own profile" ON public.profiles FOR DELETE USING (auth.uid() = id OR public.is_admin());

-- CATEGORIES POLICIES
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manage categories" ON public.categories;
CREATE POLICY "Admin manage categories" ON public.categories FOR ALL USING (public.is_admin());

-- WORKER_PROFILES POLICIES
DROP POLICY IF EXISTS "Public read workers" ON public.worker_profiles;
CREATE POLICY "Public read workers" ON public.worker_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Worker insert own profile" ON public.worker_profiles;
CREATE POLICY "Worker insert own profile" ON public.worker_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Worker update own profile" ON public.worker_profiles;
CREATE POLICY "Worker update own profile" ON public.worker_profiles FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Worker delete own profile" ON public.worker_profiles;
CREATE POLICY "Worker delete own profile" ON public.worker_profiles FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- LOCATIONS POLICIES
DROP POLICY IF EXISTS "Public read locations" ON public.locations;
CREATE POLICY "Public read locations" ON public.locations FOR SELECT USING (true);

DROP POLICY IF EXISTS "User manage own location" ON public.locations;
CREATE POLICY "User manage own location" ON public.locations FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- WORKER_MEDIA POLICIES
DROP POLICY IF EXISTS "Public read worker media" ON public.worker_media;
CREATE POLICY "Public read worker media" ON public.worker_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Worker manage own media" ON public.worker_media;
CREATE POLICY "Worker manage own media" ON public.worker_media FOR ALL USING (auth.uid() = worker_user_id OR public.is_admin());

-- CONVERSATIONS POLICIES
DROP POLICY IF EXISTS "Participants read conversations" ON public.conversations;
CREATE POLICY "Participants read conversations" ON public.conversations FOR SELECT
  USING (auth.uid() IN (user_1_id, user_2_id) OR public.is_admin());

DROP POLICY IF EXISTS "Participants create conversations" ON public.conversations;
CREATE POLICY "Participants create conversations" ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IN (user_1_id, user_2_id));

DROP POLICY IF EXISTS "Participants delete conversations" ON public.conversations;
CREATE POLICY "Participants delete conversations" ON public.conversations FOR DELETE
  USING (auth.uid() IN (user_1_id, user_2_id) OR public.is_admin());

-- MESSAGES POLICIES
DROP POLICY IF EXISTS "Participants read messages" ON public.messages;
CREATE POLICY "Participants read messages" ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (auth.uid() IN (c.user_1_id, c.user_2_id) OR public.is_admin())
    )
  );

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

DROP POLICY IF EXISTS "Sender or recipient update status" ON public.messages;
CREATE POLICY "Sender or recipient update status" ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (auth.uid() IN (c.user_1_id, c.user_2_id) OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Sender delete message" ON public.messages;
CREATE POLICY "Sender delete message" ON public.messages FOR DELETE
  USING (auth.uid() = sender_id OR public.is_admin());

-- MESSAGE_DELETIONS POLICIES
DROP POLICY IF EXISTS "User manage message deletions" ON public.message_deletions;
CREATE POLICY "User manage message deletions" ON public.message_deletions FOR ALL
  USING (auth.uid() = user_id);

-- MESSAGE_MEDIA POLICIES
DROP POLICY IF EXISTS "Conversation participants read media" ON public.message_media;
CREATE POLICY "Conversation participants read media" ON public.message_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_media.message_id
      AND (auth.uid() IN (c.user_1_id, c.user_2_id) OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Sender manage message media" ON public.message_media;
CREATE POLICY "Sender manage message media" ON public.message_media FOR ALL
  USING (auth.uid() = sender_id OR public.is_admin());

-- ADMIN_SETTINGS POLICIES
DROP POLICY IF EXISTS "Public read admin settings" ON public.admin_settings;
CREATE POLICY "Public read admin settings" ON public.admin_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin update settings" ON public.admin_settings;
CREATE POLICY "Admin update settings" ON public.admin_settings FOR ALL USING (public.is_admin());

-- ADMIN_COMMUNICATION POLICIES
DROP POLICY IF EXISTS "Users read broadcast and own communication" ON public.admin_communication;
CREATE POLICY "Users read broadcast and own communication" ON public.admin_communication FOR SELECT
  USING (send_to_all = true OR recipient_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin manage communication" ON public.admin_communication;
CREATE POLICY "Admin manage communication" ON public.admin_communication FOR ALL
  USING (public.is_admin());

-- ADMIN_COMMUNICATION_STATUS POLICIES
DROP POLICY IF EXISTS "User manage own notification status" ON public.admin_communication_status;
CREATE POLICY "User manage own notification status" ON public.admin_communication_status FOR ALL
  USING (auth.uid() = user_id OR public.is_admin());

-- HELP_REQUESTS POLICIES (Guests can insert, Admin can read/manage all, Users can read own)
DROP POLICY IF EXISTS "Anyone insert help requests" ON public.help_requests;
CREATE POLICY "Anyone insert help requests" ON public.help_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Read help requests" ON public.help_requests;
CREATE POLICY "Read help requests" ON public.help_requests FOR SELECT
  USING (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

DROP POLICY IF EXISTS "Admin manage help requests" ON public.help_requests;
CREATE POLICY "Admin manage help requests" ON public.help_requests FOR ALL
  USING (public.is_admin());

-- WORKER_REQUESTS POLICIES
DROP POLICY IF EXISTS "Anyone insert worker requests" ON public.worker_requests;
CREATE POLICY "Anyone insert worker requests" ON public.worker_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Read worker requests" ON public.worker_requests;
CREATE POLICY "Read worker requests" ON public.worker_requests FOR SELECT
  USING (public.is_admin() OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

DROP POLICY IF EXISTS "Admin manage worker requests" ON public.worker_requests;
CREATE POLICY "Admin manage worker requests" ON public.worker_requests FOR ALL
  USING (public.is_admin());

-- ============================================================================
-- STORAGE BUCKETS SETUP
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('profile-media', 'profile-media', true),
  ('worker-media', 'worker-media', true),
  ('chat-media', 'chat-media', false),
  ('help-media', 'help-media', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage policies
DROP POLICY IF EXISTS "Public can view profile-media" ON storage.objects;
CREATE POLICY "Public can view profile-media" ON storage.objects FOR SELECT USING (bucket_id = 'profile-media');

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

DROP POLICY IF EXISTS "Public can view worker-media" ON storage.objects;
CREATE POLICY "Public can view worker-media" ON storage.objects FOR SELECT USING (bucket_id = 'worker-media');

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

-- ============================================================================
-- 14. ADMIN COMPLETE USER DELETION FUNCTION (Cascades Auth & Application Data)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_user_by_admin(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
  v_target_email TEXT;
  v_admin_uuid CONSTANT UUID := '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72'::uuid;
BEGIN
  -- 1. Security Check: Caller must be authenticated admin
  -- Accepts caller if authenticated via Admin Email, Admin UUID, or public.is_admin()
  v_caller_id := auth.uid();
  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_caller_id IS NULL OR (
    v_caller_id <> v_admin_uuid 
    AND v_caller_email <> 'niveshkumar1230@gmail.com'
    AND NOT public.is_admin()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only admin can delete users');
  END IF;

  -- 2. Safety Check: Never delete the admin account
  IF target_user_id = v_admin_uuid OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = target_user_id AND lower(email) = 'niveshkumar1230@gmail.com'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot delete admin account');
  END IF;

  -- 3. Delete dependent application records
  -- Note: Storage files are cleaned up via official Supabase Storage API before invoking this RPC.
  -- Direct deletion from storage.objects is prohibited by Supabase triggers.
  DELETE FROM public.worker_media WHERE worker_user_id = target_user_id;
  DELETE FROM public.worker_profiles WHERE user_id = target_user_id;
  DELETE FROM public.locations WHERE user_id = target_user_id;
  DELETE FROM public.help_requests WHERE user_id = target_user_id;
  DELETE FROM public.worker_requests WHERE user_id = target_user_id;
  DELETE FROM public.admin_communication_status WHERE user_id = target_user_id;
  DELETE FROM public.admin_communication WHERE recipient_id = target_user_id;
  DELETE FROM public.message_deletions WHERE user_id = target_user_id;
  DELETE FROM public.message_media WHERE sender_id = target_user_id;
  DELETE FROM public.messages WHERE sender_id = target_user_id;
  DELETE FROM public.conversations WHERE user_1_id = target_user_id OR user_2_id = target_user_id;

  -- Resilient deletion: handle user_private_mobile safely whether table exists or not
  IF to_regclass('public.user_private_mobile') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_private_mobile WHERE user_id = $1' USING target_user_id;
  END IF;

  DELETE FROM public.profiles WHERE id = target_user_id;

  -- 4. Delete from Supabase Auth identities, sessions, and users (Eliminates Supabase Auth identity completely)
  SELECT email INTO v_target_email FROM auth.users WHERE id = target_user_id;
  DELETE FROM auth.identities WHERE user_id = target_user_id OR (v_target_email IS NOT NULL AND identity_data->>'email' = v_target_email);
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_by_admin(UUID) TO authenticated;

-- ============================================================================
-- REALTIME REPLICATION SETUP
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_communication;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_communication_status;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`;

export const ACCOUNT_DELETION_MIGRATION_SQL = `-- ============================================================================
-- KAAMMITRA: COMPLETE USER ACCOUNT DELETION RPC (Admin Security Definer)
-- Admin: niveshkumar1230@gmail.com
-- ============================================================================

-- 1. Ensure private mobile storage table exists with strict RLS (matches 20261002000000_security_hardening.sql)
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

-- 2. Privileged Account Deletion Function
CREATE OR REPLACE FUNCTION public.delete_user_by_admin(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
  v_target_email TEXT;
  v_admin_uuid CONSTANT UUID := '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72'::uuid;
BEGIN
  -- 1. Security Check: Caller must be authenticated admin
  -- Accepts caller if authenticated via Admin Email, Admin UUID, or public.is_admin()
  v_caller_id := auth.uid();
  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_caller_id IS NULL OR (
    v_caller_id <> v_admin_uuid 
    AND v_caller_email <> 'niveshkumar1230@gmail.com'
    AND NOT public.is_admin()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only admin can delete users');
  END IF;

  -- 2. Safety Check: Never delete the admin account
  IF target_user_id = v_admin_uuid OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = target_user_id AND lower(email) = 'niveshkumar1230@gmail.com'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot delete admin account');
  END IF;

  -- 3. Delete dependent application records
  -- Note: Storage files are cleaned up via official Supabase Storage API before invoking this RPC.
  -- Direct deletion from storage.objects is prohibited by Supabase triggers.
  DELETE FROM public.worker_media WHERE worker_user_id = target_user_id;
  DELETE FROM public.worker_profiles WHERE user_id = target_user_id;
  DELETE FROM public.locations WHERE user_id = target_user_id;
  DELETE FROM public.help_requests WHERE user_id = target_user_id;
  DELETE FROM public.worker_requests WHERE user_id = target_user_id;
  DELETE FROM public.admin_communication_status WHERE user_id = target_user_id;
  DELETE FROM public.admin_communication WHERE recipient_id = target_user_id;
  DELETE FROM public.message_deletions WHERE user_id = target_user_id;
  DELETE FROM public.message_media WHERE sender_id = target_user_id;
  DELETE FROM public.messages WHERE sender_id = target_user_id;
  DELETE FROM public.conversations WHERE user_1_id = target_user_id OR user_2_id = target_user_id;

  -- Resilient deletion: handle user_private_mobile safely whether table exists or not
  IF to_regclass('public.user_private_mobile') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_private_mobile WHERE user_id = $1' USING target_user_id;
  END IF;

  DELETE FROM public.profiles WHERE id = target_user_id;

  -- 4. Delete from Supabase Auth identities, sessions, and users (Eliminates Supabase Auth identity completely)
  SELECT email INTO v_target_email FROM auth.users WHERE id = target_user_id;
  DELETE FROM auth.identities WHERE user_id = target_user_id OR (v_target_email IS NOT NULL AND identity_data->>'email' = v_target_email);
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_by_admin(UUID) TO authenticated;
`;

export const VOICE_ONLY_REQUESTS_MIGRATION_SQL = `-- ============================================================================
-- KAAMMITRA: VOICE-ONLY REQUESTS MIGRATION (Backward-Compatible)
-- ============================================================================

-- 1. Add voice storage reference to worker_requests table
ALTER TABLE public.worker_requests
  ADD COLUMN IF NOT EXISTS voice_storage_path TEXT;

-- 2. Allow voice-only submissions without manual mobile input for worker_requests
ALTER TABLE public.worker_requests
  ALTER COLUMN mobile DROP NOT NULL;

-- 3. Allow voice-only submissions without manual name/mobile input for help_requests
ALTER TABLE public.help_requests
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN mobile DROP NOT NULL;
`;

export const FEATURES_3_MIGRATION_SQL = `-- ============================================================================
-- KAAMMITRA: PROVIDER ACTIVATION, FLEXIBLE PRICING & MOBILE PRIVACY MIGRATION
-- Project: hhvxanktvbncyeedzzdf
-- Admin: niveshkumar1230@gmail.com
-- ============================================================================

-- 1. FEATURE 1: Service Provider Activate / Deactivate by Admin
ALTER TABLE IF EXISTS public.worker_profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_worker_profiles_active ON public.worker_profiles(is_active);

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
  v_caller_id := auth.uid();
  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_caller_id IS NULL OR (v_caller_id <> v_admin_uuid AND v_caller_email <> 'niveshkumar1230@gmail.com') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only admin can activate or deactivate providers');
  END IF;

  IF target_user_id = v_admin_uuid OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = target_user_id AND lower(email) = 'niveshkumar1230@gmail.com'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot deactivate admin account');
  END IF;

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

-- 2. FEATURE 2: Flexible Pricing
ALTER TABLE IF EXISTS public.worker_profiles
  ADD COLUMN IF NOT EXISTS price_unit TEXT NOT NULL DEFAULT 'day';

ALTER TABLE IF EXISTS public.worker_profiles
  ADD COLUMN IF NOT EXISTS custom_price_unit TEXT;

-- 3. FEATURE 3: Public Mobile Number ON/OFF
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS is_mobile_public BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_mobile_public ON public.profiles(is_mobile_public);
`;

export const SECURITY_HARDENING_MIGRATION_SQL = `-- ============================================================================
-- KAAMMITRA (काम मित्र) — PRODUCTION SECURITY HARDENING MIGRATION
-- Migration: 20261002000000_security_hardening.sql
-- Admin: niveshkumar1230@gmail.com
-- ============================================================================

-- 1. PROFILE MOBILE NUMBER PRIVACY (Database & RLS Level)
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

INSERT INTO public.user_private_mobile (user_id, mobile)
SELECT id, mobile FROM public.profiles
WHERE mobile IS NOT NULL AND mobile <> ''
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_profile_mobile_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.mobile IS NOT NULL AND NEW.mobile <> '' THEN
    INSERT INTO public.user_private_mobile (user_id, mobile, updated_at)
    VALUES (NEW.id, NEW.mobile, now())
    ON CONFLICT (user_id) DO UPDATE SET mobile = EXCLUDED.mobile, updated_at = now();
  END IF;

  IF NEW.is_mobile_public = false THEN
    NEW.mobile := NULL;
  ELSE
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

UPDATE public.profiles SET mobile = NULL WHERE is_mobile_public = false;

-- 2. CHAT MEDIA STORAGE AUTHORIZATION
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

-- 3. HELP MEDIA STORAGE AUTHORIZATION
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

-- 4. WORKER PROFILE PROTECTED FIELDS
CREATE OR REPLACE FUNCTION public.protect_worker_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.priority_points := 50;
    NEW.is_active := true;
    RETURN NEW;
  END IF;

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

-- 5. PROFILE / WORKER MEDIA OWNERSHIP
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

-- 6. MESSAGE INSERT AUTHORIZATION
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

-- ============================================================================
-- 7. REQUIREMENTS MARKETPLACE ("आवश्यकताएँ")
-- ============================================================================
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
  keywords TEXT[] DEFAULT '{}',
  photo_storage_paths TEXT[] DEFAULT '{}',
  priority_points INTEGER NOT NULL DEFAULT 50 CHECK (priority_points BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requirements_owner ON public.requirements(owner_id);
CREATE INDEX IF NOT EXISTS idx_requirements_active ON public.requirements(is_active);
CREATE INDEX IF NOT EXISTS idx_requirements_category ON public.requirements(category);
CREATE INDEX IF NOT EXISTS idx_requirements_priority ON public.requirements(priority_points DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requirements_created ON public.requirements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requirements_coords ON public.requirements(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_requirements_keywords ON public.requirements USING GIN (keywords);

ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active requirements" ON public.requirements;
CREATE POLICY "Public can view active requirements" ON public.requirements
  FOR SELECT USING (is_active = true OR auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can create own requirements" ON public.requirements;
CREATE POLICY "Users can create own requirements" ON public.requirements
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own requirements" ON public.requirements;
CREATE POLICY "Users can update own requirements" ON public.requirements
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own requirements" ON public.requirements;
CREATE POLICY "Users can delete own requirements" ON public.requirements
  FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('requirement-media', 'requirement-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

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

-- REQUIREMENT PROTECTED FIELDS (Only Admin can change priority_points)
CREATE OR REPLACE FUNCTION public.protect_requirement_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.priority_points := 50;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.priority_points IS DISTINCT FROM OLD.priority_points THEN
      NEW.priority_points := OLD.priority_points;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_requirement_fields ON public.requirements;
CREATE TRIGGER trg_protect_requirement_fields
BEFORE INSERT OR UPDATE ON public.requirements
FOR EACH ROW EXECUTE FUNCTION public.protect_requirement_fields();
`;

export const REQUIREMENTS_ENHANCEMENT_MIGRATION_SQL = `
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
`;

export const REQUIREMENTS_PRIORITY_MIGRATION_SQL = `
-- ============================================================================
-- KAAMMITRA: REQUIREMENTS PREFERENCE & PRIORITY POINTS (1-100, DEFAULT 50)
-- Migration: 20261004000001_requirements_priority_points.sql
-- ============================================================================

-- 1. ADD PRIORITY POINTS TO REQUIREMENTS TABLE
ALTER TABLE public.requirements
  ADD COLUMN IF NOT EXISTS priority_points INTEGER NOT NULL DEFAULT 50 CHECK (priority_points BETWEEN 1 AND 100);

-- 2. CREATE INDEX FOR PRIORITY SORTING
CREATE INDEX IF NOT EXISTS idx_requirements_priority ON public.requirements(priority_points DESC, created_at DESC);

-- 3. PROTECT PRIORITY POINTS (ADMIN ONLY)
CREATE OR REPLACE FUNCTION public.protect_requirement_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.priority_points := 50;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.priority_points IS DISTINCT FROM OLD.priority_points THEN
      NEW.priority_points := OLD.priority_points;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_requirement_fields ON public.requirements;
CREATE TRIGGER trg_protect_requirement_fields
BEFORE INSERT OR UPDATE ON public.requirements
FOR EACH ROW EXECUTE FUNCTION public.protect_requirement_fields();

-- 4. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 20261006120000_user_notifications.sql
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

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_lookup
  ON public.user_notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_comment_lookup
  ON public.user_notifications (comment_id);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications" ON public.user_notifications
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Senders insert notifications" ON public.user_notifications;
CREATE POLICY "Senders insert notifications" ON public.user_notifications
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
CREATE POLICY "Users update own notifications" ON public.user_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.user_notifications;
CREATE POLICY "Users delete own notifications" ON public.user_notifications
  FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

-- ============================================================================
-- 20261006130000_push_subscriptions.sql
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

DROP POLICY IF EXISTS "Users read own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users read own push subscriptions" ON public.push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users insert own push subscriptions" ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users update own push subscriptions" ON public.push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users delete own push subscriptions" ON public.push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());

NOTIFY pgrst, 'reload schema';
`;


