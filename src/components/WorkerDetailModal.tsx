import React, { useState, useEffect } from 'react';
import { X, QrCode, Heart } from 'lucide-react';
import { WorkerProfile, UserProfile, CommentReference } from '../types';
import { FullProfileDetails } from './FullProfileDetails';
import { WorkerQRCodeModal } from './WorkerQRCodeModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { WorkerService } from '../services/workerService';
import { ProfileService } from '../services/profileService';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { useFavorites } from '../hooks/useFavorites';

export interface WorkerDetailModalProps {
  worker?: WorkerProfile | null;
  user?: UserProfile | null;
  userId?: string | null;
  onClose: () => void;
  onOpenChat: (userId: string, commentRef?: CommentReference | null) => void;
  onRequireAuth: () => void;
  onStartEditing?: () => void;
  commentReference?: CommentReference | null;
  highlightCommentId?: string | null;
}

export const WorkerDetailModal: React.FC<WorkerDetailModalProps> = ({
  worker,
  user: initialUser,
  userId: initialUserId,
  onClose,
  onOpenChat,
  onRequireAuth,
  onStartEditing,
  commentReference,
  highlightCommentId,
}) => {
  const { user: currentUser } = useAuth();
  const { t, lang } = useTranslation();

  const [activeWorker, setActiveWorker] = useState<WorkerProfile | null>(worker || null);
  const [activeUser, setActiveUser] = useState<UserProfile | null>(
    initialUser || worker?.profile || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [commenterModal, setCommenterModal] = useState<{
    userId: string;
    commentRef: CommentReference;
  } | null>(null);

  const effectiveUserId =
    worker?.user_id || initialUser?.id || initialUserId || null;

  const { isFavorite, toggleFavorite } = useFavorites(activeWorker?.user_id);

  // Modal dismiss hierarchy: browser Back button closes modal cleanly
  usePopupBackDismiss(Boolean(effectiveUserId), onClose);

  // Hydrate full real details from Supabase if needed
  useEffect(() => {
    setActiveWorker(worker || null);
    setActiveUser(initialUser || worker?.profile || null);

    if (!effectiveUserId) return;

    let isMounted = true;
    setIsLoading(true);

    WorkerService.getWorkerDetail(effectiveUserId)
      .then(async (freshWorker) => {
        if (!isMounted) return;
        if (freshWorker) {
          setActiveWorker(freshWorker);
          if (freshWorker.profile) {
            setActiveUser(freshWorker.profile);
          }
        } else {
          // If not a worker, load as normal user profile
          const freshUser = await ProfileService.getProfile(effectiveUserId);
          if (!isMounted) return;
          if (freshUser) {
            setActiveUser(freshUser);
          }
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveUserId, worker, initialUser]);

  if (!effectiveUserId) return null;

  const displayUser: UserProfile =
    activeUser ||
    activeWorker?.profile || {
      id: effectiveUserId,
      name: 'उपयोगकर्ता',
      mobile: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

  const isOwn = currentUser?.id === effectiveUserId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 bg-[#fff4e9] px-4 sm:px-5 py-3.5 border-b border-[#ebdcc4] flex items-center justify-between z-20 shadow-xs">
          <h2 className="text-base font-bold text-slate-800 tracking-tight">
            {t.viewProfile}
          </h2>
          <div className="flex items-center gap-1.5">
            {activeWorker && !isOwn && (
              <button
                type="button"
                onClick={async () => {
                  if (activeWorker) {
                    await toggleFavorite(activeWorker);
                  }
                }}
                className={`p-1.5 border rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                  isFavorite
                    ? 'bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
                }`}
                title={
                  isFavorite
                    ? lang === 'hi'
                      ? 'पसंदीदा से हटाएं (Remove Favorite)'
                      : 'Remove from Favorites'
                    : lang === 'hi'
                    ? 'पसंदीदा में जोड़ें (Add to Favorites)'
                    : 'Add to Favorites'
                }
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">
                  {isFavorite
                    ? lang === 'hi'
                      ? 'पसंदीदा'
                      : 'Favorited'
                    : lang === 'hi'
                    ? 'पसंद करें'
                    : 'Favorite'}
                </span>
              </button>
            )}
            {activeWorker && (
              <button
                type="button"
                onClick={() => setShowQRModal(true)}
                className="p-1.5 text-[#0a5241] hover:text-[#083a2d] bg-[#edf7f1] hover:bg-[#d3eadb] border border-[#d3eadb] rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
                title={lang === 'hi' ? 'QR कोड देखें और शेयर करें' : 'View and share QR code'}
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">{lang === 'hi' ? 'QR कोड' : 'QR Code'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
              aria-label="बंद करें"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Single Unified FullProfileDetails Component */}
        <div className="p-3.5 sm:p-5">
          <FullProfileDetails
            user={displayUser}
            worker={activeWorker}
            location={activeWorker?.location || displayUser.location || null}
            isOwnProfile={isOwn}
            onStartEditing={onStartEditing ? () => { onClose(); onStartEditing(); } : undefined}
            onOpenChat={(uid) => {
              onClose();
              onOpenChat(uid, commentReference);
            }}
            onRequireAuth={onRequireAuth}
            onOpenCommenterProfile={(authorId, commentRef) => {
              setCommenterModal({ userId: authorId, commentRef });
            }}
            highlightCommentId={highlightCommentId}
          />
        </div>
      </div>

      {/* Shareable QR Code Modal */}
      {showQRModal && activeWorker && (
        <WorkerQRCodeModal
          worker={activeWorker}
          user={displayUser}
          onClose={() => setShowQRModal(false)}
        />
      )}

      {/* Nested Commenter Profile Modal */}
      {commenterModal && (
        <WorkerDetailModal
          userId={commenterModal.userId}
          commentReference={commenterModal.commentRef}
          onClose={() => setCommenterModal(null)}
          onOpenChat={(uid, ref) => {
            setCommenterModal(null);
            onClose();
            onOpenChat(uid, ref);
          }}
          onRequireAuth={onRequireAuth}
        />
      )}
    </div>
  );
};
