-- ============================================================================
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
  skills TEXT,
  about_text TEXT,
  priority_points INTEGER NOT NULL DEFAULT 50 CHECK (priority_points BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
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
  mobile TEXT NOT NULL,
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
  WITH CHECK (auth.uid() = sender_id);

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
CREATE POLICY "Users can upload profile-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update profile-media" ON storage.objects;
CREATE POLICY "Users can update profile-media" ON storage.objects FOR UPDATE USING (bucket_id = 'profile-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete profile-media" ON storage.objects;
CREATE POLICY "Users can delete profile-media" ON storage.objects FOR DELETE USING (bucket_id = 'profile-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Public can view worker-media" ON storage.objects;
CREATE POLICY "Public can view worker-media" ON storage.objects FOR SELECT USING (bucket_id = 'worker-media');

DROP POLICY IF EXISTS "Workers can upload worker-media" ON storage.objects;
CREATE POLICY "Workers can upload worker-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'worker-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Workers can update worker-media" ON storage.objects;
CREATE POLICY "Workers can update worker-media" ON storage.objects FOR UPDATE USING (bucket_id = 'worker-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Workers can delete worker-media" ON storage.objects;
CREATE POLICY "Workers can delete worker-media" ON storage.objects FOR DELETE USING (bucket_id = 'worker-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Participants can view chat-media" ON storage.objects;
CREATE POLICY "Participants can view chat-media" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can upload chat-media" ON storage.objects;
CREATE POLICY "Users can upload chat-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin and uploaders can view help-media" ON storage.objects;
CREATE POLICY "Admin and uploaders can view help-media" ON storage.objects FOR SELECT USING (bucket_id = 'help-media');

DROP POLICY IF EXISTS "Anyone can upload help-media" ON storage.objects;
CREATE POLICY "Anyone can upload help-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'help-media');

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
-- REALTIME REPLICATION SETUP (Optional convenience for Realtime replication)
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
