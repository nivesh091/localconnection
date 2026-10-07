import React, { useState, useEffect } from 'react';
import { X, QrCode } from 'lucide-react';
import { WorkerProfile, UserProfile, CommentReference } from '../types';
import { FullProfileDetails } from './FullProfileDetails';
import { WorkerQRCodeModal } from './WorkerQRCodeModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { WorkerService } from '../services/workerService';
import { ProfileService } from '../services/profileService';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

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
        className="bg-[#fcfaf7] border border-[#d4be98]/80 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 bg-[#fff4e9] px-4 sm:px-5 py-3.5 border-b border-[#ebdcc4] flex items-center justify-between z-20 shadow-2xs">
          <h2 className="text-base font-bold text-slate-800 tracking-tight">
            {t.viewProfile}
          </h2>
          <div className="flex items-center gap-1.5">
            {activeWorker && (
              <button
                type="button"
                onClick={() => setShowQRModal(true)}
                className="p-1.5 text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
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
