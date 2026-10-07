import React, { useState, useEffect, useMemo } from 'react';
import { X, Phone, MessageSquare, MapPin, Flag, Info, Mic, Tag, Image as ImageIcon, Star } from 'lucide-react';
import { Requirement, CommentReference } from '../types';
import { RequirementService } from '../services/requirementService';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { DistanceService } from '../services/distanceService';
import { LocationService } from '../services/locationService';
import { AdminService } from '../services/adminService';
import { AudioPlayer } from './AudioPlayer';
import { ImageViewerModal } from './ImageViewerModal';
import { ProfilePhotoViewerModal } from './ProfilePhotoViewerModal';
import { ReportProviderModal } from './ReportProviderModal';
import { CommentsSection } from './CommentsSection';
import { WorkerDetailModal } from './WorkerDetailModal';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface RequirementDetailModalProps {
  requirement?: Requirement | null;
  requirementId?: string | null;
  highlightCommentId?: string | null;
  onClose: () => void;
  onOpenChat: (targetUserId: string, commentRef?: CommentReference | null) => void;
  onRequireAuth: () => void;
  currentUserCoords?: { lat: number; lng: number } | null;
  isOwnRequirement?: boolean;
}

export const RequirementDetailModal: React.FC<RequirementDetailModalProps> = ({
  requirement: initialRequirement,
  requirementId,
  highlightCommentId,
  onClose,
  onOpenChat,
  onRequireAuth,
  currentUserCoords,
  isOwnRequirement = false,
}) => {
  const { user, location: userLocation, isAdmin, refreshUser } = useAuth();
  const { lang } = useTranslation();
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [commenterModal, setCommenterModal] = useState<{
    userId: string;
    commentRef: CommentReference;
  } | null>(null);

  const [activeReq, setActiveReq] = useState<Requirement | null>(initialRequirement || null);

  useEffect(() => {
    if (initialRequirement) {
      setActiveReq(initialRequirement);
    } else if (requirementId) {
      RequirementService.getRequirementById(requirementId).then((r) => {
        if (r) setActiveReq(r);
      });
    } else {
      setActiveReq(null);
    }
  }, [initialRequirement, requirementId]);

  const requirement = activeReq;

  usePopupBackDismiss(Boolean(requirement), onClose);

  const owner = requirement?.owner;
  const name = owner?.name?.trim() || (lang === 'hi' ? 'उपयोगकर्ता' : 'User');
  const photo = owner?.profile_photo;
  const firstLetter = name.charAt(0).toUpperCase();

  // Mobile Privacy checks
  const isMobilePublic =
    owner?.is_mobile_public !== undefined ? Boolean(owner.is_mobile_public) : true;
  const canViewMobile = isMobilePublic || isAdmin;
  const mobile = canViewMobile ? (owner?.mobile?.trim() || '') : '';

  const categoryName = requirement?.category || (lang === 'hi' ? 'सेवा विशेषज्ञ' : 'Service Expert');
  const maxBudget = requirement?.maximum_budget || 0;

  // Experience
  const experienceYears = requirement?.minimum_experience_years;
  const experienceText =
    experienceYears !== null && experienceYears !== undefined && experienceYears > 0
      ? lang === 'hi'
        ? `${experienceYears} वर्ष`
        : `${experienceYears} ${experienceYears === 1 ? 'Year' : 'Years'}`
      : '—';

  // Distance calculation
  const distanceText = useMemo(() => {
    if (
      !requirement ||
      !currentUserCoords ||
      currentUserCoords.lat === undefined ||
      currentUserCoords.lng === undefined ||
      requirement.latitude === null ||
      requirement.latitude === undefined ||
      requirement.longitude === null ||
      requirement.longitude === undefined
    ) {
      return '';
    }

    const distKm = DistanceService.calculateHaversineDistanceKm(
      { lat: currentUserCoords.lat, lng: currentUserCoords.lng },
      { lat: requirement.latitude, lng: requirement.longitude }
    );

    return distKm !== null ? `${distKm.toFixed(1)} km` : '';
  }, [requirement, currentUserCoords]);

  // Dynamically resolve Tehsil if not stored directly
  const [resolvedTehsil, setResolvedTehsil] = useState<string>('');

  useEffect(() => {
    if (!requirement?.place) {
      setResolvedTehsil('');
      return;
    }
    const directTehsil =
      requirement.subdistrict ||
      requirement.tehsil ||
      requirement.location?.landmark ||
      requirement.location?.subdistrict;
    if (directTehsil && directTehsil.trim()) {
      setResolvedTehsil(directTehsil.trim());
      return;
    }
    let cancelled = false;
    LocationService.findSubdistrictForVillage(
      requirement.state,
      requirement.district,
      requirement.place
    ).then((tehsil) => {
      if (!cancelled && tehsil) {
        setResolvedTehsil(tehsil);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    requirement?.place,
    requirement?.district,
    requirement?.state,
    requirement?.subdistrict,
    requirement?.tehsil,
    requirement?.location?.landmark,
    requirement?.location?.subdistrict,
  ]);

  // Strict format: गाँव: VALUE, तहसील: VALUE, जिला: VALUE, राज्य: VALUE (reusing authoritative LocationService.formatWorkerCard)
  const formattedLocationString = useMemo(() => {
    if (!requirement || !requirement.place) return '';
    const locObj = {
      place: requirement.place,
      village: requirement.place,
      subdistrict:
        requirement.subdistrict ||
        requirement.tehsil ||
        requirement.location?.landmark ||
        requirement.location?.subdistrict ||
        resolvedTehsil,
      tehsil:
        requirement.subdistrict ||
        requirement.tehsil ||
        requirement.location?.landmark ||
        requirement.location?.subdistrict ||
        resolvedTehsil,
      district: requirement.district,
      state: requirement.state,
    };
    return LocationService.formatWorkerCard(locObj, '', lang);
  }, [requirement, resolvedTehsil, lang]);

  // Admin Priority Points state (Part 5 & 20)
  const [priorityPoints, setPriorityPoints] = useState<number>(
    requirement?.priority_points ?? 50
  );
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [priorityNotice, setPriorityNotice] = useState<string | null>(null);

  useEffect(() => {
    setPriorityPoints(requirement?.priority_points ?? 50);
  }, [requirement?.priority_points]);

  const handleUpdatePriority = async (newVal: number) => {
    if (!isAdmin || !requirement) return;
    const clamped = Math.max(1, Math.min(100, Math.round(newVal)));
    setPriorityPoints(clamped);
    setIsSavingPriority(true);
    try {
      const res = await AdminService.updateRequirementPriority(requirement.id, clamped);
      if (res.success) {
        setPriorityNotice('प्राथमिकता सहेजी गई!');
        setTimeout(() => setPriorityNotice(null), 2500);
      }
    } finally {
      setIsSavingPriority(false);
    }
  };

  if (!requirement) return null;

  const handleMessage = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (requirement.owner_id === user.id) return;
    onClose();
    onOpenChat(requirement.owner_id);
  };

  const handleCall = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!mobile) return;
    window.location.href = `tel:${mobile}`;
  };

  const handleOpenReport = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setShowReportModal(true);
  };

  const hasKeywords = Array.isArray(requirement.keywords) && requirement.keywords.length > 0;
  const hasPhotos = Array.isArray(requirement.photos) && requirement.photos.length > 0;
  const hasAdditionalInfo = Boolean(requirement.additional_info && requirement.additional_info.trim());

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold truncate">
              {lang === 'hi' ? 'आवश्यकता का पूरा विवरण' : 'Full Requirement Details'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 bg-[#f8fafc]">
          {/* Main Profile & Requirement Header Card */}
          <div className="bg-gradient-to-b from-[#2b4468] via-[#213554] to-[#1a2b44] rounded-2xl p-[2.5px] shadow-sm">
            <div className="bg-[#f8fafc] rounded-[13px] p-3.5 sm:p-4 space-y-3">
              {/* Photo, Name & Budget Row */}
              <div className="flex items-center justify-between gap-3">
                {/* Photo */}
                <div
                  onClick={() => setShowPhotoViewer(true)}
                  className="w-16 h-16 sm:w-18 sm:h-18 rounded-full p-[2px] bg-gradient-to-tr from-[#2b4468] to-[#607d9f] shadow-xs hover:scale-105 active:scale-95 transition cursor-pointer shrink-0"
                  title="फोटो बड़ी देखें"
                >
                  <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-xl font-bold text-[#1e3a5f]">
                    {photo ? (
                      <img src={photo} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{firstLetter}</span>
                    )}
                  </div>
                </div>

                {/* Name & Category */}
                <div className="flex-1 min-w-0 text-center">
                  <h2 className="text-base sm:text-lg font-bold text-[#1e293b] truncate">
                    {name}
                  </h2>
                  <div className="mt-1 flex justify-center">
                    <span className="inline-flex items-center justify-center border border-[#94a3b8] bg-[#e2e8f0]/80 text-[#1e293b] rounded-full px-3 py-0.5 text-xs sm:text-sm font-semibold truncate shadow-2xs">
                      {categoryName}
                    </span>
                  </div>
                </div>

                {/* Maximum Budget */}
                <div className="shrink-0">
                  <div className="bg-[#e2e8f0] rounded-xl p-[2px] shadow-2xs">
                    <div className="bg-gradient-to-b from-[#fef3c7] to-[#fde68a] rounded-[10px] px-3 py-1.5 flex flex-col items-center justify-center border border-[#d97706]/30 min-w-[68px] sm:min-w-[76px]">
                      <span className="text-sm sm:text-base font-extrabold text-[#92400e] leading-none whitespace-nowrap">
                        ₹{maxBudget}
                      </span>
                      <span className="text-[10px] sm:text-xs font-bold text-[#b45309] mt-0.5 leading-none whitespace-nowrap">
                        {lang === 'hi' ? 'तक' : 'Max'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* आवश्यक सेवा */}
              <div className="bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl p-3 shadow-2xs">
                <p className="text-[11px] font-semibold text-[#64748b]">
                  {lang === 'hi' ? 'आवश्यक सेवा:' : 'Service required:'}
                </p>
                <p className="text-sm sm:text-base font-bold text-[#0f172a] mt-1 break-words whitespace-normal leading-snug">
                  "{requirement.short_requirement}"
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 px-1 text-xs">
                <div className="text-left">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {lang === 'hi' ? 'अधिकतम अनुभव: ' : 'Max Experience: '}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    {experienceText}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {lang === 'hi' ? 'दूरी: ' : 'Distance: '}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    {distanceText || '—'}
                  </span>
                </div>
              </div>

              {/* Structured Continuous Location (Points 3, 4, 5) */}
              {formattedLocationString && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#1e3a5f]">
                    <MapPin className="w-3.5 h-3.5 text-teal-700" />
                    <span>{lang === 'hi' ? 'लोकेशन' : 'Location'}</span>
                  </div>
                  <p className="text-xs sm:text-[13px] font-bold text-slate-800 break-words leading-relaxed pt-0.5">
                    {formattedLocationString}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Voice Recording (Points 10, 26 & 40: Only show if recording exists) */}
          {requirement.voice_url && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Mic className="w-3.5 h-3.5 text-teal-700" />
                <span>
                  {lang === 'hi' ? 'आवश्यकता का पूरा विवरण सुनें' : 'Listen to Full Requirement Details'}
                </span>
              </div>
              <AudioPlayer src={requirement.voice_url} title="वॉइस रिकॉर्डिंग" />
            </div>
          )}

          {/* Requirement Photos Gallery (Points 28 & 29: Only show if photos exist) */}
          {hasPhotos && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <ImageIcon className="w-3.5 h-3.5 text-teal-700" />
                <span>{lang === 'hi' ? 'संलग्न फोटो' : 'Attached Photos'}</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  ({requirement.photos!.length})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {requirement.photos!.map((photoUrl, idx) => (
                  <div
                    key={idx}
                    onClick={() => setZoomedPhotoUrl(photoUrl)}
                    className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 hover:opacity-95 active:scale-95 transition cursor-pointer relative group"
                  >
                    <img
                      src={photoUrl}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[11px] font-semibold">
                      बड़ा देखें
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Information / Written Detailed Description */}
          {hasAdditionalInfo && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Info className="w-3.5 h-3.5 text-[#1e3a5f]" />
                <span>
                  {lang === 'hi' ? 'आवश्यकता का पूरा विवरण पढ़ें' : 'Read Full Requirement Details'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words pt-1">
                {requirement.additional_info!.trim()}
              </p>
            </div>
          )}

          {/* Keywords Section - Point 8: MUST be the LAST information content section */}
          {hasKeywords && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Tag className="w-3.5 h-3.5 text-teal-700" />
                <span>{lang === 'hi' ? 'कीवर्ड' : 'Keywords'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {requirement.keywords!.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-900 border border-teal-200 text-xs font-semibold"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Admin Preference / Priority Points Control (Parts 5 & 20 - Admin Only) */}
          {isAdmin && (
            <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                  <Star className="w-4 h-4 text-amber-600 fill-amber-500" />
                  <span>प्राथमिकता (Admin Priority Points): {priorityPoints}</span>
                </div>
                <span className="text-[11px] text-amber-800 font-medium">डिफ़ॉल्ट: 50 (1-100)</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={priorityPoints}
                  onChange={(e) => setPriorityPoints(Number(e.target.value))}
                  className="flex-1 accent-amber-700 cursor-pointer h-2 bg-amber-200 rounded-lg"
                />
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={priorityPoints}
                  onChange={(e) => setPriorityPoints(Math.max(1, Math.min(100, Number(e.target.value))))}
                  className="w-14 px-2 py-1 text-xs border border-amber-300 rounded-lg text-center font-bold bg-white"
                />
                <button
                  type="button"
                  onClick={() => handleUpdatePriority(priorityPoints)}
                  disabled={isSavingPriority}
                  className="px-3 py-1 bg-amber-700 hover:bg-amber-800 active:scale-95 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingPriority ? 'सहेज रहे हैं...' : 'सहेजें'}
                </button>
              </div>
              {priorityNotice && (
                <p className="text-[11px] text-emerald-700 font-bold">{priorityNotice}</p>
              )}
            </div>
          )}

          {/* Action Buttons: Message & Call - Point 9: ABSOLUTE END after all information */}
          {!isOwnRequirement && (
            <div className="flex gap-2 sm:gap-3 pt-2">
              <div className="flex-1 bg-[#364f6b]/70 rounded-xl p-[2px] shadow-xs">
                <button
                  type="button"
                  onClick={handleMessage}
                  className="w-full bg-gradient-to-b from-[#2d4a70] to-[#1a2e48] rounded-[10px] py-2.5 px-3 flex items-center justify-center gap-2 shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.3)] hover:brightness-110 active:scale-[0.98] transition cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-[#f1f5f9] shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-[#f1f5f9]">
                    {lang === 'hi' ? 'मैसेज' : 'Message'}
                  </span>
                </button>
              </div>

              {Boolean(mobile) && (
                <div className="flex-1 bg-[#364f6b]/70 rounded-xl p-[2px] shadow-xs">
                  <button
                    type="button"
                    onClick={handleCall}
                    className="w-full bg-gradient-to-b from-[#2d4a70] to-[#1a2e48] rounded-[10px] py-2.5 px-3 flex items-center justify-center gap-2 shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.3)] hover:brightness-110 active:scale-[0.98] transition cursor-pointer"
                    title={lang === 'hi' ? 'कॉल करें' : 'Call'}
                  >
                    <Phone className="w-4 h-4 text-[#f1f5f9] shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-[#f1f5f9]">
                      {lang === 'hi' ? 'कॉल करें' : 'Call'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Report / Complaint Option */}
          {!isOwnRequirement && owner && (
            <div className="pt-2 border-t border-slate-200/80 flex justify-end">
              <button
                type="button"
                onClick={handleOpenReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg font-medium transition cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{lang === 'hi' ? 'शिकायत / रिपोर्ट करें' : 'Report Requirement'}</span>
              </button>
            </div>
          )}

          {/* =========================================================================
              COMMENTS SECTION (Absolute Bottom of Full Requirement Detail)
          ========================================================================== */}
          {requirement && (
            <div className="pt-3 border-t border-slate-200/80">
              <CommentsSection
                targetType="requirement"
                targetId={requirement.id}
                targetOwnerId={requirement.owner_id}
                highlightCommentId={highlightCommentId}
                onOpenAuthorProfile={(authorId, commentRef) => {
                  setCommenterModal({ userId: authorId, commentRef });
                }}
                onRequireAuth={onRequireAuth}
              />
            </div>
          )}
        </div>
      </div>

      {/* Profile Photo Viewer */}
      {showPhotoViewer && (
        isOwnRequirement && user ? (
          <ProfilePhotoViewerModal
            userId={user.id}
            userName={user.name}
            photoUrl={user.profile_photo || photo || null}
            onClose={() => setShowPhotoViewer(false)}
            onPhotoUpdated={async () => {
              await refreshUser(true);
            }}
          />
        ) : photo ? (
          <ImageViewerModal
            imageUrl={photo}
            title={name}
            onClose={() => setShowPhotoViewer(false)}
          />
        ) : null
      )}

      {/* Requirement Attached Photo Zoom Viewer */}
      {zoomedPhotoUrl && (
        <ImageViewerModal
          imageUrl={zoomedPhotoUrl}
          title={lang === 'hi' ? 'आवश्यकता फोटो' : 'Requirement Photo'}
          onClose={() => setZoomedPhotoUrl(null)}
        />
      )}

      {/* Report Modal */}
      {showReportModal && user && owner && (
        <ReportProviderModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          provider={owner}
          currentUser={user}
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
