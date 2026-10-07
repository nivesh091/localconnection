import React from 'react';
import { Menu, User as UserIcon, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { TalentBrandLogo } from './WorkerQRCodeModal';
import verificationLogo from '@/verificationlogo.png';

interface HeaderProps {
  onOpenSidebar: () => void;
  onNavigateProfile: () => void;
  unreadNotifCount?: number;
  onOpenNotifications?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSidebar,
  onNavigateProfile,
  unreadNotifCount = 0,
  onOpenNotifications,
}) => {
  const { user } = useAuth();
  const { lang, toggleLanguage, t } = useTranslation();
  const { logoUrl, websiteName } = useWebsiteBranding();

  // Single-line center greeting
  const greeting = user?.name
    ? `${t.hello} ${user.name}`
    : t.welcome;

  // First letter fallback
  const firstLetter = user?.name ? user.name.trim().charAt(0).toUpperCase() : null;

  return (
    <header className="sticky top-0 z-40 w-full bg-[#fff4e9] border-b border-slate-200/80 shadow-xs">
      <div className="max-w-4xl mx-auto px-3.5 h-14 flex items-center justify-between gap-2">
        {/* LEFT: Hamburger menu & Website Logo */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open navigation menu"
            className="p-2 -ml-1 text-slate-700 hover:text-slate-900 active:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div
            className="hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-teal-800 p-0.5 shadow-2xs"
            style={{ display: 'none' }}
            title={websiteName}
          >
            <TalentBrandLogo size={22} logoUrl={logoUrl} />
          </div>
        </div>

        {/* CENTER: Greeting with single-line truncation + Verification Logo by default */}
        <div className="flex-1 min-w-0 flex items-center justify-center px-1">
          <div className="inline-flex items-center justify-center min-w-0 max-w-[190px] xs:max-w-[230px] sm:max-w-sm">
            <span
              title={greeting}
              style={{ fontSize: '19px' }}
              className="text-[19px] font-semibold text-slate-800 tracking-tight truncate text-center"
            >
              {greeting}
            </span>
            {user?.name && (
              <img
                src={verificationLogo}
                alt="Verified"
                className="inline-block shrink-0 object-contain select-none"
                style={{
                  width: '18px',
                  height: '18px',
                  marginLeft: '2px',
                }}
              />
            )}
          </div>
        </div>

        {/* RIGHT CONTROLS: [ Language Button ] -> [ Bell Button ] -> [ Profile Photo ] (Rightmost) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1. Language Switch Button */}
          <button
            type="button"
            onClick={toggleLanguage}
            title={lang === 'hi' ? 'Switch to English' : 'हिंदी में बदलें'}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition cursor-pointer shrink-0"
          >
            {lang === 'hi' ? 'ENGLISH' : 'हिंदी'}
          </button>

          {/* 2. Bell Notification Button */}
          {user && onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              title={lang === 'hi' ? 'सूचनाएं' : 'Notifications'}
              aria-label="Notifications"
              style={{ display: 'none' }}
              className="hidden relative p-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition cursor-pointer flex items-center justify-center shrink-0"
            >
              <Bell className="w-5 h-5 text-slate-700" />
              {typeof unreadNotifCount === 'number' && unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full min-w-4 text-center leading-tight shadow-xs border-2 border-white animate-in zoom-in-75 duration-150">
                  {unreadNotifCount}
                </span>
              )}
            </button>
          )}

          {/* 3. Profile Avatar / Photo (Always at the absolute RIGHTMOST position) */}
          <button
            type="button"
            onClick={onNavigateProfile}
            aria-label="View Profile"
            className="relative w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border border-slate-200 bg-teal-50 text-teal-800 hover:opacity-90 active:scale-95 transition cursor-pointer shrink-0 ml-0.5"
          >
            {user?.profile_photo ? (
              <img
                src={user.profile_photo}
                alt={user.name || 'User'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : firstLetter ? (
              <span className="text-sm font-bold text-teal-800">{firstLetter}</span>
            ) : (
              <UserIcon className="w-4 h-4 text-slate-500" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};


