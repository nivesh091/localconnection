import { supabase } from '../lib/supabase';
import {
  CallRecord,
  CallRecording,
  CallStatus,
  CallEndReason,
  CallSignal,
  SignalType,
} from '../types/calling';
import { safeStorage } from '../lib/storage';
import { invalidateChatCaches } from './chatService';
import { AdminService } from './adminService';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export class CallingService {
  /**
   * Get set of call IDs deleted by a specific user from local persistent safeStorage
   */
  public static getDeletedCallIds(userId: string): Set<string> {
    try {
      const raw = safeStorage.getItem(`km_deleted_calls_${userId}`);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Delete a call record for the current user's view with authorization
   */
  public static async deleteCallForUser(callId: string, userId: string): Promise<boolean> {
    try {
      if (!callId || !userId) return false;

      // 1. Verify user is either caller or receiver
      const { data: call } = await supabase
        .from('calls')
        .select('id, caller_id, receiver_id')
        .eq('id', callId)
        .maybeSingle();

      if (call && call.caller_id !== userId && call.receiver_id !== userId) {
        console.warn('[CallingService] User unauthorized to delete call record:', callId);
        return false;
      }

      // 2. Persist in user's deleted calls storage
      const deletedSet = this.getDeletedCallIds(userId);
      deletedSet.add(callId);
      safeStorage.setItem(`km_deleted_calls_${userId}`, JSON.stringify(Array.from(deletedSet)));

      // 3. Mark personal recording deleted if owned by this user
      try {
        await supabase
          .from('call_recordings')
          .update({ is_deleted_by_user: true })
          .eq('call_id', callId)
          .eq('user_id', userId);
      } catch {}

      // 4. Invalidate conversation caches so conversation list reflects removal
      invalidateChatCaches(userId);

      return true;
    } catch (err) {
      console.warn('[CallingService] deleteCallForUser error:', err);
      return false;
    }
  }
  /**
   * Get WebRTC configuration with STUN and optional TURN servers
   */
  public static getRtcConfiguration(): RTCConfiguration {
    const config: RTCConfiguration = {
      iceServers: [...ICE_SERVERS],
      iceCandidatePoolSize: 2,
    };

    // If custom TURN server is provided in environment variables, add it
    const turnUrl = (import.meta as any).env?.VITE_TURN_URL;
    const turnUser = (import.meta as any).env?.VITE_TURN_USERNAME;
    const turnCred = (import.meta as any).env?.VITE_TURN_CREDENTIAL;

    if (turnUrl && turnUser && turnCred) {
      config.iceServers?.push({
        urls: turnUrl,
        username: turnUser,
        credential: turnCred,
      });
    }

    return config;
  }

  /**
   * Check if a recipient is eligible to receive Internet calls
   */
  public static async canReceiveCall(targetUserId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    try {
      // 1. First enforce Admin Global Calling Control (fail-safe)
      const callingSettings = await AdminService.getCallingSettings().catch(() => ({
        mobile_calling_enabled: false,
        internet_calling_enabled: false,
      }));
      if (!callingSettings.internet_calling_enabled) {
        return {
          allowed: false,
          reason: 'कॉल एडमिन द्वारा बंद की गई है (Internet calling has been disabled by the administrator)',
        };
      }

      if (!targetUserId) {
        return { allowed: false, reason: 'उपयोगकर्ता उपलब्ध नहीं है' };
      }

      // Check profiles table
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, name, is_internet_call_enabled')
        .eq('id', targetUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116' && error.code !== 'PGRST204') {
        console.warn('Profile fetch error for calling:', error);
      }

      if (profile && profile.is_internet_call_enabled === false) {
        return {
          allowed: false,
          reason: 'उपयोगकर्ता ने इंटरनेट कॉलिंग बंद कर रखी है (Internet calling is disabled by user)',
        };
      }

      return { allowed: true };
    } catch {
      // Fail safely: do not allow a disabled calling method to be used
      return { allowed: false, reason: 'कॉल सेवा अनुपलब्ध है' };
    }
  }

  /**
   * Initiate a new Internet call
   */
  public static async initiateCall(params: {
    callerId: string;
    receiverId: string;
    conversationId?: string | null;
    callerConsentAdminRecording: boolean;
    callerProfile?: any;
  }): Promise<{ success: boolean; call?: CallRecord; error?: string }> {
    try {
      // 1. Enforce Admin Global Calling Control (fail-safe)
      const callingSettings = await AdminService.getCallingSettings().catch(() => ({
        mobile_calling_enabled: false,
        internet_calling_enabled: false,
      }));
      if (!callingSettings.internet_calling_enabled) {
        return {
          success: false,
          error: 'कॉल एडमिन द्वारा बंद की गई है (Calling has been disabled by the administrator)',
        };
      }

      const eligibility = await this.canReceiveCall(params.receiverId);
      if (!eligibility.allowed) {
        return { success: false, error: eligibility.reason };
      }

      const nowIso = new Date().toISOString();

      // Ensure a conversation row exists between the two users
      let resolvedConversationId = params.conversationId || null;
      if (!resolvedConversationId && params.callerId && params.receiverId) {
        try {
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .or(
              `and(user_1_id.eq.${params.callerId},user_2_id.eq.${params.receiverId}),and(user_1_id.eq.${params.receiverId},user_2_id.eq.${params.callerId})`
            )
            .maybeSingle();

          if (existingConv?.id) {
            resolvedConversationId = existingConv.id;
          } else {
            const { data: newConv } = await supabase
              .from('conversations')
              .insert({
                user_1_id: params.callerId,
                user_2_id: params.receiverId,
                last_message_at: nowIso,
              })
              .select('id')
              .maybeSingle();
            if (newConv?.id) {
              resolvedConversationId = newConv.id;
            }
          }
        } catch (convErr) {
          console.warn('[CallingService] Conversation resolve notice:', convErr);
        }
      }

      // Update conversation last_message_at so the conversation surfaces immediately
      if (resolvedConversationId) {
        try {
          await supabase
            .from('conversations')
            .update({ last_message_at: nowIso, updated_at: nowIso })
            .eq('id', resolvedConversationId);
        } catch {}
      }

      // Invalidate chat caches for both participants so the conversation entry is immediately discovered
      invalidateChatCaches(params.callerId);
      invalidateChatCaches(params.receiverId);

      // Insert into calls table
      const { data, error } = await supabase
        .from('calls')
        .insert({
          caller_id: params.callerId,
          receiver_id: params.receiverId,
          conversation_id: resolvedConversationId,
          status: 'calling',
          started_at: nowIso,
          duration_seconds: 0,
          caller_consent_admin_recording: params.callerConsentAdminRecording,
          recipient_consent_admin_recording: false,
          admin_recording_active: false,
        })
        .select('*')
        .single();

      if (error) {
        console.warn('Call initiation insert failed:', error);
        return {
          success: false,
          error:
            error.code === '42P01'
              ? 'कॉलिंग डेटाबेस टेबल सेटअप लंबित है।'
              : error.message || 'कॉल शुरू करने में असमर्थ',
        };
      }

      const createdCall = data as CallRecord;

      // Broadcast instant incoming call alert directly to recipient's private user channel
      try {
        const userChannel = supabase.channel(`user_calls_${params.receiverId}`);
        await userChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            userChannel
              .send({
                type: 'broadcast',
                event: 'incoming_call',
                payload: {
                  call: createdCall,
                  caller: params.callerProfile || null,
                },
              })
              .then(() => {
                setTimeout(() => supabase.removeChannel(userChannel), 4000);
              })
              .catch(() => {});
          }
        });
      } catch (broadcastErr) {
        console.warn('Instant user broadcast failed, relying on postgres_changes:', broadcastErr);
      }

      return { success: true, call: createdCall };
    } catch (err: any) {
      return { success: false, error: err?.message || 'कॉल शुरू करने में त्रुटि' };
    }
  }

  /**
   * Answer incoming call and record receiver consent
   */
  public static async answerCall(params: {
    callId: string;
    receiverConsentAdminRecording: boolean;
  }): Promise<{ success: boolean; adminRecordingActive?: boolean; error?: string }> {
    try {
      const nowIso = new Date().toISOString();

      // Fetch call to verify caller consent
      const { data: call } = await supabase
        .from('calls')
        .select('caller_consent_admin_recording')
        .eq('id', params.callId)
        .maybeSingle();

      const adminRecordingActive =
        Boolean(call?.caller_consent_admin_recording) &&
        Boolean(params.receiverConsentAdminRecording);

      const updatePayload: Record<string, any> = {
        status: 'connecting',
        answered_at: nowIso,
        recipient_consent_admin_recording: params.receiverConsentAdminRecording,
        admin_recording_active: adminRecordingActive,
        updated_at: nowIso,
      };

      const { error } = await supabase
        .from('calls')
        .update(updatePayload)
        .eq('id', params.callId);

      if (error) {
        // Fallback without duplicate alias columns if schema is strict
        const fallbackPayload = {
          status: 'connecting',
          answered_at: nowIso,
          recipient_consent_admin_recording: params.receiverConsentAdminRecording,
          admin_recording_active: adminRecordingActive,
          updated_at: nowIso,
        };
        const { error: retryError } = await supabase
          .from('calls')
          .update(fallbackPayload)
          .eq('id', params.callId);

        if (retryError) {
          console.warn('answerCall update failed:', retryError);
          return { success: false, error: retryError.message };
        }
      }

      return { success: true, adminRecordingActive };
    } catch (err: any) {
      return { success: false, error: err?.message || 'कॉल स्वीकार करने में विफल' };
    }
  }

  /**
   * Transition call to connected once WebRTC media peer connection is actually established
   */
  public static async markCallConnected(callId: string): Promise<boolean> {
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'connected',
          connected_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', callId)
        .neq('status', 'ended');

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Reject incoming call
   */
  public static async rejectCall(callId: string): Promise<boolean> {
    try {
      const nowIso = new Date().toISOString();

      const { error } = await supabase
        .from('calls')
        .update({
          status: 'rejected',
          ended_reason: 'rejected',
          end_reason: 'rejected',
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', callId);

      if (error) {
        // Fallback for strict column schema
        await supabase
          .from('calls')
          .update({
            status: 'rejected',
            ended_reason: 'rejected',
            ended_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', callId);
      }

      // Update linked conversation timestamp and invalidate caches
      if (callId) {
        try {
          const { data: callRow } = await supabase
            .from('calls')
            .select('conversation_id, caller_id, receiver_id')
            .eq('id', callId)
            .maybeSingle();

          if (callRow?.conversation_id) {
            await supabase
              .from('conversations')
              .update({ last_message_at: nowIso, updated_at: nowIso })
              .eq('id', callRow.conversation_id);
          }
          if (callRow?.caller_id) invalidateChatCaches(callRow.caller_id);
          if (callRow?.receiver_id) invalidateChatCaches(callRow.receiver_id);
        } catch {}
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * End active call or mark missed/failed
   */
  public static async endCall(params: {
    callId: string;
    reason?: CallEndReason | string;
    durationSeconds?: number;
    status?: CallStatus;
  }): Promise<boolean> {
    try {
      const finalStatus =
        params.status || (params.reason === 'timeout_unanswered' ? 'missed' : 'ended');
      const finalReason = params.reason || 'normal';
      const nowIso = new Date().toISOString();

      const { error } = await supabase
        .from('calls')
        .update({
          status: finalStatus,
          ended_reason: finalReason,
          end_reason: finalReason,
          duration_seconds: params.durationSeconds || 0,
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', params.callId);

      if (error) {
        await supabase
          .from('calls')
          .update({
            status: finalStatus,
            ended_reason: finalReason,
            duration_seconds: params.durationSeconds || 0,
            ended_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', params.callId);
      }

      // Update linked conversation timestamp and invalidate caches
      if (params.callId) {
        try {
          const { data: callRow } = await supabase
            .from('calls')
            .select('conversation_id, caller_id, receiver_id')
            .eq('id', params.callId)
            .maybeSingle();

          if (callRow?.conversation_id) {
            await supabase
              .from('conversations')
              .update({ last_message_at: nowIso, updated_at: nowIso })
              .eq('id', callRow.conversation_id);
          }
          if (callRow?.caller_id) invalidateChatCaches(callRow.caller_id);
          if (callRow?.receiver_id) invalidateChatCaches(callRow.receiver_id);
        } catch {}
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send WebRTC signal (Offer, Answer, ICE Candidate, State)
   * Broadcasts to room channel and persists core SDP / ICE in call_signals table
   */
  public static async sendSignal(
    signal: CallSignal,
    activeRoomChannel?: any
  ): Promise<void> {
    try {
      // 1. Broadcast to realtime room channel
      if (activeRoomChannel) {
        activeRoomChannel.send({
          type: 'broadcast',
          event: 'signal',
          payload: signal,
        });
      } else {
        const channel = supabase.channel(`call_room_${signal.call_id}`);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel
              .send({
                type: 'broadcast',
                event: 'signal',
                payload: signal,
              })
              .catch(() => {});
          }
        });
      }

      // 2. Persist offer, answer, ice_candidate, end / ended in call_signals table for reliability
      const persistableTypes = ['offer', 'answer', 'ice_candidate', 'end', 'ended'];
      if (persistableTypes.includes(signal.type)) {
        try {
          const dbType = signal.type === 'ended' ? 'end' : signal.type;
          await supabase.from('call_signals').insert({
            call_id: signal.call_id,
            sender_id: signal.sender_id,
            recipient_id: signal.recipient_id,
            type: dbType,
            payload: signal.payload,
          });
        } catch {
          // Fallback if table unavailable or transient network
        }
      }
    } catch (err) {
      console.warn('Failed to send call signal:', err);
    }
  }

  /**
   * Retrieve stored Offer from call_signals table (handles race condition when receiver answers later)
   */
  public static async getOfferSignal(callId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('call_signals')
        .select('payload')
        .eq('call_id', callId)
        .eq('type', 'offer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.payload) {
        return data.payload;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieve stored Answer from call_signals table (handles race condition when caller receives answer later)
   */
  public static async getAnswerSignal(callId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('call_signals')
        .select('payload')
        .eq('call_id', callId)
        .eq('type', 'answer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.payload) {
        return data.payload;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieve stored ICE candidates for a call
   */
  public static async getIceCandidates(
    callId: string,
    senderId?: string
  ): Promise<any[]> {
    try {
      let query = supabase
        .from('call_signals')
        .select('payload, sender_id')
        .eq('call_id', callId)
        .eq('type', 'ice_candidate')
        .order('created_at', { ascending: true });

      if (senderId) {
        query = query.eq('sender_id', senderId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map((row) => row.payload).filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Listen for incoming calls to the current authenticated user
   * Combines user-specific broadcast channel (<50ms) + postgres_changes fallback
   */
  public static subscribeToIncomingCalls(
    userId: string,
    onIncoming: (call: CallRecord) => void
  ): () => void {
    const channelName = `user_calls_${userId}`;

    const channel = supabase
      .channel(channelName, {
        config: { broadcast: { self: false } },
      })
      // 1. Direct WebSocket broadcast listener
      .on('broadcast', { event: 'incoming_call' }, async ({ payload }) => {
        if (!payload?.call) return;
        const incomingCall = payload.call as CallRecord;

        if (incomingCall.status === 'calling' && incomingCall.receiver_id === userId) {
          let callerProfile = payload.caller;
          if (!callerProfile) {
            const { data } = await supabase
              .from('profiles')
              .select('id, name, profile_photo, mobile')
              .eq('id', incomingCall.caller_id)
              .maybeSingle();
            callerProfile = data;
          }

          onIncoming({
            ...incomingCall,
            caller: callerProfile,
          });
        }
      })
      // 2. Database postgres_changes listener
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          const callData = payload.new as CallRecord;
          if (callData && callData.status === 'calling') {
            const { data: callerProfile } = await supabase
              .from('profiles')
              .select('id, name, profile_photo, mobile')
              .eq('id', callData.caller_id)
              .maybeSingle();

            onIncoming({
              ...callData,
              caller: callerProfile as any,
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn(`Incoming call subscription notice (${channelName}):`, status, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Upload Call Recording audio to Supabase Storage & register in database
   */
  public static async uploadRecording(params: {
    blob: Blob;
    callId: string;
    recordingType: 'personal' | 'admin_evidence';
    userId?: string;
    durationSeconds: number;
  }): Promise<{ success: boolean; recordingId?: string; error?: string }> {
    try {
      const fileExt = params.blob.type.includes('mp4') ? 'mp4' : 'webm';
      let storagePath: string;

      // Ensure storage path strictly matches RLS bucket policies:
      // user-recordings/<userId>/... and admin-evidence/...
      if (params.recordingType === 'personal') {
        if (!params.userId) return { success: false, error: 'User ID missing' };
        storagePath = `user-recordings/${params.userId}/${params.callId}_${Date.now()}.${fileExt}`;
      } else {
        storagePath = `admin-evidence/${params.callId}_${Date.now()}.${fileExt}`;
      }

      // 1. Upload to Supabase Storage bucket 'call-recordings'
      const { error: uploadError } = await supabase.storage
        .from('call-recordings')
        .upload(storagePath, params.blob, {
          contentType: params.blob.type || 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload failed:', uploadError);
        return { success: false, error: uploadError.message };
      }

      // 2. Register recording record in database
      const retentionDays = 30;
      const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: recData, error: recError } = await supabase
        .from('call_recordings')
        .insert({
          call_id: params.callId,
          user_id: params.recordingType === 'personal' ? params.userId : null,
          owner_id: params.recordingType === 'personal' ? params.userId : null,
          recording_type: params.recordingType,
          storage_path: storagePath,
          file_size_bytes: params.blob.size,
          duration_seconds: params.durationSeconds,
          mime_type: params.blob.type || 'audio/webm',
          expires_at: expiresAt,
        })
        .select('id')
        .maybeSingle();

      if (recError) {
        // Fallback for strict user_id only
        const { data: retryData } = await supabase
          .from('call_recordings')
          .insert({
            call_id: params.callId,
            user_id: params.recordingType === 'personal' ? params.userId : null,
            recording_type: params.recordingType,
            storage_path: storagePath,
            file_size_bytes: params.blob.size,
            duration_seconds: params.durationSeconds,
            mime_type: params.blob.type || 'audio/webm',
            expires_at: expiresAt,
          })
          .select('id')
          .maybeSingle();

        return { success: true, recordingId: retryData?.id };
      }

      return { success: true, recordingId: recData?.id };
    } catch (err: any) {
      console.error('uploadRecording error:', err);
      return { success: false, error: err?.message || 'रिकॉर्डिंग अपलोड में त्रुटि' };
    }
  }

  /**
   * Get Short-Lived Authorized Signed URL for Audio Playback
   */
  public static async getSignedAudioUrl(storagePath: string): Promise<string | null> {
    try {
      if (!storagePath) return null;

      // 1-hour expiration
      const { data, error } = await supabase.storage
        .from('call-recordings')
        .createSignedUrl(storagePath, 3600);

      if (error || !data?.signedUrl) {
        console.warn('Failed to generate signed URL:', error);
        return null;
      }

      return data.signedUrl;
    } catch {
      return null;
    }
  }

  /**
   * Fetch Personal Call Recordings for current user
   */
  public static async getPersonalRecordings(userId: string): Promise<CallRecording[]> {
    try {
      // Query by user_id
      const { data, error } = await supabase
        .from('call_recordings')
        .select(`
          *,
          call:calls(
            id,
            started_at,
            ended_at,
            duration_seconds,
            status,
            caller_id,
            receiver_id,
            caller:profiles!calls_caller_id_fkey(id, name, profile_photo, mobile),
            receiver:profiles!calls_receiver_id_fkey(id, name, profile_photo, mobile)
          )
        `)
        .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
        .eq('recording_type', 'personal')
        .is('purged_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        // Retry with user_id only
        const { data: retryData, error: retryErr } = await supabase
          .from('call_recordings')
          .select(`
            *,
            call:calls(
              id,
              started_at,
              ended_at,
              duration_seconds,
              status,
              caller_id,
              receiver_id,
              caller:profiles!calls_caller_id_fkey(id, name, profile_photo, mobile),
              receiver:profiles!calls_receiver_id_fkey(id, name, profile_photo, mobile)
            )
          `)
          .eq('user_id', userId)
          .eq('recording_type', 'personal')
          .is('purged_at', null)
          .order('created_at', { ascending: false });

        if (retryErr) {
          console.warn('Error fetching personal recordings:', retryErr);
          return [];
        }
        return (retryData || []) as CallRecording[];
      }

      return (data || []) as CallRecording[];
    } catch {
      return [];
    }
  }

  /**
   * Delete personal recording (removes audio file from storage and database)
   */
  public static async deletePersonalRecording(
    recordingId: string,
    storagePath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Remove storage object
      await supabase.storage.from('call-recordings').remove([storagePath]);

      // 2. Delete database record
      const { error: dbError } = await supabase
        .from('call_recordings')
        .delete()
        .eq('id', recordingId);

      if (dbError) {
        return { success: false, error: dbError.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'हटाने में त्रुटि' };
    }
  }

  /**
   * Admin: Get all call recordings (with filters)
   */
  public static async getAdminRecordings(params?: {
    recordingType?: 'all' | 'personal' | 'admin_evidence';
    searchTerm?: string;
  }): Promise<CallRecording[]> {
    try {
      let query = supabase
        .from('call_recordings')
        .select(`
          *,
          call:calls(
            id,
            started_at,
            ended_at,
            duration_seconds,
            status,
            caller_id,
            receiver_id,
            caller_consent_admin_recording,
            recipient_consent_admin_recording,
            admin_recording_active,
            caller:profiles!calls_caller_id_fkey(id, name, profile_photo, mobile),
            receiver:profiles!calls_receiver_id_fkey(id, name, profile_photo, mobile)
          )
        `)
        .is('purged_at', null)
        .order('created_at', { ascending: false });

      if (params?.recordingType && params.recordingType !== 'all') {
        query = query.eq('recording_type', params.recordingType);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Admin recordings query error:', error);
        return [];
      }

      let results = (data || []) as CallRecording[];

      if (params?.searchTerm && params.searchTerm.trim()) {
        const term = params.searchTerm.toLowerCase().trim();
        results = results.filter((item) => {
          const cName = item.call?.caller?.name?.toLowerCase() || '';
          const rName = item.call?.receiver?.name?.toLowerCase() || '';
          const cMob = item.call?.caller?.mobile || '';
          const rMob = item.call?.receiver?.mobile || '';
          return (
            cName.includes(term) ||
            rName.includes(term) ||
            cMob.includes(term) ||
            rMob.includes(term) ||
            item.call_id.includes(term)
          );
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Admin: Permanently delete all recordings for a specific call
   */
  public static async adminPermanentDeleteCallRecordings(
    callId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: recordings } = await supabase
        .from('call_recordings')
        .select('id, storage_path')
        .eq('call_id', callId);

      const pathsToDelete = (recordings || []).map((r) => r.storage_path).filter(Boolean);

      if (pathsToDelete.length > 0) {
        await supabase.storage.from('call-recordings').remove(pathsToDelete);
      }

      const { error } = await supabase
        .from('call_recordings')
        .delete()
        .eq('call_id', callId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'स्थायी रूप से हटाने में विफल' };
    }
  }

  /**
   * Alias: Get Short-Lived Signed URL for Audio Playback
   */
  public static async getRecordingSignedUrl(
    storagePath: string,
    expiresInSeconds: number = 3600
  ): Promise<string | null> {
    try {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from('call-recordings')
        .createSignedUrl(storagePath, expiresInSeconds);

      if (error || !data?.signedUrl) {
        console.warn('Failed to generate recording signed URL:', error);
        return null;
      }
      return data.signedUrl;
    } catch {
      return null;
    }
  }

  /**
   * Fetch call history between two users or for a conversation
   */
  public static async getCallHistory(params: {
    userId1?: string;
    userId2?: string;
    conversationId?: string;
  }): Promise<CallRecord[]> {
    try {
      let query = supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (params.userId1 && params.userId2) {
        query = query.or(
          `and(caller_id.eq.${params.userId1},receiver_id.eq.${params.userId2}),and(caller_id.eq.${params.userId2},receiver_id.eq.${params.userId1})`
        );
      } else if (params.conversationId) {
        query = query.eq('conversation_id', params.conversationId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('getCallHistory error:', error);
        return [];
      }
      let calls = (data || []) as CallRecord[];
      if (params.userId1) {
        const deletedSet = this.getDeletedCallIds(params.userId1);
        if (deletedSet.size > 0) {
          calls = calls.filter((c) => !deletedSet.has(c.id));
        }
      }
      return calls;
    } catch {
      return [];
    }
  }

  /**
   * Admin: Update Call Recording Retention Setting
   */
  public static async updateRetentionSetting(
    days: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('admin_settings')
        .update({
          call_recording_retention_days: days,
          updated_at: new Date().toISOString(),
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'सेटिंग सहेजने में त्रुटि' };
    }
  }

  /**
   * Helper: Cache user preference in local storage
   */
  public static setLocalCallPreference(
    userId: string,
    key: 'internetCallingEnabled' | 'personalRecordingEnabled',
    value: boolean
  ): void {
    if (typeof window === 'undefined') return;
    safeStorage.setItem(`km_call_${key}_${userId}`, String(value));
  }

  public static getLocalCallPreference(
    userId: string,
    key: 'internetCallingEnabled' | 'personalRecordingEnabled'
  ): boolean | null {
    if (typeof window === 'undefined') return null;
    const val = safeStorage.getItem(`km_call_${key}_${userId}`);
    if (val === null) return null;
    return val === 'true';
  }
}
