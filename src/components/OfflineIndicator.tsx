import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useTranslation } from '../hooks/useTranslation';
import { OfflineWorkerStorage } from '../services/offlineWorkerStorage';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { lang } = useTranslation();
  const cachedCount = OfflineWorkerStorage.getCachedWorkersCount();

  if (isOnline) return null;

  return (
    <aside
      aria-label={lang === 'hi' ? 'ऑफ़लाइन स्थिति' : 'Offline Status'}
      className="fixed top-14 left-0 right-0 z-50 bg-amber-600 text-white text-xs py-1.5 px-3 flex items-center justify-center gap-2 shadow-md animate-in fade-in duration-200"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {lang === 'hi'
          ? `ऑफ़लाइन मोड सक्रिय — कैश्ड वर्कर प्रोफ़ाइल (${cachedCount > 0 ? `${cachedCount} सुरक्षित` : 'उपलब्ध'}) और सर्च परिणाम उपलब्ध हैं।`
          : `Offline Mode Active — Cached worker profiles (${cachedCount > 0 ? `${cachedCount} saved` : 'available'}) and search results are accessible.`}
      </span>
    </aside>
  );
};
