import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  Trash2,
  CheckCheck,
  Briefcase,
  ClipboardList,
  MessageSquare,
  CornerDownRight,
  Loader2,
  Clock,
  Check,
  Mic,
} from 'lucide-react';
import { UserNotification } from '../types';
import { UserNotificationService } from '../services/userNotificationService';
import { WorkerService } from '../services/workerService';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import verificationLogo from '@/verificationlogo.png';

interface NotificationListModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectNotification: (notif: UserNotification) => void;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationListModal: React.FC<NotificationListModalProps> = ({
  userId,
  isOpen,
  onClose,
  onSelectNotification,
  onUnreadCountChange,
}) => {
  const { lang } = useTranslation();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Collect all sender IDs from notifications
  const senderIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const n of notifications) {
      const sId = n.sender?.id || n.sender_id;
      if (sId) ids.add(sId);
    }
    return Array.from(ids);
  }, [notifications]);

  const [workerUserIds, setWorkerUserIds] = useState<Set<string>>(() =>
    WorkerService.getCachedWorkerUserIds(senderIds)
  );

  useEffect(() => {
    if (senderIds.length === 0) return;
    let isMounted = true;
    WorkerService.getValidWorkerUserIds(senderIds).then((set) => {
      if (isMounted) setWorkerUserIds(set);
    });
    return () => {
      isMounted = false;
    };
  }, [senderIds]);

  usePopupBackDismiss(isOpen, onClose);

  const loadNotifications = async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const list = await UserNotificationService.getNotifications(userId);
      setNotifications(list);
      const unread = list.filter((n) => !n.is_read).length;
      if (onUnreadCountChange) onUnreadCountChange(unread);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      loadNotifications();
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleMarkAllRead = async () => {
    await UserNotificationService.markAllAsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (onUnreadCountChange) onUnreadCountChange(0);
  };

  const handleDelete = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    setDeletingId(notifId);
    try {
      await UserNotificationService.deleteNotification(notifId, userId);
      setNotifications((prev) => {
        const updated = prev.filter((n) => n.id !== notifId);
        const unread = updated.filter((n) => !n.is_read).length;
        if (onUnreadCountChange) onUnreadCountChange(unread);
        return updated;
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleItemClick = async (notif: UserNotification) => {
    if (!notif.is_read) {
      await UserNotificationService.markAsRead(notif.id, userId);
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n));
        const unread = updated.filter((item) => !item.is_read).length;
        if (onUnreadCountChange) onUnreadCountChange(unread);
        return updated;
      });
    }
    onClose();
    onSelectNotification(notif);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const today = new Date();
      const isToday =
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();

      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (isToday) {
        return lang === 'hi' ? `आज, ${timeStr}` : `Today, ${timeStr}`;
      }
      const dateStr = d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', {
        day: 'numeric',
        month: 'short',
      });
      return `${dateStr}, ${timeStr}`;
    } catch {
      return '';
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-[#1e3a5f] text-white px-4 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <Bell className="w-5 h-5 text-amber-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-4 text-center leading-tight">
                  {unreadCount}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold truncate">
              {lang === 'hi' ? 'सूचनाएं (Notifications)' : 'Notifications'}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                title={lang === 'hi' ? 'सभी को पढ़ा हुआ चिह्नित करें' : 'Mark all as read'}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg text-xs font-semibold text-white transition cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {lang === 'hi' ? 'सब पढ़ लिया' : 'Mark all read'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 bg-slate-50/70">
          {isLoading ? (
            <div className="py-16 text-center space-y-2">
              <Loader2 className="w-7 h-7 text-teal-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-500">
                {lang === 'hi' ? 'सूचनाएं लोड हो रही हैं...' : 'Loading notifications...'}
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-2.5">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <Bell className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">
                {lang === 'hi' ? 'कोई नई सूचना नहीं है' : 'No notifications yet'}
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {lang === 'hi'
                  ? 'जब कोई आपकी प्रोफ़ाइल या आवश्यकता पर टिप्पणी या जवाब देगा, तो सूचना यहाँ दिखेगी।'
                  : 'You will receive notifications here when someone comments on your profile or requirement.'}
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isWorker = notif.target_type === 'worker';
              const isReply = notif.notification_type === 'reply';
              const sender = notif.sender;
              const senderId = sender?.id || notif.sender_id;
              const isSenderWorker = Boolean(senderId && workerUserIds.has(senderId));
              const senderName = sender?.name || (lang === 'hi' ? 'उपयोगकर्ता' : 'User');
              const firstLetter = senderName.charAt(0).toUpperCase();

              // Distinct Colors:
              // Worker Profile -> Emerald / Teal theme
              // Requirement    -> Amber / Orange theme
              const borderColor = isWorker
                ? notif.is_read
                  ? 'border-emerald-200 hover:border-emerald-400 bg-white'
                  : 'border-emerald-400 bg-emerald-50/40 shadow-xs'
                : notif.is_read
                ? 'border-amber-200 hover:border-amber-400 bg-white'
                : 'border-amber-400 bg-amber-50/40 shadow-xs';

              const accentBorder = isWorker ? 'border-l-4 border-l-emerald-600' : 'border-l-4 border-l-amber-500';

              return (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  style={{
                    paddingLeft: '14px',
                    paddingTop: '10px',
                    paddingBottom: '7px',
                  }}
                  className={`rounded-xl border transition cursor-pointer relative flex items-start gap-3 shadow-2xs hover:shadow-xs ${borderColor} ${accentBorder}`}
                >
                  {/* Sender Photo */}
                  <div className="relative shrink-0 mt-0.5">
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm border-2 shadow-2xs ${
                        isWorker
                          ? 'border-emerald-400 bg-emerald-100 text-emerald-900'
                          : 'border-amber-400 bg-amber-100 text-amber-900'
                      }`}
                    >
                      {sender?.profile_photo ? (
                        <img
                          src={sender.profile_photo}
                          alt={senderName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{firstLetter}</span>
                      )}
                    </div>

                    {/* Small action icon overlay */}
                    <div
                      className={`absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full flex items-center justify-center text-white text-[9px] shadow-xs ${
                        isReply ? 'bg-indigo-600' : isWorker ? 'bg-emerald-600' : 'bg-amber-600'
                      }`}
                    >
                      {isReply ? (
                        <CornerDownRight className="w-2.5 h-2.5" />
                      ) : (
                        <MessageSquare className="w-2.5 h-2.5" />
                      )}
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <div className="inline-flex items-center min-w-0">
                          <span
                            style={{ fontSize: '16px' }}
                            className="font-bold text-slate-900 truncate"
                          >
                            {senderName}
                          </span>
                          {isSenderWorker && (
                            <img
                              src={verificationLogo}
                              alt="Verified"
                              className="inline-block shrink-0 object-contain select-none"
                              style={{
                                width: '16px',
                                height: '16px',
                                marginLeft: '2px',
                              }}
                            />
                          )}
                        </div>

                        {/* Distinct Tag: Worker Profile vs Requirement */}
                        {isWorker ? (
                          <span
                            style={{
                              display: 'none',
                              paddingLeft: '6px',
                              paddingTop: '2px',
                              marginLeft: '0px',
                              marginTop: '0px',
                              marginBottom: '4px',
                            }}
                            className="hidden inline-flex items-center gap-1 pr-1.5 pb-0.5 rounded-md font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                          >
                            <Briefcase className="w-2.5 h-2.5 text-emerald-700" />
                            <span style={{ fontSize: '11px' }}>
                              {lang === 'hi' ? '' : ''}
                            </span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'none',
                              paddingLeft: '6px',
                              paddingTop: '2px',
                              marginLeft: '0px',
                              marginTop: '0px',
                              marginBottom: '4px',
                            }}
                            className="hidden inline-flex items-center gap-1 pr-1.5 pb-0.5 rounded-md font-bold bg-amber-100 text-amber-900 border border-amber-300"
                          >
                            <ClipboardList className="w-2.5 h-2.5 text-amber-800" />
                            <span style={{ fontSize: '11px' }}>
                              {lang === 'hi' ? '' : ''}
                            </span>
                          </span>
                        )}

                        {/* Reply tag if threaded reply */}
                        {isReply && (
                          <span
                            style={{ display: 'none' }}
                            className="hidden inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                          >
                            <span>{lang === 'hi' ? 'जवाब' : 'Reply'}</span>
                          </span>
                        )}
                      </div>

                      {/* Unread indicator pulse dot */}
                      {!notif.is_read && (
                        <span
                          className={`hidden w-2 h-2 rounded-full shrink-0 ${
                            isWorker ? 'bg-emerald-600' : 'bg-amber-600'
                          }`}
                          title={lang === 'hi' ? 'नया' : 'New'}
                        />
                      )}
                    </div>

                    {/* Preview Text */}
                    <div className="mt-1 flex items-baseline flex-wrap gap-1.5 w-full min-w-0">
                      {notif.has_voice && (
                        <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 shadow-2xs">
                          <Mic className="w-2.5 h-2.5 text-emerald-700" />
                          <span>{lang === 'hi' ? 'वॉयस टिप्पणी' : 'Voice comment'}</span>
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '15px',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                        className={`break-words whitespace-normal ${
                          !notif.is_read ? 'text-slate-900 font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {notif.comment_preview || (isReply ? 'टिप्पणी का जवाब दिया' : 'नई टिप्पणी पोस्ट की')}
                      </span>
                    </div>

                    {/* Date / Time and Delete Action */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-slate-100 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatDate(notif.created_at)}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, notif.id)}
                          disabled={deletingId === notif.id}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                          title={lang === 'hi' ? 'सूचना हटाएं' : 'Delete notification'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
