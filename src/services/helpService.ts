import { supabase, isSchemaCacheError } from '../lib/supabase';
import { HelpRequest } from '../types';
import { MediaService } from './mediaService';

export class HelpService {
  static async submitHelpRequest(params: {
    name?: string;
    mobile?: string;
    voiceBlob?: Blob | null;
    description?: string;
    userId?: string;
    guestRequestId?: string;
  }): Promise<{ request: HelpRequest | null; error?: string }> {
    let voiceStoragePath: string | null = null;
    try {
      const realId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
      const tempId = params.guestRequestId || (realId ? `req_${realId.slice(0, 8)}` : `req_${Date.now()}`);

      // Upload voice recording if provided
      if (params.voiceBlob) {
        const { path, error: uploadErr } = await MediaService.uploadHelpVoice(
          tempId,
          params.voiceBlob
        );
        if (uploadErr || !path) {
          return {
            request: null,
            error: uploadErr || 'वॉयस रिकॉर्डिंग अपलोड नहीं हो सकी। कृपया पुनः प्रयास करें।',
          };
        }
        voiceStoragePath = path;
      }

      const insertPayload: Record<string, any> = {
        user_id: params.userId || null,
        guest_request_id: params.guestRequestId || null,
        request_type: 'voice_help',
        name: params.name?.trim() || null,
        mobile: params.mobile?.trim() || null,
        description: params.description?.trim() || null,
        status: 'pending',
      };

      if (realId) {
        insertPayload.id = realId;
      }

      if (voiceStoragePath) {
        insertPayload.voice_storage_path = voiceStoragePath;
      }

      // Insert request cleanly (applicable for both authenticated users and guests)
      const { error } = await supabase.from('help_requests').insert(insertPayload);
      if (error) {
        // Orphan cleanup if database insertion fails
        if (voiceStoragePath) {
          await supabase.storage.from('help-media').remove([voiceStoragePath]).catch(() => {});
        }
        return { request: null, error: error.message || 'अनुरोध दर्ज नहीं हो सका।' };
      }

      return {
        request: {
          id: realId || tempId,
          ...insertPayload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as HelpRequest,
      };
    } catch (err) {
      if (voiceStoragePath) {
        await supabase.storage.from('help-media').remove([voiceStoragePath]).catch(() => {});
      }
      return { request: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  static async getHelpRequests(): Promise<HelpRequest[]> {
    const { data, error } = await supabase
      .from('help_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      isSchemaCacheError(error);
      return [];
    }
    return data || [];
  }

  static async updateHelpRequestStatus(
    id: string,
    status: 'pending' | 'contacted' | 'resolved'
  ): Promise<boolean> {
    const { error } = await supabase
      .from('help_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    return !error;
  }

  /**
   * Delete an individual Help Request and its voice recording from private storage
   */
  static async deleteHelpRequest(
    id: string,
    voiceStoragePath?: string | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Delete voice recording from private help-media if present
      if (voiceStoragePath) {
        const { data: delData, error: storageErr } = await supabase.storage
          .from('help-media')
          .remove([voiceStoragePath]);

        if (storageErr || !delData || delData.length === 0) {
          return {
            success: false,
            error: `वॉयस रिकॉर्डिंग हटाने में विफलता (${storageErr?.message || 'स्टोरेज डिलीट अस्वीकृत'})। डेटाबेस रिकॉर्ड सुरक्षित रखा गया है ताकि रिकॉर्डिंग अनाथ न हो।`,
          };
        }
      }

      // 2. Delete database row only after storage deletion succeeded
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      let query = supabase.from('help_requests').delete();
      if (isUuid) {
        query = query.eq('id', id);
      } else {
        query = query.eq('guest_request_id', id);
      }
      const { error: dbErr } = await query;

      if (dbErr) {
        return {
          success: false,
          error: `डेटाबेस रिकॉर्ड हटाने में विफलता: ${dbErr.message}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'हटाने में अज्ञात त्रुटि',
      };
    }
  }

  /**
   * Clear All Help Requests and all associated voice recordings permanently
   */
  static async clearAllHelpRequests(): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
  }> {
    try {
      // 1. Fetch all existing records to get IDs and storage paths
      const { data: allReqs, error: fetchErr } = await supabase
        .from('help_requests')
        .select('id, voice_storage_path');

      if (fetchErr) {
        return {
          success: false,
          deletedCount: 0,
          error: `अनुरोध सूची प्राप्त करने में विफलता: ${fetchErr.message}`,
        };
      }

      if (!allReqs || allReqs.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      // 2. Collect every non-null voice_storage_path
      const pathsToDelete = allReqs
        .map((r) => r.voice_storage_path)
        .filter((p): p is string => Boolean(p && typeof p === 'string' && p.trim().length > 0));

      // 3. Delete all recordings from private help-media
      if (pathsToDelete.length > 0) {
        const { data: delData, error: storageErr } = await supabase.storage
          .from('help-media')
          .remove(pathsToDelete);

        if (storageErr || !delData || delData.length === 0) {
          return {
            success: false,
            deletedCount: 0,
            error: `स्टोरेज रिकॉर्डिंग्स हटाने में विफलता (${storageErr?.message || 'स्टोरेज डिलीट अस्वीकृत'})। कोई डेटाबेस रिकॉर्ड नहीं हटाया गया।`,
          };
        }
      }

      // 4. Delete corresponding rows from public.help_requests
      const idsToDelete = allReqs.map((r) => r.id);
      const { error: dbErr } = await supabase
        .from('help_requests')
        .delete()
        .in('id', idsToDelete);

      if (dbErr) {
        return {
          success: false,
          deletedCount: 0,
          error: `डेटाबेस रिकॉर्ड्स हटाने में विफलता: ${dbErr.message}`,
        };
      }

      // 5. Verify the table contains zero request rows
      const { count, error: countErr } = await supabase
        .from('help_requests')
        .select('*', { count: 'exact', head: true });

      if (countErr) {
        return {
          success: false,
          deletedCount: 0,
          error: `सत्यापन विफल: ${countErr.message}`,
        };
      }

      if (count !== 0) {
        return {
          success: false,
          deletedCount: allReqs.length - (count || 0),
          error: `कुछ रिकॉर्ड्स नहीं हटाए जा सके। शेष: ${count}`,
        };
      }

      return { success: true, deletedCount: allReqs.length };
    } catch (err) {
      return {
        success: false,
        deletedCount: 0,
        error: err instanceof Error ? err.message : 'हटाने में अज्ञात त्रुटि',
      };
    }
  }
}
