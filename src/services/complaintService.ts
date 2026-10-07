import { supabase } from '../lib/supabase';
import { ProviderComplaint, UserProfile } from '../types';
import { MediaService } from './mediaService';

export class ComplaintService {
  /**
   * Submit voice complaint against a service provider
   */
  static async submitComplaint(params: {
    userId: string;
    providerId: string;
    providerName?: string;
    voiceBlob: Blob;
  }): Promise<{ complaint: ProviderComplaint | null; error?: string }> {
    let voiceStoragePath: string | null = null;
    try {
      const realId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `comp_${Date.now()}`;

      // 1. Upload audio recording to private help-media storage
      const { path, error: uploadErr } = await MediaService.uploadComplaintVoice(
        realId,
        params.voiceBlob
      );

      if (uploadErr || !path) {
        return {
          complaint: null,
          error: uploadErr || 'वॉयस रिकॉर्डिंग अपलोड नहीं हो सकी। कृपया पुनः प्रयास करें।',
        };
      }
      voiceStoragePath = path;

      // 2. Try inserting into public.provider_complaints table first
      const payload: Record<string, any> = {
        id: realId,
        user_id: params.userId,
        provider_id: params.providerId,
        voice_storage_path: voiceStoragePath,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: insertData, error: dbErr } = await supabase
        .from('provider_complaints')
        .insert(payload)
        .select()
        .single();

      if (!dbErr) {
        return {
          complaint: (insertData as ProviderComplaint) || (payload as ProviderComplaint),
        };
      }

      // If provider_complaints table is not present in schema cache, fallback to help_requests
      const isSchemaErr =
        dbErr.code === 'PGRST205' ||
        dbErr.message?.toLowerCase().includes('schema cache') ||
        dbErr.message?.toLowerCase().includes('does not exist') ||
        dbErr.message?.toLowerCase().includes('relation');

      if (isSchemaErr) {
        const fallbackPayload = {
          id: realId,
          user_id: params.userId,
          request_type: 'provider_complaint',
          name: `शिकायत: ${params.providerName || 'सेवा प्रदाता'}`,
          voice_storage_path: voiceStoragePath,
          description: JSON.stringify({
            provider_id: params.providerId,
            provider_name: params.providerName || '',
          }),
          status: 'pending',
        };

        const { error: helpErr } = await supabase.from('help_requests').insert(fallbackPayload);
        if (helpErr) {
          // Cleanup storage if both inserts fail
          if (voiceStoragePath) {
            await supabase.storage.from(MediaService.BUCKET_HELP).remove([voiceStoragePath]).catch(() => {});
          }
          return { complaint: null, error: helpErr.message || 'शिकायत दर्ज नहीं हो सकी।' };
        }

        return {
          complaint: payload as ProviderComplaint,
        };
      }

      // Any other database error
      if (voiceStoragePath) {
        await supabase.storage.from(MediaService.BUCKET_HELP).remove([voiceStoragePath]).catch(() => {});
      }
      return { complaint: null, error: dbErr.message || 'शिकायत दर्ज नहीं हो सकी।' };
    } catch (err) {
      if (voiceStoragePath) {
        await supabase.storage.from(MediaService.BUCKET_HELP).remove([voiceStoragePath]).catch(() => {});
      }
      return { complaint: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Fetch all complaints for Admin with linked user & provider profiles
   */
  static async getComplaints(): Promise<ProviderComplaint[]> {
    try {
      const results: ProviderComplaint[] = [];

      // 1. Try fetching from provider_complaints
      const { data, error } = await supabase
        .from('provider_complaints')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        results.push(...data);
      }

      // 2. Also check fallback complaints stored in help_requests
      const { data: helpData, error: helpErr } = await supabase
        .from('help_requests')
        .select('*')
        .eq('request_type', 'provider_complaint')
        .order('created_at', { ascending: false });

      if (!helpErr && helpData) {
        for (const hr of helpData) {
          let provId = '';
          try {
            if (hr.description?.startsWith('{')) {
              const parsed = JSON.parse(hr.description);
              provId = parsed.provider_id || '';
            }
          } catch {}

          if (!results.some((r) => r.id === hr.id)) {
            results.push({
              id: hr.id,
              user_id: hr.user_id || '',
              provider_id: provId,
              voice_storage_path: hr.voice_storage_path || '',
              status: hr.status === 'contacted' ? 'reviewed' : hr.status === 'resolved' ? 'resolved' : 'pending',
              created_at: hr.created_at,
              updated_at: hr.updated_at,
            });
          }
        }
      }

      // 3. Hydrate User & Provider Profiles
      const userIdsToFetch = new Set<string>();
      results.forEach((c) => {
        if (c.user_id) userIdsToFetch.add(c.user_id);
        if (c.provider_id) userIdsToFetch.add(c.provider_id);
      });

      if (userIdsToFetch.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', Array.from(userIdsToFetch));

        if (profiles) {
          const profileMap = new Map<string, UserProfile>(profiles.map((p) => [p.id, p as UserProfile]));
          results.forEach((c) => {
            if (c.user_id) c.user = profileMap.get(c.user_id) || null;
            if (c.provider_id) c.provider = profileMap.get(c.provider_id) || null;
          });
        }
      }

      // Sort newest first
      return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (err) {
      console.warn('Error fetching complaints:', err);
      return [];
    }
  }

  /**
   * Update complaint status
   */
  static async updateComplaintStatus(
    id: string,
    status: 'pending' | 'reviewed' | 'resolved'
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('provider_complaints')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        // Fallback to help_requests
        const mappedStatus = status === 'reviewed' ? 'contacted' : status === 'resolved' ? 'resolved' : 'pending';
        await supabase
          .from('help_requests')
          .update({ status: mappedStatus, updated_at: new Date().toISOString() })
          .eq('id', id);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete complaint and its storage audio
   */
  static async deleteComplaint(id: string, voiceStoragePath?: string | null): Promise<boolean> {
    try {
      if (voiceStoragePath) {
        await supabase.storage.from(MediaService.BUCKET_HELP).remove([voiceStoragePath]).catch(() => {});
      }
      await supabase.from('provider_complaints').delete().eq('id', id);
      await supabase.from('help_requests').delete().eq('id', id);
      return true;
    } catch {
      return false;
    }
  }
}
