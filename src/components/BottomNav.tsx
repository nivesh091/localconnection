import React from 'react';
import { Home, ClipboardList, MapPin, MessageSquare, User } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

interface BottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onNavigate, unreadCount = 0 }) => {
  const { lang } = useTranslation();

  const tabs = [
    { id: 'home', label: lang === 'hi' ? 'होम' : 'Home', icon: Home },
    { id: 'search', label: lang === 'hi' ? 'आवश्यकताएँ' : 'Requirements', icon: ClipboardList },
    { id: 'map', label: lang === 'hi' ? 'मैप' : 'Map', icon: MapPin },
    { id: 'messages', label: lang === 'hi' ? 'मैसेज' : 'Messages', icon: MessageSquare, badge: unreadCount },
    { id: 'profile', label: lang === 'hi' ? 'प्रोफ़ाइल' : 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-lg pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto grid grid-cols-5 h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`relative flex flex-col items-center justify-center pt-1 pb-1 transition-colors ${
                isActive ? 'text-teal-800 font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {!!tab.badge && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full min-w-4 text-center leading-tight shadow-xs border-2 border-white">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[11px] leading-tight mt-0.5 ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
