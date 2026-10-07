import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Phone,
  Send,
  Mic,
  Image,
  MapPin,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  X,
  Trash2,
  RotateCcw,
  Shield,
  Download,
  Maximize2,
  Search,
  ChevronUp,
  ChevronDown,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Message, MessageType, UserProfile, WorkerProfile, UserLocation, CommentReference } from '../types';
import { ChatService, ADMIN_USER_ID } from '../services/chatService';
import { ProfileService } from '../services/profileService';
import { WorkerService } from '../services/workerService';
import { LocationService } from '../services/locationService';
import { safeStorage } from '../lib/storage';
import { AudioPlayer } from '../components/AudioPlayer';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { WorkerDetailModal } from '../components/WorkerDetailModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { ChatImagePreviewModal } from '../components/ChatImagePreviewModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import verificationLogo from '@/verificationlogo.png';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { supabase } from '../lib/supabase';

interface ChatPageProps {
  conversationId: string;
  otherUserId: string;
  onBack: () => void;
  onRequireAuth: () => void;
  initialCommentReference?: CommentReference | null;
  onClearCommentReference?: () => void;
}

/**
 * ChatPhotoBubble (Point 33: Complete state transitions for chat photos)
 * Transitions: loading -> resolving URL -> loading image -> loaded -> spinner removed
 * Or: error -> spinner removed -> fallback with retry button
 */
interface ChatPhotoBubbleProps {
  msg: Message;
  isMine: boolean;
  onOpenFullscreen: (url: string) => void;
  onRetry: (msg: Message) => void;
}

const ChatPhotoBubble: React.FC<ChatPhotoBubbleProps> = ({
  msg,
  isMine,
  onOpenFullscreen,
  onRetry,
}) => {
  const [isImgLoaded, setIsImgLoaded] = useState(false);
  const [hasImgError, setHasImgError] = useState(false);

  useEffect(() => {
    setIsImgLoaded(false);
    setHasImgError(false);
  }, [msg.media_url]);

  const isResolving = !msg.media_url && !msg.media_failed;
  const isFailed = msg.media_failed || hasImgError;

  return (
    <div className="relative mb-1 rounded-xl overflow-hidden max-w-full select-none">
      {/* 1. Resolving URL State (Point 33: resolving URL -> loading image -> loaded) */}
      {isResolving && (
        <div className="w-52 h-44 rounded-xl bg-black/10 flex flex-col items-center justify-center gap-2 p-3 text-center animate-pulse">
          <Clock className={`w-6 h-6 animate-spin ${isMine ? 'text-teal-200' : 'text-teal-600'}`} />
          <span className="text-[11px] opacity-80 font-medium">फ़ोटो तैयार हो रही है...</span>
        </div>
      )}

      {/* 2. Loading Image State: Image is fetching over network */}
      {msg.media_url && !isImgLoaded && !isFailed && (
        <div className="w-52 h-44 rounded-xl bg-black/10 flex flex-col items-center justify-center gap-2 p-3 text-center animate-pulse">
          <Clock className={`w-6 h-6 animate-spin ${isMine ? 'text-teal-200' : 'text-teal-600'}`} />
          <span className="text-[11px] opacity-80 font-medium">फ़ोटो लोड हो रही है...</span>
        </div>
      )}

      {/* 3. Error Fallback: Spinner removed, clear error shown with Retry button */}
      {isFailed && (
        <div className="w-52 h-40 rounded-xl bg-rose-50/95 border border-rose-200 flex flex-col items-center justify-center gap-2 p-3 text-center text-rose-800">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
          <span className="text-[11px] font-semibold">फ़ोटो लोड नहीं हो सकी</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHasImgError(false);
              setIsImgLoaded(false);
              onRetry(msg);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-rose-100 text-rose-800 rounded-lg text-xs font-bold border border-rose-300 shadow-2xs transition active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>पुनः प्रयास करें</span>
          </button>
        </div>
      )}

      {/* 4. Real Image with onLoad and onError handlers */}
      {msg.media_url && !isFailed && (
        <div className={`relative group ${!isImgLoaded ? 'hidden' : 'block'}`}>
          <img
            src={msg.media_url}
            alt="Attachment"
            draggable={false}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
            }}
            onLoad={() => {
              setIsImgLoaded(true);
              setHasImgError(false);
            }}
            onError={() => {
              setIsImgLoaded(false);
              setHasImgError(true);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (msg.media_url) onOpenFullscreen(msg.media_url);
            }}
            className="rounded-xl max-h-64 sm:max-h-72 w-auto max-w-full object-contain cursor-pointer transition-transform group-hover:scale-101"
            loading="eager"
          />

          {/* Action Overlay: Fullscreen and Download */}
          {isImgLoaded && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
              <a
                href={msg.media_url}
                download="chat_photo.jpg"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition shadow-md"
                title="फ़ोटो डाउनलोड करें"
                aria-label="डाउनलोड करें"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (msg.media_url) onOpenFullscreen(msg.media_url);
                }}
                className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg transition shadow-md"
                title="बड़ा देखें"
                aria-label="बड़ा देखें"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * ChatVoiceBubble (Point 33: Complete state transitions for audio recordings)
 * Transitions: loading -> resolving URL -> loading audio -> ready -> spinner removed
 * Or: error -> spinner removed -> fallback with retry button
 */
interface ChatVoiceBubbleProps {
  msg: Message;
  isMine: boolean;
  onRetry: (msg: Message) => void;
}

const ChatVoiceBubble: React.FC<ChatVoiceBubbleProps> = ({
  msg,
  isMine,
  onRetry,
}) => {
  const isResolving = !msg.media_url && !msg.media_failed;
  const isFailed = msg.media_failed || (!msg.media_url && !isResolving);

  // 1. Resolving URL State (Point 33: loading -> resolving URL -> loading audio -> ready)
  if (isResolving) {
    return (
      <div className="min-w-[210px] py-2 px-3 rounded-xl bg-black/10 flex items-center gap-2.5 animate-pulse mb-1">
        <Clock className={`w-4 h-4 animate-spin shrink-0 ${isMine ? 'text-teal-200' : 'text-teal-600'}`} />
        <span className="text-xs opacity-85 font-medium">आवाज संदेश लोड हो रहा है...</span>
      </div>
    );
  }

  // 2. Error Fallback: Spinner removed, clear error shown with Retry
  if (isFailed) {
    return (
      <div className="min-w-[210px] py-2 px-3 rounded-xl bg-rose-50/95 border border-rose-200 text-rose-800 flex items-center justify-between gap-2 text-xs mb-1">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">ऑडियो उपलब्ध नहीं है</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry(msg);
          }}
          className="px-2 py-0.5 bg-white hover:bg-rose-100 text-rose-800 rounded font-bold border border-rose-300 shadow-2xs transition cursor-pointer"
        >
          पुनः प्रयास
        </button>
      </div>
    );
  }

  // 3. Audio Player with real signed URL and browser audio events
  return (
    <div className="min-w-[220px] max-w-full py-1">
      <AudioPlayer src={msg.media_url!} title="आवाज संदेश" isMine={isMine} />
    </div>
  );
};

