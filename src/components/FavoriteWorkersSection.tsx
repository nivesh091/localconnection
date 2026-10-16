import React, { useState } from 'react';
import { Heart, Search, Trash2, X, ChevronRight } from 'lucide-react';
import { WorkerProfile } from '../types';
import { useFavorites } from '../hooks/useFavorites';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
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
  const { favorites, clearAllFavorites, removeFavorite } = useFavorites();
  const { t, lang } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Close modal via browser/mobile Back button cleanly
  usePopupBackDismiss(isOpen, () => {
    setIsOpen(false);
    setShowClearConfirm(false);
  });

  const titleText =
    t?.favoriteWorkers ||
    (lang === 'hi' ? 'पसंदीदा सेवा प्रदाता' : 'Favorite Service Providers');
  const emptyText =
    t?.noFavoriteWorkers ||
    (lang === 'hi'
      ? 'आपने अभी तक कोई पसंदीदा सेवा प्रदाता नहीं जोड़ा है।'
      : 'You have not added any favorite service providers yet.');

  const handleClose = () => {
    setIsOpen(false);
    setShowClearConfirm(false);
  };

  const handleExplore = () => {
    handleClose();
    if (onExploreWorkers) {
      onExploreWorkers();
    }
  };

  return (
    <>
      {/* Compact Button / Card on Profile Page */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between p-3.5 sm:p-4 bg-white hover:bg-rose-50/40 active:scale-[0.99] border border-slate-200/90 rounded-2xl shadow-2xs hover:shadow-xs transition cursor-pointer text-left group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100 shadow-2xs group-hover:scale-105 transition-transform">
            <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base tracking-tight truncate">
                {titleText}
              </h3>
              {favorites.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                  {favorites.length}
                </span>
              )}
            </div>
            <p className="text-[12px] sm:text-xs text-slate-500 truncate mt-0.5">
              {favorites.length > 0
                ? lang === 'hi'
                  ? `${favorites.length} सहेजे गए सेवा प्रदाता देखने के लिए टैप करें`
                  : `Tap to view ${favorites.length} saved service providers`
                : lang === 'hi'
                ? 'सहेजे गए सेवा प्रदाता देखने के लिए टैप करें'
                : 'Tap to view saved service providers'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-600 transition shrink-0 ml-2">
          <ChevronRight className="w-5 h-5" />
        </div>
      </button>

      {/* Favorites Popup / Modal (matches "पूरी प्रोफाइल देखें" interaction style) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[45] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
          onClick={handleClose}
        >
          <div
            className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#fff4e9] px-4 sm:px-5 py-3.5 border-b border-[#ebdcc4] flex items-center justify-between z-20 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0 shadow-2xs">
                  <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-base font-bold text-slate-800 tracking-tight truncate">
                    {titleText}
                  </h2>
                  {favorites.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                      {favorites.length}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
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
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
                  aria-label={lang === 'hi' ? 'बंद करें' : 'Close'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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

            {/* Modal Content */}
            <div className="p-3 sm:p-4">
              {favorites.length === 0 ? (
                /* Existing Empty-State Message inside the popup */
                <div className="py-10 px-4 text-center flex flex-col items-center justify-center">
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
                      onClick={handleExplore}
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
                /* Existing List of Favorited Service Providers with same cards and remove action */
                <div className="grid grid-cols-1 gap-3.5 sm:gap-4">
                  {favorites.map((worker) => (
                    <div
                      key={worker.user_id}
                      className="relative flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-slate-500">
                          {lang === 'hi' ? 'सहेजा गया सेवा प्रदाता' : 'Saved Service Provider'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFavorite(worker.user_id);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-0.5 rounded-md transition cursor-pointer active:scale-95"
                          title={lang === 'hi' ? 'पसंदीदा से हटाएं' : 'Remove from Favorites'}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{lang === 'hi' ? 'हटाएं' : 'Remove'}</span>
                        </button>
                      </div>

                      <WorkerCard
                        worker={worker}
                        onOpenDetail={onOpenWorkerDetail}
                        onOpenChat={(uid) => {
                          if (onOpenChat) onOpenChat(uid);
                          else onRequireAuth();
                        }}
                        onRequireAuth={onRequireAuth}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
