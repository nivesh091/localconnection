import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  AlertCircle,
  Loader2,
  Navigation,
  FolderPlus,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  MapPin,
  X,
} from 'lucide-react';
import { Requirement, RequirementFilterState, CommentReference } from '../types';
import { RequirementService } from '../services/requirementService';
import { ProfileService } from '../services/profileService';
import { LocationService } from '../services/locationService';
import { DistanceService } from '../services/distanceService';
import { RequirementCard } from '../components/RequirementCard';
import { RequirementDetailModal } from '../components/RequirementDetailModal';
import { RequirementFormModal } from '../components/RequirementFormModal';
import { RequirementFilterModal } from '../components/RequirementFilterModal';
import { LocationPickerValue } from '../components/LocationPicker';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface SearchPageProps {
  onOpenChat: (userId: string, commentRef?: CommentReference | null) => void;
  onRequireAuth: () => void;
  initialWorkerId?: string | null;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  onOpenChat,
  onRequireAuth,
}) => {
  const { user, workerProfile, location: userLocation } = useAuth();
  const { lang } = useTranslation();

  // Public Feed State
  const [publicRequirements, setPublicRequirements] = useState<Requirement[]>([]);
  const [isLoadingPublic, setIsLoadingPublic] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // User ID fallback for immediate 0ms fetch during auth hydration
  const effectiveUserId =
    user?.id ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('km_active_user_id') || sessionStorage.getItem('km_active_user_id')
      : null);

  // User's Own Requirements State (Section 5) - synchronous 0ms cached initialization
  const [userRequirements, setUserRequirements] = useState<Requirement[]>(() => {
    if (effectiveUserId) {
      const cached = RequirementService.getCachedUserRequirements(effectiveUserId);
      if (cached) return cached;
    }
    return [];
  });
  const [isLoadingUserReqs, setIsLoadingUserReqs] = useState<boolean>(() => {
    if (effectiveUserId && RequirementService.getCachedUserRequirements(effectiveUserId)) {
      return false;
    }
    return Boolean(effectiveUserId && !userRequirements.length);
  });

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRadiusKm, setSelectedRadiusKm] = useState<number | undefined>(undefined);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);

  // Async fallback for saved profile location from database
  const [asyncProfileLoc, setAsyncProfileLoc] = useState<any>(null);

  useEffect(() => {
    if (userLocation) {
      setAsyncProfileLoc(userLocation);
      return;
    }
    const currentUserId = user?.id || effectiveUserId;
    if (currentUserId) {
      ProfileService.getUserLocation(currentUserId)
        .then((loc) => {
          if (loc) setAsyncProfileLoc(loc);
        })
        .catch(() => {});
    }
  }, [userLocation, user?.id, effectiveUserId]);

  // 1. Saved profile location resolution (same source and logic as Home / Profile / Worker Card)
  const savedProfileLocation = useMemo(() => {
    if (userLocation) return userLocation;
    if (asyncProfileLoc) return asyncProfileLoc;
    if (workerProfile?.location) return workerProfile.location;
    if (user?.location) return user.location;
    const profileLocs = (user as any)?.locations;
    if (profileLocs) {
      if (Array.isArray(profileLocs)) return profileLocs[0] || null;
      return profileLocs;
    }
    return null;
  }, [userLocation, asyncProfileLoc, workerProfile, user]);

  // Formatted saved profile location text (reusing authoritative LocationService.formatWorkerCard)
  const savedLocationText = useMemo(() => {
    const formatted = LocationService.formatWorkerCard(savedProfileLocation, '', lang);
    if (formatted) return formatted;
    if (user?.address?.trim()) return user.address.trim();
    return '';
  }, [savedProfileLocation, lang, user?.address]);

  // Coordinates from saved profile location (handles direct lat/lng or verified district coords)
  const [profileResolvedCoords, setProfileResolvedCoords] = useState<{ lat: number; lng: number } | null>(() => {
    return DistanceService.extractCoordinates(savedProfileLocation);
  });

  useEffect(() => {
    if (!savedProfileLocation) {
      setProfileResolvedCoords(null);
      return;
    }
    const direct = DistanceService.extractCoordinates(savedProfileLocation);
    if (direct) {
      setProfileResolvedCoords(direct);
      return;
    }
    const canonical = LocationService.extractCanonicalLocation(savedProfileLocation);
    if (canonical && (canonical.place || canonical.subdistrict || canonical.district)) {
      LocationService.resolveLocationCoordinates({
        village: canonical.place,
        subdistrict: canonical.subdistrict,
        district: canonical.district,
        state: canonical.state,
      })
        .then((res) => {
          if (res) {
            setProfileResolvedCoords({ lat: res.latitude, lng: res.longitude });
          }
        })
        .catch(() => {});
    }
  }, [savedProfileLocation]);

  // 2. Live Location State (reusing existing Home location system)
  const [manualLocationCoords, setManualLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [resolvedLocation, setResolvedLocation] = useState<{
    place?: string;
    subdistrict?: string;
    district?: string;
    state?: string;
  } | null>(null);
  const [rawLocationFallback, setRawLocationFallback] = useState<string>('');
  const [locationDetecting, setLocationDetecting] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const isLocationActive = Boolean(manualLocationCoords && (locationName || resolvedLocation));

  // Current formatted live location display string (reusing authoritative LocationService.formatWorkerCard)
  const currentLocationText = useMemo(() => {
    if (resolvedLocation) {
      const formatted = LocationService.formatWorkerCard(resolvedLocation, '', lang);
      if (formatted) return formatted;
    }
    return rawLocationFallback || locationName || '';
  }, [resolvedLocation, lang, rawLocationFallback, locationName]);

  // Formatted location text displayed below the button:
  // Live location overrides profile location when active; otherwise defaults to saved profile location!
  const displayedLocationText = useMemo(() => {
    if (isLocationActive) {
      return currentLocationText;
    }
    return savedLocationText;
  }, [isLocationActive, currentLocationText, savedLocationText]);

  // Active coordinates for distance calculation and sorting:
  // 1. If live location active -> manualLocationCoords
  // 2. Otherwise by default -> saved profile location coordinates!
  const activeUserCoords = useMemo(() => {
    if (manualLocationCoords) {
      return manualLocationCoords;
    }
    return profileResolvedCoords || DistanceService.extractCoordinates(savedProfileLocation);
  }, [manualLocationCoords, profileResolvedCoords, savedProfileLocation]);

  // Modals
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [isMyRequirementsOpen, setIsMyRequirementsOpen] = useState<boolean>(false);

  usePopupBackDismiss(isMyRequirementsOpen, () => setIsMyRequirementsOpen(false));

  // Deletion confirmation modal
  const [deletingRequirement, setDeletingRequirement] = useState<Requirement | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Initial mount ref for search debounce
  const isInitialMount = useRef(true);

  // 2. Fetch dynamic active categories
  const fetchActiveCategories = useCallback(async () => {
    try {
      const cats = await RequirementService.getActiveCategories();
      setActiveCategories(cats);
    } catch {
      setActiveCategories([]);
    }
  }, []);

  // 3. Fetch user's own requirements with 0ms cache revalidation
  const fetchUserRequirements = useCallback(async () => {
    const targetUserId = user?.id || effectiveUserId;
    if (!targetUserId) {
      setUserRequirements([]);
      setIsLoadingUserReqs(false);
      return;
    }

    const cached = RequirementService.getCachedUserRequirements(targetUserId);
    if (!cached || cached.length === 0) {
      setIsLoadingUserReqs(true);
    }
    try {
      const reqs = await RequirementService.getUserRequirements(targetUserId);
      setUserRequirements(reqs);
    } catch (err) {
      console.warn('Error fetching own requirements:', err);
    } finally {
      setIsLoadingUserReqs(false);
    }
  }, [user?.id, effectiveUserId]);

  // 4. Fetch public requirements (excluding logged-in user)
  const fetchPublicRequirements = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setIsLoadingPublic(true);
      setLoadError(null);
      try {
        const filterState: RequirementFilterState = {
          searchTerm: searchTerm.trim() || undefined,
          categories: selectedCategories.length > 0 ? selectedCategories : undefined,
          radiusKm: selectedRadiusKm,
          userLat: activeUserCoords?.lat,
          userLng: activeUserCoords?.lng,
        };

        const reqs = await RequirementService.getPublicRequirements(filterState, user?.id);
        setPublicRequirements(reqs);
      } catch (err) {
        setLoadError(
          lang === 'hi'
            ? 'आवश्यकताएँ लोड करने में समस्या आई।'
            : 'Error loading requirements.'
        );
      } finally {
        if (showSpinner) setIsLoadingPublic(false);
      }
    },
    [searchTerm, selectedCategories, selectedRadiusKm, activeUserCoords, user?.id, lang]
  );

  // 1. Fetch active categories once on mount
  useEffect(() => {
    fetchActiveCategories();
  }, [fetchActiveCategories]);

  // 2. Fetch user's own requirements on mount and when user identity changes
  useEffect(() => {
    fetchUserRequirements();
  }, [fetchUserRequirements]);

  // 3. Debounced and reactive public requirements fetching (filters, search term, or coordinates change)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchPublicRequirements(true);
      return;
    }
    const timer = setTimeout(() => {
      fetchPublicRequirements(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, selectedCategories, selectedRadiusKm, activeUserCoords, fetchPublicRequirements]);

  // Live location detection handler (reusing existing Home location system)
  const handleDetectLocation = async () => {
    setLocationDetecting(true);
    setLocationError(null);
    try {
      const pos = await LocationService.getCurrentPosition();
      if (pos) {
        const coords = { lat: pos.latitude, lng: pos.longitude };
        setManualLocationCoords(coords);
        const rev = await LocationService.reverseGeocode(pos.latitude, pos.longitude);
        if (rev) {
          setLocationName(`${rev.place}, ${rev.district}`);
          setResolvedLocation({
            place: rev.place,
            subdistrict: rev.subdistrict,
            district: rev.district,
            state: rev.state,
          });
          const formatted = LocationService.formatWorkerCard(
            { place: rev.place, subdistrict: rev.subdistrict, district: rev.district, state: rev.state },
            '',
            lang
          );
          setRawLocationFallback(formatted || `${rev.place}, ${rev.district}`);
        } else {
          setLocationName(lang === 'hi' ? 'वर्तमान स्थान' : 'Current Location');
          setResolvedLocation(null);
          setRawLocationFallback(`${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`);
        }
      } else {
        setLocationError(
          lang === 'hi'
            ? 'लोकेशन अनुमति नहीं मिली। कृपया डिवाइस सेटिंग्स में लोकेशन अनुमति दें।'
            : 'Location permission not granted. Please enable location permissions in device settings.'
        );
      }
    } catch {
      setLocationError(
        lang === 'hi'
          ? 'लोकेशन प्राप्त करने में त्रुटि हुई। कृपया पुनः प्रयास करें।'
          : 'Failed to retrieve location. Please try again.'
      );
    } finally {
      setLocationDetecting(false);
    }
  };

  // Remove live location, restoring original non-location behavior
  const handleClearLocation = () => {
    setManualLocationCoords(null);
    setLocationName('');
    setResolvedLocation(null);
    setRawLocationFallback('');
    setLocationError(null);
  };

  // Open creation form (or require auth for guests)
  const handleOpenCreate = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setEditingRequirement(null);
    setIsFormOpen(true);
  };

  // Open edit form
  const handleOpenEdit = (req: Requirement) => {
    if (!user || user.id !== req.owner_id) return;
    setEditingRequirement(req);
    setIsFormOpen(true);
  };

  // Save creation / edit
  const handleSaveRequirement = async (data: {
    category: string;
    shortRequirement: string;
    location: LocationPickerValue;
    maximumBudget: number;
    minimumExperienceYears?: number | null;
    additionalInfo?: string | null;
    keywords?: string[];
    voiceBlob?: Blob | null;
    removeExistingVoice?: boolean;
    photoBlobs?: Blob[];
    remainingPhotoStoragePaths?: string[];
  }) => {
    if (!user) {
      return { success: false, error: 'कृपया पहले लॉगिन करें।' };
    }

    if (editingRequirement) {
      // Update
      const res = await RequirementService.updateRequirement({
        id: editingRequirement.id,
        ownerId: user.id,
        category: data.category,
        shortRequirement: data.shortRequirement,
        locationId: editingRequirement.location_id,
        place: data.location.place,
        district: data.location.district,
        state: data.location.state,
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        maximumBudget: data.maximumBudget,
        minimumExperienceYears: data.minimumExperienceYears,
        additionalInfo: data.additionalInfo,
        keywords: data.keywords,
        voiceBlob: data.voiceBlob,
        existingVoiceStoragePath: editingRequirement.voice_storage_path,
        removeExistingVoice: data.removeExistingVoice,
        newPhotoBlobs: data.photoBlobs,
        remainingPhotoStoragePaths: data.remainingPhotoStoragePaths,
      });

      if (res.requirement) {
        // Refresh feeds
        await Promise.all([
          fetchUserRequirements(),
          fetchPublicRequirements(false),
          fetchActiveCategories(),
        ]);
        return { success: true };
      }
      return { success: false, error: res.error };
    } else {
      // Create
      const res = await RequirementService.createRequirement({
        ownerId: user.id,
        category: data.category,
        shortRequirement: data.shortRequirement,
        place: data.location.place,
        district: data.location.district,
        state: data.location.state,
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        maximumBudget: data.maximumBudget,
        minimumExperienceYears: data.minimumExperienceYears,
        additionalInfo: data.additionalInfo,
        keywords: data.keywords,
        voiceBlob: data.voiceBlob,
        photoBlobs: data.photoBlobs,
      });

      if (res.requirement) {
        // Refresh feeds
        await Promise.all([
          fetchUserRequirements(),
          fetchPublicRequirements(false),
          fetchActiveCategories(),
        ]);
        return { success: true };
      }
      return { success: false, error: res.error };
    }
  };

  // Delete requirement execution with permanent media cleanup (Points 49-53)
  const handleConfirmDelete = async () => {
    if (!deletingRequirement || !user) return;
    setIsDeleting(true);
    try {
      const res = await RequirementService.deleteRequirement(
        deletingRequirement.id,
        user.id,
        deletingRequirement.voice_storage_path,
        deletingRequirement.photo_storage_paths
      );
      if (res.success) {
        setDeletingRequirement(null);
        await Promise.all([
          fetchUserRequirements(),
          fetchPublicRequirements(false),
          fetchActiveCategories(),
        ]);
      } else {
        alert(res.error || 'हटाने में त्रुटि हुई।');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const hasActiveFilters = selectedCategories.length > 0 || selectedRadiusKm !== undefined;

  // 20 KM Distance Slot & Preference Ranking for Requirements (matching existing Home location system)
  const sortedPublicRequirements = useMemo(() => {
    return DistanceService.sortByDistanceSlotAndPreference<Requirement>(
      publicRequirements,
      (req: Requirement) => {
        if (
          !activeUserCoords ||
          req.latitude === null ||
          req.latitude === undefined ||
          req.longitude === null ||
          req.longitude === undefined
        ) {
          return null;
        }
        return DistanceService.calculateHaversineDistanceKm(activeUserCoords, {
          lat: req.latitude,
          lng: req.longitude,
        });
      },
      (req: Requirement) => req.priority_points ?? 50,
      (req: Requirement) => req.created_at
    );
  }, [publicRequirements, activeUserCoords]);

  return (
    <div className="pb-20 pt-1 px-3 max-w-4xl mx-auto space-y-1.5">
      {/* 1. Main Requirements Page Header (centered "अपनी आवश्यकता पोस्ट कर सकते हैं" ABOVE "आपकी आवश्यकताएँ") */}
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a70] rounded-xl p-2 text-white shadow-xs flex items-center justify-center text-center">
        <h1 style={{ fontSize: '18px' }} className="font-bold tracking-tight leading-snug text-center">
          {lang === 'hi'
            ? 'अपनी आवश्यकता पोस्ट कर सकते हैं'
            : 'You can post your requirement here'}
        </h1>
      </div>

      {/* 2. "आपकी आवश्यकताएँ" Summary Row with '+' button on the LEFT side */}
      <div style={{ marginTop: '0px', marginBottom: '6px' }} className="w-full bg-white border border-slate-200/90 rounded-xl px-[10px] py-[5px] shadow-2xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* '+' Button moved to LEFT */}
          <button
            type="button"
            style={{ marginLeft: '6px' }}
            onClick={handleOpenCreate}
            className="p-1 sm:p-1.5 bg-teal-700 hover:bg-teal-800 active:scale-95 text-white rounded-lg font-bold transition shadow-xs cursor-pointer flex items-center justify-center shrink-0"
            title={lang === 'hi' ? 'आवश्यकता जोड़ें' : 'Add Requirement'}
            aria-label={lang === 'hi' ? 'आवश्यकता जोड़ें' : 'Add Requirement'}
          >
            <Plus className="w-4 h-4 text-[16px]" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!user) {
                onRequireAuth();
                return;
              }
              setIsMyRequirementsOpen(true);
            }}
            className="min-w-0 flex-1 hover:opacity-85 transition cursor-pointer select-none text-left"
          >
            <span style={{ fontSize: '16px', marginLeft: '8px' }} className="font-bold text-slate-800 truncate block">
              {lang === 'hi' ? 'आपकी आवश्यकताएँ' : 'Your Requirements'}
            </span>
          </button>
        </div>

        {/* Existing देखें Button with exact short wording: देखें */}
        <button
          type="button"
          onClick={() => {
            if (!user) {
              onRequireAuth();
              return;
            }
            setIsMyRequirementsOpen(true);
          }}
          className="flex items-center gap-0.5 text-xs font-semibold text-teal-800 hover:text-teal-900 transition cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-teal-50 shrink-0"
        >
          <span>{lang === 'hi' ? 'देखें' : 'View'}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3. Search Bar & Filter Controls (Thinner row, excessive padding removed from filter button) */}
      <div className="bg-white border border-slate-200 rounded-xl p-0 shadow-2xs space-y-1">
        <div className="flex gap-1.5 items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <input
              type="text"
              style={{ fontSize: '14px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                lang === 'hi'
                  ? 'आवश्यकता खोजें (नाम, सेवा, स्थान, कीवर्ड)...'
                  : 'Search requirements (name, service, location, keywords)...'
              }
              className="w-full h-8 pl-2.5 pr-7 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs"
            />
            <div className="absolute right-2 top-2 text-slate-400 pointer-events-none">
              <Search className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Filter Button - excessive internal padding removed */}
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            className={`px-2 h-8 rounded-lg border flex items-center gap-1 text-[11px] font-semibold transition active:scale-95 cursor-pointer shrink-0 ${
              hasActiveFilters
                ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span style={{ fontSize: '13px' }}>{lang === 'hi' ? 'फ़िल्टर' : 'Filter'}</span>
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
            )}
          </button>
        </div>

        {/* Active Filter Badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5 text-xs">
            <span className="text-[10px] font-bold text-slate-500">
              {lang === 'hi' ? 'सक्रिय फ़िल्टर:' : 'Active:'}
            </span>
            {selectedCategories.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-300 font-semibold text-[10px]"
              >
                <span>{c}</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedCategories(selectedCategories.filter((x) => x !== c))
                  }
                  className="hover:text-teal-950 font-bold"
                >
                  ×
                </button>
              </span>
            ))}

            {selectedRadiusKm !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-300 font-semibold text-[10px]">
                <span>{selectedRadiusKm} km</span>
                <button
                  type="button"
                  onClick={() => setSelectedRadiusKm(undefined)}
                  className="hover:text-teal-950 font-bold"
                >
                  ×
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedCategories([]);
                setSelectedRadiusKm(undefined);
              }}
              className="text-[10px] font-bold text-rose-600 hover:underline ml-0.5 cursor-pointer"
            >
              {lang === 'hi' ? 'सभी हटाएं' : 'Clear All'}
            </button>
          </div>
        )}
      </div>

      {/* 4. Location Section: Smaller/thinner button, centered, followed by default profile or live location info */}
      <div style={{ marginLeft: '0px', marginTop: '0px', paddingLeft: '0px', paddingTop: '4px', paddingBottom: '4px' }} className="flex flex-col items-center justify-center text-center mb-[4px]">
        {!isLocationActive ? (
          <button
            type="button"
            style={{ marginBottom: '4px' }}
            onClick={handleDetectLocation}
            disabled={locationDetecting}
            className="inline-flex items-center justify-center text-center gap-1 px-[30px] py-[2px] bg-slate-50 hover:bg-teal-50/80 active:bg-teal-100/70 text-slate-800 hover:text-teal-900 border border-slate-200 hover:border-teal-400/60 rounded-lg font-semibold text-[11px] sm:text-xs shadow-2xs hover:shadow-xs transition duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed select-none min-h-[30px]"
          >
            {locationDetecting ? (
              <Loader2 className="w-3 h-3 text-teal-700 animate-spin shrink-0" />
            ) : (
              <Navigation className="w-3 h-3 text-teal-700 shrink-0" />
            )}
            <span style={{ fontSize: '15px' }} className="truncate">
              {locationDetecting
                ? lang === 'hi'
                  ? 'लोकेशन पहचानी जा रही है...'
                  : 'Detecting location...'
                : lang === 'hi'
                ? 'लोकेशन का उपयोग करें'
                : 'Use Location'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            style={{ marginBottom: '4px' }}
            onClick={handleClearLocation}
            className="inline-flex items-center justify-center text-center gap-1 px-[30px] py-[2px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 hover:border-rose-400 rounded-lg font-semibold text-[11px] sm:text-xs shadow-2xs hover:shadow-xs transition duration-150 active:scale-[0.98] cursor-pointer select-none min-h-[30px]"
            title={lang === 'hi' ? 'लोकेशन हटाएं' : 'Remove location'}
          >
            <X className="w-3 h-3 text-rose-600 shrink-0" />
            <span style={{ fontSize: '15px' }} className="truncate">
              {lang === 'hi' ? 'लोकेशन हटाएँ' : 'Remove Location'}
            </span>
          </button>
        )}

        {/* Location Error if permission denied */}
        {locationError && (
          <p className="mt-0.5 text-[10px] text-rose-600 font-medium text-center">
            {locationError}
          </p>
        )}

        {/* 5. Current/Default Location Information (shown by default from saved profile, or from live location when active) */}
        {displayedLocationText && (
          <div className="mt-0.5 px-2 flex items-center justify-center text-center text-[11px] text-slate-600 leading-snug mx-auto max-w-xl">
            <div style={{ marginBottom: '3px' }} className="whitespace-normal break-words text-center">
              <span style={{ fontSize: '13px' }} className="font-semibold text-slate-700">
                {lang === 'hi'
                  ? 'वर्तमान लोकेशन: '
                  : isLocationActive
                  ? 'Current Location: '
                  : 'Saved Location: '}
              </span>
              <span style={{ fontSize: '13px' }} className="text-slate-600">{displayedLocationText}</span>
            </div>
          </div>
        )}
      </div>

      {/* 6. Main Public Requirements Feed (Points 4 & 37: "लोगों की आवश्यकताएँ") */}
      <div className="space-y-2 pt-0.5">
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a70] rounded-xl p-2.5 sm:p-3 text-white shadow-xs flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold tracking-tight flex items-center gap-2">
            <span>{lang === 'hi' ? 'लोगों की आवश्यकताएँ' : "People's Requirements"}</span>
            {!isLoadingPublic && (
              <span className="text-xs bg-white/20 text-white font-semibold px-2 py-0.5 rounded-full">
                {publicRequirements.length}
              </span>
            )}
          </h2>

          <button
            type="button"
            onClick={() => fetchPublicRequirements(true)}
            className="text-xs text-white/80 hover:text-white hover:bg-white/10 px-2 py-0.5 rounded-md transition flex items-center gap-1 cursor-pointer"
            title="रीफ्रेश करें"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">{lang === 'hi' ? 'रीफ्रेश' : 'Refresh'}</span>
          </button>
        </div>

        {isLoadingPublic ? (
          <div className="py-12 text-center space-y-2">
            <Loader2 className="w-7 h-7 text-teal-700 animate-spin mx-auto" />
            <p className="text-xs text-slate-500">
              {lang === 'hi' ? 'आवश्यकताएँ लोड हो रही हैं...' : 'Loading requirements...'}
            </p>
          </div>
        ) : loadError ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center space-y-1.5">
            <AlertCircle className="w-5 h-5 text-amber-600 mx-auto" />
            <p className="text-xs text-amber-900 font-semibold">{loadError}</p>
            <button
              type="button"
              onClick={() => fetchPublicRequirements(true)}
              className="px-3 py-1 bg-teal-700 text-white text-xs font-bold rounded-lg"
            >
              {lang === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            </button>
          </div>
        ) : publicRequirements.length === 0 ? (
          <div className="py-10 px-3 text-center bg-white rounded-xl border border-dashed border-slate-300 space-y-1.5">
            <AlertCircle className="w-7 h-7 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">
              {hasActiveFilters || searchTerm
                ? (lang === 'hi' ? 'कोई आवश्यकता नहीं मिली' : 'No requirements found')
                : (lang === 'hi' ? 'अभी तक कोई आवश्यकता पोस्ट नहीं की गई है।' : 'No requirements posted yet.')}
            </h3>
            {(hasActiveFilters || searchTerm) && (
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {lang === 'hi'
                  ? 'कृपया अलग कीवर्ड या अधिक दायरा चुनकर पुनः खोजें।'
                  : 'Try adjusting your search terms or expanding your filter radius.'}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {sortedPublicRequirements.map((req) => (
              <RequirementCard
                key={req.id}
                requirement={req}
                isOwnRequirement={false}
                onOpenDetail={setSelectedRequirement}
                onOpenChat={onOpenChat}
                onRequireAuth={onRequireAuth}
                currentUserCoords={activeUserCoords}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dedicated "आपकी आवश्यकताएँ" View / Modal (Sections 2 & 3) */}
      {isMyRequirementsOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setIsMyRequirementsOpen(false)}
        >
          <div
            className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar with Back Button & Count */}
            <div className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsMyRequirementsOpen(false)}
                  className="p-1 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title={lang === 'hi' ? 'वापस जाएँ' : 'Go Back'}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-sm sm:text-base font-bold truncate">
                  {lang === 'hi' ? 'आपकी आवश्यकताएँ' : 'Your Requirements'}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsMyRequirementsOpen(false);
                  handleOpenCreate();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'hi' ? '+ नई आवश्यकता' : '+ New'}</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-3 bg-[#f8fafc]">
              {isLoadingUserReqs ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-teal-700" />
                  <p className="text-xs text-slate-500 mt-2">लोड हो रहा है...</p>
                </div>
              ) : userRequirements.length === 0 ? (
                <div className="py-12 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-3">
                  <FolderPlus className="w-8 h-8 text-slate-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">
                    {lang === 'hi'
                      ? 'अभी आपने कोई आवश्यकता पोस्ट नहीं की है'
                      : 'You have not posted any requirements yet'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {lang === 'hi'
                      ? 'किसी सेवा के लिए कुशल सेवा प्रदाता की जरूरत है? नई आवश्यकता पोस्ट करें।'
                      : 'Need a skilled service provider? Post your requirement now.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMyRequirementsOpen(false);
                      handleOpenCreate();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{lang === 'hi' ? '+ आवश्यकता डालें' : '+ Post Requirement'}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {userRequirements.map((req) => (
                    <RequirementCard
                      key={req.id}
                      requirement={req}
                      isOwnRequirement={true}
                      onOpenDetail={setSelectedRequirement}
                      onOpenChat={onOpenChat}
                      onRequireAuth={onRequireAuth}
                      currentUserCoords={activeUserCoords}
                      onEdit={(r) => {
                        setIsMyRequirementsOpen(false);
                        handleOpenEdit(r);
                      }}
                      onDelete={(r) => setDeletingRequirement(r)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <RequirementDetailModal
        requirement={selectedRequirement}
        onClose={() => setSelectedRequirement(null)}
        onOpenChat={onOpenChat}
        onRequireAuth={onRequireAuth}
        currentUserCoords={activeUserCoords}
        isOwnRequirement={user?.id === selectedRequirement?.owner_id}
      />

      {/* Creation / Edit Form Modal */}
      <RequirementFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingRequirement(null);
        }}
        onSave={handleSaveRequirement}
        initialRequirement={editingRequirement}
        existingCategories={activeCategories}
      />

      {/* Filter Modal */}
      <RequirementFilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        availableCategories={activeCategories}
        selectedCategories={selectedCategories}
        selectedRadiusKm={selectedRadiusKm}
        onApply={(cats, rad) => {
          setSelectedCategories(cats);
          setSelectedRadiusKm(rad);
        }}
        onReset={() => {
          setSelectedCategories([]);
          setSelectedRadiusKm(undefined);
        }}
        hasUserCoordinates={Boolean(activeUserCoords)}
        onRequestDetectLocation={handleDetectLocation}
        isDetectingLocation={locationDetecting}
      />

      {/* Deletion Confirmation Modal */}
      {deletingRequirement && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setDeletingRequirement(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {lang === 'hi' ? 'आवश्यकता हटाएं?' : 'Delete Requirement?'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'hi'
                    ? 'क्या आप यह आवश्यकता हटाना चाहते हैं?'
                    : 'Are you sure you want to delete this requirement?'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRequirement(null)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{lang === 'hi' ? 'हाँ, हटाएं' : 'Yes, Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
