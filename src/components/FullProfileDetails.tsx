import React, { useState } from 'react';
import {
  Briefcase,
  MapPin,
  ImageIcon,
  Volume2,
  User as UserIcon,
  Mic,
  Loader2,
  Trash2,
  Plus,
  Edit2,
  QrCode,
} from 'lucide-react';
import { WorkerProfile, UserProfile, UserLocation, getPriceUnitLabel } from '../types';
import { WorkerCard } from './WorkerCard';
import { AudioPlayer } from './AudioPlayer';
import { VoiceRecorder } from './VoiceRecorder';
import { ImageViewerModal } from './ImageViewerModal';
import { ReportProviderModal } from './ReportProviderModal';
import { WorkerQRCodeModal } from './WorkerQRCodeModal';
import { CommentsSection } from './CommentsSection';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../context/AuthContext';
import { LocationService } from '../services/locationService';
import { CommentReference } from '../types';

export interface FullProfileDetailsProps {
  user: UserProfile;
  worker?: WorkerProfile | null;
  location?: UserLocation | null;
  isOwnProfile?: boolean;
  onOpenChat?: (userId: string) => void;
  onRequireAuth?: () => void;
  onOpenCommenterProfile?: (authorId: string, commentRef: CommentReference) => void;
  highlightCommentId?: string | null;
  // Own profile actions:
  onStartEditing?: () => void;
  onConfirmDeleteWorker?: () => void;
  isConfirmingDeleteWorker?: boolean;
  setIsConfirmingDeleteWorker?: (val: boolean) => void;
  isSaving?: boolean;
  // Work photos for own profile:
  onWorkPhotoUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteWorkPhoto?: (photoId: string, storagePath: string) => void;
  isUploadingPhoto?: boolean;
  uploadingPreviewUrl?: string | null;
  deletingPhotoId?: string | null;
  workPhotoInputRef?: React.RefObject<HTMLInputElement | null>;
  // Voice recording for own profile:
  showVoiceRecorder?: boolean;
  onToggleVoiceRecorder?: () => void;
  onUploadWorkerVoice?: (audioBlob: Blob) => Promise<void>;
  isUploadingVoice?: boolean;
  // Photo zoom viewer callback:
  onOpenPhotoViewer?: (url?: string) => void;
}

