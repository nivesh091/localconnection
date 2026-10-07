import React, { useState, useMemo, useEffect } from 'react';
import { Phone, MessageSquare, MapPin, Play, Pause, QrCode } from 'lucide-react';
import { WorkerProfile, getPriceUnitLabel } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { LocationService } from '../services/locationService';
import { DistanceService } from '../services/distanceService';
import { ImageViewerModal } from './ImageViewerModal';
import { ProfilePhotoViewerModal } from './ProfilePhotoViewerModal';
import { WorkerQRCodeModal } from './WorkerQRCodeModal';
import { useShortcutAudio } from '../hooks/useShortcutAudio';
import verificationLogo from '@/verificationlogo.png';

interface WorkerCardProps {
  worker: WorkerProfile;
  onOpenDetail: (worker: WorkerProfile) => void;
  onOpenChat: (targetUserId: string) => void;
  onRequireAuth: () => void;
  currentUserCoords?: { lat: number; lng: number } | any | null;
  isNormalUser?: boolean;
  isOwnProfile?: boolean;
  onOpenPhotoViewer?: () => void;
  hideActions?: boolean;
  showAudioShortcut?: boolean;
}

export const WorkerCard: React.FC<WorkerCardProps> = ({
  worker,
  onOpenDetail,
  onOpenChat,
  onRequireAuth,
  currentUserCoords,
  isNormalUser = false,
  isOwnProfile = false,
  onOpenPhotoViewer,
  hideActions = false,
  showAudioShortcut = false,
}) => {
  const { user, location: userLocation, refreshUser, isAdmin } = useAuth();
  const { t, lang } = useTranslation();
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [callNotice, setCallNotice] = useState<string | null>(null);

  // Audio Shortcut Integration (Home Screen Worker Cards)
  const audioUrl = worker.voice_recording?.public_url || null;
  const hasAudio = Boolean(showAudioShortcut && audioUrl);
  const { isPlaying, toggleAudio } = useShortcutAudio(worker.user_id);

  // 1. Worker Name from real profile data
  const profile = worker.profile;
  const name = profile?.name?.trim() || (lang === 'hi' ? 'सेवा प्रदाता' : 'Service Provider');
  const photo = profile?.profile_photo;
  const firstLetter = name.charAt(0).toUpperCase();

  // Feature 3: Public Mobile Number ON/OFF resolution
  const isMobilePublic =
    worker.is_mobile_public !== undefined
      ? Boolean(worker.is_mobile_public)
      : profile?.is_mobile_public !== undefined
      ? Boolean(profile.is_mobile_public)
      : true;

  // In public-facing worker cards (Home, Search, Map, lists), if mobile is set to private,
  // it must remain hidden for all users (including profile owner). Only admin can view/call.
  const canViewMobile = isMobilePublic || isAdmin;
  const mobile = canViewMobile ? (profile?.mobile?.trim() || '') : '';

  // 2. True dynamic auto-fit font sizing calculation based on worker name length:
  // Short name -> noticeably larger, medium -> medium, long -> smaller, very long -> smaller + natural wrap
  const nameLength = name.length;
  const nameStyle = useMemo(() => {
    if (nameLength <= 6) {
      return { fontSize: 'clamp(1.25rem, 5vw, 1.55rem)', lineHeight: 1.15 };
    } else if (nameLength <= 10) {
      return { fontSize: 'clamp(1.1rem, 4.2vw, 1.35rem)', lineHeight: 1.18 };
    } else if (nameLength <= 15) {
      return { fontSize: 'clamp(0.98rem, 3.6vw, 1.18rem)', lineHeight: 1.22 };
    } else if (nameLength <= 22) {
      return { fontSize: 'clamp(0.875rem, 3vw, 1.05rem)', lineHeight: 1.25 };
    } else {
      return { fontSize: 'clamp(0.78rem, 2.5vw, 0.92rem)', lineHeight: 1.3 };
    }
  }, [nameLength]);

  // 3. Category from real worker data (strictly separate from experience)
  const categoryName =
    lang === 'hi'
      ? worker.category?.name_hi || worker.other_category || 'सेवा प्रदाता'
      : worker.category?.name_en || worker.other_category || 'Service Provider';

  // 4. Daily wage from real database field
  const dailyWage = worker.price_per_day !== undefined && worker.price_per_day !== null ? worker.price_per_day : 0;
  const priceUnitText = getPriceUnitLabel(worker.price_unit, worker.custom_price_unit, lang);

  // 5. Experience from real worker data
  const experienceYears = worker.experience_years || 0;
  const experienceText =
    experienceYears > 0
      ? lang === 'hi'
        ? `( ${experienceYears} वर्ष )`
        : `( ${experienceYears} ${experienceYears === 1 ? 'Year' : 'Years'} )`
      : lang === 'hi'
      ? '( नया )'
      : '( New )';

  // 5. Worker Location resolution (Village, Tehsil, District, State)
  const workerLocation = useMemo(() => {
    return LocationService.extractCanonicalLocation(worker, worker.profile?.address);
  }, [worker]);

  const locationText = LocationService.formatWorkerCard(workerLocation, '', lang);

  // Background coordinate resolution for workers with missing DB coordinates
  const [asyncWorkerCoords, setAsyncWorkerCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!workerLocation) return;
    const hasExact = DistanceService.extractCoordinates(workerLocation);
    if (!hasExact && (workerLocation.place || workerLocation.landmark || workerLocation.district)) {
      let isMounted = true;
      LocationService.resolveLocationCoordinates({
        village: workerLocation.place,
        subdistrict: (workerLocation as any).subdistrict || workerLocation.landmark,
        district: workerLocation.district,
        state: workerLocation.state,
      })
        .then((coords) => {
          if (isMounted && coords) {
            setAsyncWorkerCoords({ lat: coords.latitude, lng: coords.longitude });
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [workerLocation]);

  // Background coordinate detection for viewer if missing
  const [asyncViewerCoords, setAsyncViewerCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!currentUserCoords && !userLocation && !LocationService.getLastKnownPosition() && !asyncViewerCoords) {
      let isMounted = true;
      LocationService.getCurrentPosition()
        .then((pos) => {
          if (isMounted && pos) {
            setAsyncViewerCoords({ lat: pos.latitude, lng: pos.longitude });
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [currentUserCoords, userLocation, asyncViewerCoords]);

  // 6. User Coordinates & Safe Distance Calculation via existing DistanceService
  const userCoordinates = useMemo(() => {
    if (currentUserCoords) {
      const c = DistanceService.extractCoordinates(currentUserCoords);
      if (c) return c;
    }
    if (userLocation) {
      const c = DistanceService.extractCoordinates(userLocation);
      if (c) return c;
    }
    if (asyncViewerCoords) {
      return asyncViewerCoords;
    }
    const lastPos = LocationService.getLastKnownPosition();
    if (lastPos) {
      return { lat: Number(lastPos.latitude), lng: Number(lastPos.longitude) };
    }
    return null;
  }, [currentUserCoords, userLocation, asyncViewerCoords]);

  // 7. Target Worker Coordinates (Exact database coordinates strictly prioritized)
  const targetWorkerCoord = useMemo(() => {
    if (workerLocation) {
      const c = DistanceService.extractCoordinates(workerLocation);
      if (c) return c;
    }
    if (asyncWorkerCoords) {
      return asyncWorkerCoords;
    }
    if (worker) {
      const c = DistanceService.extractCoordinates(worker as any);
      if (c) return c;
    }
    return null;
  }, [workerLocation, asyncWorkerCoords, worker]);

  const distanceText = useMemo(() => {
    if (!userCoordinates || !targetWorkerCoord) {
      return null;
    }
    return DistanceService.getFormattedDistanceBetween(userCoordinates, targetWorkerCoord);
  }, [userCoordinates, targetWorkerCoord]);

  const handleMessageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      onRequireAuth();
      return;
    }
    onOpenChat(worker.user_id);
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mobile) {
      window.location.href = `tel:${mobile}`;
    } else {
      setCallNotice(
        lang === 'hi'
          ? 'नंबर उपलब्ध नहीं है'
          : 'Number not available'
      );
      setTimeout(() => setCallNotice(null), 3500);
    }
  };

  return (
    <>
      {/* Outer Card with Gold Rim and 3D Skeuomorphic Bevel */}
      <div
        onClick={() => onOpenDetail(worker)}
        className="w-full bg-[#bca071] rounded-[28px] sm:rounded-[32px] p-[4px] sm:p-[5px] shadow-[0_12px_28px_rgba(0,0,0,0.2),inset_0_3px_5px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.25)] hover:shadow-[0_16px_34px_rgba(0,0,0,0.28)] transition-all duration-200 cursor-pointer select-none relative"
      >
        {/* Notice toast if number is private / unavailable */}
        {callNotice && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 text-white text-[11px] font-bold py-1 px-3 rounded-full shadow-lg border border-slate-700 animate-in fade-in duration-150">
            {callNotice}
          </div>
        )}

        {/* Inner Card Container */}
        <div className={`bg-[#f4f6f5] rounded-[24px] sm:rounded-[27px] pt-2 sm:pt-2.5 pb-3 sm:pb-3.5 px-3.5 sm:px-5 shadow-[inset_0_0_12px_rgba(0,0,0,0.04)] flex flex-col justify-between gap-1.5 sm:gap-2 ${
          hideActions ? 'min-h-0' : 'min-h-[195px]'
        }`}>
          {/* Header Row: Profile Photo, Center Details (Name & Category), Right Price Tag */}
          <div className="relative flex items-center justify-between gap-2.5 sm:gap-3 min-h-[64px] sm:min-h-[70px]">
            {/* Left: Circular Profile Photo with Gold Bevel Rim */}
            <div className="shrink-0 z-10">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOwnProfile && onOpenPhotoViewer) {
                    onOpenPhotoViewer();
                  } else if (photo || isOwnProfile) {
                    setShowPhotoViewer(true);
                  }
                }}
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#bca071] p-[3px] shadow-[0_6px_12px_rgba(0,0,0,0.18),inset_0_2px_4px_rgba(255,255,255,0.7)] ${
                  photo || isOwnProfile ? 'cursor-pointer hover:opacity-95 active:scale-95 transition' : ''
                }`}
                title={isOwnProfile ? (lang === 'hi' ? 'फ़ोटो देखें / संपादित करें' : 'View / Edit Photo') : photo ? (lang === 'hi' ? 'फ़ोटो देखें' : 'View Photo') : undefined}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-slate-600 flex items-center justify-center text-white font-bold text-xl sm:text-2xl shadow-[inset_0_3px_6px_rgba(0,0,0,0.4)]">
                  {photo ? (
                    <img
                      src={photo}
                      alt={name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span>{firstLetter}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Center: Real Worker Name with True Dynamic Auto-fit Font Size & Verification Logo + Real Category
                Horizontally centered relative to the ENTIRE CARD with padding to clear left photo and right wage tag */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-[72px] sm:px-[88px] pointer-events-none">
              <div className="max-w-full text-center pointer-events-auto">
                <h2
                  style={nameStyle}
                  className="font-bold text-[#222b31] tracking-tight break-words inline leading-tight"
                >
                  <span>{name}</span>
                  {/* Provided Verification Logo Image */}
                  {!isNormalUser && (
                    <img
                      src={verificationLogo}
                      alt="Verified"
                      className="inline-block shrink-0 object-contain select-none"
                      style={{
                        width: '0.88em',
                        height: '0.88em',
                        minWidth: '15px',
                        minHeight: '15px',
                        maxWidth: '24px',
                        maxHeight: '24px',
                        verticalAlign: '-0.08em',
                        marginLeft: '2px',
                      }}
                    />
                  )}
                  {/* Feature 1: Deactivated Account by Admin label near name */}
                  {worker.is_active === false && (
                    <span className="block mt-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-2 py-0.5 rounded-full">
                      Deactivated Account by Admin
                    </span>
                  )}
                </h2>
              </div>

              {/* Real Worker Category centered directly below name */}
              {!isNormalUser && (
                <div className="mt-1 sm:mt-1.5 flex justify-center max-w-full pointer-events-auto">
                  <span
                    className="inline-flex items-center justify-center border border-[#bca071] bg-[#f2c7d6] text-[#2d3748] rounded-full px-[15px] pt-[3px] pb-[6px] ml-0 mt-0 text-[18px] font-semibold tracking-tight leading-none text-center max-w-full break-words shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    style={{ marginLeft: '0px' }}
                  >
                    {categoryName}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Price Tag with 3D Bevel (Feature 2: Flexible Pricing Display) */}
            {!isNormalUser ? (
              <div className="shrink-0 z-10">
                <div className="bg-[#f4f6f5] rounded-xl p-[2px] shadow-[2px_3px_8px_rgba(0,0,0,0.12),-2px_-2px_6px_rgba(255,255,255,0.85)]">
                  <div className="bg-[#fae4b2] rounded-[10px] px-2.5 py-1.5 sm:px-3 sm:py-2 flex flex-col items-center justify-center shadow-[inset_0_1px_3px_rgba(255,255,255,1)] border border-[#bca071]/30 min-w-[62px] sm:min-w-[72px]">
                    <span className="text-sm sm:text-base font-bold text-[#8a734d] leading-none whitespace-nowrap">
                      ₹{dailyWage}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-semibold text-[#8a734d] mt-1 leading-tight text-center break-words max-w-[90px]">
                      / {priceUnitText}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-16 sm:w-20 shrink-0 pointer-events-none opacity-0" aria-hidden="true" />
            )}
          </div>

          {/* Stats Grid: Experience (Left) & Distance (Right) */}
          {!isNormalUser && (
            <div className="grid grid-cols-2 px-1 sm:px-2 pt-0.5">
              <div className="text-left">
                <p
                  className="text-xs sm:text-sm font-semibold text-[#222b31] leading-tight"
                  style={{ fontSize: '14px', marginLeft: '5px' }}
                >
                  {lang === 'hi' ? 'अनुभव' : 'Experience'}
                </p>
                <p
                  className="text-xs sm:text-sm font-bold text-[#222b31] mt-0.5 leading-tight break-words"
                  style={{ fontSize: '14px', marginLeft: '5px' }}
                >
                  {experienceText}
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-xs sm:text-sm font-semibold text-[#222b31] leading-tight"
                  style={{ fontSize: '14px', marginLeft: '0px', marginRight: '5px' }}
                >
                  {lang === 'hi' ? 'दूरी' : 'Distance'}
                </p>
                <p
                  className="text-xs sm:text-sm font-bold text-[#222b31] mt-0.5 leading-tight"
                  style={{ fontSize: '14px', marginLeft: '0px', marginRight: '5px' }}
                >
                  {distanceText || '—'}
                </p>
              </div>
            </div>
          )}

          {/* Location Bar with Gold Rim Bevel */}
          <div className="bg-[#bca071] rounded-xl p-[2px] shadow-[0_3px_6px_rgba(0,0,0,0.08)]">
            <div
              className="bg-[#f4f6f5] rounded-[10px] py-1.5 sm:py-2 px-2.5 sm:px-3 flex items-center justify-between gap-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.04)]"
              style={{ fontSize: '21px' }}
            >
              <div className={`flex items-start gap-2 min-w-0 ${hasAudio || !isNormalUser ? 'flex-[8] basis-[80%]' : 'flex-1'}`}>
                <MapPin
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6e5c47] shrink-0 mt-[3px]"
                  style={{ paddingLeft: '0px', marginLeft: '0px' }}
                />
                <span
                  className="text-[11px] sm:text-xs font-medium text-[#222b31] min-w-0 flex-1 whitespace-normal break-words leading-snug"
                  style={{ fontSize: '13px', paddingLeft: '0px', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                >
                  {locationText || (lang === 'hi' ? 'स्थान उपलब्ध नहीं' : 'Location unavailable')}
                </span>
              </div>

              {(hasAudio || !isNormalUser) && (
                <div className="shrink-0 flex items-center justify-end gap-1.5 flex-[2] basis-[20%]">
                  {hasAudio && (
                    <button
                      type="button"
                      onClick={(e) => toggleAudio(audioUrl, e)}
                      aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                      title={isPlaying ? (lang === 'hi' ? 'रोकें (Pause)' : 'Pause') : (lang === 'hi' ? 'सुनें (Play)' : 'Play')}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-b from-[#fef3c7] to-[#fde68a] border border-[#d97706]/40 text-[#92400e] hover:brightness-105 active:scale-95 flex items-center justify-center shadow-xs transition cursor-pointer select-none"
                    >
                      {isPlaying ? (
                        <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-[#92400e]" />
                      ) : (
                        <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-[#92400e] ml-0.5" />
                      )}
                    </button>
                  )}

                  {!isNormalUser && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowQRModal(true);
                      }}
                      aria-label={lang === 'hi' ? 'QR कोड देखें' : 'View QR Code'}
                      title={lang === 'hi' ? 'QR कोड देखें और स्कैन करें' : 'View & scan QR code'}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-b from-[#e6f4ea] to-[#ceead6] border border-[#137333]/40 text-[#137333] hover:brightness-105 active:scale-95 flex items-center justify-center shadow-xs transition cursor-pointer select-none"
                    >
                      <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#137333]" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: 3D Forest Green Skeuomorphic Buttons with Gold Outer Rim */}
          {!hideActions && !isNormalUser && (
            isOwnProfile ? (
              /* Own Profile Action: Show Prominent QR Badge Button */
              <div className="flex gap-2 sm:gap-3 pt-0.5">
                <div className="flex-1 bg-[#bca071] rounded-xl p-[2px] shadow-[0_5px_10px_rgba(0,0,0,0.18),inset_0_2px_4px_rgba(255,255,255,0.4)]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQRModal(true);
                    }}
                    className="w-full bg-gradient-to-b from-[#527c54] to-[#2b4f30] rounded-[10px] py-2 sm:py-2.5 px-3 flex items-center justify-center gap-2 shadow-[inset_0_2px_4px_rgba(255,255,255,0.22),inset_0_-2px_4px_rgba(0,0,0,0.3)] hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-[#e2cfa7] shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-[#e2cfa7]">
                      {lang === 'hi' ? 'मेरा QR कोड देखें और शेयर करें' : 'View & Share My QR Code'}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              /* Visitor Actions: Message, Call (if mobile available), and QR Share Button */
              <div className="flex gap-2 sm:gap-3 pt-0.5">
                {/* Message Button */}
                <div className="flex-1 bg-[#bca071] rounded-xl p-[2px] shadow-[0_5px_10px_rgba(0,0,0,0.18),inset_0_2px_4px_rgba(255,255,255,0.4)]">
                  <button
                    type="button"
                    onClick={handleMessageClick}
                    className="w-full bg-gradient-to-b from-[#527c54] to-[#2b4f30] rounded-[10px] py-2 sm:py-2.5 px-3 flex items-center justify-center gap-1.5 sm:gap-2 shadow-[inset_0_2px_4px_rgba(255,255,255,0.22),inset_0_-2px_4px_rgba(0,0,0,0.3)] hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#e2cfa7] shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-[#e2cfa7]">
                      {lang === 'hi' ? 'मैसेज' : 'Message'}
                    </span>
                  </button>
                </div>

                {/* Call Button (Feature 3: Public Mobile Number ON/OFF — Disappears when OFF) */}
                {Boolean(mobile) && (
                  <div className="flex-1 bg-[#bca071] rounded-xl p-[2px] shadow-[0_5px_10px_rgba(0,0,0,0.18),inset_0_2px_4px_rgba(255,255,255,0.4)]">
                    <button
                      type="button"
                      onClick={handleCallClick}
                      className="w-full bg-gradient-to-b from-[#527c54] to-[#2b4f30] rounded-[10px] py-2 sm:py-2.5 px-3 flex items-center justify-center gap-1.5 sm:gap-2 shadow-[inset_0_2px_4px_rgba(255,255,255,0.22),inset_0_-2px_4px_rgba(0,0,0,0.3)] hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
                      title={lang === 'hi' ? 'कॉल करें' : 'Call'}
                    >
                      <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-[#e2cfa7]" />
                      <span className="text-xs sm:text-sm font-semibold text-[#e2cfa7]">
                        {lang === 'hi' ? 'कॉल करें' : 'Call'}
                      </span>
                    </button>
                  </div>
                )}

                {/* QR Code Button */}
                <div className="bg-[#bca071] rounded-xl p-[2px] shadow-[0_5px_10px_rgba(0,0,0,0.18),inset_0_2px_4px_rgba(255,255,255,0.4)] shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQRModal(true);
                    }}
                    className="h-full bg-gradient-to-b from-[#527c54] to-[#2b4f30] rounded-[10px] py-2 sm:py-2.5 px-3 flex items-center justify-center gap-1.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.22),inset_0_-2px_4px_rgba(0,0,0,0.3)] hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
                    title={lang === 'hi' ? 'QR कोड देखें और स्कैन करें' : 'View & scan QR code'}
                  >
                    <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#e2cfa7] shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-[#e2cfa7]">
                      {lang === 'hi' ? 'QR' : 'QR'}
                    </span>
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Fullscreen Photo Viewer Modal */}
      {showPhotoViewer && (
        isOwnProfile && user ? (
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

      {/* Worker QR Code Modal */}
      {showQRModal && !isNormalUser && (
        <WorkerQRCodeModal
          worker={worker}
          user={profile}
          onClose={() => setShowQRModal(false)}
        />
      )}
    </>
  );
};

