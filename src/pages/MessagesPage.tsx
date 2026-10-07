import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  MoreVertical,
  Trash2,
  LogIn,
  Shield,
  Search,
  Bell,
  X,
  Pin,
  Loader2,
} from 'lucide-react';
import { Conversation, UserNotification } from '../types';
import { supabase } from '../lib/supabase';
import { safeStorage } from '../lib/storage';
import { ChatService, ADMIN_USER_ID } from '../services/chatService';
import { UserNotificationService } from '../services/userNotificationService';
import { NotificationListModal } from '../components/NotificationListModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import verificationLogo from '@/verificationlogo.png';

interface MessagesPageProps {
  onOpenConversation: (conversationId: string, otherUserId: string) => void;
  onRequireAuth: () => void;
  onOpenNotificationTarget?: (
    targetType: 'worker' | 'requirement',
    targetId: string,
    commentId?: string
  ) => void;
}

export const MessagesPage: React.FC<MessagesPageProps> = ({
  onOpenConversation,
  onRequireAuth,
  onOpenNotificationTarget,
}) => {
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const { websiteName } = useWebsiteBranding();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [workerUserIdSet, setWorkerUserIdSet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchingConversationIds, setMatchingConversationIds] = useState<Set<string>>(new Set());
  const [matchedMessageSnippets, setMatchedMessageSnippets] = useState<Map<string, string>>(new Map());

  // Notification states
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

  // Chat deletion state
  const [convToDelete, setConvToDelete] = useState<Conversation | null>(null);
  const [isDeletingConv, setIsDeletingConv] = useState(false);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  usePopupBackDismiss(Boolean(activeMenuId), () => setActiveMenuId(null), menuContainerRef);

  const isAdminConversation = (c: Conversation) => {
    return (
      c.other_user?.id === ADMIN_USER_ID ||
      c.other_user?.mobile === '9149275779'
    );
  };

  // Re-verify worker status directly from worker_profiles for all conversation participants
  useEffect(() => {
    if (!user) return;
    const otherIds = conversations
      .map((c) => c.other_user?.id || (c.user_1_id === user.id ? c.user_2_id : c.user_1_id))
      .filter((id): id is string => Boolean(id) && id !== ADMIN_USER_ID && id !== 'admin');

    if (otherIds.length > 0) {
      (async () => {
        try {
          const { data } = await supabase
            .from('worker_profiles')
            .select('user_id')
            .in('user_id', otherIds);
          if (data && data.length > 0) {
            setWorkerUserIdSet(new Set(data.map((w) => w.user_id)));
          }
        } catch {}
      })();
    }
  }, [conversations, user?.id]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // 1. Fetch real conversations from database
        const list = await ChatService.getConversations(user.id);

        // 2. Handle Admin conversation integration if current user is not admin
        if (user.id !== ADMIN_USER_ID && user.mobile !== '9149275779') {
          const deletedAtStr = safeStorage.getItem(`kaammitra_admin_deleted_at_${user.id}`);
          const deletedAt = deletedAtStr ? new Date(deletedAtStr) : null;

          // Check if conversation with admin exists in list
          let adminConv = list.find(isAdminConversation);

          // Fetch latest admin communication (broadcast or direct to this user)
          const { data: latestComm } = await supabase
            .from('admin_communication')
            .select('*')
            .or(`send_to_all.eq.true,recipient_id.eq.${user.id}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Active if latest communication is genuinely newer than last deletion
          const isCommActive =
            latestComm && (!deletedAt || new Date(latestComm.created_at) > deletedAt);

          if (isCommActive && !adminConv) {
            // Get or create unique conversation between user and admin
            const { conversation: createdConv } = await ChatService.getOrCreateConversation(
              user.id,
              ADMIN_USER_ID
            );
            if (createdConv) {
              adminConv = createdConv;
              list.push(adminConv);
            }
          }

          if (adminConv) {
            const latestMsgTime = new Date(
              adminConv.latest_message?.created_at || adminConv.last_message_at || adminConv.created_at
            );
            const latestActivity =
              isCommActive && latestComm && new Date(latestComm.created_at) > latestMsgTime
                ? new Date(latestComm.created_at)
                : latestMsgTime;

            if (deletedAt && deletedAt >= latestActivity) {
              // User deleted this chat and no new message arrived -> keep deleted!
              const idx = list.findIndex((c) => c.id === adminConv!.id);
              if (idx !== -1) list.splice(idx, 1);
            } else if (
              isCommActive &&
              latestComm &&
              (!adminConv.latest_message || new Date(latestComm.created_at) > latestMsgTime)
            ) {
              adminConv.latest_message = {
                id: latestComm.id,
                conversation_id: adminConv.id,
                sender_id: latestComm.admin_id,
                message_type: latestComm.message_type === 'voice' ? 'voice' : 'text',
                message_text:
                  latestComm.message_text ||
                  (latestComm.message_type === 'voice' ? '🎤 आवाज संदेश' : ''),
                media_url: latestComm.media_url,
                created_at: latestComm.created_at,
                is_read: false,
              } as any;
              adminConv.last_message_at = latestComm.created_at;
            }
          }
        }

        setConversations(list);
      } catch (err) {
        console.error('Error loading messages page:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [user]);

  // Realtime subscription to re-order conversations when any message arrives (Issue 4)
  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    const channelName = `messages_order_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
          },
          async () => {
            const list = await ChatService.getConversations(userId);
            setConversations(list);
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[MessagesPage] Realtime subscription setup warning:', err);
    }

    const handleOnline = async () => {
      try {
        const list = await ChatService.getConversations(userId);
        setConversations(list);
      } catch {}
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [user]);

  // WhatsApp-style message content search across existing conversation messages
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !user) {
      setMatchingConversationIds(new Set());
      setMatchedMessageSnippets(new Map());
      return;
    }

    let isCurrent = true;
    const searchMessages = async () => {
      try {
        const { data } = await supabase
          .from('messages')
          .select('conversation_id, message_text')
          .ilike('message_text', `%${q}%`)
          .eq('deleted_for_everyone', false)
          .limit(60);

        if (!isCurrent) return;
        if (data && data.length > 0) {
          const ids = new Set<string>();
          const snippets = new Map<string, string>();
          for (const m of data) {
            ids.add(m.conversation_id);
            if (!snippets.has(m.conversation_id) && m.message_text) {
              snippets.set(m.conversation_id, m.message_text);
            }
          }
          setMatchingConversationIds(ids);
          setMatchedMessageSnippets(snippets);
        } else {
          setMatchingConversationIds(new Set());
          setMatchedMessageSnippets(new Map());
        }
      } catch {
        // Fallback gracefully
      }
    };

    const timer = setTimeout(searchMessages, 250);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [searchQuery, user]);

  // Load & subscribe to unread notification count
  useEffect(() => {
    if (!user) {
      setUnreadNotifCount(0);
      return;
    }
    const userId = user.id;
    let isMounted = true;

    const fetchNotifUnread = async () => {
      try {
        const count = await UserNotificationService.getUnreadCount(userId);
        if (isMounted) setUnreadNotifCount(count);
      } catch {}
    };

    fetchNotifUnread();
    const unsubscribe = UserNotificationService.subscribeToUserNotifications(userId, () => {
      fetchNotifUnread();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  // Three-dot action: Delete Chat ONLY (Section 36 & Task 3)
  const handleDeleteChat = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setActiveMenuId(null);
    setConvToDelete(conv);
  };

  const handleConfirmDeleteConversation = async () => {
    if (!convToDelete || !user) return;
    const conversationId = convToDelete.id;
    setIsDeletingConv(true);

    try {
      if (isAdminConversation(convToDelete)) {
        // Mark deletion timestamp so admin chat stays deleted across refreshes
        safeStorage.setItem(`kaammitra_admin_deleted_at_${user.id}`, new Date().toISOString());
        try {
          const { data: comms } = await supabase
            .from('admin_communication')
            .select('id')
            .or(`send_to_all.eq.true,recipient_id.eq.${user.id}`);
          if (comms && comms.length > 0) {
            for (const item of comms) {
              await supabase.from('admin_communication_status').upsert({
                communication_id: item.id,
                user_id: user.id,
                is_deleted: true,
              });
            }
          }
        } catch {}
      }

      await ChatService.deleteConversation(conversationId, user.id);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setConvToDelete(null);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setIsDeletingConv(false);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Admin conversation pinned at top; regular conversations sorted by most recent activity timestamp
  const adminConvs = conversations.filter((c) => isAdminConversation(c));
  const regularConvs = conversations
    .filter((c) => !isAdminConversation(c))
    .sort((a, b) => {
      const timeA = new Date(a.latest_message?.created_at || a.last_message_at || a.created_at).getTime();
      const timeB = new Date(b.latest_message?.created_at || b.last_message_at || b.created_at).getTime();
      return timeB - timeA;
    });
  const allSortedConvs = [...adminConvs, ...regularConvs];

  const displayList = allSortedConvs.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const isAdm = isAdminConversation(c);
    const other = c.other_user;
    const name = isAdm
      ? (lang === 'hi' ? `${websiteName} एडमिन` : `${websiteName} Admin`).toLowerCase()
      : (other?.name || '').toLowerCase();
    const mobile = (other?.mobile || '').toLowerCase();
    const latestText = (c.latest_message?.message_text || '').toLowerCase();

    // 1. Matches other user's name
    if (name.includes(q)) return true;
    // 2. Matches other user's mobile number
    if (mobile.includes(q)) return true;
    // 3. Matches latest message text
    if (latestText.includes(q)) return true;
    // 4. Matches older message content in this conversation from Supabase query
    if (matchingConversationIds.has(c.id)) return true;

    return false;
  });

  return (
    <div className="pb-24 pt-3 px-3 max-w-2xl mx-auto space-y-4">
      {/* Conversations Header: Left: बातचीत (Chats) | Right: Search button then Bell button */}
      <div className="flex items-center justify-between px-1">
        <h3 className="font-bold text-slate-800 text-lg sm:text-xl">
          बातचीत (Chats)
        </h3>

        <div className="flex items-center gap-1.5">
          {/* Search Button */}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              if (isSearchOpen) setSearchQuery('');
            }}
            className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
              isSearchOpen
                ? 'bg-teal-100 text-teal-800'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
            title={lang === 'hi' ? 'खोजें' : 'Search chats'}
            aria-label="Search chats"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Bell Notification Button */}
          <button
            type="button"
            onClick={() => setIsNotificationModalOpen(true)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition cursor-pointer relative flex items-center justify-center"
            title={lang === 'hi' ? 'सूचनाएं' : 'Notifications'}
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full min-w-4 text-center leading-tight shadow-xs border-2 border-white">
                {unreadNotifCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Search Input (WhatsApp Style) */}
      {isSearchOpen && (
        <div className="relative animate-in fade-in slide-in-from-top-2 duration-150">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              lang === 'hi'
                ? 'नाम, फ़ोन या मैसेज के शब्दों से खोजें...'
                : 'Search by name, phone or message words...'
            }
            className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Guest Warning if not logged in */}
      {!user ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <MessageSquare className="w-10 h-10 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">मैसेज देखने के लिए लॉगिन करें</h4>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            सेवा प्रदाताओं से सीधे चैट और बातचीत करने के लिए अपना खाता खोलें।
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{t.login} / {t.createAccount}</span>
          </button>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center space-y-2">
          <div className="w-7 h-7 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">{t.loading}</p>
        </div>
      ) : displayList.length === 0 ? (
        /* Empty state: No chats or search result empty */
        <div className="py-12 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-2">
          <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700">
            {searchQuery
              ? lang === 'hi'
                ? 'कोई मेल खाती चैट नहीं मिली'
                : 'No matching chats found'
              : 'अभी कोई चैट उपलब्ध नहीं है'}
          </h4>
          <p className="text-xs text-slate-500">
            {searchQuery
              ? lang === 'hi'
                ? 'दूसरे नाम या मैसेज के शब्दों से खोज कर देखें।'
                : 'Try searching with different name or message keywords.'
              : 'होम पेज या खोज से किसी भी सेवा प्रदाता के कार्ड पर "मैसेज" दबाकर बातचीत शुरू करें।'}
          </p>
        </div>
      ) : (
        /* Real Conversations list sorted naturally by recent activity */
        <div className="space-y-2">
          {displayList.map((c) => {
            const isAdm = isAdminConversation(c);
            const other = c.other_user;
            const otherUserId = other?.id || (c.user_1_id === user?.id ? c.user_2_id : c.user_1_id);
            const isWorker =
              !isAdm &&
              (Boolean(other?.is_worker) || (Boolean(otherUserId) && workerUserIdSet.has(otherUserId)));
            const name = isAdm
              ? (lang === 'hi' ? `${websiteName} एडमिन` : `${websiteName} Admin`)
              : other?.name || 'उपयोगकर्ता';
            const photo = other?.profile_photo;
            const firstLetter = name.trim().charAt(0).toUpperCase();
            const lastMsgText =
              c.latest_message?.deleted_for_everyone
                ? 'यह मैसेज हटा दिया गया है।'
                : c.latest_message?.message_type === 'voice'
                ? '🎤 आवाज संदेश'
                : c.latest_message?.message_type === 'photo'
                ? '📷 फ़ोटो'
                : c.latest_message?.message_type === 'location'
                ? '📍 लोकेशन'
                : c.latest_message?.message_text || 'नई बातचीत';

            const matchedSnippet = matchedMessageSnippets.get(c.id);

            return (
              <div
                key={c.id}
                onClick={() => onOpenConversation(c.id, other?.id || (isAdm ? ADMIN_USER_ID : ''))}
                className={`relative rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all flex items-center justify-between gap-3.5 cursor-pointer ${
                  isAdm
                    ? 'bg-[#fffcf7] border-2 border-amber-300 hover:border-amber-400'
                    : 'bg-white border border-[#d4be98]/70 hover:border-[#bca071]'
                }`}
              >
                {/* Photo / Initial fallback with premium border rim */}
                <div
                  className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full overflow-hidden shrink-0 border-2 flex items-center justify-center font-bold text-base shadow-xs ${
                    isAdm
                      ? 'bg-amber-100 text-amber-900 border-amber-400'
                      : 'border-[#bca071] bg-teal-50 text-teal-900'
                  }`}
                >
                  {isAdm ? (
                    <Shield className="w-6 h-6 text-amber-700" />
                  ) : photo ? (
                    <img src={photo} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-base sm:text-lg font-bold text-teal-900">{firstLetter}</span>
                  )}
                </div>

                {/* Name & Latest Message */}
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '16px' }} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <h4 style={{ fontSize: isAdm ? '17px' : '18px' }} className="font-bold text-slate-900 truncate tracking-tight">{name}</h4>
                      {isAdm && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-2xs">
                          <Pin className="w-2.5 h-2.5 rotate-45 text-amber-700" />
                          <span>{lang === 'hi' ? 'एडमिन (पिन)' : 'Admin (Pinned)'}</span>
                        </span>
                      )}
                      {isWorker && (
                        <img
                          src={verificationLogo}
                          alt="Verified"
                          className="inline-block ml-0.5 shrink-0 object-contain select-none"
                          style={{
                            width: '16px',
                            height: '16px',
                            verticalAlign: 'middle',
                          }}
                        />
                      )}
                      {other?.is_worker_active === false && (
                        <span className="shrink-0 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          Deactivated Account by Admin
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span style={{ fontSize: '13px' }} className="text-slate-400 font-mono">
                        {formatTime(c.last_message_at)}
                      </span>
                      {!!c.unread_count && c.unread_count > 0 && (
                        <span className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-5 text-center leading-tight shadow-xs">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '16px' }} className="flex flex-col gap-0.5 mt-1">
                    <p style={{ fontSize: '15px' }} className={`truncate ${c.unread_count && c.unread_count > 0 ? 'text-slate-900 font-bold' : 'text-slate-600 font-normal'}`}>
                      {lastMsgText}
                    </p>
                    {searchQuery.trim() && matchedSnippet && (
                      <p className="text-[12px] text-teal-700 font-medium truncate">
                        💬 &ldquo;{matchedSnippet}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {/* Three-dot menu: Delete Chat ONLY with outside-click & back-button dismissal */}
                <div
                  ref={activeMenuId === c.id ? menuContainerRef : null}
                  className="relative shrink-0"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(activeMenuId === c.id ? null : c.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                    aria-label="Options"
                  >
                    <MoreVertical style={{ fontSize: '16px' }} className="w-4 h-4" />
                  </button>

                  {activeMenuId === c.id && (
                    <div
                      className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[120px] animate-in fade-in duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDeleteChat(e, c)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 font-semibold cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t.deleteChat}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Chat Confirmation Dialog (Reliable in all iframes & mobile browsers) */}
      {convToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeletingConv) setConvToDelete(null);
          }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-base">
                  {lang === 'hi' ? 'चैट हटाएं?' : 'Delete Chat?'}
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {lang === 'hi'
                    ? 'क्या आप यह पूरी बातचीत हटाना चाहते हैं? इस चैट के संदेश आपके लिए हटा दिए जाएंगे।'
                    : 'Are you sure you want to delete this conversation? Messages will be removed for you.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingConv}
                onClick={() => setConvToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={isDeletingConv}
                onClick={handleConfirmDeleteConversation}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingConv && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{lang === 'hi' ? 'चैट हटाएं' : 'Delete Chat'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification List Modal */}
      {user && (
        <NotificationListModal
          userId={user.id}
          isOpen={isNotificationModalOpen}
          onClose={() => setIsNotificationModalOpen(false)}
          onSelectNotification={(notif) => {
            if (onOpenNotificationTarget) {
              onOpenNotificationTarget(
                notif.target_type,
                notif.target_id,
                notif.comment_id || undefined
              );
            }
          }}
          onUnreadCountChange={(c) => setUnreadNotifCount(c)}
        />
      )}
    </div>
  );
};
