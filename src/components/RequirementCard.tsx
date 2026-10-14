import React, { useState, useEffect, useMemo } from 'react';
import { Edit3, Trash2, Play, Pause, MapPin, Clock, RotateCcw } from 'lucide-react';
import { Requirement } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { DistanceService } from '../services/distanceService';
import { RequirementService } from '../services/requirementService';
import { useShortcutAudio } from '../hooks/useShortcutAudio';
import verificationLogo from '@/verificationlogo.png';
import { WorkerService } from '../services/workerService';
import { RoadRoutingService, RoadDistanceResult } from '../services/roadRoutingService';
import { LocationService } from '../services/locationService';

interface RequirementCardProps {
  requirement: Requirement;
  onOpenDetail: (requirement: Requirement) => void;
  currentUserCoords?: { lat: number; lng: number } | null;
  isOwnRequirement?: boolean;
  onEdit?: (requirement: Requirement) => void;
  onDelete?: (requirement: Requirement) => void;
  showAudioShortcut?: boolean;
  // Kept for interface compatibility
  onOpenChat?: (targetUserId: string) => void;
  onRequireAuth?: () => void;
}

export const RequirementCard: React.FC<RequirementCardProps> = ({
  requirement,
  onOpenDetail,
  currentUserCoords,
  isOwnRequirement = false,
  onEdit,
  onDelete,
  showAudioShortcut = true,
}) => {
  const { location: userLocation } = useAuth();
  const { lang } = useTranslation();

  // Audio Shortcut Integration (Home Screen Requirement Cards)
  const audioUrl =
    requirement.voice_url ||
    (requirement.voice_storage_path
      ? RequirementService.getVoicePublicUrl(requirement.voice_storage_path)
      : null);
  const hasAudio = Boolean(showAudioShortcut && audioUrl);
  const { isPlaying, isLoading, hasError, toggleAudio, preloadAudio } = useShortcutAudio(requirement.id);

  // 1. Profile information of the requirement owner
  const owner = requirement.owner;
  const ownerId = requirement.owner_id || owner?.id;
  const name = owner?.name?.trim() || (lang === 'hi' ? 'उपयोगकर्ता' : 'User');
  const photo = owner?.profile_photo;
  const firstLetter = name.charAt(0).toUpperCase();

  const [isOwnerWorker, setIsOwnerWorker] = useState<boolean>(() => {
    if (!ownerId) return false;
    return WorkerService.getCachedWorkerUserIds([ownerId]).has(ownerId);
  });

  useEffect(() => {
    if (!ownerId) {
      setIsOwnerWorker(false);
      return;
    }
    let isMounted = true;
    WorkerService.getValidWorkerUserIds([ownerId]).then((set) => {
      if (isMounted) {
        setIsOwnerWorker(set.has(ownerId));
      }
    });
    return () => {
      isMounted = false;
    };
  }, [ownerId]);

  // 2. Name auto-fit styling
  const nameLength = name.length;
  const nameStyle = useMemo(() => {
    if (nameLength <= 6) {
      return { fontSize: 'clamp(1rem, 3.8vw, 1.25rem)', lineHeight: 1.15 };
    } else if (nameLength <= 10) {
      return { fontSize: 'clamp(0.92rem, 3.4vw, 1.12rem)', lineHeight: 1.18 };
    } else if (nameLength <= 15) {
      return { fontSize: 'clamp(0.85rem, 3vw, 1rem)', lineHeight: 1.2 };
    } else {
      return { fontSize: 'clamp(0.78rem, 2.6vw, 0.92rem)', lineHeight: 1.22 };
    }
  }, [nameLength]);

  // 3. Category & Budget
  const categoryName = requirement.category || (lang === 'hi' ? 'सेवा विशेषज्ञ' : 'Service Expert');
  const maxBudget = requirement.maximum_budget || 0;

  // 4. Maximum Experience (Point 8: "अधिकतम अनुभव")
  const experienceYears = requirement.minimum_experience_years;
  const experienceText =
    experienceYears !== null && experienceYears !== undefined && experienceYears > 0
      ? lang === 'hi'
        ? `${experienceYears} वर्ष`
        : `${experienceYears} ${experienceYears === 1 ? 'Year' : 'Years'}`
      : '—';

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

  // 5. Current User Coordinates (viewer/worker viewing the requirement)
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

  // 6. Target Requirement Coordinates (Strictly the job's actual location coordinates, NOT poster's profile coordinates)
  const [asyncRequirementCoords, setAsyncRequirementCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (
      requirement.latitude !== null &&
      requirement.latitude !== undefined &&
      requirement.longitude !== null &&
      requirement.longitude !== undefined
    ) {
      return;
    }
    // If coordinates are missing on requirement, resolve using the requirement's job location fields
    if (requirement.place || requirement.district) {
      let isMounted = true;
      LocationService.resolveLocationCoordinates({
        village: requirement.place,
        subdistrict: requirement.subdistrict || requirement.tehsil || undefined,
        district: requirement.district || undefined,
        state: requirement.state || undefined,
      })
        .then((coords) => {
          if (isMounted && coords) {
            setAsyncRequirementCoords({ lat: coords.latitude, lng: coords.longitude });
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [requirement.latitude, requirement.longitude, requirement.place, requirement.district, requirement.subdistrict, requirement.tehsil, requirement.state]);

  const targetRequirementCoord = useMemo(() => {
    if (
      requirement.latitude !== null &&
      requirement.latitude !== undefined &&
      requirement.longitude !== null &&
      requirement.longitude !== undefined &&
      !isNaN(Number(requirement.latitude)) &&
      !isNaN(Number(requirement.longitude))
    ) {
      return { lat: Number(requirement.latitude), lng: Number(requirement.longitude) };
    }
    if (asyncRequirementCoords) {
      return asyncRequirementCoords;
    }
    if (requirement.location) {
      const c = DistanceService.extractCoordinates(requirement.location);
      if (c) return c;
    }
    return null;
  }, [requirement.latitude, requirement.longitude, asyncRequirementCoords, requirement.location]);

  // 7. Road Distance Calculation (Real road routing path via RoadRoutingService, strictly separate from straight-line displacement)
  const [roadDistanceResult, setRoadDistanceResult] = useState<RoadDistanceResult | null>(() => {
    if (userCoordinates && targetRequirementCoord) {
      return RoadRoutingService.getCachedRoadDistance(userCoordinates, targetRequirementCoord, lang);
    }
    return null;
  });
  const [isCalculatingRoad, setIsCalculatingRoad] = useState<boolean>(false);

  useEffect(() => {
    if (!userCoordinates || !targetRequirementCoord) {
      setRoadDistanceResult(null);
      return;
    }

    const cached = RoadRoutingService.getCachedRoadDistance(userCoordinates, targetRequirementCoord, lang);
    if (cached) {
      setRoadDistanceResult(cached);
      return;
    }

    let isMounted = true;
    setIsCalculatingRoad(true);

    RoadRoutingService.calculateRoadDistance(userCoordinates, targetRequirementCoord, lang)
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
  }, [userCoordinates?.lat, userCoordinates?.lng, targetRequirementCoord?.lat, targetRequirementCoord?.lng, lang]);

  // Fix 2: Dynamically resolve Tehsil if not stored directly (reusing existing authoritative logic from RequirementDetailModal)
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

  // Fix 2: Strict format: गाँव: VALUE, तहसील: VALUE, जिला: VALUE, राज्य: VALUE (reusing authoritative LocationService.formatWorkerCard)
  const locationText = useMemo(() => {
    if (!requirement) return '';
    const hasAnyLoc = Boolean(
      requirement.place ||
      requirement.district ||
      requirement.state ||
      requirement.subdistrict ||
      requirement.tehsil ||
      requirement.location
    );
    if (!hasAnyLoc) return '';

    const locObj = {
      place: requirement.place || requirement.location?.place || '',
      village: requirement.place || requirement.location?.village || '',
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
      district: requirement.district || requirement.location?.district || '',
      state: requirement.state || requirement.location?.state || '',
    };
    return LocationService.formatWorkerCard(locObj, '', lang);
  }, [requirement, resolvedTehsil, lang]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(requirement);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(requirement);
  };

  return (
    <div
      onClick={() => onOpenDetail(requirement)}
      className="w-full text-left bg-gradient-to-b from-[#2b4468] via-[#213554] to-[#1a2b44] rounded-2xl p-[2.5px] shadow-[0_6px_16px_rgba(26,43,68,0.18),0_2px_4px_rgba(0,0,0,0.08)] hover:shadow-[0_10px_24px_rgba(26,43,68,0.26)] transition-all duration-150 cursor-pointer select-none active:scale-[0.995]"
    >
      <div className="bg-[#f8fafc] rounded-[13px] p-3 sm:p-3.5 space-y-2 relative overflow-hidden">
        {/* Top Header: Photo (Left), Name & Category (Center), Max Budget (Right) */}
        <div className="flex items-center justify-between gap-2.5 min-h-[52px]">
          {/* Left: Profile Photo */}
          <div className="shrink-0">
            <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full p-[2px] bg-gradient-to-tr from-[#2b4468] to-[#607d9f] shadow-xs">
              <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-sm sm:text-base font-bold text-[#1e3a5f]">
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

          {/* Center: Name & Category */}
          <div className="flex-1 min-w-0 text-center px-1">
            <h3
              style={{ ...nameStyle, fontSize: '19.92px' }}
              className="font-bold text-[#1e293b] tracking-tight leading-tight flex items-center justify-center"
            >
              <span className="truncate">{name}</span>
              {isOwnerWorker && (
                <img
                  src={verificationLogo}
                  alt="Verified"
                  className="inline-block shrink-0 object-contain select-none"
                  style={{
                    width: '16px',
                    height: '16px',
                    marginLeft: '2px',
                  }}
                />
              )}
            </h3>
            <div style={{ flexWrap: 'wrap' }} className="mt-1 flex justify-center flex-wrap">
              <span
                style={{ fontSize: '14px' }}
                className="inline-flex items-center justify-center border border-[#94a3b8] bg-[#e2e8f0]/80 text-[#1e293b] rounded-full px-2.5 py-0.5 font-semibold tracking-tight leading-none max-w-full shadow-2xs"
              >
                {categoryName}
              </span>
            </div>
          </div>

          {/* Right: Maximum Budget Badge with 3D Bevel */}
          <div className="shrink-0">
            <div className="bg-[#e2e8f0] rounded-xl p-[2px] shadow-[1px_2px_4px_rgba(0,0,0,0.06)]">
              <div className="bg-gradient-to-b from-[#fef3c7] to-[#fde68a] rounded-[10px] px-2.5 py-1 sm:px-3 sm:py-1.5 flex flex-col items-center justify-center border border-[#d97706]/30 min-w-[58px] sm:min-w-[68px]">
                <span style={{ fontSize: '16px' }} className="font-extrabold text-[#92400e] leading-none whitespace-nowrap">
                  ₹{maxBudget}
                </span>
                <span style={{ fontSize: '12px' }} className="font-bold text-[#b45309] mt-0.5 leading-none whitespace-nowrap">
                  {lang === 'hi' ? 'तक' : 'Max'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Short Requirement ("क्या करवाना है") with Optional Audio Shortcut */}
        <div className="bg-[#f1f5f9] border border-[#cbd5e1] rounded-xl px-2.5 py-2 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className={`min-w-0 ${hasAudio ? 'flex-[9] basis-[90%]' : 'w-full'}`}>
              <p style={{ fontSize: '12.5px' }} className="font-semibold text-[#64748b] leading-tight">
                {lang === 'hi' ? 'आवश्यक सेवा:' : 'Service required:'}
              </p>
              <p style={{ fontSize: '15px' }} className="font-bold text-[#0f172a] mt-0.5 leading-snug break-words line-clamp-2">
                "{requirement.short_requirement}"
              </p>
            </div>

            {hasAudio && (
              <div className="shrink-0 flex items-center justify-end flex-[1] basis-[10%]">
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
                      : 'bg-gradient-to-b from-[#fef3c7] to-[#fde68a] border border-[#d97706]/40 text-[#92400e] hover:brightness-105 active:scale-95'
                  } ${isLoading ? 'cursor-wait opacity-90' : 'cursor-pointer'}`}
                >
                  {isLoading ? (
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#92400e] animate-spin" />
                  ) : hasError ? (
                    <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-700" />
                  ) : isPlaying ? (
                    <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-[#92400e]" />
                  ) : (
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-[#92400e] ml-0.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats: Experience ("अधिकतम अनुभव") (Left) & Distance ("दूरी") (Right) - Point 8 */}
        <div className="grid grid-cols-2 px-1 text-xs">
          <div style={{ fontSize: '12px' }} className="text-left">
            <span style={{ fontSize: '12.5px' }} className="font-semibold text-slate-500">
              {lang === 'hi' ? 'अधिकतम अनुभव: ' : 'Max Experience: '}
            </span>
            <span style={{ fontSize: '14px' }} className="font-bold text-slate-800">
              {experienceText}
            </span>
          </div>
          <div className="text-right">
            <span style={{ fontSize: '12.5px' }} className="font-semibold text-slate-500">
              {lang === 'hi' ? 'दूरी: ' : 'Distance: '}
            </span>
            <span style={{ fontSize: '14px' }} className="font-bold text-slate-800">
              {roadDistanceResult?.success ? (
                <span style={{ marginLeft: '0px' }}>{roadDistanceResult.formattedCardDistance}</span>
              ) : isCalculatingRoad ? (
                <span style={{ marginLeft: '0px' }} className="text-slate-500 font-medium text-xs">
                  {lang === 'hi' ? 'दूरी लोड हो रही है...' : 'Calculating distance...'}
                </span>
              ) : userCoordinates && targetRequirementCoord ? (
                <span style={{ marginLeft: '0px' }} className="text-slate-500 font-medium text-[11px] sm:text-xs">
                  {lang === 'hi' ? 'दूरी उपलब्ध नहीं है' : 'Distance unavailable'}
                </span>
              ) : (
                <span style={{ marginLeft: '0px' }} className="text-slate-400 font-medium text-xs">
                  {lang === 'hi' ? 'दूरी उपलब्ध नहीं है' : 'Distance unavailable'}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Fix 2: Existing Location Display at Bottom of Requirement Card */}
        {locationText ? (
          <div className="bg-[#cbd5e1] rounded-xl p-[1.5px] shadow-2xs">
            <div className="bg-[#f1f5f9] rounded-[10px] py-1.5 px-2.5 flex items-start gap-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
              <MapPin className="w-3.5 h-3.5 text-[#2b4468] shrink-0 mt-0.5" />
              <span
                style={{ fontSize: '13px' }}
                className="text-[11.5px] sm:text-xs font-medium text-[#1e293b] min-w-0 flex-1 whitespace-normal break-words leading-snug"
              >
                {locationText}
              </span>
            </div>
          </div>
        ) : null}

        {/* Optional Edit / Delete controls for own requirements view */}
        {isOwnRequirement && (
          <div className="flex gap-2 pt-1 border-t border-slate-200/70">
            <button
              type="button"
              onClick={handleEditClick}
              className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300 flex items-center justify-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-teal-700" />
              <span>{lang === 'hi' ? 'संपादित करें' : 'Edit'}</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteClick}
              className="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs rounded-lg border border-rose-200 flex items-center justify-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-3 h-3 text-rose-600" />
              <span>{lang === 'hi' ? 'हटाएं' : 'Delete'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
