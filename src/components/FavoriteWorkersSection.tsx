import React, { useState } from 'react';
import { Heart, Search, Trash2 } from 'lucide-react';
import { WorkerProfile } from '../types';
import { useFavorites } from '../hooks/useFavorites';
import { useTranslation } from '../hooks/useTranslation';
import { WorkerCard } from './WorkerCard';

interface FavoriteWorkersSectionProps {
  onOpenWorkerDetail: (worker: WorkerProfile) => void;
  onOpenChat?: (userId: string, commentRef?: any) => void;
  onRequireAuth: () => void;
  onExploreWorkers?: () => void;
}

export const FavoriteWorkersSection: React.FC<FavoriteWorkersSectionProps> = ({
  onOpenWorkerDetail,
  onOpenChat,
  onRequireAuth,
  onExploreWorkers,
}) => {
  const { favorites, clearAllFavorites } = useFavorites();
  const { t, lang } = useTranslation();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const titleText = t?.favoriteWorkers || (lang === 'hi' ? 'पसंदीदा सेवा प्रदाता' : 'Favorite Service Providers');
  const emptyText = t?.noFavoriteWorkers || (lang === 'hi' ? 'आपने अभी तक कोई पसंदीदा सेवा प्रदाता नहीं जोड़ा है।' : 'You have not added any favorite service providers yet.');

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all duration-150">
      {/* Header */}
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-gradient-to-r from-rose-50/70 via-slate-50 to-white border-b border-slate-200/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0 shadow-2xs">
            <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-800 truncate">
              {titleText}
            </h2>
            {favorites.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                {favorites.length}
              </span>
            )}
          </div>
        </div>

        {favorites.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 active:scale-95"
            title={lang === 'hi' ? 'सभी पसंदीदा हटाएं' : 'Clear all favorites'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {lang === 'hi' ? 'सभी हटाएं' : 'Clear All'}
            </span>
          </button>
        )}
      </div>

      {/* Confirmation Dialog for Clearing All */}
      {showClearConfirm && (
        <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs sm:text-sm text-amber-900 flex items-center justify-between gap-3 animate-in fade-in">
          <span>
            {lang === 'hi'
              ? 'क्या आप सभी पसंदीदा सेवा प्रदाताओं को हटाना चाहते हैं?'
              : 'Are you sure you want to remove all favorite providers?'}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                clearAllFavorites();
                setShowClearConfirm(false);
              }}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-md transition text-xs cursor-pointer active:scale-95"
            >
              {lang === 'hi' ? 'हाँ, हटाएं' : 'Yes, Clear'}
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold rounded-md transition text-xs cursor-pointer"
            >
              {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3 sm:p-4">
        {favorites.length === 0 ? (
          <div className="py-8 px-4 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mb-3 shadow-inner">
              <Heart className="w-7 h-7 text-rose-300 stroke-[1.5]" />
            </div>
            <p className="text-sm sm:text-base font-semibold text-slate-700 max-w-sm mb-1">
              {emptyText}
            </p>
            <p className="text-xs text-slate-500 max-w-xs mb-4">
              {lang === 'hi'
                ? 'किसी भी सेवा प्रदाता के प्रोफाइल पर दिल (❤️) आइकन दबाकर पसंदीदा में जोड़ें।'
                : 'Tap the heart (❤️) icon on any service provider profile to save them here.'}
            </p>
            {onExploreWorkers && (
              <button
                type="button"
                onClick={onExploreWorkers}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-700 to-teal-800 hover:from-teal-800 hover:to-teal-900 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition cursor-pointer active:scale-95"
              >
                <Search className="w-4 h-4" />
                <span>
                  {lang === 'hi' ? 'सेवा प्रदाता खोजें' : 'Explore Service Providers'}
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-3.5">
            {favorites.map((worker) => (
              <WorkerCard
                key={worker.user_id}
                worker={worker}
                onOpenDetail={onOpenWorkerDetail}
                onOpenChat={(uid) => {
                  if (onOpenChat) onOpenChat(uid);
                  else onRequireAuth();
                }}
                onRequireAuth={onRequireAuth}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