/**
 * Highlights matching search substrings inside message text (case-insensitive, Unicode & Hindi safe)
 */
const renderHighlightedText = (text: string, query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return text;

  try {
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      if (part.toLowerCase() === trimmed.toLowerCase()) {
        return (
          <mark
            key={idx}
            style={{
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            className="bg-amber-300 text-slate-950 font-bold rounded-xs px-0.5 select-none pointer-events-none"
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  } catch {
    return text;
  }
};

export const ChatPage: React.FC<ChatPageProps> = ({
  conversationId,
  otherUserId,
  onBack,
  onRequireAuth,
  initialCommentReference,
  onClearCommentReference,
}) => {
  const { user, isAdmin } = useAuth();
  const { t, lang } = useTranslation();
  const { websiteName } = useWebsiteBranding();

  const [otherUser, setOtherUser] = useState<UserProfile | null>(() => {
    return ChatService.getCachedOtherUser(conversationId);
  });
  const [otherWorker, setOtherWorker] = useState<WorkerProfile | null>(null);
  const [otherLocation, setOtherLocation] = useState<UserLocation | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => {
    return ChatService.getCachedMessages(conversationId, user?.id);
  });
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const cached = ChatService.getCachedMessages(conversationId, user?.id);
    return cached.length === 0;
  });
  const [isSending, setIsSending] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showReconnectedBanner, setShowReconnectedBanner] = useState(false);
  const isSyncingPendingRef = useRef(false);

  // Monitor network online/offline state
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnectedBanner(true);
      window.setTimeout(() => setShowReconnectedBanner(false), 2500);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnectedBanner(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Active temporary WhatsApp-style comment reference in composer
  const [activeCommentRef, setActiveCommentRef] = useState<CommentReference | null>(
    initialCommentReference || null
  );

  useEffect(() => {
    if (initialCommentReference) {
      setActiveCommentRef(initialCommentReference);
    }
  }, [initialCommentReference]);

  // Voice recording modal in composer
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  // Image Preview Modal before sending (Requirement 12 & 13)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);

  // Track message count and deletion state to prevent scrolling to bottom on delete (Requirement 11)
  const prevMessagesCountRef = useRef<number>(0);
  const isDeletingRef = useRef<boolean>(false);

  // In-memory queue for offline messages (Requirement 26)
  const pendingQueueRef = useRef<{ tempId: string; text: string }[]>([]);

  // Selected message for press-and-hold (Section 39: 1 second hold)
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const holdTimerRef = useRef<number | null>(null);

  // Profile detail modal for other user
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Point 17: Chat Live Location confirmation modal
  const [showLocationConfirm, setShowLocationConfirm] = useState(false);

  // Photo Lightbox modal
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  // Non-intrusive status toast (replacing window.alert)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // In-conversation message search state (Searches ONLY messages in active conversation)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
  };

  // Popups dismiss on outside click and mobile/browser Back button closes popup first
  usePopupBackDismiss(Boolean(fullscreenPhoto), () => setFullscreenPhoto(null));
  usePopupBackDismiss(Boolean(actionMessage), () => setActionMessage(null));
  usePopupBackDismiss(Boolean(showLocationConfirm), () => setShowLocationConfirm(false));
  usePopupBackDismiss(Boolean(showVoiceRecorder), () => setShowVoiceRecorder(false));
  usePopupBackDismiss(isSearchOpen, handleCloseSearch);

  // Intercept & completely suppress browser native text selection, Copy/Select/Ask Gemini menus on chat messages & action modal
  useEffect(() => {
    const isInsideComposer = (target: Node | null) => {
      if (!target) return false;
      const el = target.nodeType === Node.ELEMENT_NODE ? (target as HTMLElement) : target.parentElement;
      if (!el) return false;
      return Boolean(el.closest('textarea, input'));
    };

    const handleSelectStart = (e: Event) => {
      // Allow selection strictly inside the composer textarea/input, block everywhere else in chat
      if (isInsideComposer(e.target as Node)) {
        return;
      }
      e.preventDefault();
      try {
        window.getSelection()?.removeAllRanges();
      } catch {}
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      if (!isInsideComposer(selection.anchorNode) && !isInsideComposer(selection.focusNode)) {
        try {
          selection.removeAllRanges();
          selection.empty?.();
        } catch {}
      }
    };

    const blockContextMenu = (e: MouseEvent | TouchEvent) => {
      if (isInsideComposer(e.target as Node)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      try {
        window.getSelection()?.removeAllRanges();
      } catch {}
    };

    const handleDragStart = (e: DragEvent) => {
      if (!isInsideComposer(e.target as Node)) {
        e.preventDefault();
      }
    };

    // Capture phase intercepts before browser UI can display selection toolbar or context menu
    document.addEventListener('selectstart', handleSelectStart, { capture: true, passive: false });
    document.addEventListener('selectionchange', handleSelectionChange, { passive: true });
    document.addEventListener('contextmenu', blockContextMenu as any, { capture: true, passive: false });
    document.addEventListener('dragstart', handleDragStart, { capture: true, passive: false });

    return () => {
      document.removeEventListener('selectstart', handleSelectStart, { capture: true });
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('contextmenu', blockContextMenu as any, { capture: true });
      document.removeEventListener('dragstart', handleDragStart, { capture: true });
    };
  }, []);

  // Filter matching message IDs strictly from active conversation's messages
  const matchingMessageIds = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return [];

    return messages
      .filter((m) => {
        if (m.deleted_for_everyone) return false;
        if (!m.message_text) return false;
        return m.message_text.toLowerCase().includes(trimmed);
      })
      .map((m) => m.id);
  }, [messages, searchQuery]);

  // Keep currentMatchIndex in sync with matchingMessageIds
  useEffect(() => {
    if (matchingMessageIds.length === 0) {
      setCurrentMatchIndex(0);
    } else {
      // Start on latest match (last chronologically)
      setCurrentMatchIndex(matchingMessageIds.length - 1);
    }
  }, [matchingMessageIds.length, searchQuery]);

  const activeMatchMessageId = matchingMessageIds[currentMatchIndex] || null;

  // Scroll to active match when currentMatchIndex or search opens
  useEffect(() => {
    if (!isSearchOpen || !activeMatchMessageId) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`msg-${activeMatchMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [activeMatchMessageId, currentMatchIndex, isSearchOpen]);

  const handleNextMatch = () => {
    if (matchingMessageIds.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matchingMessageIds.length);
  };

  const handlePrevMatch = () => {
    if (matchingMessageIds.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matchingMessageIds.length) % matchingMessageIds.length);
  };

  // Dynamic media URL resolution for unresolved messages (Point 33: Realtime race condition & history)
  const resolvingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unres = messages.filter(
      (m) =>
        (m.message_type === 'photo' || m.message_type === 'video' || m.message_type === 'voice') &&
        !m.media_url &&
        !m.media_failed &&
        !resolvingRef.current.has(m.id)
    );
    if (unres.length === 0) return;

    unres.forEach(async (m) => {
      resolvingRef.current.add(m.id);
      const url = await ChatService.resolveMediaUrl(m, 4);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === m.id
            ? { ...item, media_url: url, media_failed: !url }
            : item
        )
      );
    });
  }, [messages]);

  const handleRetryMedia = async (msg: Message) => {
    resolvingRef.current.delete(msg.id);
    setMessages((prev) =>
      prev.map((item) =>
        item.id === msg.id ? { ...item, media_failed: false, media_url: null } : item
      )
    );
    const url = await ChatService.resolveMediaUrl(msg, 3);
    setMessages((prev) =>
      prev.map((item) =>
        item.id === msg.id ? { ...item, media_url: url, media_failed: !url } : item
      )
    );
  };

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mobile visualViewport tracking for software keyboard & screen resizing
  const [viewportHeight, setViewportHeight] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      return window.visualViewport.height;
    }
    return null;
  });

  // Ensure window scroll is strictly locked at 0 in chat view, preventing gap after refresh
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.scrollTo(0, 0);
    document.body.scrollTop = 0;

    if (!window.visualViewport) return;

    const handleViewportChange = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      }
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);

    const preventWindowScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', preventWindowScroll);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('scroll', preventWindowScroll);
    };
  }, []);
  // 1. Fetch other user profile
  useEffect(() => {
    async function loadMeta() {
      let targetId = otherUserId || '';

      // If otherUserId is missing, query conversation to resolve other participant ID
      if (!targetId && conversationId && user) {
        try {
          const { data: convData } = await supabase
            .from('conversations')
            .select('user_1_id, user_2_id')
            .eq('id', conversationId)
            .maybeSingle();
          if (convData) {
            targetId = convData.user_1_id === user.id ? convData.user_2_id : convData.user_1_id;
          }
        } catch {}
      }

      if (!targetId) return;

      if (targetId === ADMIN_USER_ID || targetId === 'admin') {
        setOtherUser({
          id: ADMIN_USER_ID,
          name: lang === 'hi' ? `${websiteName} एडमिन` : `${websiteName} Admin`,
          mobile: '9149275779',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_worker: false,
        });
        setOtherWorker(null);
        return;
      }

      // Load other user profile, location, worker details, and verification status in parallel
      const [pRes, locRes, wRes, wRowRes] = await Promise.allSettled([
        ProfileService.getProfile(targetId),
        ProfileService.getUserLocation(targetId),
        WorkerService.getWorkerDetail(targetId),
        supabase.from('worker_profiles').select('user_id').eq('user_id', targetId).maybeSingle(),
      ]);

      const isWorker = wRowRes.status === 'fulfilled' && Boolean(wRowRes.value?.data);

      if (pRes.status === 'fulfilled' && pRes.value) {
        const otherProfileObj = {
          ...pRes.value,
          is_worker: isWorker,
        };
        setOtherUser(otherProfileObj);
        ChatService.saveCachedOtherUser(conversationId, otherProfileObj);
      }
      if (locRes.status === 'fulfilled') setOtherLocation(locRes.value);
      if (wRes.status === 'fulfilled' && wRes.value) {
        setOtherWorker(wRes.value);
      } else if (isWorker && pRes.status === 'fulfilled' && pRes.value) {
        setOtherWorker({
          user_id: targetId,
          experience_years: 0,
          price_per_day: 0,
          skills: '',
          created_at: pRes.value.created_at,
          updated_at: pRes.value.updated_at,
          is_active: wRowRes.status === 'fulfilled' ? (wRowRes.value?.data as any)?.is_active !== false : true,
          profile: pRes.value,
        } as any);
      }
    }
    loadMeta();
  }, [otherUserId, conversationId, user]);

  // 1b. Asynchronously hydrate from local IndexedDB cache on mount to prevent data loss
  useEffect(() => {
    let isMounted = true;
    ChatService.getConversationSnapshot(conversationId, user?.id).then((snapshot) => {
      if (isMounted && snapshot && snapshot.messages.length > 0) {
        setMessages((current) => {
          if (current.length === 0 || current.length < snapshot.messages.length) {
            return snapshot.messages;
          }
          return current;
        });
        if (snapshot.otherUser) {
          setOtherUser((prev) => prev || snapshot.otherUser || null);
        }
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [conversationId, user?.id]);

  // 2. Fetch messages & subscribe to realtime (Point 2 & Point 30)
  useEffect(() => {
    if (!user) return;
    const currentUserId = user.id;
    let isMounted = true;

    async function load(showSpinner = true) {
      if (showSpinner) {
        setMessages((current) => {
          if (current.length === 0) setIsLoading(true);
          return current;
        });
      }
      try {
        const list = await ChatService.getMessages(conversationId, currentUserId);
        if (isMounted) {
          if (list && list.length > 0) {
            setMessages(list);
            // Save authoritative snapshot into IndexedDB
            ChatService.saveConversationSnapshot(conversationId, list, otherUser);
          } else {
            // Fallback to IndexedDB local cache if server returned empty due to network drop
            const snapshot = await ChatService.getConversationSnapshot(conversationId, currentUserId);
            if (snapshot && snapshot.messages.length > 0) {
              setMessages(snapshot.messages);
              if (snapshot.otherUser) {
                setOtherUser((prev) => prev || snapshot.otherUser || null);
              }
            } else if (navigator.onLine) {
              setMessages(list);
            }
          }
          if (showSpinner) setIsLoading(false);
        }
        if (navigator.onLine) {
          await ChatService.markAsRead(conversationId, currentUserId).catch(() => {});
        }
      } catch (err) {
        console.warn('Chat load error, hydrating from local IndexedDB cache:', err);
        if (isMounted) {
          const snapshot = await ChatService.getConversationSnapshot(conversationId, currentUserId);
          if (snapshot && snapshot.messages.length > 0) {
            setMessages(snapshot.messages);
            if (snapshot.otherUser) {
              setOtherUser((prev) => prev || snapshot.otherUser || null);
            }
          }
        }
      } finally {
        if (isMounted && showSpinner) setIsLoading(false);
      }
    }
    load(true);

    const handleOnline = () => {
      // Background message sync when network reconnects (no full screen spinner)
      load(false);
    };
    window.addEventListener('online', handleOnline);

    // Subscribe to realtime messages for this conversation only
    const unsubscribe = ChatService.subscribeToConversation(
      conversationId,
      async (incomingMsg: any) => {
        if (!isMounted) return;

        const isMine = incomingMsg.sender_id === currentUserId;
        const formattedMsg: Message = {
          ...incomingMsg,
          is_mine: isMine,
          media_url: incomingMsg.media_url || null,
        };

        // Add message to state immediately and save snapshot to IndexedDB
        setMessages((prev) => {
          const existingIdx = prev.findIndex((m) => m.id === incomingMsg.id);
          let updated: Message[];
          if (existingIdx !== -1) {
            updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              ...formattedMsg,
              media_url: updated[existingIdx].media_url || formattedMsg.media_url,
            };
          } else {
            updated = [...prev, formattedMsg];
          }
          // Save most recent conversation snapshot into IndexedDB whenever message is received
          ChatService.saveConversationSnapshot(conversationId, updated, otherUser);
          return updated;
        });

        // If media message and media_url not yet set, resolve with bounded retry
        if (
          (incomingMsg.message_type === 'photo' ||
           incomingMsg.message_type === 'video' ||
           incomingMsg.message_type === 'voice') &&
          !formattedMsg.media_url
        ) {
          resolvingRef.current.add(incomingMsg.id);
          ChatService.resolveMediaUrl(incomingMsg, 4).then((mediaUrl) => {
            if (!isMounted) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === incomingMsg.id
                  ? { ...m, media_url: mediaUrl, media_failed: !mediaUrl }
                  : m
              )
            );
          });
        }

        // If from recipient, mark as read
        if (incomingMsg.sender_id !== currentUserId) {
          await ChatService.markAsRead(conversationId, currentUserId);
        }
      },
      (updatedMsg: any) => {
        if (!isMounted) return;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === updatedMsg.id) {
              return {
                ...m,
                ...updatedMsg,
                is_mine: m.is_mine,
                media_url: m.media_url,
              };
            }
            return m;
          })
        );

        // If updatedMsg is media and missing media_url, re-resolve
        if (
          updatedMsg.message_type === 'photo' ||
          updatedMsg.message_type === 'video' ||
          updatedMsg.message_type === 'voice'
        ) {
          ChatService.resolveMediaUrl(updatedMsg, 2).then((mediaUrl) => {
            if (!isMounted || !mediaUrl) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === updatedMsg.id && !m.media_url
                  ? { ...m, media_url: mediaUrl, media_failed: false }
                  : m
              )
            );
          });
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [conversationId, user]);

  // Scroll to bottom only when new message arrives, NOT on deletion (Requirement 11)
  useEffect(() => {
    if (isDeletingRef.current) {
      isDeletingRef.current = false;
      prevMessagesCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessagesCountRef.current) {
      const container = messagesContainerRef.current;
      if (container) {
        // Direct container scroll prevents window scroll leakage that creates extra bottom gap on refresh
        const isInitial = prevMessagesCountRef.current === 0;
        if (isInitial) {
          container.scrollTop = container.scrollHeight;
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages]);

  // Helper to record a newly sent message and immediately persist snapshot into IndexedDB
  const recordSentMessageAndSaveSnapshot = useCallback(
    (sentMsg: Message) => {
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === sentMsg.id);
        const next = exists ? prev : [...prev, sentMsg];
        ChatService.saveConversationSnapshot(conversationId, next, otherUser);
        return next;
      });
    },
    [conversationId, otherUser]
  );

  // Synchronize pending offline messages to Supabase backend in FIFO order
  const syncPendingMessages = useCallback(async () => {
    if (!user || isSyncingPendingRef.current || !navigator.onLine) return;

    const pendingList = ChatService.getPendingMessages(conversationId);
    if (pendingList.length === 0) return;

    isSyncingPendingRef.current = true;
    try {
      for (const item of pendingList) {
        try {
          const res = await ChatService.sendMessage({
            conversationId,
            senderId: user.id,
            messageType: item.messageType || 'text',
            messageText: item.messageText,
            commentReference: item.commentReference,
          });

          if (res.message) {
            // Remove from offline storage queue
            ChatService.removePendingMessage(conversationId, item.tempId);
            // Replace temporary pending message with authoritative server message in UI & save snapshot
            setMessages((prev) => {
              const updated = prev.map((m) =>
                m.id === item.tempId ? { ...res.message!, is_mine: true } : m
              );
              ChatService.saveConversationSnapshot(conversationId, updated, otherUser);
              return updated;
            });
          }
        } catch (err) {
          console.warn('[ChatPage] Pending message sync error for tempId:', item.tempId, err);
          break; // Stop and retry on next event if network failed
        }
      }
    } finally {
      isSyncingPendingRef.current = false;
    }
  }, [conversationId, user, otherUser]);

  // Flush pending messages on online event and periodic check
  useEffect(() => {
    if (navigator.onLine) {
      syncPendingMessages();
    }
    const handleOnline = () => {
      syncPendingMessages();
    };
    window.addEventListener('online', handleOnline);
    const interval = window.setInterval(() => {
      if (navigator.onLine && ChatService.getPendingMessages(conversationId).length > 0) {
        syncPendingMessages();
      }
    }, 12000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(interval);
    };
  }, [conversationId, syncPendingMessages]);

  // Send Text with offline queue support (Requirement 26)
  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !user || isSending) return;

    const text = inputText.trim();
    const commentRefToSend = activeCommentRef;
    setInputText('');
    setActiveCommentRef(null);
    onClearCommentReference?.();

    const tempId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const pendingMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: 'text',
      message_text: text,
      deleted_for_everyone: false,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_mine: true,
      reference_type: commentRefToSend ? 'comment' : null,
      reference_comment_id: commentRefToSend?.commentId || null,
      reference_preview: commentRefToSend?.textPreview || null,
      reference_metadata: commentRefToSend
        ? {
            comment_id: commentRefToSend.commentId,
            author_id: commentRefToSend.authorId,
            author_name: commentRefToSend.authorName,
            target_type: commentRefToSend.targetType,
            target_id: commentRefToSend.targetId,
            has_voice: commentRefToSend.hasVoice,
            text: commentRefToSend.textPreview,
          }
        : null,
    };

    // If device is currently offline, queue in persistent safeStorage with pending indicator
    if (!navigator.onLine) {
      ChatService.addPendingMessage(conversationId, {
        tempId,
        conversationId,
        senderId: user.id,
        messageType: 'text',
        messageText: text,
        commentReference: commentRefToSend || undefined,
        message: pendingMsg,
        createdAt: Date.now(),
      });
      setMessages((prev) => [...prev, pendingMsg]);
      return;
    }

    setIsSending(true);
    try {
      const res = await ChatService.sendMessage({
        conversationId,
        senderId: user.id,
        messageType: 'text',
        messageText: text,
        commentReference: commentRefToSend || undefined,
      });

      if (res.message) {
        recordSentMessageAndSaveSnapshot(res.message);
      } else {
        // Network or server issue: preserve as pending message
        ChatService.addPendingMessage(conversationId, {
          tempId,
          conversationId,
          senderId: user.id,
          messageType: 'text',
          messageText: text,
          commentReference: commentRefToSend || undefined,
          message: pendingMsg,
          createdAt: Date.now(),
        });
        setMessages((prev) => [...prev, pendingMsg]);
      }
    } catch {
      // Network drop: preserve as pending message
      ChatService.addPendingMessage(conversationId, {
        tempId,
        conversationId,
        senderId: user.id,
        messageType: 'text',
        messageText: text,
        commentReference: commentRefToSend || undefined,
        message: pendingMsg,
        createdAt: Date.now(),
      });
      setMessages((prev) => [...prev, pendingMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // Send Voice Recording
  const handleSendVoice = async (blob: Blob) => {
    setShowVoiceRecorder(false);
    if (!user) return;

    const commentRefToSend = activeCommentRef;
    setActiveCommentRef(null);
    onClearCommentReference?.();

    setIsSending(true);
    const res = await ChatService.sendMessage({
      conversationId,
      senderId: user.id,
      messageType: 'voice',
      mediaFile: blob,
      commentReference: commentRefToSend || undefined,
    });
    setIsSending(false);

    if (res.message) {
      recordSentMessageAndSaveSnapshot(res.message);
    }
  };

  // Handle file selection: for images, open preview & crop modal first (Requirement 12 & 13)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.type.startsWith('image/')) {
      setSelectedImageFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Direct send for non-image video attachments
    sendMediaFile(file, 'video');
  };

  const sendMediaFile = async (file: File, msgType: MessageType) => {
    if (!user) return;
    const commentRefToSend = activeCommentRef;
    setActiveCommentRef(null);
    onClearCommentReference?.();

    setIsSending(true);
    const res = await ChatService.sendMessage({
      conversationId,
      senderId: user.id,
      messageType: msgType,
      mediaFile: file,
      commentReference: commentRefToSend || undefined,
    });
    setIsSending(false);

    if (res.message) {
      recordSentMessageAndSaveSnapshot(res.message);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendConfirmedImage = async (finalFile: File) => {
    setSelectedImageFile(null);
    await sendMediaFile(finalFile, 'photo');
  };

  // Send Current Location (Point 32: Obtain fresh device GPS at that exact moment)
  const handleSendLocation = async () => {
    if (!user) return;
    setIsSending(true);

    const freshPos = await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          // Retry with standard accuracy if highAccuracy timed out
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
            },
            () => resolve(null),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
          );
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });

    if (!freshPos) {
      setIsSending(false);
      showToast('डिवाइस की वर्तमान GPS लोकेशन प्राप्त नहीं हो सकी। कृपया लोकेशन अनुमति और GPS चालू करें।');
      return;
    }

    const rev = await LocationService.reverseGeocode(freshPos.latitude, freshPos.longitude);
    const placeName = rev?.place
      ? `${rev.place}, ${rev.district}`
      : rev?.district
      ? `${rev.district}, ${rev.state}`
      : 'वर्तमान लोकेशन';

    const res = await ChatService.sendMessage({
      conversationId,
      senderId: user.id,
      messageType: 'location',
      locationData: {
        place: placeName,
        latitude: freshPos.latitude,
        longitude: freshPos.longitude,
      },
    });
    setIsSending(false);

    if (res.message) {
      recordSentMessageAndSaveSnapshot(res.message);
    }
  };

  // Touch & Mouse Long-Press for Message Actions (Section 39)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressActiveRef = useRef(false);

  const startHoldTimer = (msg: Message, e?: React.TouchEvent | React.MouseEvent) => {
    if (typeof window !== 'undefined') {
      try {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.empty?.();
      } catch {}
    }
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    isLongPressActiveRef.current = false;

    if (e && 'touches' in e && e.touches.length > 0) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      touchStartPosRef.current = null;
    }

    // 380ms fires safely before browser default 500ms contextmenu & text selection event
    holdTimerRef.current = window.setTimeout(() => {
      isLongPressActiveRef.current = true;
      if (typeof window !== 'undefined') {
        try {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.empty?.();
        } catch {}
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(35);
        }
      } catch {}
      setActionMessage(msg);
    }, 380);
  };

  const cancelHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !e.touches || e.touches.length === 0) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
    if (dx > 8 || dy > 8) {
      cancelHoldTimer();
    }
  };

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    // ALWAYS suppress browser context menu (Copy address, Download, text menu)
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
    cancelHoldTimer();
    setActionMessage(msg);
  };

  // Delete for Me (Section 39)
  const handleDeleteForMe = async () => {
    if (!actionMessage || !user) return;
    const msgId = actionMessage.id;
    setActionMessage(null);
    isDeletingRef.current = true;
    const ok = await ChatService.deleteForMe(msgId, user.id);
    if (ok) {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } else {
      showToast('मैसेज हटाने में विफल। कृपया पुनः प्रयास करें।');
    }
  };

  // Delete for Everyone (Section 39: authorized only for sender)
  const handleDeleteForEveryone = async () => {
    if (!actionMessage || !user || !actionMessage.is_mine) return;
    const msgId = actionMessage.id;
    setActionMessage(null);
    isDeletingRef.current = true;
    const ok = await ChatService.deleteForEveryone(msgId, user.id);
    if (ok) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, deleted_for_everyone: true, message_text: 'यह मैसेज हटा दिया गया है।', media_url: null, location_data: null }
            : m
        )
      );
    } else {
      showToast('मैसेज हटाने में विफल। कृपया पुनः प्रयास करें।');
    }
  };

  const isOtherAdmin = otherUserId === ADMIN_USER_ID || otherUser?.mobile === '9149275779';
  const name = isOtherAdmin
    ? (lang === 'hi' ? `${websiteName} एडमिन` : `${websiteName} Admin`)
    : otherUser?.name || 'उपयोगकर्ता';
  const photo = otherUser?.profile_photo;
  const firstLetter = name.trim().charAt(0).toUpperCase();

  // Verification badge check strictly reusing existing worker profile status
  const isVerifiedWorker = Boolean(
    !isOtherAdmin &&
    otherWorker &&
    otherWorker.is_active !== false
  );
  const isOtherWorkerDeactivated = Boolean(
    otherWorker &&
    otherWorker.is_active === false
  );

  const receiverSubtext = (() => {
    if (isOtherAdmin) {
      return lang === 'hi' ? `${websiteName} आधिकारिक सहायता` : `${websiteName} Official Support`;
    }
    const catName =
      lang === 'hi'
        ? otherWorker?.category?.name_hi || otherWorker?.other_category
        : otherWorker?.category?.name_en || otherWorker?.category?.name_hi || otherWorker?.other_category;
    if (catName) return catName;
    if (otherLocation) {
      return LocationService.formatWorkerCard(otherLocation, '', lang);
    }
    return null;
  })();

  const isOtherMobilePublic =
    otherWorker?.is_mobile_public !== undefined
      ? Boolean(otherWorker.is_mobile_public)
      : otherUser?.is_mobile_public !== undefined
      ? Boolean(otherUser.is_mobile_public)
      : true;
  const canCallOther = Boolean(otherUser?.mobile) && (isOtherMobilePublic || isAdmin);

  return (
    <div
      style={{
        backgroundColor: '#f0f2f5',
        ...(viewportHeight ? { height: `${viewportHeight}px`, maxHeight: `${viewportHeight}px` } : {}),
      }}
      className="flex flex-col h-full max-h-[100dvh] w-full max-w-2xl mx-auto bg-[#f0f2f5] border-x border-slate-200 overflow-hidden relative"
    >
      {/* 1. TOP: Chat Header - STRICTLY FIXED AT TOP */}
      <div
        style={{ backgroundColor: '#fff1f1' }}
        className="shrink-0 z-30 border-b border-slate-200 shadow-2xs pt-[max(0.625rem,env(safe-area-inset-top))]"
      >
        {/* Top Receiver Identity Row */}
        <div className="px-3 py-2.5 flex items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer shrink-0"
              aria-label="पीछे जाएं"
              title="पीछे जाएं"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Header Identity: Tap photo or name to view complete profile */}
            <div
              onClick={() => setShowDetailModal(true)}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-90 active:scale-[0.99] transition"
            >
              {/* Avatar Photo */}
              <div
                className={`w-9 h-9 rounded-full overflow-hidden shrink-0 border flex items-center justify-center font-bold text-sm ${
                  isOtherAdmin
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'border-slate-200 bg-teal-50 text-teal-800'
                }`}
                title="प्रोफ़ाइल देखें"
              >
                {isOtherAdmin ? (
                  <Shield className="w-5 h-5 text-amber-700" />
                ) : photo ? (
                  <img src={photo} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <span>{firstLetter}</span>
                )}
              </div>

              {/* Name & Category + Verified Worker Badge */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-nowrap">
                  <div className="inline-flex items-center min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">
                      {name}
                    </h3>
                    {isVerifiedWorker && (
                      <img
                        src={verificationLogo}
                        alt="Verified Professional"
                        className="inline-block shrink-0 object-contain select-none"
                        style={{
                          width: '16px',
                          height: '16px',
                          marginLeft: '2px',
                        }}
                      />
                    )}
                  </div>
                  {isOtherWorkerDeactivated && (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      Deactivated
                    </span>
                  )}
                </div>
                {receiverSubtext && (
                  <p className="text-[11px] text-teal-700 truncate leading-tight mt-0.5">
                    {receiverSubtext}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Action Icons: Search Toggle & Call Button */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Search Toggle Icon Button */}
            <button
              type="button"
              onClick={() => {
                if (isSearchOpen) {
                  handleCloseSearch();
                } else {
                  setIsSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 80);
                }
              }}
              className={`p-2 rounded-full transition shrink-0 cursor-pointer ${
                isSearchOpen
                  ? 'bg-teal-100 text-teal-800 ring-1 ring-teal-300'
                  : 'text-slate-600 hover:text-teal-700 hover:bg-slate-100'
              }`}
              title={isSearchOpen ? (lang === 'hi' ? 'खोज बंद करें' : 'Close search') : (lang === 'hi' ? 'मैसेज खोजें' : 'Search messages')}
              aria-label={isSearchOpen ? 'खोज बंद करें' : 'मैसेज खोजें'}
              aria-expanded={isSearchOpen}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Call button using public worker/user mobile */}
            {canCallOther && (
              <button
                type="button"
                onClick={() => {
                  if (otherUser?.mobile) {
                    window.location.href = `tel:${otherUser.mobile}`;
                  }
                }}
                className="p-2 text-teal-700 hover:bg-teal-50 rounded-full transition shrink-0 cursor-pointer"
                title="कॉल करें"
              >
                <Phone className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Toggled Search Input Field (Clean animated bar without disrupting header/chat layout) */}
        {isSearchOpen && (
          <div className="px-3 pb-2.5 pt-1 border-t border-slate-100 bg-slate-50/95 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex-1 min-w-0 relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'hi' ? 'इस बातचीत में संदेश खोजें...' : 'Search messages in this chat...'}
                className="w-full h-8.5 pl-8 pr-7 rounded-lg border border-teal-600/70 bg-white text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 text-slate-900 placeholder:text-slate-400 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-1.5 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="हटाएं (Clear)"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Results count & Next/Prev navigation */}
            {searchQuery.trim() && (
              <div className="flex items-center gap-1 shrink-0">
                {matchingMessageIds.length > 0 ? (
                  <span className="text-[11px] font-bold text-slate-700 px-1.5 py-0.5 bg-white border border-slate-200 rounded-md whitespace-nowrap shadow-2xs">
                    {currentMatchIndex + 1}/{matchingMessageIds.length}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                    {lang === 'hi' ? 'कोई संदेश नहीं' : 'No messages'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={handlePrevMatch}
                  disabled={matchingMessageIds.length === 0}
                  className="p-1 text-slate-600 hover:text-teal-700 hover:bg-slate-200/60 disabled:opacity-30 rounded-md transition cursor-pointer"
                  title={lang === 'hi' ? 'पिछला परिणाम' : 'Previous match'}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleNextMatch}
                  disabled={matchingMessageIds.length === 0}
                  className="p-1 text-slate-600 hover:text-teal-700 hover:bg-slate-200/60 disabled:opacity-30 rounded-md transition cursor-pointer"
                  title={lang === 'hi' ? 'अगला परिणाम' : 'Next match'}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleCloseSearch}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition cursor-pointer shrink-0"
              title={lang === 'hi' ? 'खोज बंद करें' : 'Close search'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Offline Status Bar (Modern messaging app style: clean, non-intrusive) */}
      {!isOnline && (
        <div className="bg-amber-100/95 border-b border-amber-300 px-3 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold text-amber-900 select-none shadow-2xs">
          <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span>{lang === 'hi' ? 'आप ऑफलाइन हैं' : 'You are offline'}</span>
        </div>
      )}

      {isOnline && showReconnectedBanner && (
        <div className="bg-emerald-100/95 border-b border-emerald-300 px-3 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-900 select-none shadow-2xs">
          <Wifi className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>{lang === 'hi' ? 'वापस ऑनलाइन हैं' : 'Back online'}</span>
        </div>
      )}

      {/* 2. MIDDLE: Messages Scroll Area - ONLY SCROLLING AREA */}
      <div
        id="chat-messages-container"
        ref={messagesContainerRef}
        style={{
          backgroundColor: '#a0c2ce',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          userSelect: 'none',
        }}
        className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 overscroll-contain bg-[#a0c2ce] select-none"
      >
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">{t.loading}</div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-1">
            <p>बातचीत की शुरुआत करें।</p>
            <p className="text-[10px] text-slate-400">
              मैसेज, फ़ोटो या अपनी आवाज में संदेश भेजें।
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.is_mine;
            const isDeleted = msg.deleted_for_everyone;
            const isSelectedForAction = actionMessage?.id === msg.id;
            const isSelectedSearchMatch = isSearchOpen && activeMatchMessageId === msg.id;
            const isSearchMatch = isSearchOpen && matchingMessageIds.includes(msg.id);

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                onMouseDown={(e) => {
                  if (e.button === 0) startHoldTimer(msg, e);
                }}
                onMouseUp={cancelHoldTimer}
                onMouseLeave={cancelHoldTimer}
                onTouchStart={(e) => startHoldTimer(msg, e)}
                onTouchEnd={cancelHoldTimer}
                onTouchMove={handleTouchMove}
                onTouchCancel={cancelHoldTimer}
                onContextMenu={(e) => handleContextMenu(e, msg)}
                onDragStart={(e) => e.preventDefault()}
                style={{
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  userSelect: 'none',
                  touchAction: 'pan-y',
                }}
                className={`flex flex-col select-none ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  onContextMenu={(e) => handleContextMenu(e, msg)}
                  onDragStart={(e) => e.preventDefault()}
                  style={{
                    backgroundColor: isMine ? '#a9ffa9' : '#ffffff',
                    fontSize: '16px',
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    userSelect: 'none',
                    touchAction: 'pan-y',
                  }}
                  className={`max-w-[85%] rounded-2xl p-3 shadow-2xs text-[16px] break-words [overflow-wrap:anywhere] min-w-0 transition-all ${
                    isSelectedSearchMatch
                      ? 'ring-4 ring-amber-500 ring-offset-2 ring-offset-slate-100 shadow-lg scale-[1.02] bg-amber-50 text-slate-900 border-2 border-amber-500'
                      : isSearchMatch
                      ? 'ring-2 ring-amber-300 ring-offset-1'
                      : isSelectedForAction
                      ? 'ring-3 ring-teal-500 ring-offset-2 ring-offset-slate-100 shadow-md scale-[1.01]'
                      : ''
                  } ${
                    isSelectedSearchMatch
                      ? ''
                      : isMine
                      ? 'bg-[#a9ffa9] border border-emerald-300/80 text-emerald-950 rounded-br-xs'
                      : 'bg-white text-slate-900 border border-slate-200/90 rounded-bl-xs'
                  }`}
                >
                  {isDeleted ? (
                    <span className="italic opacity-70 select-none pointer-events-none">यह मैसेज हटा दिया गया है।</span>
                  ) : (
                    <>
                      {/* Quoted Comment Reference (WhatsApp-style reference block) */}
                      {msg.reference_preview && (
                        <div
                          className={`mb-2 p-2 rounded-xl border-l-4 text-xs select-none max-w-full overflow-hidden ${
                            isMine
                              ? 'bg-emerald-200/70 border-teal-800 text-emerald-950'
                              : 'bg-slate-100 border-teal-700 text-slate-800'
                          }`}
                        >
                          <div className="font-bold text-[11px] text-teal-900 truncate flex items-center gap-1 select-none pointer-events-none">
                            <span>{msg.reference_metadata?.author_name || 'टिप्पणी'}</span>
                            <span className="text-[10px] opacity-75 font-normal">
                              ({msg.reference_metadata?.target_type === 'requirement' ? 'आवश्यकता' : 'प्रोफ़ाइल'})
                            </span>
                          </div>
                          <p className="text-[11px] opacity-90 line-clamp-2 mt-0.5 break-words [overflow-wrap:anywhere] select-none pointer-events-none">
                            {msg.reference_preview}
                          </p>
                        </div>
                      )}

                      {/* Photo Attachment (Point 11, Issue 1, Point 33) */}
                      {msg.message_type === 'photo' && (
                        <ChatPhotoBubble
                          msg={msg}
                          isMine={!!isMine}
                          onOpenFullscreen={(url) => setFullscreenPhoto(url)}
                          onRetry={handleRetryMedia}
                        />
                      )}

                      {/* Voice Audio Player (Point 33) */}
                      {msg.message_type === 'voice' && (
                        <ChatVoiceBubble
                          msg={msg}
                          isMine={!!isMine}
                          onRetry={handleRetryMedia}
                        />
                      )}

                      {/* Location Message (Requirement 5: Entire card opens map) */}
                      {msg.message_type === 'location' && msg.location_data && (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${msg.location_data?.latitude}&mlon=${msg.location_data?.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            if (isLongPressActiveRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            e.stopPropagation();
                          }}
                          onContextMenu={(e) => handleContextMenu(e, msg)}
                          style={{
                            WebkitTouchCallout: 'none',
                            WebkitUserSelect: 'none',
                            userSelect: 'none',
                          }}
                          className="flex items-center gap-2.5 p-2.5 bg-black/10 hover:bg-black/20 rounded-xl cursor-pointer active:scale-98 transition select-none"
                          title="नक्शे पर देखें (Tap to Open Map)"
                        >
                          <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="font-bold block truncate text-xs sm:text-sm">
                              {msg.location_data.place || 'लोकेशन'}
                            </span>
                            <span className="text-[11px] underline opacity-90 block">
                              नक्शे पर देखें (Open Map)
                            </span>
                          </div>
                        </a>
                      )}

                      {/* Text */}
                      {msg.message_text && (
                        <p
                          style={{
                            WebkitTouchCallout: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            userSelect: 'none',
                            pointerEvents: 'none',
                          }}
                          onDragStart={(e) => e.preventDefault()}
                          className="whitespace-pre-line leading-relaxed break-words [overflow-wrap:anywhere] min-w-0 select-none pointer-events-none"
                        >
                          {isSearchOpen && searchQuery.trim()
                            ? renderHighlightedText(msg.message_text, searchQuery)
                            : msg.message_text}
                        </p>
                      )}
                    </>
                  )}

                  {/* Status Indicator (Section 38: Sending, Sent, Delivered, Read, Failed) */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isMine ? 'text-emerald-800/80 font-medium' : 'text-slate-500'
                    }`}
                  >
                    <span>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMine && !isDeleted && (
                      <span>
                        {msg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-teal-700" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-800" />
                        ) : msg.status === 'sent' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-800" />
                        ) : msg.status === 'pending' ? (
                          <span
                            className="flex items-center gap-0.5 text-amber-700 font-semibold"
                            title={lang === 'hi' ? 'पेंडिंग (ऑफ़लाइन)' : 'Pending (Offline)'}
                          >
                            <Clock className="w-3 h-3 text-amber-700" />
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-amber-700" title="भेजा जा रहा है...">
                            <Clock className="w-3 h-3 animate-spin" />
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Action Modal with Clear Visual Relationship & Real Buttons */}
      {actionMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setActionMessage(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-4 sm:p-5 shadow-2xl space-y-3.5 border border-slate-200 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <h4 className="text-sm font-bold text-slate-900">मैसेज हटाएं (Delete Message)</h4>
              </div>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition cursor-pointer"
                title="बंद करें"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selected message context preview (Relationship: SELECTED MESSAGE -> DELETE ACTIONS) */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 text-xs">
              <span className="block text-[10px] font-bold text-teal-800 uppercase tracking-wider mb-1">
                चयनित संदेश (Selected Message):
              </span>
              <p className="text-slate-800 line-clamp-3 italic break-words [overflow-wrap:anywhere]">
                {actionMessage.message_text ||
                  (actionMessage.message_type === 'photo'
                    ? '📷 [फ़ोटो संदेश]'
                    : actionMessage.message_type === 'voice'
                    ? '🎤 [आवाज संदेश]'
                    : actionMessage.message_type === 'location'
                    ? '📍 [लाइव लोकेशन संदेश]'
                    : 'संदेश')}
              </p>
            </div>

            {/* Action Buttons: Real actionable buttons with distinct meaningful colors */}
            <div className="space-y-2 pt-1">
              {/* Button 1: Delete for Me (Neutral/Dark muted destructive style) */}
              <button
                type="button"
                onClick={handleDeleteForMe}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-slate-800 hover:bg-slate-900 active:scale-98 text-white shadow-sm border border-slate-700 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-slate-300" />
                <span>{t.deleteForMe}</span>
              </button>

              {/* Button 2: Delete for Everyone (Stronger red destructive visual treatment, sender only) */}
              {actionMessage.is_mine && !actionMessage.deleted_for_everyone && (
                <button
                  type="button"
                  onClick={handleDeleteForEveryone}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 active:scale-98 text-white shadow-md transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  <span>{t.deleteForEveryone}</span>
                </button>
              )}

              {/* Cancel Button */}
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                className="w-full py-2.5 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer text-center"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. BOTTOM: Message input area - STRICTLY FIXED AT BOTTOM */}
      <div className="shrink-0 z-30 bg-white border-t border-slate-200 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xs">
        {/* WhatsApp-style Comment Reference Preview above Composer */}
        {activeCommentRef && (
          <div className="px-3 pt-2 pb-1 bg-slate-50 border-b border-slate-200 animate-in fade-in slide-in-from-bottom-1 duration-150">
            <div className="flex items-start justify-between gap-2 bg-white rounded-xl p-2.5 border-l-4 border-teal-700 shadow-2xs">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
                  <span>{activeCommentRef.authorName}</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({activeCommentRef.targetType === 'requirement' ? 'आवश्यकता टिप्पणी' : 'प्रोफ़ाइल टिप्पणी'})
                  </span>
                </div>
                <p className="text-xs text-slate-700 line-clamp-2 mt-0.5 break-words [overflow-wrap:anywhere]">
                  {activeCommentRef.textPreview}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveCommentRef(null);
                  onClearCommentReference?.();
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition cursor-pointer shrink-0"
                title="हटाएं (Remove reference)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Voice Recorder Overlay Modal */}
        {showVoiceRecorder && (
          <div className="p-3 bg-white border-b border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => setShowVoiceRecorder(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <VoiceRecorder
              onRecordingComplete={handleSendVoice}
              title="आवाज संदेश रिकॉर्ड करें"
            />
          </div>
        )}

        {/* Composer (Section 37):
            Empty: Photo & Location controls on left, mic on right.
            Typing: Mic disappears, send arrow appears!
            Text cleared: Mic returns! */}
        <form
          onSubmit={handleSendText}
          style={{ backgroundColor: '#ffffff' }}
          className="p-2 sm:p-2.5 flex items-center gap-1.5 sm:gap-2"
        >
          {/* Left: Photo & Location controls */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-500 hover:text-teal-800 rounded-full hover:bg-slate-100 transition shrink-0 cursor-pointer"
            title="फ़ोटो भेजें"
          >
            <Image className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowLocationConfirm(true)}
            className="p-2 text-slate-500 hover:text-teal-800 rounded-full hover:bg-slate-100 transition shrink-0 cursor-pointer"
            title="लोकेशन भेजें"
          >
            <MapPin className="w-5 h-5" />
          </button>

          {/* Center: Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onFocus={() => {
              // Ensure messages list is scrolled to latest when mobile keyboard appears
              setTimeout(() => {
                if (messagesContainerRef.current) {
                  messagesContainerRef.current.scrollTo({
                    top: messagesContainerRef.current.scrollHeight,
                    behavior: 'smooth',
                  });
                }
              }, 120);
            }}
            placeholder="मैसेज लिखें..."
            style={{ backgroundColor: '#f5f5f5' }}
            className="flex-1 min-w-0 h-10 px-3.5 rounded-full border border-slate-300 text-xs sm:text-sm focus:outline-none focus:border-teal-700 bg-[#f5f5f5] focus:bg-white transition"
          />

          {/* Right: Mic if empty, Send Arrow if typing (Section 37) */}
          {inputText.trim().length > 0 ? (
            <button
              type="submit"
              disabled={isSending}
              className="w-10 h-10 rounded-full bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center shadow-xs active:scale-95 transition disabled:opacity-50 shrink-0 cursor-pointer"
              title="भेजें"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowVoiceRecorder(true)}
              className="w-10 h-10 rounded-full bg-teal-50 hover:bg-teal-100 text-teal-800 flex items-center justify-center border border-teal-200 active:scale-95 transition shrink-0 cursor-pointer"
              title="आवाज रिकॉर्ड करें"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </form>
      </div>

      {/* Point 17: Chat Live Location Confirmation Modal */}
      {showLocationConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-800 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">लाइव लोकेशन साझा करें</h3>
                <p className="text-xs text-slate-500">चैट में आपकी वर्तमान स्थिति</p>
              </div>
            </div>

            <p className="text-sm text-slate-800 font-medium py-1">
              क्या आप अपनी लाइव लोकेशन भेजना चाहते हैं?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowLocationConfirm(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLocationConfirm(false);
                  handleSendLocation();
                }}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
              >
                हाँ, भेजें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Full Profile Detail Modal for other participant (Worker or Normal User) */}
      {showDetailModal && (
        <WorkerDetailModal
          worker={otherWorker}
          user={otherUser}
          userId={otherUserId}
          onClose={() => setShowDetailModal(false)}
          onOpenChat={() => setShowDetailModal(false)}
          onRequireAuth={onRequireAuth}
        />
      )}

      {/* Image Zoom Lightbox Modal with Pinch-to-Zoom */}
      {fullscreenPhoto && (
        <ImageViewerModal
          imageUrl={fullscreenPhoto}
          title="चैट फ़ोटो"
          onClose={() => setFullscreenPhoto(null)}
        />
      )}

      {/* WhatsApp-style Image Preview & Crop Modal before sending (Requirement 12 & 13) */}
      {selectedImageFile && (
        <ChatImagePreviewModal
          file={selectedImageFile}
          onSend={handleSendConfirmedImage}
          onCancel={() => setSelectedImageFile(null)}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 max-w-[90vw] text-center pointer-events-none transition-all">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
