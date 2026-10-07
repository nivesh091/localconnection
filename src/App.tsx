import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { OfflineIndicator } from './components/OfflineIndicator';
import { DatabaseSetupNotice } from './components/DatabaseSetupNotice';

import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { MapPage } from './pages/MapPage';
import { MessagesPage } from './pages/MessagesPage';
import { ChatPage } from './pages/ChatPage';
import { ProfilePage } from './pages/ProfilePage';
import { HelpPage } from './pages/HelpPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminPage } from './pages/AdminPage';
import { DeveloperPage } from './pages/DeveloperPage';
import { WorkerDetailModal } from './components/WorkerDetailModal';
import { RequirementDetailModal } from './components/RequirementDetailModal';
import { NotificationListModal } from './components/NotificationListModal';

import { ChatService } from './services/chatService';
import { UserNotificationService } from './services/userNotificationService';
import { supabase } from './lib/supabase';
import { usePopupBackDismiss } from './hooks/usePopupBackDismiss';
import { PWAInstallPopup } from './components/PWAInstallPopup';
import { NotificationPermissionBanner } from './components/NotificationPermissionBanner';
import { NotificationService } from './services/notificationService';
import { useWebsiteBranding } from './hooks/useWebsiteBranding';
import { CommentReference } from './types';

// Parse URL hash/path to restore exact page/state on refresh (Point 1 & Point 5)
export interface AppLocationState {
  tab: string;
  conversation: { conversationId: string; otherUserId: string } | null;
  workerId: string | null;
  editMode: 'profile' | 'worker' | null;
}

