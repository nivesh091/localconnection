import { supabase } from '../lib/supabase';
import { Message } from '../types';
import { brandingStore } from './brandingService';
import { safeStorage } from '../lib/storage';

export class NotificationService {
  private static notifiedMsgIds = new Set<string>();
  private static senderNameCache = new Map<string, string>();
  private static isSubscribedToRealtime = false;
  private static activeChannel: ReturnType<typeof supabase.channel> | null = null;

  /**
   * Check if Notifications and Service Worker are supported in current browser
   */
  static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator
    );
  }

  /**
   * Current notification permission ('default' | 'granted' | 'denied')
   */
  static getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Check if user has previously dismissed the in-app notification prompt
   */
  static hasDismissedPrompt(): boolean {
    if (typeof window === 'undefined') return true;
    return !!safeStorage.getItem('kaammitra_notification_dismissed');
  }

  /**
   * Dismiss the notification prompt (do not nag repeatedly)
   */
  static dismissPrompt(): void {
    if (typeof window !== 'undefined') {
      safeStorage.setItem('kaammitra_notification_dismissed', Date.now().toString());
    }
  }

  /**
   * Request notification permission with user consent
   */
  static async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        safeStorage.removeItem('kaammitra_notification_dismissed');
        await this.registerPushSubscription();
      } else if (permission === 'denied') {
        this.dismissPrompt();
      }
      return permission;
    } catch {
      return 'denied';
    }
  }

  /**
   * Register Web Push subscription with Service Worker PushManager and sync with backend & Supabase
   */
  static async registerPushSubscription(userId?: string): Promise<PushSubscription | null> {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return null;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      if (!('pushManager' in reg)) {
        return null;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // Optional VAPID key from environment
        const vapidPublicKey =
          (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY ||
          'BIj-hKqgD1VNvcGsg_3Z5zzyBE57jQoTfJ6EDMGZ6k9n99d1EUxKO9G6k_HxCyrUFi9kXXP_raZu9Qyv2y2M0o0';
        const options: PushSubscriptionOptionsInit = {
          userVisibleOnly: true,
        };

        if (vapidPublicKey) {
          options.applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource;
        }

        sub = await reg.pushManager.subscribe(options);
      }

      if (sub && userId) {
        const subJson = sub.toJSON();
        const p256dh = subJson.keys?.p256dh;
        const auth = subJson.keys?.auth;

        // 1. Sync to local server
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            subscription: subJson,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          }),
        }).catch(() => {});

        // 2. Persist to Supabase push_subscriptions table
        if (p256dh && auth) {
          try {
            await supabase.from('push_subscriptions').upsert(
              {
                user_id: userId,
                endpoint: sub.endpoint,
                p256dh,
                auth,
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,endpoint' }
            );
          } catch {}
        }
      }

      return sub;
    } catch (err) {
      console.warn('[NotificationService] PushManager subscription notice:', err);
      return null;
    }
  }

  /**
   * Send a Web Push notification to a recipient via backend push service
   */
  static async sendPushNotification(params: {
    recipientId: string;
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: any;
  }): Promise<boolean> {
    try {
      if (!params.recipientId || !params.title) return false;

      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: params.recipientId,
          title: params.title,
          body: params.body,
          icon: params.icon || '/pwa-192x192.png',
          badge: params.badge || '/favicon.ico',
          tag: params.tag || 'kaammitra_notification',
          data: params.data || {},
        }),
      });

      return res.ok;
    } catch (err) {
      console.warn('[NotificationService] Send push error:', err);
      return false;
    }
  }

  /**
   * Send incoming-call push notification with dynamic administrator branding
   */
  static async sendIncomingCallPush(params: {
    recipientId: string;
    callId: string;
    callerId: string;
    callerName: string;
    callerPhoto?: string | null;
  }): Promise<boolean> {
    const appName = brandingStore.getName('hi');
    const title = params.callerName ? `${params.callerName} — ${appName}` : appName;
    const body = 'इनकमिंग इंटरनेट कॉल... (Incoming Call)';

    return await this.sendPushNotification({
      recipientId: params.recipientId,
      title,
      body,
      icon: params.callerPhoto || '/pwa-192x192.png',
      badge: '/favicon.ico',
      tag: `call_${params.callId}`,
      data: {
        type: 'incoming_call',
        callId: params.callId,
        callerId: params.callerId,
        callerName: params.callerName,
        url: `/#call=${encodeURIComponent(params.callId)}`,
      },
    });
  }

  /**
   * Send missed-call notification to recipient with dynamic administrator branding
   */
  static async sendMissedCallPush(params: {
    recipientId: string;
    callId: string;
    callerId: string;
    callerName: string;
    callerPhoto?: string | null;
    conversationId?: string | null;
  }): Promise<boolean> {
    const appName = brandingStore.getName('hi');
    const title = params.callerName ? `${params.callerName} — ${appName}` : appName;
    const body = 'मिस्ड इंटरनेट कॉल (Missed call)';

    const chatUrl = params.conversationId
      ? `/#chat?c=${encodeURIComponent(params.conversationId)}&u=${encodeURIComponent(params.callerId)}`
      : '/#messages';

    return await this.sendPushNotification({
      recipientId: params.recipientId,
      title,
      body,
      icon: params.callerPhoto || '/pwa-192x192.png',
      badge: '/favicon.ico',
      tag: `missed_call_${params.callId}`,
      data: {
        type: 'missed_call',
        callId: params.callId,
        callerId: params.callerId,
        callerName: params.callerName,
        conversationId: params.conversationId,
        url: chatUrl,
      },
    });
  }

  /**
   * Dismiss active incoming call notification from screen / service worker
   */
  static async dismissCallNotification(callId: string, recipientId?: string): Promise<void> {
    try {
      // 1. Local service worker dismissal
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CLOSE_CALL_NOTIFICATION',
          callId,
        });
      }

      // 2. Remote push dismissal
      if (recipientId) {
        fetch('/api/push/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId, callId }),
        }).catch(() => {});
      }
    } catch {}
  }

  /**
   * Display a Web Push / Service Worker notification
   */
  static async showNotification(
    title: string,
    options: NotificationOptions & { data?: Record<string, any>; vibrate?: number[] }
  ): Promise<void> {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return;
    }

    const defaultOptions: Record<string, any> = {
      icon: '/pwa-192x192.png',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      ...options,
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, defaultOptions);
      } else {
        new Notification(title, defaultOptions);
      }
    } catch (err) {
      console.warn('[NotificationService] Failed to show notification:', err);
    }
  }

  /**
   * Set up real-time listener for incoming messages to trigger background notifications
   */
  static setupRealtimeMessageNotifications(
    currentUserId: string,
    onNavigateToChat?: (conversationId: string, otherUserId: string) => void
  ): () => void {
    if (!currentUserId || !this.isSupported()) {
      return () => {};
    }

    // 1. Listen for clicks from the Service Worker (when notification is tapped)
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NAVIGATE_CHAT') {
        const { conversationId, senderId } = event.data;
        if (conversationId && senderId && onNavigateToChat) {
          onNavigateToChat(conversationId, senderId);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    // 2. Prevent duplicate real-time channels
    if (this.isSubscribedToRealtime && this.activeChannel) {
      return () => {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
        }
      };
    }

    this.isSubscribedToRealtime = true;

    // 3. Subscribe to all new messages in Supabase Realtime
    const channelName = `push_notif_${currentUserId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      this.activeChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
        async (payload) => {
          const newMsg = payload.new as Message;
          if (!newMsg || !newMsg.id) return;

          // Guard: Don't notify own sent messages
          if (newMsg.sender_id === currentUserId) return;

          // Guard: Deduplicate — never notify the exact same message twice
          if (this.notifiedMsgIds.has(newMsg.id)) return;
          this.notifiedMsgIds.add(newMsg.id);

          // Guard: If app is visible and user is actively reading this exact conversation, skip OS alert
          const isViewingThisChat =
            typeof document !== 'undefined' &&
            !document.hidden &&
            window.location.hash.includes(newMsg.conversation_id);

          if (isViewingThisChat) {
            return;
          }

          // Fetch sender's human name (cached or from profiles table)
          const senderName = await this.getSenderName(newMsg.sender_id);

          // Format body text based on message type
          let bodyText = newMsg.message_text || 'नया संदेश भेजा';
          if (newMsg.message_type === 'photo') {
            bodyText = '📷 फ़ोटो भेजी';
          } else if (newMsg.message_type === 'voice') {
            bodyText = '🎤 वॉयस रिकॉर्डिंग भेजी';
          } else if (newMsg.message_type === 'video') {
            bodyText = '🎥 वीडियो भेजा';
          } else if (newMsg.message_type === 'location') {
            bodyText = '📍 स्थान साझा किया';
          }

          const targetUrl = `/#chat?c=${encodeURIComponent(newMsg.conversation_id)}&u=${encodeURIComponent(newMsg.sender_id)}`;

          // Show Notification via Service Worker with full metadata
          await this.showNotification(senderName, {
            body: bodyText,
            icon: '/pwa-192x192.png',
            badge: '/favicon.ico',
            tag: `msg_${newMsg.id}`,
            data: {
              conversationId: newMsg.conversation_id,
              senderId: newMsg.sender_id,
              messageId: newMsg.id,
              url: targetUrl,
            },
          });
        }
      )
      .subscribe();
    } catch (err) {
      console.warn('[NotificationService] setupRealtimeMessageNotifications setup warning:', err);
    }

    return () => {
      this.isSubscribedToRealtime = false;
      if (this.activeChannel) {
        try {
          supabase.removeChannel(this.activeChannel);
        } catch {}
        this.activeChannel = null;
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }

  /**
   * Helper to resolve sender's display name
   */
  private static async getSenderName(senderId: string): Promise<string> {
    if (this.senderNameCache.has(senderId)) {
      return this.senderNameCache.get(senderId)!;
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', senderId)
        .maybeSingle();

      const fallbackName = `${brandingStore.getName('hi')} यूज़र`;
      const name = data?.name?.trim() || fallbackName;
      this.senderNameCache.set(senderId, name);
      return name;
    } catch {
      return `${brandingStore.getName('hi')} यूज़र`;
    }
  }

  /**
   * Convert VAPID base64 string to Uint8Array
   */
  private static urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}
