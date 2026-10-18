import React, { useState, useMemo, useEffect } from 'react';
import { Phone, MessageSquare, MapPin, Play, Pause, QrCode, Clock, RotateCcw } from 'lucide-react';
import { WorkerProfile, getPriceUnitLabel } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { LocationService } from '../services/locationService';
import { DistanceService } from '../services/distanceService';
import { RoadRoutingService, RoadDistanceResult } from '../services/roadRoutingService';
import { ImageViewerModal } from './ImageViewerModal';
import { ProfilePhotoViewerModal } from './ProfilePhotoViewerModal';
import { WorkerQRCodeModal } from './WorkerQRCodeModal';
import { useShortcutAudio } from '../hooks/useShortcutAudio';
import { ADMIN_USER_ID } from '../services/chatService';
import { useCalling } from '../context/CallingContext';
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
  const { isPlaying, isLoading, hasError, toggleAudio, preloadAudio } = useShortcutAudio(worker.user_id);
  const { startCall } = useCalling();

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

  // Internet Calling ON/OFF resolution (Requirement 4)
  const isInternetCallEnabled =
    worker.is_internet_call_enabled !== undefined
      ? Boolean(worker.is_internet_call_enabled)
      : profile?.is_internet_call_enabled !== undefined
      ? Boolean(profile.is_internet_call_enabled)
      : true;

  // In public-facing worker cards (Home, Search, Map, lists), if mobile is set to private,
  // it must remain hidden for all users (including profile owner). Only admin can view/call.
  const canViewMobile = isMobilePublic || isAdmin;
  const mobile = canViewMobile ? (profile?.mobile?.trim() || '') : '';

  // Matrix:
  // Mobile OFF + Internet OFF -> show no call button
  // Mobile ON + Internet OFF -> mobile tel: call
  // Mobile OFF + Internet ON -> Internet Calling only; do not expose mobile
  // Both ON -> prioritize Internet Calling; do not expose mobile
  const showCallButton = Boolean(isMobilePublic && mobile) || isInternetCallEnabled;
  const isInternetCallAction = isInternetCallEnabled;

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

  // 8. Road Distance Calculation (Real road routing path, strictly separate from straight-line displacement)
  const [roadDistanceResult, setRoadDistanceResult] = useState<RoadDistanceResult | null>(() => {
    if (userCoordinates && targetWorkerCoord) {
      return RoadRoutingService.getCachedRoadDistance(userCoordinates, targetWorkerCoord, lang);
    }
    return null;
  });
  const [isCalculatingRoad, setIsCalculatingRoad] = useState<boolean>(false);

  useEffect(() => {
    if (!userCoordinates || !targetWorkerCoord) {
      setRoadDistanceResult(null);
      return;
    }

    const cached = RoadRoutingService.getCachedRoadDistance(userCoordinates, targetWorkerCoord, lang);
    if (cached) {
      setRoadDistanceResult(cached);
      return;
    }

    let isMounted = true;
    setIsCalculatingRoad(true);

    RoadRoutingService.calculateRoadDistance(userCoordinates, targetWorkerCoord, lang)
      .then((res) => {
        if (isMounted) {
          setRoadDistanceResult(res);
          setIsCalculatingRoad(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsCalculatingRoad(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userCoordinates?.lat, userCoordinates?.lng, targetWorkerCoord?.lat, targetWorkerCoord?.lng, lang]);

  // Formatted dynamic distance value according to selected language (e.g., "17.4 कि.मी." or "17.4 KM")
  const displayDistance = useMemo(() => {
    if (
      !roadDistanceResult?.success ||
      roadDistanceResult.distanceKm === null ||
      roadDistanceResult.distanceKm === undefined ||
      isNaN(roadDistanceResult.distanceKm)
    ) {
      return null;
    }
    return RoadRoutingService.formatCardDistance(roadDistanceResult.distanceKm, lang);
  }, [roadDistanceResult, lang]);

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
    if (!user) {
      onRequireAuth();
      return;
    }

    // Prioritize Internet Calling if enabled
    if (isInternetCallAction && profile) {
      startCall(profile);
      return;
    }

    // Otherwise use tel: if mobile is public & available
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
        className="w-full bg-[#bca071] rounded-[28px] sm:rounded-[32px] p-[4px] sm:p-[5px] shadow-[0_12px_28px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.4)] transition-all duration-200 cursor-pointer text-left relative overflow-hidden active:scale-[0.995]"
      >
        {/* Notice toast if number is private / unavailable */}
        {callNotice && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 text-white text-[11px] font-bold py-1 px-3 rounded-full shadow-lg border border-slate-700 animate-in fade-in duration-150">
            {callNotice}
          </div>
        )}

        {/* Inner Card Container */}
        <div className={`bg-[#fcfaf7] rounded-[24px] sm:rounded-[27px] pt-3 pb-3.5 px-3.5 sm:px-4 flex flex-col justify-between gap-2 relative overflow-hidden ${
          hideActions ? 'min-h-0' : 'min-h-[195px]'
        }`}>
          {/* Header Row: Profile Photo, Center Details (Name & Category), Right Price Tag */}
          <div className="relative flex items-center justify-between gap-2.5 sm:gap-3 min-h-[58px] sm:min-h-[64px]">
            {/* Left: Circular Profile Photo with Gold Rim */}
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
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#bca071] p-[2px] shadow-xs ${
                  photo || isOwnProfile ? 'cursor-pointer hover:opacity-95 active:scale-95 transition' : ''
                }`}
                title={isOwnProfile ? (lang === 'hi' ? 'फ़ोटो देखें / संपादित करें' : 'View / Edit Photo') : photo ? (lang === 'hi' ? 'फ़ोटो देखें' : 'View Photo') : undefined}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-[#8a734d] font-bold text-lg sm:text-xl shadow-inner">
                  {photo ? (
                    <img
                      src={photo}
                      alt={name}
                      className={`w-full h-full ${
                        worker.user_id === ADMIN_USER_ID || profile?.id === ADMIN_USER_ID
                          ? 'object-contain p-0.5'
                          : 'object-cover'
                      }`}
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
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-[68px] sm:px-[80px] pointer-events-none">
              <div className="max-w-full text-center pointer-events-auto">
                <h2
                  style={nameStyle}
                  className="font-bold text-slate-900 tracking-tight inline-flex items-center justify-center max-w-full leading-tight"
                >
                  <span
                    className="truncate"
                    style={{
                      fontSize: '19.88px',
                      paddingLeft: '0px',
                      marginLeft: '0px',
                      paddingTop: '0px',
                      marginTop: '0px',
                    }}
                  >
                    {name}
                  </span>
                  {/* Provided Verification Logo Image */}
                  {!isNormalUser && (
                    <img
                      src={verificationLogo}
                      alt="Verified"
                      className="shrink-0 object-contain select-none"
                      style={{
                        width: '15.9884px',
                        height: '15.9884px',
                        minWidth: '15px',
                        minHeight: '15px',
                        maxWidth: '24px',
                        maxHeight: '24px',
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
                <div className="mt-1 flex justify-center max-w-full pointer-events-auto">
                  <span
                    style={{
                      backgroundColor: '#dee9ec',
                      borderColor: '#080005',
                      color: '#000000',
                      paddingLeft: '12px',
                      paddingTop: '2px',
                      paddingBottom: '3px',
                      marginTop: '-4px',
                      marginBottom: '-12px',
                      marginLeft: '0px',
                      fontSize: '14px',
                    }}
                    className="inline-flex items-center justify-center border rounded-full px-3 text-xs font-semibold tracking-tight leading-none text-center max-w-full break-words shadow-2xs"
                  >
                    {categoryName}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Price Tag (Feature 2: Flexible Pricing Display) */}
            {!isNormalUser ? (
              <div className="shrink-0 z-10">
                <div className="bg-[#e2e8f0] rounded-xl p-[2px] shadow-[1px_2px_4px_rgba(0,0,0,0.06)]">
                  <div className="bg-gradient-to-b from-[#fef3c7] to-[#fde68a] rounded-[10px] px-2.5 py-1 sm:px-3 sm:py-1.5 flex flex-col items-center justify-center border border-[#d97706]/30 min-w-[62px] sm:min-w-[70px]">
                    <span className="text-sm sm:text-base font-extrabold text-[#92400e] leading-none whitespace-nowrap">
                      ₹{dailyWage}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-bold text-[#b45309] mt-0.5 leading-tight text-center break-words max-w-[90px]">
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
                  className="text-xs font-medium text-slate-500 leading-tight"
                  style={{ fontSize: '13px', marginLeft: '2px' }}
                >
                  {lang === 'hi' ? 'अनुभव' : 'Experience'}
                </p>
                <p
                  className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 leading-tight break-words"
                  style={{ fontSize: '13.5px', marginLeft: '2px' }}
                >
                  {experienceText}
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-xs font-medium text-slate-500 leading-tight"
                  style={{ fontSize: '13px', marginLeft: '0px', marginRight: '2px' }}
                >
                  {lang === 'hi' ? 'दूरी' : 'Distance'}
                </p>
                <div
                  className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 leading-tight"
                  style={{ fontSize: '13px', marginLeft: '0px', marginRight: '2px' }}
                >
                  {displayDistance ? (
                    <span>{displayDistance}</span>
                  ) : isCalculatingRoad ? (
                    <span className="text-slate-500 font-medium text-xs">
                      {lang === 'hi' ? 'दूरी लोड हो रही है...' : 'Calculating distance...'}
                    </span>
                  ) : userCoordinates && targetWorkerCoord ? (
                    <span className="text-slate-500 font-medium text-[11px] sm:text-xs">
                      {lang === 'hi' ? 'दूरी उपलब्ध नहीं है' : 'Distance unavailable'}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium text-xs">
                      {lang === 'hi' ? 'दूरी उपलब्ध नहीं है' : 'Distance unavailable'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Location Bar with Gold Rim */}
          <div className="bg-[#d4be98]/70 rounded-xl p-[1.5px] shadow-2xs">
            <div className="bg-[#fcfaf7] border border-[#ebdcc4]/80 rounded-[10px] py-1.5 sm:py-2 px-2.5 sm:px-3 flex items-center justify-between gap-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
              <div className={`flex items-start gap-2 min-w-0 ${hasAudio || !isNormalUser ? 'flex-[8] basis-[80%]' : 'flex-1'}`}>
                <MapPin
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8a734d] shrink-0 mt-[2px]"
                  style={{ paddingLeft: '0px', marginLeft: '0px' }}
                />
                <span
                  className="text-[11px] sm:text-xs font-medium text-slate-800 min-w-0 flex-1 whitespace-normal break-words leading-snug"
                  style={{ fontSize: '13px', paddingLeft: '0px', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                >
                  {locationText || (lang === 'hi' ? 'स्थान उपलब्ध नहीं' : 'Location unavailable')}
                </span>
              </div>

              {(hasAudio || !isNormalUser) && (
                <div className="shrink-0 flex items-center justify-end gap-1.5 flex-[2] basis-[20%]">
                  {!isNormalUser && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowQRModal(true);
                      }}
                      aria-label={lang === 'hi' ? 'QR कोड देखें' : 'View QR Code'}
                      title={lang === 'hi' ? 'QR कोड देखें और स्कैन करें' : 'View & scan QR code'}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 active:scale-95 flex items-center justify-center shadow-2xs transition cursor-pointer select-none"
                    >
                      <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700" />
                    </button>
                  )}

                  {hasAudio && (
                    <button
                      type="button"
                      onClick={(e) => toggleAudio(audioUrl, e)}
                      onMouseEnter={() => preloadAudio(audioUrl)}
                      onTouchStart={() => preloadAudio(audioUrl)}
                      disabled={isLoading}
                      aria-label={
                        isLoading
                          ? (lang === 'hi' ? 'ऑडियो लोड हो रहा है...' : 'Loading audio...')
                          : isPlaying
                          ? 'Pause audio'
                          : 'Play audio'
                      }
                      title={
                        hasError
                          ? (lang === 'hi' ? 'पुनः प्रयास करें' : 'Retry')
                          : isLoading
                          ? (lang === 'hi' ? 'लोड हो रहा है...' : 'Loading...')
                          : isPlaying
                          ? (lang === 'hi' ? 'रोकें (Pause)' : 'Pause')
                          : (lang === 'hi' ? 'सुनें (Play)' : 'Play')
                      }
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-xs transition select-none ${
                        hasError
                          ? 'bg-rose-100 border border-rose-400 text-rose-700 hover:bg-rose-200'
                          : 'bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 active:scale-95'
                      } ${isLoading ? 'cursor-wait opacity-90' : 'cursor-pointer'}`}
                    >
                      {isLoading ? (
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-800 animate-spin" />
                      ) : hasError ? (
                        <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-700" />
                      ) : isPlaying ? (
                        <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-amber-800" />
                      ) : (
                        <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-amber-800 ml-0.5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {!hideActions && !isNormalUser && (
            isOwnProfile ? (
              /* Own Profile Action: Show Prominent QR Badge Button */
              <div className="flex gap-2 sm:gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQRModal(true);
                  }}
                  className="w-full bg-gradient-to-r from-teal-700 to-emerald-800 hover:from-teal-800 hover:to-emerald-900 active:scale-[0.98] text-white rounded-xl py-2 sm:py-2.5 px-3 flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-emerald-100 shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-white">
                    {lang === 'hi' ? 'मेरा QR कोड देखें और शेयर करें' : 'View & Share My QR Code'}
                  </span>
                </button>
              </div>
            ) : (
              /* Visitor Actions: Message, Call (if mobile available), and QR Share Button */
              <div className="flex gap-2 sm:gap-3 pt-0.5">
                {/* Message Button */}
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={handleMessageClick}
                    style={{ backgroundColor: '#0b6e32' }}
                    className="w-full bg-[#0b6e32] active:scale-[0.98] text-white rounded-xl py-2 sm:py-2.5 px-3 flex items-center justify-center gap-1.5 sm:gap-2 shadow-xs transition cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-100 shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-white">
                      {lang === 'hi' ? 'मैसेज' : 'Message'}
                    </span>
                  </button>
                </div>

                {/* Call Button (Calling Matrix: Mobile ON/OFF and Internet Calling ON/OFF) */}
                {showCallButton && (
                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={handleCallClick}
                      style={{ backgroundColor: '#0b6e32' }}
                      className="w-full bg-[#0b6e32] active:scale-[0.98] text-white rounded-xl py-2 sm:py-2.5 px-3 flex items-center justify-center gap-1.5 sm:gap-2 shadow-xs transition cursor-pointer"
                      title={
                        isInternetCallAction
                          ? (lang === 'hi' ? 'इंटरनेट कॉल करें' : 'Internet Call')
                          : (lang === 'hi' ? 'कॉल करें' : 'Call')
                      }
                    >
                      <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-emerald-100" />
                      <span className="text-xs sm:text-sm font-semibold text-white">
                        {lang === 'hi' ? 'कॉल करें' : 'Call'}
                      </span>
                    </button>
                  </div>
                )}

                {/* QR Code Button */}
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQRModal(true);
                    }}
                    className="h-full bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 border border-slate-300 rounded-xl py-2 sm:py-2.5 px-3 flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
                    title={lang === 'hi' ? 'QR कोड देखें और स्कैन करें' : 'View & scan QR code'}
                  >
                    <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700 shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-700">
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

