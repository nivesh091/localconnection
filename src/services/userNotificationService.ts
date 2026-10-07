import { supabase, isSchemaCacheError, withNetworkRetry } from '../lib/supabase';
import { UserNotification } from '../types';
import { safeStorage } from '../lib/storage';

export class UserNotificationService {
  private static getLocalKey(userId: string): string {
    return `kaammitra_user_notifications_${userId}`;
  }

  private static getReadSetKey(userId: string): string {
    return `kaammitra_read_notif_ids_${userId}`;
  }

  private static getDeletedSetKey(userId: string): string {
    return `kaammitra_deleted_notif_ids_${userId}`;
  }

  private static getReadSet(userId: string): Set<string> {
    try {
      const raw = safeStorage.getItem(this.getReadSetKey(userId));
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  private static setReadSet(userId: string, set: Set<string>): void {
    try {
      safeStorage.setItem(this.getReadSetKey(userId), JSON.stringify(Array.from(set)));
    } catch {}
  }

  private static getDeletedSet(userId: string): Set<string> {
    try {
      const raw = safeStorage.getItem(this.getDeletedSetKey(userId));
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  private static setDeletedSet(userId: string, set: Set<string>): void {
    try {
      safeStorage.setItem(this.getDeletedSetKey(userId), JSON.stringify(Array.from(set)));
    } catch {}
  }

  private static getLocalNotifications(userId: string): UserNotification[] {
    try {
      const raw = safeStorage.getItem(this.getLocalKey(userId));
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private static setLocalNotifications(userId: string, list: UserNotification[]): void {
    try {
      safeStorage.setItem(this.getLocalKey(userId), JSON.stringify(list));
    } catch {}
  }

  /**
   * Create an in-app notification record.
   * If user_notifications table is in Supabase, inserts into it.
   * Always persists in local mirror so recipient UI updates immediately.
   */
  static async createNotification(params: {
    userId: string;
    senderId: string;
    notificationType: 'comment' | 'reply';
    targetType: 'worker' | 'requirement';
    targetId: string;
    commentId?: string | null;
    commentPreview?: string | null;
    hasVoice?: boolean;
    senderProfile?: {
      name: string;
      profile_photo?: string | null;
      mobile?: string | null;
    };
  }): Promise<UserNotification | null> {
    // 1. Never notify oneself
    if (!params.userId || !params.senderId || params.userId === params.senderId) {
      return null;
    }

    const payload = {
      user_id: params.userId,
      sender_id: params.senderId,
      notification_type: params.notificationType,
      target_type: params.targetType,
      target_id: params.targetId,
      comment_id: params.commentId || null,
      comment_preview: params.commentPreview || null,
      has_voice: Boolean(params.hasVoice),
      is_read: false,
    };

    let createdNotification: UserNotification | null = null;

    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .insert(payload)
        .select(`
          id,
          user_id,
          sender_id,
          notification_type,
          target_type,
          target_id,
          comment_id,
          comment_preview,
          has_voice,
          is_read,
          created_at,
          sender:profiles!user_notifications_sender_id_fkey(id, name, profile_photo, mobile, is_mobile_public)
        `)
        .single();

      if (!error && data) {
        const row = data as any;
        createdNotification = {
          id: row.id,
          user_id: row.user_id,
          sender_id: row.sender_id,
          notification_type: row.notification_type,
          target_type: row.target_type,
          target_id: row.target_id,
          comment_id: row.comment_id,
          comment_preview: row.comment_preview,
          has_voice: row.has_voice,
          is_read: row.is_read,
          created_at: row.created_at,
          sender: row.sender || {
            id: params.senderId,
            name: params.senderProfile?.name || 'उपयोगकर्ता',
            profile_photo: params.senderProfile?.profile_photo || null,
            mobile: params.senderProfile?.mobile || null,
          },
        };
      }
    } catch {}

    if (!createdNotification) {
      const fallbackItem: UserNotification = {
        id: params.commentId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `notif_${Date.now()}`),
        user_id: params.userId,
        sender_id: params.senderId,
        notification_type: params.notificationType,
        target_type: params.targetType,
        target_id: params.targetId,
        comment_id: params.commentId || null,
        comment_preview: params.commentPreview || null,
        has_voice: Boolean(params.hasVoice),
        is_read: false,
        created_at: new Date().toISOString(),
        sender: {
          id: params.senderId,
          name: params.senderProfile?.name || 'उपयोगकर्ता',
          profile_photo: params.senderProfile?.profile_photo || null,
          mobile: params.senderProfile?.mobile || null,
        },
      };
      createdNotification = fallbackItem;
    }

    try {
      const existing = this.getLocalNotifications(params.userId);
      const isDuplicate = existing.some(
        (n) => n.comment_id && n.comment_id === createdNotification!.comment_id
      );
      if (!isDuplicate) {
        this.setLocalNotifications(params.userId, [createdNotification, ...existing]);
      }
    } catch {}

    // Real-time multi-client & cross-device notification broadcast
    try {
      // 1. Supabase Realtime WebSocket Broadcast
      const sendChannel = supabase.channel(`bell_send_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      sendChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sendChannel.send({
            type: 'broadcast',
            event: 'new_notification',
            payload: {
              recipientId: params.userId,
              notification: createdNotification,
            },
          }).finally(() => {
            try {
              supabase.removeChannel(sendChannel);
            } catch {}
          });
        }
      });

      // 2. Cross-tab BroadcastChannel for same-device accounts
      if (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('kaammitra_bell_channel');
        bc.postMessage({ recipientId: params.userId, notification: createdNotification });
        setTimeout(() => bc.close(), 1000);
      }

      // 3. In-page CustomEvent for instant UI update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('kaammitra_notification_created', {
            detail: { recipientId: params.userId, notification: createdNotification },
          })
        );
      }
    } catch {}

    return createdNotification;
  }

  /**
   * Fetch all notifications for the given user in newest-first order (created_at DESC).
   * 1. Tries user_notifications table in Supabase.
   * 2. If table is absent or empty, queries Supabase comments table directly:
   *    - Worker profile comments: target_type = 'worker' AND target_id = userId AND author_id != userId
   *    - Requirement comments: target_type = 'requirement' AND target_id in user's requirement IDs AND author_id != userId
   *    - Threaded replies: parent_comment_id in user's comment IDs AND author_id != userId
   * 3. Excludes deleted notifications.
   * 4. Merges read/unread state.
   */
  static async getNotifications(userId: string): Promise<UserNotification[]> {
    if (!userId) return [];

    const readSet = this.getReadSet(userId);
    const deletedSet = this.getDeletedSet(userId);

    // 1. Try querying user_notifications table
    try {
      const { data, error } = await withNetworkRetry(async () =>
        supabase
          .from('user_notifications')
          .select(`
            id,
            user_id,
            sender_id,
            notification_type,
            target_type,
            target_id,
            comment_id,
            comment_preview,
            has_voice,
            is_read,
            created_at,
            sender:profiles!user_notifications_sender_id_fkey(id, name, profile_photo, mobile, is_mobile_public)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );

      if (!error && data && data.length > 0) {
        const rows: UserNotification[] = (data as any[])
          .filter((r) => !deletedSet.has(r.id))
          .map((r) => ({
            id: r.id,
            user_id: r.user_id,
            sender_id: r.sender_id,
            notification_type: r.notification_type,
            target_type: r.target_type,
            target_id: r.target_id,
            comment_id: r.comment_id,
            comment_preview: r.comment_preview,
            has_voice: r.has_voice,
            is_read: r.is_read || readSet.has(r.id),
            created_at: r.created_at,
            sender: r.sender || null,
          }));

        this.setLocalNotifications(userId, rows);
        return rows;
      }
    } catch {}

    // 2. Query Supabase comments table directly (real cross-user, cross-device data)
    try {
      const notificationsList: UserNotification[] = [];
      const seenCommentIds = new Set<string>();

      // A. Worker profile comments for this user (target_id is userId)
      const { data: workerComments } = await supabase
        .from('comments')
        .select(`
          id,
          author_id,
          target_type,
          target_id,
          parent_comment_id,
          text,
          voice_storage_path,
          created_at,
          author:profiles!comments_author_id_fkey(id, name, profile_photo, mobile, is_mobile_public)
        `)
        .eq('target_type', 'worker')
        .eq('target_id', userId)
        .neq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(60);

      if (workerComments) {
        for (const c of workerComments as any[]) {
          if (deletedSet.has(c.id) || seenCommentIds.has(c.id)) continue;
          seenCommentIds.add(c.id);

          notificationsList.push({
            id: c.id,
            user_id: userId,
            sender_id: c.author_id,
            notification_type: c.parent_comment_id ? 'reply' : 'comment',
            target_type: 'worker',
            target_id: c.target_id,
            comment_id: c.id,
            comment_preview: c.text || (c.voice_storage_path ? '🎤 आवाज संदेश' : ''),
            has_voice: Boolean(c.voice_storage_path),
            is_read: readSet.has(c.id),
            created_at: c.created_at,
            sender: c.author || {
              id: c.author_id,
              name: 'उपयोगकर्ता',
              profile_photo: null,
              mobile: null,
            },
          });
        }
      }

      // B. Requirement comments for requirements owned by this user
      const { data: userReqs } = await supabase
        .from('requirements')
        .select('id')
        .eq('owner_id', userId);

      const reqIds = (userReqs || []).map((r) => r.id);
      if (reqIds.length > 0) {
        const { data: reqComments } = await supabase
          .from('comments')
          .select(`
            id,
            author_id,
            target_type,
            target_id,
            parent_comment_id,
            text,
            voice_storage_path,
            created_at,
            author:profiles!comments_author_id_fkey(id, name, profile_photo, mobile, is_mobile_public)
          `)
          .eq('target_type', 'requirement')
          .in('target_id', reqIds)
          .neq('author_id', userId)
          .order('created_at', { ascending: false })
          .limit(60);

        if (reqComments) {
          for (const c of reqComments as any[]) {
            if (deletedSet.has(c.id) || seenCommentIds.has(c.id)) continue;
            seenCommentIds.add(c.id);

            notificationsList.push({
              id: c.id,
              user_id: userId,
              sender_id: c.author_id,
              notification_type: c.parent_comment_id ? 'reply' : 'comment',
              target_type: 'requirement',
              target_id: c.target_id,
              comment_id: c.id,
              comment_preview: c.text || (c.voice_storage_path ? '🎤 आवाज संदेश' : ''),
              has_voice: Boolean(c.voice_storage_path),
              is_read: readSet.has(c.id),
              created_at: c.created_at,
              sender: c.author || {
                id: c.author_id,
                name: 'उपयोगकर्ता',
                profile_photo: null,
                mobile: null,
              },
            });
          }
        }
      }

      // C. Threaded replies to comments authored by this user
      const { data: userComments } = await supabase
        .from('comments')
        .select('id')
        .eq('author_id', userId);

      const userCommentIds = (userComments || []).map((c) => c.id);
      if (userCommentIds.length > 0) {
        const { data: replyComments } = await supabase
          .from('comments')
          .select(`
            id,
            author_id,
            target_type,
            target_id,
            parent_comment_id,
            text,
            voice_storage_path,
            created_at,
            author:profiles!comments_author_id_fkey(id, name, profile_photo, mobile, is_mobile_public)
          `)
          .in('parent_comment_id', userCommentIds)
          .neq('author_id', userId)
          .order('created_at', { ascending: false })
          .limit(60);

        if (replyComments) {
          for (const c of replyComments as any[]) {
            if (deletedSet.has(c.id) || seenCommentIds.has(c.id)) continue;
            seenCommentIds.add(c.id);

            notificationsList.push({
              id: c.id,
              user_id: userId,
              sender_id: c.author_id,
              notification_type: 'reply',
              target_type: c.target_type,
              target_id: c.target_id,
              comment_id: c.id,
              comment_preview: c.text || (c.voice_storage_path ? '🎤 आवाज संदेश' : ''),
              has_voice: Boolean(c.voice_storage_path),
              is_read: readSet.has(c.id),
              created_at: c.created_at,
              sender: c.author || {
                id: c.author_id,
                name: 'उपयोगकर्ता',
                profile_photo: null,
                mobile: null,
              },
            });
          }
        }
      }

      // Merge with local fallback items if any exist and aren't seen yet
      const localList = this.getLocalNotifications(userId);
      for (const item of localList) {
        if (!deletedSet.has(item.id) && !seenCommentIds.has(item.id) && (!item.comment_id || !seenCommentIds.has(item.comment_id))) {
          if (item.comment_id) seenCommentIds.add(item.comment_id);
          notificationsList.push({
            ...item,
            is_read: item.is_read || readSet.has(item.id),
          });
        }
      }

      // Sort newest first
      notificationsList.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      this.setLocalNotifications(userId, notificationsList);
      return notificationsList;
    } catch (err) {
      console.warn('Error constructing notifications from comments:', err);
    }

    // Fallback: local list
    const local = this.getLocalNotifications(userId).filter((n) => !deletedSet.has(n.id));
    return local
      .map((n) => ({ ...n, is_read: n.is_read || readSet.has(n.id) }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Get count of ONLY UNREAD notifications for user.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    if (!userId) return 0;
    const list = await this.getNotifications(userId);
    return list.filter((n) => !n.is_read).length;
  }

  /**
   * Mark a single notification as read.
   */
  static async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    if (!notificationId || !userId) return false;

    // 1. Update readSet in safeStorage
    const readSet = this.getReadSet(userId);
    readSet.add(notificationId);
    this.setReadSet(userId, readSet);

    // 2. Update local notifications list
    try {
      const local = this.getLocalNotifications(userId);
      const updated = local.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n));
      this.setLocalNotifications(userId, updated);
    } catch {}

    // 3. Update Supabase user_notifications if present
    try {
      await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId);
    } catch {}

    return true;
  }

  /**
   * Mark all notifications as read for user.
   */
  static async markAllAsRead(userId: string): Promise<boolean> {
    if (!userId) return false;

    // 1. Mark all existing notification IDs as read
    const notifs = await this.getNotifications(userId);
    const readSet = this.getReadSet(userId);
    for (const n of notifs) {
      readSet.add(n.id);
      if (n.comment_id) readSet.add(n.comment_id);
    }
    this.setReadSet(userId, readSet);

    // 2. Update local notifications list
    try {
      const local = this.getLocalNotifications(userId);
      const updated = local.map((n) => ({ ...n, is_read: true }));
      this.setLocalNotifications(userId, updated);
    } catch {}

    // 3. Update Supabase user_notifications if present
    try {
      await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
    } catch {}

    return true;
  }

  /**
   * Delete an individual notification (does not delete the underlying comment).
   */
  static async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    if (!notificationId || !userId) return false;

    // 1. Record in deletedSet
    const deletedSet = this.getDeletedSet(userId);
    deletedSet.add(notificationId);
    this.setDeletedSet(userId, deletedSet);

    // 2. Remove from local storage
    try {
      const local = this.getLocalNotifications(userId);
      const updated = local.filter((n) => n.id !== notificationId && n.comment_id !== notificationId);
      this.setLocalNotifications(userId, updated);
    } catch {}

    // 3. Delete from Supabase user_notifications if present
    try {
      await supabase
        .from('user_notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', userId);
    } catch {}

    return true;
  }

  /**
   * Subscribe to real-time changes so Bell unread count & list updates automatically.
   * Listens to:
   * 1. Supabase Realtime broadcast events
   * 2. Browser BroadcastChannel & CustomEvent
   * 3. Database comments / user_notifications table changes
   * 4. Window focus / visibilitychange
   * 5. Lightweight periodic heartbeat while tab is active
   */
  static subscribeToUserNotifications(userId: string, onUpdate: () => void): () => void {
    if (!userId) return () => {};

    // 1. Unique channel identifier to prevent StrictMode re-mount collisions
    const subId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const channelName = `bell_stream_${userId}_${subId}`;

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    try {
      // Clean up any lingering legacy static channels for this user
      const existing = supabase.getChannels().filter((c) => 
        c.topic?.includes(`comments_realtime_bell:${userId}`) || 
        c.topic?.includes(`notifs_realtime_bell:${userId}`) ||
        c.topic?.includes(`bell_notifs_listener_${userId}`)
      );
      existing.forEach((ch) => {
        try { supabase.removeChannel(ch); } catch {}
      });

      // Unified channel for all database and broadcast notifications
      realtimeChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'comments',
          },
          (payload) => {
            const newRow = payload.new as any;
            if (newRow && newRow.author_id !== userId) {
              onUpdate();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            onUpdate();
          }
        )
        .on(
          'broadcast',
          { event: 'new_notification' },
          (payload: any) => {
            if (payload?.payload?.recipientId === userId) {
              onUpdate();
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[UserNotificationService] Realtime channel setup warning:', err);
    }

    // 4. Cross-tab BroadcastChannel listener
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('kaammitra_bell_channel');
        bc.onmessage = (event) => {
          if (event.data?.recipientId === userId) {
            onUpdate();
          }
        };
      } catch {}
    }

    // 5. In-window CustomEvent listener
    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.recipientId === userId) {
        onUpdate();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('kaammitra_notification_created', handleCustomEvent);
    }

    // 6. Window focus & visibility revalidation
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        onUpdate();
      }
    };
    const handleFocus = () => onUpdate();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibility);
    }

    // 7. Active heartbeat poll (every 10 seconds while tab is active)
    let intervalTimer: ReturnType<typeof setInterval> | null = null;
    if (typeof window !== 'undefined') {
      intervalTimer = setInterval(() => {
        if (!document.hidden) {
          onUpdate();
        }
      }, 10000);
    }

    return () => {
      if (realtimeChannel) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch {}
      }
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('kaammitra_notification_created', handleCustomEvent);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (intervalTimer) {
        clearInterval(intervalTimer);
      }
    };
  }
}
