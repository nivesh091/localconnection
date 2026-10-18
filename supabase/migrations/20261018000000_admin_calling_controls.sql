-- ============================================================================
-- KAAMMITRA (काम मित्र) — ADMIN CALLING CONTROLS MIGRATION
-- Migration: 20261018000000_admin_calling_controls.sql
-- ============================================================================

-- Add independent global calling controls to admin_settings
ALTER TABLE IF EXISTS public.admin_settings
  ADD COLUMN IF NOT EXISTS mobile_calling_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS internet_calling_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.admin_settings.mobile_calling_enabled IS 'Admin global control: Enable or disable mobile network/regular phone calling throughout the app';
COMMENT ON COLUMN public.admin_settings.internet_calling_enabled IS 'Admin global control: Enable or disable internet audio calling throughout the app';

-- Ensure default values for general row
UPDATE public.admin_settings
SET
  mobile_calling_enabled = COALESCE(mobile_calling_enabled, true),
  internet_calling_enabled = COALESCE(internet_calling_enabled, true)
WHERE id = 'general';
