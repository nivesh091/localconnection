import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

const rawUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  '';
const rawKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  '';

function sanitizePublishableKey(input: string): string {
  if (!input) return '';
  const match = input.match(/sb_publishable_[A-Za-z0-9_-]+/);
  if (match) return match[0];
  if (input.startsWith('eyJ')) return input.trim();
  return '';
}

const cleanedKey = sanitizePublishableKey(rawKey);

// Reliable credentials with production project fallback
export const SUPABASE_URL = (rawUrl && rawUrl.startsWith('http') ? rawUrl.trim() : '') || DEFAULT_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = cleanedKey || DEFAULT_SUPABASE_KEY;
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const ADMIN_EMAIL = 'niveshkumar1230@gmail.com';
export const ADMIN_CONTACT_DEFAULT = '9149275779';

// Single centralized Supabase client instance for the entire application
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Reactive state for database schema availability
type SchemaStateListener = (pending: boolean) => void;
let isSchemaPendingState = false;
const schemaListeners = new Set<SchemaStateListener>();

export function markSchemaPending(pending = true): void {
  if (isSchemaPendingState !== pending) {
    isSchemaPendingState = pending;
    schemaListeners.forEach((fn) => fn(pending));
  }
}

export function isSchemaPending(): boolean {
  return isSchemaPendingState;
}

export function subscribeSchemaPending(listener: SchemaStateListener): () => void {
  schemaListeners.add(listener);
  listener(isSchemaPendingState);
  return () => {
    schemaListeners.delete(listener);
  };
}

/**
 * Checks if an error is due to a missing table in Supabase PostgREST schema cache (PGRST205)
 */
export function isSchemaCacheError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as { code?: string; message?: string; details?: string };
  const msg = typeof anyErr.message === 'string' ? anyErr.message : '';
  const details = typeof anyErr.details === 'string' ? anyErr.details : '';
  
  // Specific match for table/column not found in PostgREST schema cache (PGRST205, PGRST204, 42703)
  const isMatch =
    anyErr.code === 'PGRST205' ||
    anyErr.code === 'PGRST204' ||
    anyErr.code === '42703' ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table') ||
    msg.includes('Could not find the') ||
    details.includes('Could not find') ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('relation') && msg.includes('does not exist'));

  if (isMatch) {
    markSchemaPending(true);
  }
  return isMatch;
}

/**
 * All required KaamMitra tables defined in master schema
 */
export const REQUIRED_KAAMMITRA_TABLES = [
  'profiles',
  'categories',
  'worker_profiles',
  'locations',
  'worker_media',
  'conversations',
  'messages',
  'message_deletions',
  'message_media',
  'admin_settings',
  'admin_communication',
  'admin_communication_status',
  'help_requests',
  'worker_requests',
] as const;

let cachedReadiness: { isReady: boolean; missingTables: string[]; timestamp: number } | null = null;
let readinessInFlight: Promise<{ isReady: boolean; missingTables: string[] }> | null = null;

/**
 * Actively checks whether the required tables exist in the current Supabase project.
 * Uses fast-path single-query verification on core tables, request deduplication and in-memory caching
 * to eliminate 14 redundant queries on every page startup.
 */
export async function checkDatabaseReadiness(): Promise<{ isReady: boolean; missingTables: string[] }> {
  if (!isSupabaseConfigured) {
    markSchemaPending(true);
    return { isReady: false, missingTables: ['unconfigured_env'] };
  }

  const now = Date.now();
  if (cachedReadiness && cachedReadiness.isReady && now - cachedReadiness.timestamp < 300000) {
    markSchemaPending(false);
    return { isReady: true, missingTables: [] };
  }

  if (readinessInFlight) {
    return readinessInFlight;
  }

  readinessInFlight = (async () => {
    try {
      // Fast path: Check core 'profiles' table first (1 single lightweight head query)
      const { error: profileErr } = await supabase.from('profiles').select('id').limit(1);
      if (!profileErr || !isSchemaCacheError(profileErr)) {
        // Core table is healthy, database is ready
        markSchemaPending(false);
        const res = { isReady: true, missingTables: [] };
        cachedReadiness = { ...res, timestamp: Date.now() };
        return res;
      }

      // If profiles table returned schema cache error (PGRST205), check which tables are missing
      const missingTables: string[] = [];
      const checks = await Promise.all(
        REQUIRED_KAAMMITRA_TABLES.map(async (tableName) => {
          try {
            const { error } = await supabase.from(tableName).select('id').limit(1);
            if (error && isSchemaCacheError(error)) {
              return { table: tableName, exists: false };
            }
            return { table: tableName, exists: true };
          } catch (err) {
            if (isSchemaCacheError(err)) {
              return { table: tableName, exists: false };
            }
            return { table: tableName, exists: true };
          }
        })
      );

      for (const res of checks) {
        if (!res.exists) {
          missingTables.push(res.table);
        }
      }

      const isReady = missingTables.length === 0;
      markSchemaPending(!isReady);
      const result = { isReady, missingTables };
      cachedReadiness = { ...result, timestamp: Date.now() };
      return result;
    } catch {
      return { isReady: false, missingTables: ['connection_error'] };
    } finally {
      readinessInFlight = null;
    }
  })();

  return readinessInFlight;
}