export function parseLocationState(): AppLocationState {
  if (typeof window === 'undefined') {
    return { tab: 'home', conversation: null, workerId: null, editMode: null };
  }

  const path = window.location.pathname || '';
  const hash = window.location.hash || '';
  const search = window.location.search || '';

  // Extract query parameters from hash (#tab?param=val) and search (?param=val)
  const cleanHash = hash.replace(/^#\/?/, '');
  const [routePart, hashQuery = ''] = cleanHash.split('?');
  const hashParams = new URLSearchParams(hashQuery || (routePart.includes('=') ? routePart : ''));
  const searchParams = new URLSearchParams(search);

  // 1. Worker Profile ID
  let workerId: string | null =
    hashParams.get('worker') ||
    searchParams.get('worker') ||
    null;

  if (!workerId && routePart.startsWith('worker=')) {
    workerId = routePart.split('=')[1] || null;
  }
  if (!workerId && path.startsWith('/worker/')) {
    workerId = path.split('/worker/')[1] || null;
  }

  // 2. Chat Conversation
  const isChat =
    hash.startsWith('#chat') ||
    cleanHash === 'chat' ||
    path.startsWith('/chat');

  if (isChat) {
    const c = hashParams.get('c') || searchParams.get('c');
    const u = hashParams.get('u') || searchParams.get('u');
    if (c && u) {
      return { tab: 'chat', conversation: { conversationId: c, otherUserId: u }, workerId: null, editMode: null };
    }
    return { tab: 'messages', conversation: null, workerId: null, editMode: null };
  }

  // 3. Edit Mode for Profile / Worker
  let editMode: 'profile' | 'worker' | null = null;
  const editParam = hashParams.get('edit') || searchParams.get('edit');
  const editWorkerParam = hashParams.get('edit_worker') || searchParams.get('edit_worker');
  if (editParam === '1' || editParam === 'profile') {
    editMode = 'profile';
  } else if (editWorkerParam === '1' || editParam === 'worker') {
    editMode = 'worker';
  }

  // 4. Tab Resolution
  const validTabs = ['home', 'search', 'map', 'messages', 'profile', 'help', 'admin', 'developer'];
  let candidateTab: string | null = null;

  // A. Check hash route (e.g. #home, #search, #map, #messages, #profile, #help, #admin, #developer)
  const cleanHashTab = (routePart.includes('=') ? '' : routePart).toLowerCase();
  if (validTabs.includes(cleanHashTab)) {
    candidateTab = cleanHashTab;
  }

  // B. Check pathname route (e.g. /search, /map, /messages, /profile, /help, /admin, /developer)
  if (!candidateTab) {
    const cleanPathSegment = path.replace(/^\//, '').split('/')[0].toLowerCase();
    if (validTabs.includes(cleanPathSegment)) {
      candidateTab = cleanPathSegment;
    }
  }

  // C. Check ?tab= query parameter
  if (!candidateTab) {
    const tabFromQuery = (searchParams.get('tab') || hashParams.get('tab') || '').toLowerCase();
    if (validTabs.includes(tabFromQuery)) {
      candidateTab = tabFromQuery;
    }
  }

  // D. Check history state (if browser preserved state across F5)
  if (!candidateTab && window.history?.state?.tab) {
    const stateTab = String(window.history.state.tab).toLowerCase();
    if (validTabs.includes(stateTab)) {
      candidateTab = stateTab;
    }
  }

  // E. Final Tab Resolution: default to home only if no route is found
  let tab = 'home';
  if (candidateTab) {
    tab = candidateTab;
  } else if (workerId) {
    tab = 'home';
  }

  return { tab, conversation: null, workerId, editMode };
}

function AppContent() {
  const { user, logout } = useAuth();
  useWebsiteBranding();

  // URL-driven navigation state (Point 1 & Point 5)
  const [locationState, setLocationState] = useState<AppLocationState>(() => parseLocationState());

  const activeTab = locationState.tab;
  const activeConversation = locationState.conversation;
  const activeWorkerId = locationState.workerId;
  const activeEditMode = locationState.editMode;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingCommentRef, setPendingCommentRef] = useState<CommentReference | null>(null);

  // Deep-linking target from Notification click (Worker Profile or Requirement)
  const [selectedNotificationTarget, setSelectedNotificationTarget] = useState<{
    targetType: 'worker' | 'requirement';
    targetId: string;
    commentId?: string;
  } | null>(null);

  // Auth modal states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  usePopupBackDismiss(showAuthModal, () => setShowAuthModal(false));

  // Track current authenticated user ID in a ref to prevent stale closures during delayed reconnect callbacks
  const currentUserIdRef = useRef<string | undefined>(user?.id);
  currentUserIdRef.current = user?.id;

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);

  // Real-time unread notification count for Bell icon (Worker & Requirement Comments)
  useEffect(() => {
    if (!user?.id) {
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

  // Real-time unread messages count for logged-in user with debounced reconnect handling
  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }

    const userId = user.id;
    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const fetchUnread = async () => {
      if (!isMounted || currentUserIdRef.current !== userId) return;
      try {
        const count = await ChatService.getTotalUnreadCount(userId);
        if (isMounted && currentUserIdRef.current === userId) {
          setUnreadCount(count);
        }
      } catch {}
    };

    // Helper to create the single unread Realtime channel
    const createUnreadChannel = () => {
      if (activeChannel) {
        try {
          supabase.removeChannel(activeChannel);
        } catch {}
        activeChannel = null;
      }

      const unreadChannelName = `app_unread_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      try {
        activeChannel = supabase
          .channel(unreadChannelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages',
            },
            () => {
              fetchUnread();
            }
          )
          .subscribe();
      } catch (err) {
        console.warn('[App] Realtime unread channel setup warning:', err);
      }
    };

    // Initial unread fetch and channel creation
    fetchUnread();
    createUnreadChannel();

    // Debounced reconnect handler: absorbs rapid flapping (offline -> online -> offline -> online)
    const handleOnline = () => {
      // Clear any pending reconnect timer from rapid/burst events
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // 600ms debounce window
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;

        // 1. Guard: Check if component is still mounted and browser is genuinely online
        if (!isMounted || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          return;
        }

        // 2. Guard: Prevent stale closures — verify user hasn't changed or logged out
        if (currentUserIdRef.current !== userId) {
          return;
        }

        // 3. Inspect existing channel state: Supabase Realtime client manages automatic socket reconnects.
        // If channel is already joined/healthy, reuse it. Otherwise, clean up and re-initialize exactly one.
        const channelState = activeChannel?.state;
        const isHealthy = channelState === 'joined' || channelState === 'joining';

        if (!isHealthy) {
          createUnreadChannel();
        }

        // 4. Perform unread count revalidation once connection is verified stable
        fetchUnread();
      }, 600);
    };

    // If an offline event occurs while reconnect debounce timer is pending, cancel it immediately
    const handleOffline = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (activeChannel) {
        try {
          supabase.removeChannel(activeChannel);
        } catch {}
        activeChannel = null;
      }
    };
  }, [user?.id]);

  // Refresh unread count when conversation closes or user changes
  useEffect(() => {
    if (user?.id) {
      ChatService.getTotalUnreadCount(user.id).then((c) => setUnreadCount(c)).catch(() => {});
    }
  }, [user?.id, activeConversation]);

  // Web Push & Realtime Message Notifications (Background SW alerts & click navigation)
  useEffect(() => {
    if (!user?.id) return;

    // Listen to real-time incoming messages to trigger background Service Worker notifications
    const unsubscribeMessageNotifications = NotificationService.setupRealtimeMessageNotifications(
      user.id,
      (conversationId, senderId) => {
        handleOpenConversation(conversationId, senderId);
      }
    );

    // Also listen to postMessage from Service Worker when a user taps an OS/browser push notification
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE_CHAT') {
        const { conversationId, senderId } = event.data;
        if (conversationId && senderId) {
          handleOpenConversation(conversationId, senderId);
        }
      } else if (event.data?.type === 'NAVIGATE_TARGET') {
        const { targetType, targetId, commentId } = event.data;
        if (targetType && targetId) {
          setSelectedNotificationTarget({ targetType, targetId, commentId });
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      unsubscribeMessageNotifications();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [user?.id]);

  // Sync browser path/history for all tabs & back navigation (Point 1 & Point 5)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If the popstate was for an internal modal/popup dismiss, do not change tab or route
      if (e.state?.isModal || e.state?.popupOpen || e.state?.modalId) {
        return;
      }
      setLocationState(parseLocationState());
    };
    const handleHashChange = () => {
      setLocationState(parseLocationState());
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleNavigate = (tab: string) => {
    if (tab !== 'chat') {
      setPendingCommentRef(null);
    }
    if (tab === activeTab && !activeConversation && !activeWorkerId && !activeEditMode) return;

    const targetUrl =
      tab === 'admin'
        ? '#admin'
        : tab === 'home'
        ? '#home'
        : `#${tab}`;

    window.history.pushState({ tab }, '', targetUrl);
    setLocationState(parseLocationState());
  };

  const handleOpenChat = async (targetUserId: string, commentRef?: CommentReference | null) => {
    if (!user) {
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }
    if (commentRef !== undefined) {
      setPendingCommentRef(commentRef || null);
    }
    const res = await ChatService.getOrCreateConversation(user.id, targetUserId);
    if (res.conversation) {
      handleOpenConversation(res.conversation.id, targetUserId, commentRef);
    }
  };

  const handleOpenConversation = (
    conversationId: string,
    otherUserId: string,
    commentRef?: CommentReference | null
  ) => {
    if (commentRef !== undefined) {
      setPendingCommentRef(commentRef || null);
    }
    const targetUrl = `#chat?c=${encodeURIComponent(conversationId)}&u=${encodeURIComponent(otherUserId)}`;
    window.history.pushState(
      { tab: 'chat', conversationId, otherUserId },
      '',
      targetUrl
    );
    setLocationState(parseLocationState());
  };

  // Track active fullscreen chat conversation state
  const isChatConversationActive = activeTab === 'chat' && Boolean(activeConversation);

  return (
    <div
      className={`min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900 ${
        isChatConversationActive
          ? 'h-[100dvh] max-h-[100dvh] overflow-hidden fixed inset-0 z-40 bg-[#f0f2f5]'
          : ''
      }`}
      style={isChatConversationActive ? { backgroundColor: '#f0f2f5' } : undefined}
    >
      {/* Offline Alert Banner (hidden during active fullscreen chat conversation) */}
      {!isChatConversationActive && <OfflineIndicator />}

      {/* Database Schema Setup Notice (hidden during active fullscreen chat conversation) */}
      {!isChatConversationActive && <DatabaseSetupNotice />}

      {/* PWA Timed Install Popup (hidden during active fullscreen chat conversation) */}
      {!isChatConversationActive && <PWAInstallPopup />}

      {/* Gentle In-App Notification Permission Banner (hidden during active fullscreen chat conversation) */}
      {!isChatConversationActive && <NotificationPermissionBanner />}

      {/* Global Header (Hidden during active fullscreen chat conversation) */}
      {!isChatConversationActive && (
        <Header
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onNavigateProfile={() => handleNavigate('profile')}
          unreadNotifCount={unreadNotifCount}
          onOpenNotifications={() => setIsNotificationModalOpen(true)}
        />
      )}

      {/* Sidebar Navigation */}
      {!isChatConversationActive && (
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeTab={activeTab}
          onNavigate={handleNavigate}
          unreadCount={unreadCount}
          onOpenLogin={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
        />
      )}

      {/* Main View Area */}
      <main
        style={isChatConversationActive ? { backgroundColor: '#f0f2f5' } : undefined}
        className={`flex-1 w-full ${
          isChatConversationActive
            ? 'h-full overflow-hidden flex flex-col min-h-0 bg-[#f0f2f5]'
            : 'bg-[#ececec]'
        }`}
      >
        {activeTab === 'home' && (
          <HomePage
            initialWorkerId={activeWorkerId}
            onOpenChat={handleOpenChat}
            onRequireAuth={() => {
              setAuthMode('login');
              setShowAuthModal(true);
            }}
          />
        )}

        {activeTab === 'search' && (
          <SearchPage
            initialWorkerId={activeWorkerId}
            onOpenChat={handleOpenChat}
            onRequireAuth={() => {
              setAuthMode('login');
              setShowAuthModal(true);
            }}
          />
        )}

        {activeTab === 'map' && (
          <MapPage
            initialWorkerId={activeWorkerId}
            onOpenChat={handleOpenChat}
            onRequireAuth={() => {
              setAuthMode('login');
              setShowAuthModal(true);
            }}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesPage
            onOpenConversation={handleOpenConversation}
            onRequireAuth={() => {
              setAuthMode('login');
              setShowAuthModal(true);
            }}
            onOpenNotificationTarget={(targetType, targetId, commentId) => {
              setSelectedNotificationTarget({ targetType, targetId, commentId });
            }}
          />
        )}

        {activeTab === 'chat' && activeConversation && (
          <ChatPage
            conversationId={activeConversation.conversationId}
            otherUserId={activeConversation.otherUserId}
            initialCommentReference={pendingCommentRef}
            onClearCommentReference={() => setPendingCommentRef(null)}
            onBack={() => {
              setPendingCommentRef(null);
              if (window.history.length > 1) {
                window.history.back();
              } else {
                handleNavigate('messages');
              }
            }}
            onRequireAuth={() => {
              setAuthMode('login');
              setShowAuthModal(true);
            }}
          />
        )}

        {activeTab === 'profile' && (
          <ProfilePage
            initialEditMode={activeEditMode}
            onOpenChat={handleOpenChat}
            onRequireAuth={() => {
              setAuthMode('login');
              setShowAuthModal(true);
            }}
          />
        )}

        {activeTab === 'help' && <HelpPage />}

        {activeTab === 'admin' && <AdminPage />}

        {activeTab === 'developer' && <DeveloperPage onBack={() => handleNavigate('home')} />}
      </main>

      {/* Bottom Navigation for all primary screens (Hidden during active fullscreen chat conversation) */}
      {!isChatConversationActive && (
        <BottomNav
          activeTab={activeTab}
          onNavigate={handleNavigate}
          unreadCount={unreadCount}
        />
      )}

      {/* Auth Modal (Login / Register Flow) */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 flex items-start justify-center"
          onClick={() => setShowAuthModal(false)}
        >
          <div
            className="w-full max-w-sm my-auto py-4"
            onClick={(e) => e.stopPropagation()}
          >
            {authMode === 'login' ? (
              <LoginPage
                onClose={() => setShowAuthModal(false)}
                onNavigateRegister={() => setAuthMode('register')}
                onNavigateHelp={() => {
                  setShowAuthModal(false);
                  handleNavigate('help');
                }}
                onSuccess={() => setShowAuthModal(false)}
              />
            ) : (
              <RegisterPage
                onBackToLogin={() => setAuthMode('login')}
                onSuccess={() => setShowAuthModal(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* Target Modal for Notification Deep-Linking (Worker Profile or Requirement) */}
      {selectedNotificationTarget?.targetType === 'worker' && (
        <WorkerDetailModal
          userId={selectedNotificationTarget.targetId}
          highlightCommentId={selectedNotificationTarget.commentId}
          onClose={() => setSelectedNotificationTarget(null)}
          onOpenChat={handleOpenChat}
          onRequireAuth={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
        />
      )}

      {selectedNotificationTarget?.targetType === 'requirement' && (
        <RequirementDetailModal
          requirementId={selectedNotificationTarget.targetId}
          highlightCommentId={selectedNotificationTarget.commentId}
          onClose={() => setSelectedNotificationTarget(null)}
          onOpenChat={handleOpenChat}
          onRequireAuth={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
        />
      )}

      {/* Global Notification List Modal (Accessible via Header Bell on all screens) */}
      {user && isNotificationModalOpen && (
        <NotificationListModal
          userId={user.id}
          isOpen={isNotificationModalOpen}
          onClose={() => setIsNotificationModalOpen(false)}
          onSelectNotification={(notif) => {
            setSelectedNotificationTarget({
              targetType: notif.target_type,
              targetId: notif.target_id,
              commentId: notif.comment_id || undefined,
            });
          }}
          onUnreadCountChange={(c) => setUnreadNotifCount(c)}
        />
      )}
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled UI error caught by boundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 max-w-md w-full text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-800">कुछ तकनीकी समस्या आई</h2>
            <p className="text-xs text-slate-500">
              कृपया पृष्ठ को पुनः लोड करें। आपकी जानकारी सुरक्षित है।
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.hash = '';
                window.location.reload();
              }}
              className="px-4 py-2 bg-teal-700 text-white rounded-xl text-xs font-bold hover:bg-teal-800 transition cursor-pointer"
            >
              पुनः लोड करें (Reload App)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
