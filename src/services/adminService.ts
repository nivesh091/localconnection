import { supabase, ADMIN_EMAIL, ADMIN_CONTACT_DEFAULT, isSchemaCacheError } from '../lib/supabase';
import {
  UserProfile,
  WorkerProfile,
  WorkerCategory,
  AdminSettings,
  AdminCommunication,
} from '../types';
import {
  parseWorkerMetadata,
  serializeWorkerMetadata,
  extractAboutAndMetadata,
  appendMetadataToAbout,
} from './workerMetadata';
import {
  WorkerService,
  checkExtendedSchemaSupport,
  buildWorkerSelectQuery,
  BASE_WORKER_COLUMNS,
} from './workerService';
import { OfflineWorkerStorage } from './offlineWorkerStorage';

// In-memory cache for Admin Settings to prevent repeated database hits on navigation
let cachedAdminSettings: { data: AdminSettings; timestamp: number } | null = null;
let settingsInFlight: Promise<AdminSettings> | null = null;
const SETTINGS_CACHE_TTL = 60000; // 60 seconds

export class AdminService {
  /**
   * Get Admin Settings (Section 75 & 76)
   */
  static async getSettings(): Promise<AdminSettings> {
    const now = Date.now();
    if (cachedAdminSettings && now - cachedAdminSettings.timestamp < SETTINGS_CACHE_TTL) {
      return cachedAdminSettings.data;
    }

    if (settingsInFlight) {
      return settingsInFlight;
    }

    settingsInFlight = (async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('*')
          .eq('id', 'general')
          .maybeSingle();

        let localReqMapOverride = false;
        try {
          localReqMapOverride = localStorage.getItem('admin_show_requirements_on_map') === 'true';
        } catch {}

        if (error || !data) {
          if (error) isSchemaCacheError(error);
          const fallback: AdminSettings = {
            id: 'general',
            admin_call_enabled: false, // SECURE DEFAULT: NEVER true on fallback/unknown
            admin_contact_number: '',  // SECURE DEFAULT: NEVER expose number on fallback/unknown
            about_kaammitra_hi:
              'काम मित्र (KaamMitra) ग्रामीण एवं कस्बाई क्षेत्रों के कुशल सेवा प्रदाताओं और जरूरतमंद लोगों को जोड़ने का एक सीधा, निःशुल्क व विश्वसनीय मंच है।',
            about_kaammitra_en:
              'KaamMitra connects skilled village and local service providers with people who need quality services without middlemen.',
            home_welcome_hi: 'काम मित्र आपका स्वागत करता है',
            home_welcome_en: 'Welcome to KaamMitra',
            chat_retention_days: 30,
            show_requirements_on_map: localReqMapOverride,
            updated_at: new Date().toISOString(),
          };
          cachedAdminSettings = { data: fallback, timestamp: Date.now() };
          return fallback;
        }

        const resolvedShowReqsOnMap =
          data.show_requirements_on_map !== undefined && data.show_requirements_on_map !== null
            ? Boolean(data.show_requirements_on_map)
            : localReqMapOverride;

        const mergedData: AdminSettings = {
          ...data,
          show_requirements_on_map: resolvedShowReqsOnMap,
        };

        cachedAdminSettings = { data: mergedData, timestamp: Date.now() };
        return mergedData;
      } catch {
        let localReqMapOverride = false;
        try {
          localReqMapOverride = localStorage.getItem('admin_show_requirements_on_map') === 'true';
        } catch {}

        if (cachedAdminSettings) return cachedAdminSettings.data;
        const fallback: AdminSettings = {
          id: 'general',
          admin_call_enabled: false, // SECURE DEFAULT: NEVER true on fallback/unknown
          admin_contact_number: '',  // SECURE DEFAULT: NEVER expose number on fallback/unknown
          about_kaammitra_hi: 'काम मित्र (KaamMitra)',
          about_kaammitra_en: 'KaamMitra',
          home_welcome_hi: 'काम मित्र आपका स्वागत करता है',
          home_welcome_en: 'Welcome to KaamMitra',
          chat_retention_days: 30,
          show_requirements_on_map: localReqMapOverride,
          updated_at: new Date().toISOString(),
        };
        return fallback;
      } finally {
        settingsInFlight = null;
      }
    })();

    return settingsInFlight;
  }

  /**
   * Invalidate cached Admin Settings
   */
  static invalidateSettingsCache(): void {
    cachedAdminSettings = null;
    settingsInFlight = null;
  }

  /**
   * Update Admin Settings
   */
  static async updateSettings(
    updates: Partial<Omit<AdminSettings, 'id' | 'updated_at'>>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (updates.show_requirements_on_map !== undefined) {
        try {
          localStorage.setItem('admin_show_requirements_on_map', String(Boolean(updates.show_requirements_on_map)));
        } catch {}
      }

      const { error } = await supabase.from('admin_settings').upsert({
        id: 'general',
        ...updates,
        updated_at: new Date().toISOString(),
      });

      if (error) return { success: false, error: error.message };
      // Immediately invalidate in-memory cache so setting changes reflect instantly
      cachedAdminSettings = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Get all registered users (newest first) (Section 72)
   */
  static async getUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, locations(place, district, state, landmark, latitude, longitude)')
        .order('created_at', { ascending: false });

      if (error) {
        const { data: d2 } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        return d2 || [];
      }

      const rawList = (data || []) as any[];
      return rawList.map((row) => {
        const profileLocations = row.locations;
        const loc = Array.isArray(profileLocations)
          ? profileLocations[0] || null
          : profileLocations || null;
        return {
          ...row,
          location: loc,
        } as UserProfile;
      });
    } catch {
      return [];
    }
  }

  /**
   * Get all workers for Admin (Section 73: NEWEST FIRST, NOT by priority points)
   */
  static async getWorkersAdmin(): Promise<WorkerProfile[]> {
    let rawData: any[] | null = null;

    const support = await checkExtendedSchemaSupport();
    const selectCols = buildWorkerSelectQuery(support);

    let { data, error } = await supabase
      .from('worker_profiles')
      .select(selectCols as any)
      .order('created_at', { ascending: false });

    if (error && selectCols !== BASE_WORKER_COLUMNS) {
      // Graceful fallback to guaranteed baseline columns
      const { data: fallbackData, error: fbErr } = await supabase
        .from('worker_profiles')
        .select(BASE_WORKER_COLUMNS as any)
        .order('created_at', { ascending: false });
      data = fallbackData;
      error = fbErr;
    }

    if (error) {
      throw error;
    }

    rawData = data || [];

    const rawList = (rawData || []) as any[];
    return rawList.map((row) => {
      const { about: cleanAbout, metadata: aboutMeta } = extractAboutAndMetadata(row.about_text);
      const meta = parseWorkerMetadata(row.skills);
      const profileLocations = row.profile?.locations;
      let loc = Array.isArray(profileLocations)
        ? profileLocations[0] || null
        : profileLocations || null;

      const isActive =
        row.is_active !== undefined && row.is_active !== null
          ? Boolean(row.is_active)
          : aboutMeta.is_active !== undefined
          ? Boolean(aboutMeta.is_active)
          : meta.is_active !== undefined
          ? Boolean(meta.is_active)
          : true;

      const priceUnit = row.price_unit || aboutMeta.price_unit || meta.price_unit || 'day';
      const customPriceUnit = row.custom_price_unit || aboutMeta.custom_price_unit || meta.custom_price_unit || null;
      const isMobilePublic =
        row.profile?.is_mobile_public !== undefined && row.profile?.is_mobile_public !== null
          ? Boolean(row.profile.is_mobile_public)
          : aboutMeta.is_mobile_public !== undefined
          ? Boolean(aboutMeta.is_mobile_public)
          : meta.is_mobile_public !== undefined
          ? Boolean(meta.is_mobile_public)
          : true;

      return {
        ...row,
        about_text: cleanAbout,
        is_active: isActive,
        price_unit: priceUnit,
        custom_price_unit: customPriceUnit,
        is_mobile_public: isMobilePublic,
        location: loc,
      } as WorkerProfile;
    });
  }

  /**
   * Toggle Worker Activation (Feature 1: Admin Service Provider Activate / Deactivate)
   */
  static async toggleWorkerActivation(
    userId: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Safety guard: Admin account cannot be deactivated
      if (userId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72') {
        return { success: false, error: 'Cannot deactivate admin account' };
      }

      // Fetch existing row to retrieve existing metadata
      const { data: currentWorker, error: fetchErr } = await supabase
        .from('worker_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchErr || !currentWorker) {
        return { success: false, error: fetchErr?.message || 'Worker profile not found in database.' };
      }

      // 1. First attempt: Dedicated Admin RPC set_worker_activation_by_admin (if created in Supabase)
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('set_worker_activation_by_admin', {
          target_user_id: userId,
          new_is_active: isActive,
        });
        if (!rpcErr && rpcRes && (rpcRes.success === true || rpcRes.is_active !== undefined)) {
          WorkerService.invalidateCache(userId);
          return { success: true };
        }
      } catch {
        // Fallback to direct table update with RLS
      }

      const support = await checkExtendedSchemaSupport();

      if (support.worker) {
        const { error: nativeErr } = await supabase
          .from('worker_profiles')
          .update({
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (!nativeErr) {
          WorkerService.invalidateCache(userId);
          return { success: true };
        }
      }

      // 2. Fallback: Update about_text metadata tag
      const updatedAbout = appendMetadataToAbout(
        currentWorker.about_text,
        { is_active: isActive },
        currentWorker.about_text
      );

      const { error: updateErr } = await supabase
        .from('worker_profiles')
        .update({
          about_text: updatedAbout,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateErr) {
        console.error('Failed to update worker activation in Supabase:', updateErr);
        return { success: false, error: updateErr.message };
      }

      // Invalidate worker caches so changes reflect immediately across all discovery views (Home, Search, Map)
      WorkerService.invalidateCache(userId);

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Update Worker Priority Points (1-100) (Section 24 & 73)
   */
  static async updateWorkerPriority(
    userId: string,
    priorityPoints: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const clamped = Math.max(1, Math.min(100, Math.round(priorityPoints)));
      const { error } = await supabase
        .from('worker_profiles')
        .update({
          priority_points: clamped,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Update Requirement Priority Points (1-100) (Admin Only - Part 5 & 20)
   */
  static async updateRequirementPriority(
    requirementId: string,
    priorityPoints: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const clamped = Math.max(1, Math.min(100, Math.round(priorityPoints)));

      // Save local override so admin changes take effect immediately across all sessions
      try {
        localStorage.setItem(`admin_req_priority_${requirementId}`, String(clamped));
      } catch {}

      // Update in Supabase database if column exists
      const { error } = await supabase
        .from('requirements')
        .update({
          priority_points: clamped,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', requirementId);

      if (error) {
        console.warn('DB requirement priority update notice:', error.message);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Category Management (Section 74)
   */
  static async getCategoriesAdmin(): Promise<WorkerCategory[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name_hi', { ascending: true });

    if (error) return [];
    return data || [];
  }

  static async addCategory(
    nameHi: string,
    nameEn: string
  ): Promise<{ category: WorkerCategory | null; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          name_hi: nameHi.trim(),
          name_en: nameEn.trim(),
          is_active: true,
        })
        .select('*')
        .single();

      if (error) return { category: null, error: error.message };
      return { category: data };
    } catch (err) {
      return { category: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  static async toggleCategory(
    id: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    return { success: !error, error: error?.message };
  }

  static async editCategory(
    id: string,
    nameHi: string,
    nameEn: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name_hi: nameHi.trim(),
          name_en: nameEn.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  static async deleteCategory(
    id: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Delete Worker Account completely (Admin only)
   * Completely removes worker profile, user profile, storage, and Supabase Auth identity
   * according to official account-deletion architecture.
   */
  static async deleteWorkerAdmin(
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.deleteUserAdmin(userId);
  }

  /**
   * Delete User Account completely (Admin only)
   * Atomically deletes all associated records, media, storage, public profiles,
   * private mobile, and Supabase Auth user identity.
   */
  static async deleteUserAdmin(
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const ADMIN_UUID = '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72';
      if (userId === ADMIN_UUID) {
        return { success: false, error: 'एडमिन खाता नहीं हटाया जा सकता।' };
      }

      // Safety check: Never delete the admin account
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, mobile')
        .eq('id', userId)
        .maybeSingle();

      if (targetProfile && (targetProfile.mobile === '9149275779' || targetProfile.mobile === ADMIN_CONTACT_DEFAULT)) {
        return { success: false, error: 'एडमिन खाता नहीं हटाया जा सकता।' };
      }

      // 1. Remove all user-owned storage files across official buckets via official Supabase Storage API
      // Note: Direct deletion from storage.objects is prohibited by Supabase triggers.
      try {
        const [workerMediaRes, chatMediaRes, helpRes, workerReqRes] = await Promise.all([
          supabase.from('worker_media').select('storage_path').eq('worker_user_id', userId),
          supabase.from('message_media').select('storage_path').eq('sender_id', userId),
          supabase.from('help_requests').select('voice_storage_path').eq('user_id', userId),
          supabase.from('worker_requests').select('voice_storage_path').eq('user_id', userId),
        ]);

        if (workerMediaRes.data && workerMediaRes.data.length > 0) {
          const paths = workerMediaRes.data.map((m) => m.storage_path).filter(Boolean);
          if (paths.length > 0) {
            await supabase.storage.from('worker-media').remove(paths);
          }
        }
        if (chatMediaRes.data && chatMediaRes.data.length > 0) {
          const paths = chatMediaRes.data.map((m) => m.storage_path).filter(Boolean);
          if (paths.length > 0) {
            await supabase.storage.from('chat-media').remove(paths);
          }
        }
        if (helpRes.data && helpRes.data.length > 0) {
          const paths = helpRes.data.map((h) => h.voice_storage_path).filter(Boolean);
          if (paths.length > 0) {
            await supabase.storage.from('help-media').remove(paths);
          }
        }
        if (workerReqRes.data && workerReqRes.data.length > 0) {
          const paths = workerReqRes.data.map((w) => w.voice_storage_path).filter(Boolean);
          if (paths.length > 0) {
            await supabase.storage.from('help-media').remove(paths);
          }
        }

        // Clean user folder files across all 4 configured buckets
        const buckets = ['worker-media', 'profile-media', 'chat-media', 'help-media'];
        for (const bucket of buckets) {
          const { data: folderFiles } = await supabase.storage.from(bucket).list(userId);
          if (folderFiles && folderFiles.length > 0) {
            const filePaths = folderFiles.map((f) => `${userId}/${f.name}`);
            await supabase.storage.from(bucket).remove(filePaths);
          }
        }
      } catch (storageErr) {
        console.warn('Storage API files cleanup notice:', storageErr);
      }

      // Invalidate runtime in-memory and offline caches
      WorkerService.invalidateCache(userId);
      WorkerService.invalidateWorkerCache(userId);
      OfflineWorkerStorage.removeWorker(userId);

      // 2. Perform atomic deletion in database via privileged RPC
      // (This atomically removes dependent application rows, public.profiles,
      // public.user_private_mobile, auth.identities, auth.sessions, and auth.users)
      const { data: rpcRes, error: rpcError } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: userId,
      });

      if (rpcError) {
        // If RPC function not found in schema cache, report precise actionable error
        // Never fall back to deleting profiles separately — preserve all-or-nothing atomicity
        if (rpcError.code === 'PGRST202' || rpcError.message.includes('Could not find')) {
          return {
            success: false,
            error:
              'सुपाबेस में "delete_user_by_admin" SQL फ़ंक्शन आवश्यक है ताकि ऑथ यूज़र पूर्णतः डिलीट हो सके। कृपया Supabase SQL Editor में माइग्रेशन रन करें।',
          };
        }
        if (
          rpcError.message.includes('user_private_mobile') ||
          rpcError.message.includes('storage tables') ||
          rpcError.message.includes('storage.objects') ||
          rpcError.message.includes('Storage API')
        ) {
          return {
            success: false,
            error:
              'सुपाबेस में "delete_user_by_admin" फ़ंक्शन अपडेट होना आवश्यक है (user_private_mobile एरर ठीक करने के लिए)। कृपया Admin Panel में "SQL कॉपी करें" बटन दबाकर Supabase SQL Editor में नया SQL रन करें।',
          };
        }
        return { success: false, error: rpcError.message };
      }

      const parsed = rpcRes as { success?: boolean; error?: string } | null;
      if (parsed && parsed.success === false) {
        return { success: false, error: parsed.error || 'ऑथ उपयोगकर्ता हटाने में समस्या आई।' };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Apply Chat Retention: Delete messages older than specified days
   */
  static async applyChatRetention(
    retentionDays: number
  ): Promise<{ deletedCount: number; error?: string }> {
    try {
      if (retentionDays < 1) {
        return { deletedCount: 0, error: 'दिनों की संख्या कम से कम 1 होनी चाहिए।' };
      }
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('messages')
        .delete()
        .lt('created_at', cutoffDate)
        .select('id');

      if (error) return { deletedCount: 0, error: error.message };
      return { deletedCount: data ? data.length : 0 };
    } catch (err) {
      return { deletedCount: 0, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Admin Communication (Broadcast to all or specific person) (Section 44 & 77)
   */
  static async sendCommunication(params: {
    adminId: string;
    recipientId?: string | null;
    sendToAll: boolean;
    messageType: 'text' | 'voice' | 'media';
    messageText?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('admin_communication').insert({
        admin_id: params.adminId,
        recipient_id: params.sendToAll ? null : params.recipientId || null,
        send_to_all: params.sendToAll,
        message_type: params.messageType,
        message_text: params.messageText?.trim() || null,
        media_url: params.mediaUrl || null,
      });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Get all sent communications for Admin
   */
  static async getCommunicationsAdmin(): Promise<AdminCommunication[]> {
    try {
      const { data, error } = await supabase
        .from('admin_communication')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data) return [];
      return data;
    } catch {
      return [];
    }
  }

  /**
   * Delete a sent communication record
   */
  static async deleteCommunication(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('admin_communication')
        .delete()
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Get User Notifications (Admin Communication + per-user read state) (Section 44 & 45)
   */
  static async getUserNotifications(userId?: string): Promise<AdminCommunication[]> {
    try {
      let query = supabase.from('admin_communication').select('*');

      if (userId) {
        query = query.or(`send_to_all.eq.true,recipient_id.eq.${userId}`);
      } else {
        query = query.eq('send_to_all', true);
      }

      query = query.order('created_at', { ascending: false }).limit(20);

      const { data, error } = await query;
      if (error || !data) return [];

      return data;
    } catch {
      return [];
    }
  }
}