/**
 * Safe retry with exponential backoff for transient network issues.
 * Max 2 retries, short delay (400ms, 800ms).
 * Never loops infinitely, never reloads the window.
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelay = 400
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt > retries || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        throw err;
      }
      const msg = err?.message || String(err);
      const isTransient =
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('network') ||
        msg.includes('abort') ||
        err?.code === 'PGRST000' ||
        err?.status === 502 ||
        err?.status === 503 ||
        err?.status === 504;
      if (!isTransient) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)));
    }
  }
}

/**
 * Determines whether an error is a temporary network/connectivity failure
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!error) return false;
  const anyErr = error as any;
  const message = anyErr instanceof Error ? anyErr.message : String(anyErr?.message || anyErr);
  return (
    message.includes('fetch failed') ||
    message.includes('NetworkError') ||
    message.includes('ENOTFOUND') ||
    message.includes('Failed to fetch') ||
    message.includes('abort') ||
    message.includes('network') ||
    message.includes('timeout') ||
    anyErr?.name === 'AbortError' ||
    anyErr?.status === 502 ||
    anyErr?.status === 503 ||
    anyErr?.status === 504 ||
    anyErr?.code === 'PGRST000'
  );
}

/**
 * Determines whether an error is a genuine authentication/session-expiry error
 */
export function isAuthError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as any;
  const msg = anyErr instanceof Error ? anyErr.message : String(anyErr?.message || anyErr);
  return (
    msg.includes('JWT') ||
    msg.includes('session expired') ||
    msg.includes('Invalid login credentials') ||
    msg.includes('token is expired') ||
    msg.includes('invalid claim') ||
    anyErr?.status === 401 ||
    anyErr?.code === 'PGRST301'
  );
}

/**
 * Normalizes backend / network errors into user-friendly Hindi & English messages
 * Never reveals raw SQL or sensitive traces to regular users (Section 89 & 91)
 */
export function formatError(error: unknown, lang: 'hi' | 'en' = 'hi'): string {
  if (!error) return '';
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('fetch failed') ||
    message.includes('NetworkError') ||
    message.includes('ENOTFOUND') ||
    message.includes('Failed to fetch') ||
    message.includes('abort')
  ) {
    return lang === 'hi'
      ? 'सर्वर या इंटरनेट कनेक्शन जांचें और फिर प्रयास करें।'
      : 'Please check your server or internet connection and retry.';
  }

  // Schema cache, missing table or missing column
  if (
    message.includes('schema cache') ||
    message.includes('PGRST205') ||
    message.includes('PGRST204') ||
    message.includes('42703') ||
    message.includes('column') && message.includes('does not exist')
  ) {
    return lang === 'hi'
      ? 'डेटाबेस में आवश्यक माइग्रेशन (20261004000000_requirements_keywords_photos_media.sql) लंबित है। कृपया Supabase SQL Editor में माइग्रेशन रन करें।'
      : 'Database migration required. Please run the 20261004 migration in Supabase SQL Editor.';
  }

  // Numeric syntax errors (PostgreSQL 22P02)
  if (
    message.includes('invalid input syntax for type numeric') ||
    message.includes('22P02') ||
    message.includes('numeric')
  ) {
    return lang === 'hi'
      ? 'कृपया बजट या अनुभव संख्या सही अंकों में दर्ज करें।'
      : 'Please enter valid numerical digits.';
  }

  if (message.includes('duplicate key') || message.includes('already exists') || message.includes('23505')) {
    return lang === 'hi'
      ? 'यह जानकारी पहले से मौजूद है।'
      : 'This entry already exists.';
  }

  if (message.includes('Invalid login credentials')) {
    return lang === 'hi'
      ? 'गलत मोबाइल नंबर या पासवर्ड।'
      : 'Invalid mobile number or password.';
  }

  if (message.includes('JWT') || message.includes('session') || message.includes('expired')) {
    return lang === 'hi'
      ? 'सत्र समाप्त हो गया है। कृपया पुनः लॉगिन करें।'
      : 'Session expired. Please log in again.';
  }

  // Fallback: never show raw SQL / code / trace to normal user
  if (message.includes('Postgres') || message.includes('PGRST') || message.includes('constraint') || message.includes('relation')) {
    return lang === 'hi'
      ? 'डेटाबेस से संपर्क करने में समस्या हुई। कृपया पुनः प्रयास करें।'
      : 'Database operation failed. Please try again.';
  }

  return lang === 'hi'
    ? 'कृपया फिर से कोशिश करें।'
    : 'Please try again.';
}
