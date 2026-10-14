import { supabase, isSchemaCacheError, withNetworkRetry, isNetworkError } from '../lib/supabase';
import { safeStorage } from '../lib/storage';
import { ChatIndexedDB, ConversationSnapshot } from '../lib/chatIndexedDB';
import { Conversation, Message, MessageType, UserProfile, CommentReference } from '../types';
import { MediaService } from './mediaService';

export const ADMIN_USER_ID = '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72';

export interface PendingMessageItem {
  tempId: string;
  conversationId: string;
  senderId: string;
  messageType: MessageType;
  messageText?: string;
  commentReference?: CommentReference;
  message: Message;
  createdAt: number;
}

// In-memory cache for fast navigation and deduplication
const conversationsCache = new Map<string, { data: Conversation[]; timestamp: number }>();
const conversationsInFlight = new Map<string, Promise<Conversation[]>>();
const CONVERSATIONS_TTL = 8000; // 8 seconds

const unreadCountCache = new Map<string, { count: number; timestamp: number }>();
const unreadCountInFlight = new Map<string, Promise<number>>();
const UNREAD_COUNT_TTL = 8000; // 8 seconds

export function invalidateChatCaches(userId?: string) {
  if (userId) {
    conversationsCache.delete(userId);
    unreadCountCache.delete(userId);
  } else {
    conversationsCache.clear();
    unreadCountCache.clear();
  }
}

export class ChatService {
  private static getDeletedConversationsMap(userId: string): Map<string, string> {
    try {
      const raw = safeStorage.getItem(`kaammitra_deleted_convs_${userId}`);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  private static setDeletedConversationsMap(userId: string, map: Map<string, string>): void {
    try {
      const obj = Object.fromEntries(map);
      safeStorage.setItem(`kaammitra_deleted_convs_${userId}`, JSON.stringify(obj));
    } catch {}
  }

  /**
   * Save the most recent conversation snapshot into IndexedDB whenever
   * a message is successfully received or sent.
   */
  static async saveConversationSnapshot(
    conversationId: string,
    messages: Message[],
    otherUser?: UserProfile | null
  ): Promise<void> {
    if (!conversationId || !messages) return;
    try {
      // 1. Sync safeStorage cache for instant zero-latency memory access
      this.saveCachedMessages(conversationId, messages);
      if (otherUser) {
        this.saveCachedOtherUser(conversationId, otherUser);
      }
      // 2. Persist comprehensive snapshot into IndexedDB
      await ChatIndexedDB.saveSnapshot(conversationId, messages, otherUser);
    } catch (err) {
      console.warn('[ChatService] Failed to save conversation snapshot to IndexedDB:', err);
    }
  }

  /**
   * Retrieve the most recent conversation snapshot from IndexedDB
   */
  static async getConversationSnapshot(
    conversationId: string,
    currentUserId?: string
  ): Promise<{ messages: Message[]; otherUser?: UserProfile | null } | null> {
    if (!conversationId) return null;
    try {
      const snapshot = await ChatIndexedDB.getSnapshot(conversationId);
      if (snapshot && Array.isArray(snapshot.messages) && snapshot.messages.length > 0) {
        const list = snapshot.messages.map((m: Message) => ({
          ...m,
          is_mine: currentUserId ? m.sender_id === currentUserId : m.is_mine,
        }));

        // Merge any pending offline messages
        const pending = this.getPendingMessages(conversationId);
        for (const item of pending) {
          if (!list.some((m) => m.id === item.tempId)) {
            list.push({
              ...item.message,
              is_mine: currentUserId ? item.message.sender_id === currentUserId : item.message.is_mine,
            });
          }
        }

        return {
          messages: list,
          otherUser: snapshot.otherUser || null,
        };
      }
    } catch (err) {
      console.warn('[ChatService] Failed to read snapshot from IndexedDB:', err);
    }
    return null;
  }

  /**
   * Save messages into offline safeStorage cache and IndexedDB for a conversation
   */
  static saveCachedMessages(conversationId: string, messages: Message[], otherUser?: UserProfile | null): void {
    if (!conversationId || !messages) return;
    try {
      // Exclude temporary pending messages from authoritative server cache
      const serverMsgs = messages.filter((m) => m.status !== 'pending' && !m.id.startsWith('pending_'));
      const slice = serverMsgs.slice(-150);
      safeStorage.setItem(`km_chat_msgs_${conversationId}`, JSON.stringify(slice));
      // Asynchronously mirror into IndexedDB snapshot
      ChatIndexedDB.saveSnapshot(conversationId, slice, otherUser).catch(() => {});
    } catch (err) {
      console.warn('[ChatService] Failed to cache messages:', err);
    }
  }

  /**
   * Retrieve cached messages for a conversation, merged with any offline pending items
   */
  static getCachedMessages(conversationId: string, currentUserId?: string): Message[] {
    if (!conversationId) return [];
    try {
      const raw = safeStorage.getItem(`km_chat_msgs_${conversationId}`);
      let list: Message[] = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          list = parsed.map((m: Message) => ({
            ...m,
            is_mine: currentUserId ? m.sender_id === currentUserId : m.is_mine,
          }));
        }
      }

      // Merge any pending offline messages that are not yet on the server
      const pending = this.getPendingMessages(conversationId);
      for (const item of pending) {
        if (!list.some((m) => m.id === item.tempId)) {
          list.push({
            ...item.message,
            is_mine: currentUserId ? item.message.sender_id === currentUserId : item.message.is_mine,
          });
        }
      }

      return list;
    } catch {
      return [];
    }
  }