export const FullProfileDetails: React.FC<FullProfileDetailsProps> = ({
  user,
  worker,
  location,
  isOwnProfile = false,
  onOpenChat,
  onRequireAuth,
  onOpenCommenterProfile,
  highlightCommentId,
  onStartEditing,
  onConfirmDeleteWorker,
  isConfirmingDeleteWorker = false,
  setIsConfirmingDeleteWorker,
  isSaving = false,
  onWorkPhotoUpload,
  onDeleteWorkPhoto,
  isUploadingPhoto = false,
  uploadingPreviewUrl = null,
  deletingPhotoId = null,
  workPhotoInputRef,
  showVoiceRecorder = false,
  onToggleVoiceRecorder,
  onUploadWorkerVoice,
  isUploadingVoice = false,
  onOpenPhotoViewer,
}) => {
  const { lang } = useTranslation();
  const { user: currentUser } = useAuth();
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [fullscreenTitle, setFullscreenTitle] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  const isWorker = Boolean(worker);
  const profileLocation = React.useMemo(() => {
    if (worker) {
      return LocationService.extractCanonicalLocation(worker, worker.profile?.address);
    }
    return LocationService.extractCanonicalLocation(
      location || user?.location || user,
      user.address
    );
  }, [location, worker, user]);

  // Authoritative structured location matching WorkerCard exactly: गाँव: ..., तहसील: ..., जिला: ..., राज्य: ...
  const locationText = LocationService.formatWorkerCard(profileLocation, '', lang);

  const effectiveWorker: WorkerProfile = worker || {
    user_id: user.id,
    experience_years: 0,
    price_per_day: 0,
    priority_points: 0,
    created_at: user.created_at || new Date().toISOString(),
    updated_at: user.updated_at || new Date().toISOString(),
    profile: user,
    location: profileLocation || undefined,
  };

  return (
    <div className="space-y-4">
      {/* 1. Main Profile Identity Card (WorkerCard component reuse) */}
      <div className="transition-transform duration-150">
        <WorkerCard
          worker={effectiveWorker}
          onOpenDetail={() => {}}
          onOpenChat={onOpenChat || (() => {})}
          onRequireAuth={onRequireAuth || (() => {})}
          isNormalUser={!isWorker}
          isOwnProfile={isOwnProfile}
          onOpenPhotoViewer={() => {
            if (onOpenPhotoViewer) {
              onOpenPhotoViewer(user.profile_photo || undefined);
            } else if (user.profile_photo) {
              setFullscreenPhoto(user.profile_photo);
              setFullscreenTitle(user.name);
            }
          }}
        />
      </div>

      {/* 2. REMAINING INFORMATION — APPROVED PREMIUM LIGHT CARD */}
      <div
        className="bg-[#f9fff9] border border-[#d4be98]/70 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm space-y-4 text-slate-800"
        style={{ backgroundColor: '#f9fff9' }}
      >
        {/* WORKER-ONLY: Status Indicator */}
        {isWorker && (
          <div className="flex items-center justify-between bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl px-3.5 py-2.5 shadow-2xs">
            <span style={{ fontSize: '14px' }} className="font-bold uppercase tracking-wider text-[#8a734d]">
              {lang === 'hi' ? 'सेवा स्थिति (Service Status)' : 'Service Status'}
            </span>
            {effectiveWorker.is_active !== false ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                <span>{lang === 'hi' ? 'सक्रिय (Active)' : 'Active'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                <span>{lang === 'hi' ? 'निष्क्रिय (Inactive)' : 'Inactive'}</span>
              </span>
            )}
          </div>
        )}

        {/* WORKER-ONLY: Section 1 — अनुभव (Experience) */}
        {isWorker && (
          <div className="bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl p-3.5 sm:p-4 space-y-1.5 shadow-2xs">
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8a734d] flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-[#8a734d] shrink-0" />
              <span style={{ fontSize: '14px' }}>{lang === 'hi' ? 'अनुभव' : 'Experience'}</span>
            </h4>
            <p
              className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words"
              style={{ marginLeft: '10px', marginRight: '10px', fontSize: '16px' }}
            >
              {worker?.experience_years ?? 0}{' '}
              {lang === 'hi' ? 'वर्ष का अनुभव' : 'Years of Experience'}
            </p>
          </div>
        )}

        {/* Section 2 — आपका स्थान / पता (Your Location / Address) */}
        <div className="bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl p-3.5 sm:p-4 space-y-1.5 shadow-2xs">
          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8a734d] flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#8a734d] shrink-0" />
            <span style={{ fontSize: '14px' }}>{lang === 'hi' ? 'आपका स्थान / पता' : 'Your Location / Address'}</span>
          </h4>
          <p
            className="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed whitespace-normal break-words"
            style={{ fontSize: '13.5px', marginLeft: '10px', marginRight: '10px', overflowWrap: 'break-word', wordBreak: 'break-word' }}
          >
            {locationText || (lang === 'hi' ? 'स्थान उपलब्ध नहीं' : 'Location unavailable')}
          </p>
        </div>

        {/* WORKER-ONLY: Section 3 — आपकी फीस (Your Fee) */}
        {isWorker && (
          <div className="bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl p-3.5 sm:p-4 space-y-1.5 shadow-2xs">
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8a734d] flex items-center gap-1.5">
              <span className="font-bold text-sm">₹</span>
              <span style={{ fontSize: '14px' }}>{isOwnProfile ? (lang === 'hi' ? 'आपकी फीस' : 'Your Fee') : (lang === 'hi' ? 'फीस' : 'Fee')}</span>
            </h4>
            <p
              className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words"
              style={{ marginLeft: '10px', marginRight: '10px' }}
            >
              ₹{effectiveWorker.price_per_day || 0} / {getPriceUnitLabel(effectiveWorker.price_unit, effectiveWorker.custom_price_unit, lang)}
            </p>
          </div>
        )}

        {/* WORKER-ONLY: Section 4 — आपकी सर्विस की तस्वीरें (Your Service Photos) */}
        {isWorker && (
          <div className="bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8a734d] flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[#8a734d] shrink-0" />
                <span style={{ fontSize: '14px' }}>
                  {isOwnProfile ? (lang === 'hi' ? 'आपकी सर्विस की तस्वीरें' : 'Your Service Photos') : (lang === 'hi' ? 'सर्विस की तस्वीरें' : 'Service Photos')} (
                  {worker?.work_photos?.length || 0}/10)
                </span>
              </h4>
              {isOwnProfile && (worker?.work_photos?.length || 0) < 10 && onWorkPhotoUpload && (
                <>
                  <input
                    type="file"
                    ref={workPhotoInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={onWorkPhotoUpload}
                  />
                  <button
                    type="button"
                    disabled={isUploadingPhoto}
                    onClick={() => workPhotoInputRef?.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingPhoto ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                        <span>अपलोड हो रहा है...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 text-teal-700" />
                        <span>तस्वीर जोड़ें</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

            {(worker?.work_photos && worker.work_photos.length > 0) || isUploadingPhoto ? (
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1"
                style={{ marginLeft: '10px', marginRight: '10px' }}
              >
                {worker?.work_photos?.map((p, idx) => {
                  const isDeletingThis = deletingPhotoId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        if (p.public_url && !isDeletingThis) {
                          setFullscreenPhoto(p.public_url);
                          setFullscreenTitle(`${user?.name || (lang === 'hi' ? 'सेवा प्रदाता' : 'Service Provider')} - सर्विस की तस्वीर ${idx + 1}`);
                        }
                      }}
                      className="relative aspect-square rounded-xl overflow-hidden border border-[#d4be98]/60 bg-slate-100 group cursor-pointer hover:shadow-md transition"
                      title="बड़ा देखें (Tap to Zoom)"
                    >
                      <img
                        src={p.public_url}
                        alt="Service"
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                        loading="lazy"
                      />
                      {isDeletingThis ? (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white text-[10px] gap-1 z-10">
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>हटा रहे हैं...</span>
                        </div>
                      ) : isOwnProfile && onDeleteWorkPhoto ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteWorkPhoto(p.id, p.storage_path);
                          }}
                          className="absolute top-1 right-1 p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-md transition cursor-pointer z-10"
                          title="तस्वीर हटाएं"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}

                {/* Immediate preview card during upload */}
                {isUploadingPhoto && (
                  <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-dashed border-teal-500 bg-teal-50 flex flex-col items-center justify-center p-1.5 text-center">
                    {uploadingPreviewUrl && (
                      <img
                        src={uploadingPreviewUrl}
                        alt="Preview"
                        className="absolute inset-0 w-full h-full object-cover opacity-50"
                      />
                    )}
                    <div className="relative z-10 bg-white/90 backdrop-blur-xs text-slate-800 px-2 py-1.5 rounded-lg flex flex-col items-center gap-1 shadow-sm border border-teal-200">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                      <span className="text-[10px] font-medium leading-tight">अपलोड जारी है...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="p-3.5 bg-white border border-dashed border-[#ebdcc4] rounded-xl text-center space-y-2"
                style={{ marginLeft: '10px', marginRight: '10px' }}
              >
                <p style={{ fontSize: '14px' }} className="text-xs sm:text-sm text-slate-500">
                  {isOwnProfile
                    ? (lang === 'hi' ? 'कोई तस्वीर नहीं जोड़ी गई है। अपनी सर्विस और अनुभव से जुड़ी तस्वीरें जोड़ें।' : 'No photos added. Add photos that showcase your services and experience.')
                    : (lang === 'hi' ? 'कोई तस्वीर उपलब्ध नहीं है।' : 'No photos available.')}
                </p>
                {isOwnProfile && onWorkPhotoUpload && (
                  <button
                    type="button"
                    onClick={() => workPhotoInputRef?.current?.click()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-700" />
                    <span>{lang === 'hi' ? 'तस्वीर जोड़ें (Add Photo)' : 'Add Photo'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* WORKER-ONLY: Section 5 — सेवा के बारे में बोलकर बताएं / सुनें */}
        {isWorker && (
          <div className="bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8a734d] flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#8a734d] shrink-0" />
                <span style={{ fontSize: '14px' }}>
                  {worker?.voice_recording?.public_url
                    ? (lang === 'hi' ? 'सेवा के बारे में सुनें' : 'Listen to the Service Description')
                    : (lang === 'hi' ? 'पूरा विवरण बोलकर बताया गया है।' : 'Complete voice introduction/details')}
                </span>
              </h4>
              {isOwnProfile && worker?.voice_recording && onToggleVoiceRecorder && (
                <button
                  type="button"
                  onClick={onToggleVoiceRecorder}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>{showVoiceRecorder ? (lang === 'hi' ? 'बंद करें' : 'Close') : (lang === 'hi' ? 'आवाज बदलें' : 'Change Voice')}</span>
                </button>
              )}
            </div>

            {worker?.voice_recording?.public_url ? (
              <div style={{ marginLeft: '10px', marginRight: '10px' }}>
                <AudioPlayer
                  src={worker.voice_recording.public_url}
                  title={isOwnProfile ? (lang === 'hi' ? 'सेवा के बारे में सुनें' : 'Listen to the Service Description') : (lang === 'hi' ? `${user.name} - सेवा के बारे में सुनें` : `${user.name} - Service Description`)}
                />
              </div>
            ) : (
              <div
                className="p-3 bg-white border border-dashed border-[#ebdcc4] rounded-xl text-center space-y-2"
                style={{ marginLeft: '10px', marginRight: '10px' }}
              >
                <p
                  className="text-xs sm:text-sm text-slate-500"
                  style={{ marginBottom: '13px', marginLeft: '0px', marginTop: '4px', fontSize: '14px' }}
                >
                  {isOwnProfile
                    ? (lang === 'hi'
                        ? 'अभी कोई रिकॉर्डिंग नहीं है। अपनी सेवा और अनुभव के बारे में बोलकर बताएं।'
                        : 'No recording yet. Tell people about your service and experience.')
                    : (lang === 'hi' ? 'कोई रिकॉर्डिंग उपलब्ध नहीं है।' : 'No recording available.')}
                </p>
                {isOwnProfile && onToggleVoiceRecorder && (
                  <button
                    type="button"
                    onClick={onToggleVoiceRecorder}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs active:scale-95 transition cursor-pointer"
                    style={{ marginTop: '0px', marginBottom: '6px' }}
                  >
                    <Mic className="w-4 h-4" />
                    <span>{showVoiceRecorder ? (lang === 'hi' ? 'रिकॉर्डर बंद करें' : 'Close Recorder') : (lang === 'hi' ? '🎙️ पूरा विवरण बोलकर बताया गया है।' : '🎙️ Record Your Service Description')}</span>
                  </button>
                )}
              </div>
            )}

            {isOwnProfile && showVoiceRecorder && onUploadWorkerVoice && (
              <div className="pt-2">
                <VoiceRecorder
                  onRecordingComplete={onUploadWorkerVoice}
                  title={lang === 'hi' ? 'पूरा विवरण बोलकर बताया गया है।' : 'Complete voice introduction/details'}
                  subtitle={lang === 'hi' ? 'अपनी सेवा और अनुभव के बारे में बोलकर बताएं, ताकि लोग आपकी सेवा को बेहतर समझ सकें।' : 'Tell people about your service and experience so they can understand your service better.'}
                  saveLabel={lang === 'hi' ? 'आवाज सहेजें' : 'Save Voice'}
                  isSaving={isUploadingVoice}
                />
              </div>
            )}
          </div>
        )}

        {/* Section 6 — मेरी सर्विस और अनुभव / परिचय */}
        <div className="bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl p-3.5 sm:p-4 space-y-2 shadow-2xs">
          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8a734d] flex items-center gap-1.5">
            <UserIcon className="w-4 h-4 text-[#8a734d] shrink-0" />
            <span style={{ fontSize: '14px' }}>
              {isWorker
                ? isOwnProfile
                  ? (lang === 'hi' ? 'मेरी सर्विस और अनुभव' : 'My Services & Experience')
                  : (lang === 'hi' ? 'सर्विस और अनुभव' : 'Services & Experience')
                : lang === 'hi'
                ? 'परिचय'
                : 'About'}
            </span>
          </h4>
          {worker?.about_text?.trim() ? (
            <p
              className="text-sm sm:text-base text-slate-800 leading-relaxed whitespace-pre-line font-normal bg-white p-3.5 rounded-xl border border-[#ebdcc4]"
              style={{ marginLeft: '10px', marginRight: '10px', fontSize: '16px' }}
            >
              {worker.about_text.trim()}
            </p>
          ) : (
            <p
              className="text-xs sm:text-sm text-slate-400 italic bg-white p-3 rounded-xl border border-dashed border-[#ebdcc4]"
              style={{ marginLeft: '10px', marginRight: '10px', fontSize: '16px' }}
            >
              {isOwnProfile
                ? lang === 'hi'
                  ? 'कोई परिचय विवरण दर्ज नहीं है। नीचे "प्रोफ़ाइल संपादित करें" बटन दबाकर अपनी सर्विसेस और एक्सपर्टीज़ के बारे में बताएं।'
                  : 'No about description provided yet. Click "Edit Profile" below to tell people about your services and expertise.'
                : lang === 'hi'
                ? 'कोई परिचय विवरण उपलब्ध नहीं है।'
                : 'No description available.'}
            </p>
          )}
        </div>

        {/* WORKER-ONLY: Section — डिजिटल QR कोड (Digital QR Code & Sharing) */}
        {isWorker && (
          <div
            style={{ display: 'none' }}
            className="hidden bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-2xs"
          >
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8a734d] flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-[#8a734d] shrink-0" />
              <span style={{ fontSize: '14px' }}>
                {isOwnProfile
                  ? (lang === 'hi' ? 'आपका प्रोफ़ाइल QR कोड' : 'Your Profile QR Code')
                  : (lang === 'hi' ? 'प्रोफ़ाइल QR कोड' : 'Profile QR Code')}
              </span>
            </h4>

            <div className="bg-white border border-[#ebdcc4] rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0 text-teal-800">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-slate-800">
                    {lang === 'hi' ? 'प्रोफाइल का QR कोड' : 'Camera-Scannable QR Code'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {lang === 'hi'
                      ? 'फ़ोन कैमरे से स्कैन करके यह प्रोफ़ाइल देख सकते है।'
                      : 'You can view this profile by scanning it with a phone camera.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowQRModal(true)}
                className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-teal-700 to-emerald-800 hover:from-teal-800 hover:to-emerald-900 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer flex items-center justify-center gap-2 shrink-0"
              >
                <QrCode className="w-4 h-4" />
                <span>{lang === 'hi' ? 'QR कोड देखें और शेयर करें' : 'View & Share QR'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Section 7 — Action Row */}
        {isOwnProfile ? (
          <div className="pt-2 border-t border-[#ebdcc4]/80">
            <div
              className="w-full"
              style={{ marginLeft: '10px', marginRight: '10px' }}
            >
              {onStartEditing && (
                <button
                  type="button"
                  onClick={onStartEditing}
                  className="w-full py-3.5 px-4 bg-teal-700 hover:bg-teal-800 active:scale-[0.99] text-white rounded-xl font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {lang === 'hi' ? 'प्रोफ़ाइल संपादित करें' : 'Edit Profile'}
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Visitor Actions: Deactivated notice and Report Provider (when applicable) */
          (effectiveWorker.is_active === false || (isWorker && currentUser)) ? (
            <div className="pt-2 border-t border-[#ebdcc4]/80 flex flex-col items-center gap-1.5">
              {/* Deactivated Provider Notice */}
              {effectiveWorker.is_active === false && (
                <div className="w-full text-center py-2 px-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl">
                  {lang === 'hi'
                    ? 'यह सेवा प्रदाता खाता एडमिन द्वारा निष्क्रिय (Deactivated) किया गया है।'
                    : 'This service provider account has been deactivated by Admin.'}
                </div>
              )}

              {/* Small plain-text complaint action (Service Provider profiles only, logged-in non-guest users only) */}
              {isWorker && currentUser && (
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="text-[11px] sm:text-xs text-slate-500 hover:text-rose-700 transition cursor-pointer pt-0.5 tracking-tight font-medium"
                  style={{
                    fontSize: '12px',
                    marginTop: '4px',
                  }}
                >
                  {lang === 'hi' ? 'शिकायत करें' : 'Report Provider'}
                </button>
              )}
            </div>
          ) : null
        )}

        {/* =========================================================================
            COMMENTS SECTION (Absolute Bottom of Complete Worker Profile)
        ========================================================================== */}
        <div className="pt-3 border-t border-[#ebdcc4]/80">
          <CommentsSection
            targetType="worker"
            targetId={user.id}
            targetOwnerId={user.id}
            highlightCommentId={highlightCommentId}
            onOpenAuthorProfile={(authorId, commentRef) => {
              if (onOpenCommenterProfile) {
                onOpenCommenterProfile(authorId, commentRef);
              }
            }}
            onRequireAuth={onRequireAuth || (() => {})}
          />
        </div>
      </div>

      {/* Fullscreen Photo Lightbox */}
      {fullscreenPhoto && (
        <ImageViewerModal
          imageUrl={fullscreenPhoto}
          title={fullscreenTitle || user.name}
          onClose={() => setFullscreenPhoto(null)}
        />
      )}

      {/* Voice-only Complaint Modal for Service Provider */}
      {showReportModal && currentUser && (
        <ReportProviderModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          provider={user}
          worker={worker}
          currentUser={currentUser}
        />
      )}

      {/* Shareable QR Code Modal */}
      {showQRModal && isWorker && (
        <WorkerQRCodeModal
          worker={effectiveWorker}
          user={user}
          onClose={() => setShowQRModal(false)}
        />
      )}
    </div>
  );
};
