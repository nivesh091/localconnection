import React, { useEffect, useState } from 'react';
import {
  Home,
  Search,
  MapPin,
  MessageSquare,
  User,
  HelpCircle,
  LogOut,
  LogIn,
  Shield,
  X,
  Moon,
  Sun,
  Info,
  Code,
  Share2,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { AdminService } from '../services/adminService';
import { safeStorage } from '../lib/storage';
import { TalentBrandLogo } from './WorkerQRCodeModal';

import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onNavigate: (tab: string) => void;
  onOpenLogin: () => void;
  unreadCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  onNavigate,
  onOpenLogin,
  unreadCount = 0,
}) => {
  const { user, isAdmin, logout } = useAuth();
  const { t, lang } = useTranslation();
  const { websiteName, websiteNameEn, websiteNameHi, logoUrl, resolvedShareUrl } = useWebsiteBranding();

  usePopupBackDismiss(isOpen, onClose);

  const [copiedShare, setCopiedShare] = useState(false);

  const handleShareWebsite = async () => {
    const siteUrl = resolvedShareUrl;
    const dynamicName = websiteNameEn && websiteName && websiteNameEn.toLowerCase() === websiteName.toLowerCase()
      ? websiteNameEn
      : (lang === 'hi' ? websiteName : (websiteNameEn || websiteName));
    const shareTitle = dynamicName;
    const shareText =
      lang === 'hi'
        ? `${dynamicName} — स्थानीय कुशल सेवा प्रदाताओं और कारीगरों से सीधे जुड़ें:\n${siteUrl}`
        : `${dynamicName} — Connect directly with skilled local service providers:\n${siteUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: siteUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(siteUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = siteUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2200);
    } catch {
      const mailtoUrl = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText)}`;
      window.location.href = mailtoUrl;
    }
  };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const [showAboutModal, setShowAboutModal] = useState(false);
  const [aboutContent, setAboutContent] = useState<string>('');

  useEffect(() => {
    async function loadAbout() {
      try {
        const settings = await AdminService.getSettings();
        setAboutContent(lang === 'hi' ? settings.about_kaammitra_hi : settings.about_kaammitra_en);
      } catch {}
    }
    loadAbout();
  }, [lang]);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
      safeStorage.setItem('kaammitra_theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
      safeStorage.setItem('kaammitra_theme', 'dark');
    }
  };

  // Lock body scroll while sidebar is open (Section 34)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleItemClick = (tab: string) => {
    onNavigate(tab);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    onClose();
    onNavigate('home');
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: t.requirements || 'आवश्यकताएँ', icon: Search },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'help', label: t.help, icon: HelpCircle },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="relative w-72 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={websiteName}
                className="w-9 h-9 rounded-xl object-contain shrink-0 border border-slate-200 bg-white p-0.5 shadow-2xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-teal-800 flex items-center justify-center shrink-0 p-1 shadow-2xs">
                <TalentBrandLogo size={28} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-teal-800 tracking-tight truncate leading-tight">
                {websiteName}
              </h2>
              <p className="text-xs text-slate-500 truncate">{user?.name ? user.name : t.guest}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-semibold'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-teal-700' : 'text-slate-500'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'messages' && !!unreadCount && unreadCount > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" />
                )}
              </button>
            );
          })}

          {/* Admin link if user is Admin */}
          {isAdmin && (
            <button
              onClick={() => handleItemClick('admin')}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-amber-50 text-amber-900 font-semibold'
                  : 'text-amber-800 hover:bg-amber-50/60'
              }`}
            >
              <Shield className="w-5 h-5 text-amber-600" />
              <span>{t.adminPanel}</span>
            </button>
          )}

          {/* Divider */}
          <div className="pt-2 pb-1 border-t border-slate-100 my-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3.5">
              सुविधाएं
            </span>
          </div>

          {/* Dark Mode Toggle directly in drawer */}
          {/* <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
            <div className="flex items-center gap-3.5">
              {isDarkMode ? (
                <Moon className="w-5 h-5 text-indigo-600" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" />
              )}
              <span>{isDarkMode ? t.darkMode : t.lightMode}</span>
            </div>
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-300 cursor-pointer ${
                isDarkMode ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'
              }`}
              aria-label="Toggle theme"
            >
              <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
            </button>
          </div> */}

          {/* About KaamMitra directly in drawer */}
          <button
            type="button"
            onClick={() => setShowAboutModal(true)}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition text-left cursor-pointer"
          >
            <Info className="w-5 h-5 text-sky-600" />
            <span>{t.aboutKaamMitra}</span>
          </button>

          {/* About Developer (at the very end of menu items, accessible to all) */}
          <button
            type="button"
            onClick={() => handleItemClick('developer')}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition text-left cursor-pointer ${
              activeTab === 'developer'
                ? 'bg-teal-50 text-teal-800 font-semibold'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Code className="w-5 h-5 text-teal-700" />
            <span>About Developer</span>
          </button>

          {/* Website Share Option (At the very end after Developer - Requirement 2) */}
          <button
            type="button"
            onClick={handleShareWebsite}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-teal-900 hover:bg-teal-50/80 transition text-left cursor-pointer border border-teal-100 bg-teal-50/40"
          >
            {copiedShare ? (
              <Check className="w-5 h-5 text-emerald-600" />
            ) : (
              <Share2 className="w-5 h-5 text-teal-700" />
            )}
            <span className="flex-1 font-semibold">
              {copiedShare
                ? (lang === 'hi' ? 'लिंक कॉपी हो गया!' : 'Link Copied!')
                : (lang === 'hi' ? 'वेबसाइट शेयर करें (Share Website)' : 'Share Website')}
            </span>
          </button>
        </div>

        {/* Footer: Login / Logout */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          {user ? (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3.5 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-rose-500" />
              <span>{t.logout}</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                onOpenLogin();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-teal-700 text-white hover:bg-teal-800 rounded-lg shadow-xs transition cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{t.login} / {t.createAccount}</span>
            </button>
          )}
        </div>
      </div>

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-teal-700" />
                <h3 style={{ fontSize: '18px' }} className="font-bold text-slate-900">
                  {t.aboutKaamMitra}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p style={{ fontSize: '14px' }} className="text-slate-700 leading-relaxed whitespace-pre-line py-2">
              {aboutContent
                ? aboutContent
                    .replace(/काम\s*मित्र/g, websiteNameHi)
                    .replace(/Kaam\s*Mitra/gi, websiteNameEn)
                    .replace(/KaamMitra/gi, websiteNameEn)
                : lang === 'hi'
                ? `${websiteName} ग्रामीण एवं कस्बाई क्षेत्रों के कुशल सेवा विशेषज्ञों और जरूरतमंद लोगों को जोड़ने का एक सीधा, निःशुल्क व विश्वसनीय मंच है।`
                : `${websiteName} connects skilled village and local service professionals with people who need quality services without middlemen.`}
            </p>
            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                style={{ fontSize: '14px' }}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold transition cursor-pointer"
              >
                {t.close || 'बंद करें'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