  /**
   * Save and get other participant cached profile for offline rendering
   */
  static saveCachedOtherUser(conversationId: string, profile: UserProfile): void {
    if (!conversationId || !profile) return;
    try {
      safeStorage.setItem(`km_chat_other_user_${conversationId}`, JSON.stringify(profile));
    } catch {}
  }

  static getCachedOtherUser(conversationId: string): UserProfile | null {
    if (!conversationId) return null;
    try {
      const raw = safeStorage.getItem(`km_chat_other_user_${conversationId}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  /**
   * Pending messages queue management for offline sending
   */
  static getPendingMessages(conversationId: string): PendingMessageItem[] {
    if (!conversationId) return [];
    try {
      const raw = safeStorage.getItem(`km_pending_msgs_${conversationId}`);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  static addPendingMessage(conversationId: string, item: PendingMessageItem): void {
    if (!conversationId || !item) return;
    try {
      const existing = this.getPendingMessages(conversationId);
      const filtered = existing.filter((q) => q.tempId !== item.tempId);
      filtered.push(item);
      safeStorage.setItem(`km_pending_msgs_${conversationId}`, JSON.stringify(filtered));
    } catch (err) {
      console.warn('[ChatService] Failed to save pending message to storage:', err);
    }
  }

  static removePendingMessage(conversationId: string, tempId: string): void {
    if (!conversationId || !tempId) return;
    try {
      const existing = this.getPendingMessages(conversationId);
      const filtered = existing.filter((q) => q.tempId !== tempId);
      if (filtered.length > 0) {
        safeStorage.setItem(`km_pending_msgs_${conversationId}`, JSON.stringify(filtered));
      } else {
        safeStorage.removeItem(`km_pending_msgs_${conversationId}`);
      }
    } catch {}
  }

  static clearPendingMessages(conversationId: string): void {
    try {
      safeStorage.removeItem(`km_pending_msgs_${conversationId}`);
    } catch {}
  }

  /**
   * Get all conversations for a user ordered by last_message_at DESC (Section 36)
   */
  static async getConversations(userId: string): Promise<Conversation[]> {
    const now = Date.now();
    const cached = conversationsCache.get(userId);
    if (cached && now - cached.timestamp < CONVERSATIONS_TTL) {
      return cached.data;
    }

    if (conversationsInFlight.has(userId)) {
      return conversationsInFlight.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        const { data, error } = await withNetworkRetry(async () =>
          supabase
            .from('conversations')
            .select(`
              id,
              user_1_id,
              user_2_id,
              last_message_at,
              created_at,
              updated_at,
              user1:profiles!conversations_user_1_id_fkey(id, name, profile_photo, mobile),
              user2:profiles!conversations_user_2_id_fkey(id, name, profile_photo, mobile)
            `)
            .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`)
            .order('last_message_at', { ascending: false })
        );

        if (error) {
          if (isSchemaCacheError(error)) {
            console.warn('Supabase conversations table not found in schema cache.');
          } else {
            console.warn('Conversations fetch notice (offline or network retry):', error.message || error);
          }
          if (cached) return cached.data;
          const offlineRaw = safeStorage.getItem(`km_conversations_${userId}`);
          if (offlineRaw) {
            try { return JSON.parse(offlineRaw); } catch {}
          }
          return [];
        }

        const convItems = data || [];
        const convIds = convItems.map((item) => item.id);
        const unreadCountMap: Record<string, number> = {};

        // Run unread counts and latest messages in parallel
        const [unreadRes, latestMsgResults] = await Promise.all([
          convIds.length > 0
            ? supabase
                .from('messages')
                .select('conversation_id')
                .in('conversation_id', convIds)
                .neq('sender_id', userId)
                .neq('status', 'read')
            : Promise.resolve({ data: [] }),
          Promise.all(
            convItems.map((item) =>
              supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', item.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            )
          ),
        ]);

        if (unreadRes.data) {
          for (const r of unreadRes.data) {
            unreadCountMap[r.conversation_id] = (unreadCountMap[r.conversation_id] || 0) + 1;
          }
        }

        // Query worker profiles and user profiles for other participants in parallel
        const otherUserIds = Array.from(
          new Set(
            convItems
              .map((item) => (item.user_1_id === userId ? item.user_2_id : item.user_1_id))
              .filter(Boolean)
          )
        );

        const [workerRes, profileRes] = await Promise.allSettled([
          otherUserIds.length > 0
            ? supabase.from('worker_profiles').select('user_id').in('user_id', otherUserIds)
            : Promise.resolve({ data: [] }),
          otherUserIds.length > 0
            ? supabase.from('profiles').select('id, name, profile_photo, mobile').in('id', otherUserIds)
            : Promise.resolve({ data: [] }),
        ]);

        const workerActiveMap: Record<string, boolean> = {};
        if (workerRes.status === 'fulfilled' && (workerRes.value as any)?.data) {
          for (const wp of (workerRes.value as any).data) {
            workerActiveMap[wp.user_id] = true;
          }
        }

        const profileMap: Record<string, any> = {};
        if (profileRes.status === 'fulfilled' && (profileRes.value as any)?.data) {
          for (const p of (profileRes.value as any).data) {
            profileMap[p.id] = p;
          }
        }

        const list: Conversation[] = convItems.map((item, idx) => {
          const targetOtherId = item.user_1_id === userId ? item.user_2_id : item.user_1_id;
          const joinedOther = item.user_1_id === userId ? item.user2 : item.user1;
          const fallbackProfile = targetOtherId ? profileMap[targetOtherId] : undefined;
          const rawOther = joinedOther || fallbackProfile;

          const isWorker = Boolean(targetOtherId && targetOtherId in workerActiveMap);
          const isWorkerActive =
            targetOtherId && targetOtherId in workerActiveMap ? workerActiveMap[targetOtherId] : undefined;

          const other: UserProfile = {
            id: targetOtherId,
            name: (rawOther as any)?.name || 'उपयोगकर्ता',
            profile_photo: (rawOther as any)?.profile_photo || null,
            mobile: (rawOther as any)?.mobile || '',
            created_at: (rawOther as any)?.created_at || item.created_at,
            updated_at: (rawOther as any)?.updated_at || item.updated_at,
            is_worker: isWorker,
            is_worker_active: isWorkerActive,
            ...(rawOther || {}),
          };

          const latestMsg = latestMsgResults[idx]?.data || null;
          const latestTimestamp = latestMsg?.created_at || item.last_message_at || item.created_at;

          return {
            id: item.id,
            user_1_id: item.user_1_id,
            user_2_id: item.user_2_id,
            last_message_at: latestTimestamp,
            created_at: item.created_at,
            updated_at: item.updated_at,
            other_user: other,
            latest_message: latestMsg || undefined,
            unread_count: unreadCountMap[item.id] || 0,
          };
        });

        const deletedMap = this.getDeletedConversationsMap(userId);
        const filteredList = list.filter((conv) => {
          if (!deletedMap.has(conv.id)) return true;
          const deletedAt = new Date(deletedMap.get(conv.id)!).getTime();
          const lastActivityTime = new Date(conv.latest_message?.created_at || conv.last_message_at || conv.created_at).getTime();
          return lastActivityTime > deletedAt;
        });

        // Sort by most recent activity timestamp DESC (latest message timestamp first)
        filteredList.sort((a, b) => {
          const timeA = new Date(a.latest_message?.created_at || a.last_message_at || a.created_at).getTime();
          const timeB = new Date(b.latest_message?.created_at || b.last_message_at || b.created_at).getTime();
          return timeB - timeA;
        });

        conversationsCache.set(userId, { data: filteredList, timestamp: Date.now() });
        safeStorage.setItem(`km_conversations_${userId}`, JSON.stringify(filteredList));
        return filteredList;
      } catch {
        if (cached) return cached.data;
        const offlineRaw = safeStorage.getItem(`km_conversations_${userId}`);
        if (offlineRaw) {
          try { return JSON.parse(offlineRaw); } catch {}
        }
        return [];
      } finally {
        conversationsInFlight.delete(userId);
      }
    })();

    conversationsInFlight.set(userId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Get total unread messages count for a user across all conversations
   */
  static async getTotalUnreadCount(userId: string): Promise<number> {
    const now = Date.now();
    const cached = unreadCountCache.get(userId);
    if (cached && now - cached.timestamp < UNREAD_COUNT_TTL) {
      return cached.count;
    }

    if (unreadCountInFlight.has(userId)) {
      return unreadCountInFlight.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        const { data: userConvs } = await supabase
          .from('conversations')
          .select('id')
          .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`);

        if (!userConvs || userConvs.length === 0) {
          unreadCountCache.set(userId, { count: 0, timestamp: Date.now() });
          return 0;
        }
        const convIds = userConvs.map((c) => c.id);

        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', userId)
          .neq('status', 'read');

        const total = count || 0;
        unreadCountCache.set(userId, { count: total, timestamp: Date.now() });
        return total;
      } catch {
        if (cached) return cached.count;
        return 0;
      } finally {
        unreadCountInFlight.delete(userId);
      }
    })();

    unreadCountInFlight.set(userId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Get or create unique conversation between two users (Section 40)
   */
  static async getOrCreateConversation(
    userId: string,
    targetUserId: string
  ): Promise<{ conversation: Conversation | null; error?: string }> {
    if (userId === targetUserId) {
      return { conversation: null, error: 'खुद से चैट नहीं की जा सकती।' };
    }

    try {
      // Check existing conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select(`
          id,
          user_1_id,
          user_2_id,
          last_message_at,
          created_at,
          updated_at,
          user1:profiles!conversations_user_1_id_fkey(id, name, profile_photo, mobile),
          user2:profiles!conversations_user_2_id_fkey(id, name, profile_photo, mobile)
        `)
        .or(
          `and(user_1_id.eq.${userId},user_2_id.eq.${targetUserId}),and(user_1_id.eq.${targetUserId},user_2_id.eq.${userId})`
        )
        .maybeSingle();

      // Check if target user is a worker
      let isTargetWorker = false;
      let isWorkerActive: boolean | undefined = undefined;
      try {
        const { data: wpData } = await supabase
          .from('worker_profiles')
          .select('user_id, is_active')
          .eq('user_id', targetUserId)
          .maybeSingle();
        if (wpData) {
          isTargetWorker = true;
          isWorkerActive = wpData.is_active !== false;
        }
      } catch {}

      if (existing) {
        const other = existing.user_1_id === userId ? existing.user2 : existing.user1;
        const convObj: Conversation = {
          ...existing,
          other_user: other
            ? ({
                ...other,
                is_worker: isTargetWorker,
                is_worker_active: isWorkerActive,
              } as unknown as UserProfile)
            : undefined,
        };
        safeStorage.setItem(`km_conv_${userId}_${targetUserId}`, JSON.stringify(convObj));
        safeStorage.setItem(`km_conv_by_id_${convObj.id}`, JSON.stringify(convObj));
        return {
          conversation: convObj,
        };
      }

      // Create new conversation
      const { data: created, error } = await supabase
        .from('conversations')
        .insert({
          user_1_id: userId,
          user_2_id: targetUserId,
          last_message_at: new Date().toISOString(),
        })
        .select(`
          id,
          user_1_id,
          user_2_id,
          last_message_at,
          created_at,
          updated_at
        `)
        .single();

      if (error || !created) {
        const cachedConv = safeStorage.getItem(`km_conv_${userId}_${targetUserId}`);
        if (cachedConv) {
          try {
            return { conversation: JSON.parse(cachedConv) };
          } catch {}
        }
        return { conversation: null, error: error?.message || 'बातचीत शुरू नहीं हो सकी।' };
      }

      // Fetch other user profile
      const { data: otherProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      const newConvObj: Conversation = {
        ...created,
        other_user: otherProfile
          ? ({
              ...otherProfile,
              is_worker: isTargetWorker,
              is_worker_active: isWorkerActive,
            } as unknown as UserProfile)
          : undefined,
      };
      safeStorage.setItem(`km_conv_${userId}_${targetUserId}`, JSON.stringify(newConvObj));
      safeStorage.setItem(`km_conv_by_id_${newConvObj.id}`, JSON.stringify(newConvObj));

      return {
        conversation: newConvObj,
      };
    } catch (err) {
      const cachedConv = safeStorage.getItem(`km_conv_${userId}_${targetUserId}`);
      if (cachedConv) {
        try {
          return { conversation: JSON.parse(cachedConv) };
        } catch {}
      }
      return { conversation: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Resolve a signed URL for private chat media by message_id or media_id (Point 3 & Point 33)
   * Includes bounded progressive retry for the realtime race condition when message_media insert is in-flight.
   */
  static async resolveMediaUrl(
    message: { id: string; media_id?: string | null; media_url?: string | null; message_text?: string | null; conversation_id?: string },
    maxRetries = 4
  ): Promise<string | null> {
    try {
      if (message.media_url && (message.media_url.startsWith('http') || message.media_url.startsWith('blob:'))) {
        return message.media_url;
      }

      let attempts = 0;
      let storagePath: string | null = null;

      while (attempts <= maxRetries && !storagePath) {
        // 1. Check message_media by message_id first (Point 3 pattern)
        if (message.id) {
          const { data: byMsgId } = await supabase
            .from('message_media')
            .select('storage_path')
            .eq('message_id', message.id)
            .maybeSingle();

          if (byMsgId?.storage_path) {
            storagePath = byMsgId.storage_path;
            break;
          }
        }

        // 2. Fallback to media_id if present
        if (message.media_id) {
          const { data: byMediaId } = await supabase
            .from('message_media')
            .select('storage_path')
            .eq('id', message.media_id)
            .maybeSingle();

          if (byMediaId?.storage_path) {
            storagePath = byMediaId.storage_path;
            break;
          }
        }

        // 3. Fallback: check if message_text contains a valid storage path
        if (
          message.message_text &&
          message.conversation_id &&
          message.message_text.startsWith(message.conversation_id)
        ) {
          storagePath = message.message_text;
          break;
        }

        attempts++;
        if (attempts <= maxRetries) {
          // Bounded retry with progressive delay (350ms, 700ms, 1200ms, 1800ms)
          const delay = Math.min(350 * attempts, 1800);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (storagePath) {
        const cleanPath = storagePath.replace(/^\/+/, '');
        return await MediaService.getSignedUrl(MediaService.BUCKET_CHAT, cleanPath, 86400);
      }
      return null;
    } catch (err) {
      console.warn('resolveMediaUrl error:', err);
      return null;
    }
  }

  /**
   * Get messages for conversation, filter out 'delete for me', sign media URLs (Point 33: Old history support)
   */
  static async getMessages(conversationId: string, currentUserId: string): Promise<Message[]> {
    try {
      // 1. Get messages
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error || !messages) {
        console.warn('[ChatService] getMessages error or offline, serving from IndexedDB / cached snapshot:', error?.message || error);
        const idbSnapshot = await this.getConversationSnapshot(conversationId, currentUserId);
        if (idbSnapshot && idbSnapshot.messages.length > 0) {
          return idbSnapshot.messages;
        }
        return this.getCachedMessages(conversationId, currentUserId);
      }

      // 2. Get deleted-for-me ids
      const { data: deletedList } = await supabase
        .from('message_deletions')
        .select('message_id')
        .eq('user_id', currentUserId);

      const deletedIds = new Set((deletedList || []).map((d) => d.message_id));
      const activeMessages = messages.filter((m) => !deletedIds.has(m.id));

      // 3. Batch fetch all message_media records for active media messages in this conversation
      const mediaMessages = activeMessages.filter(
        (m) => m.message_type === 'photo' || m.message_type === 'video' || m.message_type === 'voice'
      );

      const mediaMapByMsgId = new Map<string, string>();
      const mediaMapById = new Map<string, string>();

      if (mediaMessages.length > 0) {
        const msgIds = mediaMessages.map((m) => m.id);
        const mediaIds = mediaMessages.map((m) => m.media_id).filter(Boolean) as string[];

        // Query by message_id
        const { data: mediaRowsByMsg } = await supabase
          .from('message_media')
          .select('id, message_id, storage_path')
          .in('message_id', msgIds);

        if (mediaRowsByMsg) {
          for (const row of mediaRowsByMsg) {
            if (row.message_id) mediaMapByMsgId.set(row.message_id, row.storage_path);
            if (row.id) mediaMapById.set(row.id, row.storage_path);
          }
        }

        // If some messages only had media_id link, query by id
        const missingMediaIds = mediaIds.filter((id) => !mediaMapById.has(id));
        if (missingMediaIds.length > 0) {
          const { data: mediaRowsById } = await supabase
            .from('message_media')
            .select('id, message_id, storage_path')
            .in('id', missingMediaIds);

          if (mediaRowsById) {
            for (const row of mediaRowsById) {
              if (row.message_id) mediaMapByMsgId.set(row.message_id, row.storage_path);
              if (row.id) mediaMapById.set(row.id, row.storage_path);
            }
          }
        }
      }

      // 4. Resolve media signed URLs in parallel with 24-hour expiration
      const result: Message[] = await Promise.all(
        activeMessages.map(async (m) => {
          let mediaUrl: string | null = null;
          if (m.message_type === 'photo' || m.message_type === 'video' || m.message_type === 'voice') {
            const storagePath =
              mediaMapByMsgId.get(m.id) ||
              (m.media_id ? mediaMapById.get(m.media_id) : null) ||
              (m.message_text && m.message_text.startsWith(conversationId) ? m.message_text : null);

            if (storagePath) {
              const cleanPath = storagePath.replace(/^\/+/, '');
              mediaUrl = await MediaService.getSignedUrl(MediaService.BUCKET_CHAT, cleanPath, 86400);
            } else {
              // Fallback to resolveMediaUrl with 0 retries (historical data)
              mediaUrl = await this.resolveMediaUrl(m, 0);
            }
          }

          return {
            ...m,
            is_mine: m.sender_id === currentUserId,
            media_url: mediaUrl,
          };
        })
      );

      // 5. If conversation involves admin, merge active admin communications
      try {
        const { data: convRow } = await supabase
          .from('conversations')
          .select('user_1_id, user_2_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (convRow && (convRow.user_1_id === ADMIN_USER_ID || convRow.user_2_id === ADMIN_USER_ID)) {
          const targetUserId = convRow.user_1_id === ADMIN_USER_ID ? convRow.user_2_id : convRow.user_1_id;
          const deletedAtStr = safeStorage.getItem(`kaammitra_admin_deleted_at_${targetUserId}`);
          const deletedAt = deletedAtStr ? new Date(deletedAtStr) : null;

          const { data: comms } = await supabase
            .from('admin_communication')
            .select('*')
            .or(`send_to_all.eq.true,recipient_id.eq.${targetUserId}`)
            .order('created_at', { ascending: true });

          if (comms && comms.length > 0) {
            const { data: deletedStatuses } = await supabase
              .from('admin_communication_status')
              .select('communication_id, is_deleted')
              .eq('user_id', targetUserId)
              .eq('is_deleted', true);

            const deletedCommIds = new Set((deletedStatuses || []).map((s) => s.communication_id));

            for (const c of comms) {
              if (deletedCommIds.has(c.id)) continue;
              if (deletedAt && new Date(c.created_at) <= deletedAt) continue;
              if (result.some((m) => m.id === c.id)) continue;

              result.push({
                id: c.id,
                conversation_id: conversationId,
                sender_id: c.admin_id || ADMIN_USER_ID,
                message_type: c.message_type === 'voice' ? 'voice' : c.message_type === 'media' ? 'photo' : 'text',
                message_text: c.message_text || (c.message_type === 'voice' ? '🎤 आवाज संदेश' : ''),
                media_url: c.media_url || null,
                created_at: c.created_at,
                is_read: true,
                is_mine: c.admin_id === currentUserId,
                status: 'delivered' as const,
                deleted_for_everyone: false,
                updated_at: c.updated_at || c.created_at,
              });
            }

            result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          }
        }
      } catch (adminErr) {
        console.warn('Error fetching admin communication in getMessages:', adminErr);
      }

      // 6. Cache latest authoritative messages for offline use and mirror to IndexedDB
      this.saveCachedMessages(conversationId, result);
      ChatIndexedDB.saveSnapshot(conversationId, result).catch(() => {});

      // 7. Merge any pending offline messages
      const pendingList = this.getPendingMessages(conversationId);
      if (pendingList.length > 0) {
        for (const item of pendingList) {
          if (!result.some((m) => m.id === item.tempId)) {
            result.push({
              ...item.message,
              is_mine: item.message.sender_id === currentUserId,
            });
          }
        }
      }

      return result;
    } catch (err) {
      console.warn('getMessages error, falling back to IndexedDB / cached messages:', err);
      try {
        const idbSnapshot = await this.getConversationSnapshot(conversationId, currentUserId);
        if (idbSnapshot && idbSnapshot.messages.length > 0) {
          return idbSnapshot.messages;
        }
      } catch {}
      return this.getCachedMessages(conversationId, currentUserId);
    }
  }

  /**
   * Send Message
   * POINT 3 Requirement:
   * A message must exist first and obtain its real message ID.
   * Then the corresponding message_media record must reference that exact message ID.
   * Do NOT insert message_media with a null message_id.
   */
  static async sendMessage(params: {
    conversationId: string;
    senderId: string;
    messageType: MessageType;
    messageText?: string;
    mediaFile?: File | Blob;
    locationData?: { place: string; latitude: number; longitude: number };
    commentReference?: CommentReference;
  }): Promise<{ message: Message | null; error?: string }> {
    try {
      let uploadedPath: string | null = null;
      let signedMediaUrl: string | null = null;

      // 1. Upload media to private 'chat-media' bucket first if attached
      if (
        params.mediaFile &&
        (params.messageType === 'photo' || params.messageType === 'video' || params.messageType === 'voice')
      ) {
        const { path, error: uploadErr } = await MediaService.uploadChatMedia(
          params.conversationId,
          params.mediaFile,
          params.messageType
        );

        if (uploadErr || !path) {
          return { message: null, error: 'मीडिया अपलोड विफल रहा।' };
        }
        uploadedPath = path;
        signedMediaUrl = await MediaService.getSignedUrl(MediaService.BUCKET_CHAT, path);
      }

      // 2. Prepare payload including optional comment reference
      const insertPayload: any = {
        conversation_id: params.conversationId,
        sender_id: params.senderId,
        message_type: params.messageType,
        message_text: params.messageText?.trim() || null,
        media_id: null,
        location_data: params.locationData || null,
        status: 'sent',
      };

      if (params.commentReference) {
        insertPayload.reference_type = 'comment';
        insertPayload.reference_comment_id = params.commentReference.commentId;
        insertPayload.reference_preview = params.commentReference.textPreview;
        insertPayload.reference_metadata = {
          comment_id: params.commentReference.commentId,
          author_id: params.commentReference.authorId,
          author_name: params.commentReference.authorName,
          target_type: params.commentReference.targetType,
          target_id: params.commentReference.targetId,
          has_voice: params.commentReference.hasVoice,
          text: params.commentReference.textPreview,
        };
      }

      // 3. Insert message FIRST to acquire its real message ID
      let { data: msg, error: msgError } = await supabase
        .from('messages')
        .insert(insertPayload)
        .select('*')
        .single();

      if (msgError && params.commentReference) {
        // Fallback in case reference columns not yet migrated in database
        delete insertPayload.reference_type;
        delete insertPayload.reference_comment_id;
        delete insertPayload.reference_preview;
        delete insertPayload.reference_metadata;
        const fallbackRes = await supabase
          .from('messages')
          .insert(insertPayload)
          .select('*')
          .single();
        msg = fallbackRes.data;
        msgError = fallbackRes.error;
      }

      if (msgError || !msg) {
        return { message: null, error: msgError?.message || 'मैसेज भेजने में समस्या आई।' };
      }

      let mediaId: string | null = null;

      // 3. Create message_media record referencing the exact real message ID!
      if (uploadedPath && params.mediaFile) {
        const { data: mediaRec, error: mediaInsertErr } = await supabase
          .from('message_media')
          .insert({
            message_id: msg.id, // EXACT REAL MESSAGE ID! (No null message_id)
            sender_id: params.senderId,
            media_type: params.messageType,
            storage_path: uploadedPath,
            file_size: params.mediaFile.size,
            mime_type: params.mediaFile.type,
          })
          .select('id')
          .single();

        if (!mediaInsertErr && mediaRec) {
          mediaId = mediaRec.id;
          // Update message with media_id link
          await supabase
            .from('messages')
            .update({ media_id: mediaRec.id })
            .eq('id', msg.id);
          msg.media_id = mediaRec.id;
        }
      }

      // 4. Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', params.conversationId);

      invalidateChatCaches(params.senderId);

      const sentMsgObj: Message = {
        ...msg,
        media_id: mediaId,
        is_mine: true,
        media_url: signedMediaUrl,
      };

      // Save updated conversation snapshot into IndexedDB whenever a message is successfully sent
      try {
        const cached = this.getCachedMessages(params.conversationId, params.senderId);
        const nextList = [...cached.filter((m) => m.id !== sentMsgObj.id), sentMsgObj];
        this.saveCachedMessages(params.conversationId, nextList);
        ChatIndexedDB.saveSnapshot(params.conversationId, nextList).catch(() => {});
      } catch {}

      return {
        message: sentMsgObj,
      };
    } catch (err) {
      return { message: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Subscribe to real-time message changes for a conversation (Point 2)
   * Returns cleanup unsubscribe function.
   */
  static subscribeToConversation(
    conversationId: string,
    onNewMessage: (msg: any) => void,
    onMessageUpdate?: (msg: any) => void
  ): () => void {
    const channelName = `messages_${conversationId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            if (payload.new) {
              onNewMessage(payload.new);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            if (payload.new && onMessageUpdate) {
              onMessageUpdate(payload.new);
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[ChatService] subscribeToConversation setup warning:', err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }

  /**
   * Delete for Me (Section 39)
   */
  static async deleteForMe(messageId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('message_deletions').insert({
        message_id: messageId,
        user_id: userId,
      });
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Delete for Everyone (Section 39)
   */
  static async deleteForEveryone(messageId: string, senderId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('messages')
        .update({
          deleted_for_everyone: true,
          message_text: 'यह मैसेज हटा दिया गया है।',
          media_id: null,
          location_data: null,
        })
        .eq('id', messageId)
        .eq('sender_id', senderId);

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Mark messages as read by recipient
   */
  static async markAsRead(conversationId: string, currentUserId: string): Promise<void> {
    try {
      await supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUserId)
        .neq('status', 'read');
      invalidateChatCaches(currentUserId);
    } catch {
      // Ignore background error
    }
  }

  /**
   * Delete conversation for a user (per-user soft deletion / message deletion)
   * Safely preserves the conversation and data for the other participant.
   */
  static async deleteConversation(conversationId: string, userId?: string): Promise<boolean> {
    try {
      if (userId) {
        // 1. Mark as deleted for this user in persistent storage
        const deletedMap = this.getDeletedConversationsMap(userId);
        deletedMap.set(conversationId, new Date().toISOString());
        this.setDeletedConversationsMap(userId, deletedMap);

        // 2. Invalidate cache for this user immediately
        invalidateChatCaches(userId);

        // 3. Soft-delete messages in this conversation for this user in Supabase message_deletions
        try {
          const { data: convMessages } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', conversationId);

          if (convMessages && convMessages.length > 0) {
            const records = convMessages.map((m) => ({
              message_id: m.id,
              user_id: userId,
            }));
            await supabase.from('message_deletions').upsert(records, { onConflict: 'message_id,user_id' });
          }
        } catch {}

        return true;
      }

      // Fallback: hard delete
      const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
      return !error;
    } catch {
      return false;
    }
  }
}
