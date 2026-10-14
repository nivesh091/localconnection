import React, { useState, useEffect } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { NotificationService } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';

export const NotificationPermissionBanner: React.FC = () => {
  const { user } = useAuth();
  const { lang } = useTranslation();
  const { websiteName, websiteNameEn } = useWebsiteBranding();
  const [isVisible, setIsVisible] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  useEffect(() => {
    // Only show if user is logged in, notifications are supported, permission is 'default' (not yet chosen), and not dismissed
    if (!user) {
      setIsVisible(false);
      return;
    }

    if (
      NotificationService.isSupported() &&
      NotificationService.getPermission() === 'default' &&
      !NotificationService.hasDismissedPrompt()
    ) {
      // Small delay so it doesn't collide with page load animations
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  const handleEnable = async () => {
    setIsEnabling(true);
    const perm = await NotificationService.requestPermission();
    setIsEnabling(false);
    setIsVisible(false);
    if (perm === 'granted') {
      const alertTitle = lang === 'hi' ? `${websiteName} — सूचनाएं सक्रिय` : `${websiteNameEn || websiteName} Notifications Enabled`;
      await NotificationService.showNotification(
        alertTitle,
        {
          body: lang === 'hi' ? 'अब आपको नए मैसेज और काम की सूचनाएं तुरंत मिलेंगी।' : 'You will now receive instant alerts for new messages.',
          icon: '/pwa-192x192.png',
          badge: '/favicon.ico',
        }
      );
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    NotificationService.dismissPrompt();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-40 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-600/30 text-teal-400 border border-teal-500/40 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
              {lang === 'hi' ? 'मैसेज सूचनाएं (Notifications)' : 'Message Notifications'}
            </p>
            <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
              {lang === 'hi'
                ? 'नया संदेश आने पर तुरंत नोटिफिकेशन पाएं।'
                : 'Get instant alerts when someone messages you.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isEnabling}
            onClick={handleEnable}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{lang === 'hi' ? 'चालू करें' : 'Enable'}</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
            title="बाद में (Later)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
