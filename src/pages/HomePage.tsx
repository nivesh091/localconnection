import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Filter, AlertCircle, RefreshCw, Navigation, Loader2, X, MapPin } from 'lucide-react';
import { WorkerProfile, WorkerCategory, SearchFilterState, CommentReference } from '../types';
import { WorkerService } from '../services/workerService';
import { AdminService } from '../services/adminService';
import { WorkerCard } from '../components/WorkerCard';
import { WorkerDetailModal } from '../components/WorkerDetailModal';
import { FilterModal } from '../components/FilterModal';
import { WorkerNotFoundModal } from '../components/WorkerNotFoundModal';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { formatError } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { DistanceService } from '../services/distanceService';
import { LocationService } from '../services/locationService';

interface HomePageProps {
  onOpenChat: (userId: string, commentRef?: CommentReference | null) => void;
  onRequireAuth: () => void;
  initialWorkerId?: string | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  onOpenChat,
  onRequireAuth,
  initialWorkerId,
}) => {
  const { t, lang } = useTranslation();
  const { websiteName, websiteNameEn, websiteNameHi } = useWebsiteBranding();
  const { user, workerProfile, location: userLocation } = useAuth();

  const [welcomeText, setWelcomeText] = useState<string>('');
  const [categories, setCategories] = useState<WorkerCategory[]>([]);
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Search input state (75-80% width)
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<SearchFilterState>({});

  // Location state completely separate from filters (Issue 1)
  const [manualLocationCoords, setManualLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [locationDetecting, setLocationDetecting] = useState(false);

  const isLocationActive = Boolean(manualLocationCoords && locationName);

  // Saved profile location resolution (same source and logic as Profile / Worker Card)
  const savedProfileLocation = useMemo(() => {
    if (userLocation) return userLocation;
    if (workerProfile?.location) return workerProfile.location;
    if (user?.location) return user.location;
    const profileLocs = (user as any)?.locations;
    if (profileLocs) {
      if (Array.isArray(profileLocs)) return profileLocs[0] || null;
      return profileLocs;
    }
    return null;
  }, [userLocation, workerProfile, user]);

  // Formatted saved profile location text (reusing LocationService.formatWorkerCard)
  const savedLocationText = useMemo(() => {
    const formatted = LocationService.formatWorkerCard(savedProfileLocation, '', lang);
    if (formatted) return formatted;
    if (user?.address?.trim()) return user.address.trim();
    return '';
  }, [savedProfileLocation, lang, user?.address]);

  // Detect current location (reusing Search-page implementation, never pollutes filters)
  const handleDetectLocation = async () => {
    setLocationDetecting(true);
    const pos = await LocationService.getCurrentPosition();
    setLocationDetecting(false);
    if (pos) {
      const coords = { lat: pos.latitude, lng: pos.longitude };
      setManualLocationCoords(coords);
      setDeviceCoords(coords);
      const rev = await LocationService.reverseGeocode(pos.latitude, pos.longitude);
      if (rev) {
        setLocationName(`${rev.place}, ${rev.district}`);
      } else {
        setLocationName('वर्तमान स्थान');
      }
    } else {
      setErrorMsg('लोकेशन अनुमति नहीं मिली। कृपया मैन्युअल रूप से खोजें।');
    }
  };

  // Remove ONLY location state, preserving all active filters (Issue 1)
  const handleClearLocation = () => {
    setManualLocationCoords(null);
    setLocationName('');
    setDeviceCoords(null);
  };

  // Viewer actual coordinates state from device GPS / last known position
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const last = LocationService.getLastKnownPosition();
    return last ? { lat: Number(last.latitude), lng: Number(last.longitude) } : null;
  });

  // Request actual device position on mount so viewer coordinates are available automatically
  useEffect(() => {
    let isMounted = true;
    LocationService.getCurrentPosition()
      .then((pos) => {
        if (isMounted && pos) {
          setDeviceCoords({ lat: pos.latitude, lng: pos.longitude });
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Active / default user coordinates for distance calculation
  const activeUserCoords = useMemo(() => {
    // 1. Manually applied live location
    if (manualLocationCoords) {
      return manualLocationCoords;
    }
    // 2. Viewer actual profile coordinates (if logged in)
    const profileCoords = DistanceService.extractCoordinates(userLocation);
    if (profileCoords) {
      return profileCoords;
    }
    // 3. Viewer actual device coordinates (from GPS or sessionStorage)
    if (deviceCoords) {
      return deviceCoords;
    }
    // 4. Last known position fallback
    const lastPos = LocationService.getLastKnownPosition();
    if (lastPos) {
      return { lat: Number(lastPos.latitude), lng: Number(lastPos.longitude) };
    }
    return null;
  }, [manualLocationCoords, userLocation, deviceCoords]);

  // 20 KM Distance Slot & Preference Ranking for Home Worker Cards (Part 6, 7, 8, 11)
  const sortedWorkers = useMemo(() => {
    return DistanceService.sortByDistanceSlotAndPreference(
      workers,
      (w) => {
        const loc = w.location || w.profile?.location;
        if (!activeUserCoords || !loc) return null;
        return DistanceService.calculateHaversineDistanceKm(activeUserCoords, loc);
      },
      (w) => w.priority_points ?? 50,
      (w) => w.created_at
    );
  }, [workers, activeUserCoords]);

  // Modals
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerProfile | null>(null);
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false);

  // Restore worker modal on refresh / initialWorkerId change (Point 1 & Issue 2)
  useEffect(() => {
    if (initialWorkerId) {
      WorkerService.getWorkerDetail(initialWorkerId).then((w) => {
        if (w) setSelectedWorker(w);
      });
    } else {
      setSelectedWorker(null);
    }
  }, [initialWorkerId]);

  // Back navigation hierarchy for worker details modal (Point 5 & Issue 3)
  useEffect(() => {
    const handlePopState = () => {
      if (!window.location.hash.includes('worker=')) {
        setSelectedWorker(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenDetail = (worker: WorkerProfile) => {
    setSelectedWorker(worker);
    window.history.pushState(
      { tab: 'home', workerId: worker.user_id },
      '',
      `#home?worker=${encodeURIComponent(worker.user_id)}`
    );
  };

  const handleCloseDetail = () => {
    setSelectedWorker(null);
    if (window.location.hash.includes('worker=')) {
      window.history.back();
    }
  };

  // Load welcome text and categories in parallel
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      try {
        const [settingsRes, catRes] = await Promise.allSettled([
          AdminService.getSettings(),
          WorkerService.getCategories(),
        ]);
        if (!isMounted) return;
        if (settingsRes.status === 'fulfilled') {
          const s = settingsRes.value;
          setWelcomeText(lang === 'hi' ? s.home_welcome_hi : s.home_welcome_en);
        }
        if (catRes.status === 'fulfilled') {
          setCategories(catRes.value);
        }
      } catch (err) {
        console.error('Meta load error:', err);
      }
    }
    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [lang]);

  // Helper to ensure filters have user coordinates when radiusKm is specified
  const attachUserCoordsToFilters = useCallback(
    (appliedFilters: SearchFilterState): SearchFilterState => {
      const copy: SearchFilterState = { ...appliedFilters };
      if (copy.radiusKm && (copy.userLat === undefined || copy.userLng === undefined)) {
        if (activeUserCoords) {
          copy.userLat = activeUserCoords.lat;
          copy.userLng = activeUserCoords.lng;
        }
      }
      return copy;
    },
    [activeUserCoords]
  );

  // Load initial workers (20 items, Section 25)
  const loadWorkers = useCallback(
    async (appliedFilters: SearchFilterState, showLoading = true) => {
      if (showLoading) setIsLoading(true);
      setErrorMsg(null);
      try {
        const filtersWithLocation = attachUserCoordsToFilters(appliedFilters);
        const res = await WorkerService.getWorkers(filtersWithLocation, 0, 20);
        setWorkers(res.workers);
        setHasMore(res.hasMore);
      } catch (err) {
        setErrorMsg(formatError(err, lang));
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [lang, attachUserCoordsToFilters]
  );

  useEffect(() => {
    loadWorkers(filters);
  }, [loadWorkers, filters]);

  // Auto-retry when internet connectivity returns without reloading the application
  useEffect(() => {
    const handleOnline = () => {
      // Revalidate in background without wiping UI or showing full spinner
      loadWorkers(filters, false);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadWorkers, filters]);

  // Real-time worker search as user types with 300ms debounce (Requirement 22)
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => {
        const nextTerm = searchInput.trim() || undefined;
        if (prev.searchTerm === nextTerm) return prev;
        return { ...prev, searchTerm: nextTerm };
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Handle Search Execution (Dismiss keyboard on search button tap, Requirement 22)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    (document.activeElement as HTMLElement)?.blur();
    setFilters((prev) => ({
      ...prev,
      searchTerm: searchInput.trim() || undefined,
    }));
  };

  // Load 10 more on Show More (Section 25)
  const handleShowMore = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const filtersWithLocation = attachUserCoordsToFilters(filters);
      const res = await WorkerService.getWorkers(filtersWithLocation, workers.length, 10);
      setWorkers((prev) => [...prev, ...res.workers]);
      setHasMore(res.hasMore);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Determine if any actual filter criteria is active (category, radius, price, experience)
  // Location (manualLocationCoords, locationName) is completely separate from filters (Issue 1)
  const hasActiveFilters = Boolean(
    filters.categoryId ||
    filters.radiusKm ||
    filters.maxPricePerDay ||
    filters.minExperienceYears
  );

  // If filters are active, pressing the filter button clears all filters and updates results;
  // It NEVER removes the active location.
  const handleFilterButtonClick = () => {
    if (hasActiveFilters) {
      setFilters((prev) => ({
        ...prev,
        categoryId: undefined,
        radiusKm: undefined,
        maxPricePerDay: undefined,
        minExperienceYears: undefined,
      }));
    } else {
      setIsFilterOpen(true);
    }
  };

  return (
    <div className="pb-24 pt-2 px-3 max-w-4xl mx-auto">
      {/* Admin editable welcome message below header (Section 27 & 76) */}
      <div className="text-center py-0 px-2">
        <h1
          style={{ fontSize: '20px' }}
          className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight"
        >
          {welcomeText
            ? welcomeText
                .replace(/काम\s*मित्र/g, websiteNameHi)
                .replace(/Kaam\s*Mitra/gi, websiteNameEn)
                .replace(/KaamMitra/gi, websiteNameEn)
            : lang === 'hi'
            ? `${websiteName} आपका स्वागत करता है`
            : `Welcome to ${websiteName}`}
        </h1>
        <p
          style={{ fontSize: '13px' }}
          className="text-xs text-slate-500 mt-0.5"
        >
          {lang === 'hi'
            ? 'अपनी जरूरत के अनुसार कुशल स्थानीय सेवा प्रदाता सीधे खोजें'
            : 'Find reliable local service providers directly in your area'}
        </p>
      </div>

      {/* Search area: Search input (75-80%) + Filter button (20-25%), same height, no mic (Section 27) */}
      <form onSubmit={handleSearchSubmit} className="mt-3 mb-[6px] px-[5px] pt-0 flex items-center gap-2">
        {/* Search input (75-80%) */}
        <div className="relative flex-[4] sm:flex-[4.5] min-w-0">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full h-[38px] pl-3.5 pr-10 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-teal-700 shadow-2xs transition"
          />
          {/* Search Icon on right of input (Section 27) */}
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-1 top-1 bottom-1 px-2.5 text-slate-500 hover:text-teal-800 active:scale-95 transition flex items-center justify-center rounded-lg"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Filter button (20-25%): "फिल्टर" when no filters, becomes "फिल्टर हटाएँ" when filters active */}
        <button
          type="button"
          onClick={handleFilterButtonClick}
          className={`flex-1 min-w-[70px] h-[38px] px-2.5 rounded-xl border font-semibold text-xs flex items-center justify-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer ${
            hasActiveFilters
              ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-400'
              : 'border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700'
          }`}
          title={hasActiveFilters ? 'फ़िल्टर हटाएं' : 'फ़िल्टर लगाएं'}
        >
          {hasActiveFilters ? (
            <>
              <X className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="truncate">फिल्टर हटाएँ</span>
            </>
          ) : (
            <>
              <Filter className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span className="truncate">{t.filter}</span>
            </>
          )}
        </button>
      </form>

      {/* Current Location Control directly below search area (reusing Search-page control) */}
      <div className="mb-3">
        <div className="flex items-center justify-center gap-2.5">
          {!isLocationActive ? (
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={locationDetecting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 bg-slate-50 hover:bg-teal-50/80 active:bg-teal-100/70 text-slate-800 hover:text-teal-900 border border-slate-200 hover:border-teal-400/60 rounded-xl font-semibold text-xs shadow-2xs hover:shadow-xs transition duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed select-none min-h-[34px]"
            >
              {locationDetecting ? (
                <Loader2 className="w-3.5 h-3.5 text-teal-700 animate-spin shrink-0" />
              ) : (
                <Navigation className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              )}
              <span style={{ fontSize: '13px' }} className="truncate">
                {locationDetecting ? 'लोकेशन पहचानी जा रही है...' : 'लोकेशन का उपयोग करें'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClearLocation}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 hover:border-rose-400 rounded-xl font-semibold text-xs shadow-2xs hover:shadow-xs transition duration-150 active:scale-[0.98] cursor-pointer select-none min-h-[34px]"
              title="लोकेशन हटाएं"
            >
              <X className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span style={{ fontSize: '13px' }} className="truncate">
                {lang === 'hi' ? 'लोकेशन हटाएँ' : 'Remove Location'}{' '}
                {locationName ? `(${LocationService.localizeDisplayString(locationName, lang)})` : ''}
              </span>
            </button>
          )}
        </div>

        {/* Saved Profile Location display (visible only when live location is inactive and user has a saved location) */}
        {!isLocationActive && savedLocationText && (
          <div className="mt-2 px-2 flex items-center justify-center text-center text-xs text-slate-600 leading-snug mx-auto max-w-xl">
            <div style={{ fontSize: '13px' }} className="whitespace-normal break-words text-center">
              <span className="font-semibold text-slate-700">
                {lang === 'hi' ? 'वर्तमान लोकेशन: ' : 'Saved Location: '}
              </span>
              <span className="text-slate-600">{savedLocationText}</span>
            </div>
          </div>
        )}
      </div>

      {/* Active filter chips below the filter area */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
          <span className="text-slate-600 text-xs font-bold">लागू फिल्टर:</span>
          {filters.categoryId && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-medium shadow-2xs">
              <span>{categories.find((c) => c.id === filters.categoryId)?.name_hi || 'श्रेणी'}</span>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, categoryId: undefined }))}
                className="hover:text-rose-600 p-0.5 cursor-pointer"
                title="हटाएं"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.radiusKm && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-medium shadow-2xs">
              <span>{filters.radiusKm} km</span>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, radiusKm: undefined }))}
                className="hover:text-rose-600 p-0.5 cursor-pointer"
                title="हटाएं"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.maxPricePerDay && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-medium shadow-2xs">
              <span>₹{filters.maxPricePerDay}/दिन तक</span>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, maxPricePerDay: undefined }))}
                className="hover:text-rose-600 p-0.5 cursor-pointer"
                title="हटाएं"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.minExperienceYears && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-medium shadow-2xs">
              <span>{filters.minExperienceYears}+ वर्ष अनुभव</span>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, minExperienceYears: undefined }))}
                className="hover:text-rose-600 p-0.5 cursor-pointer"
                title="हटाएं"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {errorMsg && (
        <div className="p-4 my-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs sm:text-sm flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{errorMsg}</p>
              <p className="text-[11px] text-amber-700 mt-1">
                यदि Supabase डेटाबेस अभी नया या पॉज्ड है, तो कृपया Dashboard में SQL Migration चलाएं।
              </p>
            </div>
          </div>
          <button
            onClick={() => loadWorkers(filters)}
            className="p-1.5 text-amber-800 hover:bg-amber-100 rounded-lg transition shrink-0"
            title={t.retry}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">{t.loading}</p>
        </div>
      ) : workers.length === 0 ? (
        /* Empty State: ABSOLUTELY NO FAKE DATA (Section 5) */
        <div className="py-16 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-300 my-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h3 className="text-base font-bold text-slate-800">{t.noWorkersFound}</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {lang === 'hi'
              ? 'वर्तमान में इस श्रेणी या क्षेत्र में कोई सेवा प्रदाता पंजीकृत नहीं है। आप सीधे सर्विस की जरूरत दर्ज कर सकते हैं।'
              : 'No service providers currently registered matching these filters. You can submit a request below.'}
          </p>
        </div>
      ) : (
        /* Real Workers Grid */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedWorkers.map((worker) => (
              <WorkerCard
                key={worker.user_id}
                worker={worker}
                onOpenDetail={handleOpenDetail}
                onOpenChat={onOpenChat}
                onRequireAuth={onRequireAuth}
                currentUserCoords={activeUserCoords}
                hideActions={true}
                showAudioShortcut={true}
              />
            ))}
          </div>

          {/* Show More Button (10 additional workers, Section 25) */}
          {hasMore && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleShowMore}
                disabled={isLoadingMore}
                className="px-6 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-semibold text-xs shadow-2xs transition disabled:opacity-50"
              >
                {isLoadingMore ? t.loading : t.showMore}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        categories={categories}
        currentFilters={filters}
        onApplyFilters={(f) => setFilters(f)}
      />

      {/* Worker Detail Modal */}
      <WorkerDetailModal
        worker={selectedWorker}
        onClose={handleCloseDetail}
        onOpenChat={onOpenChat}
        onRequireAuth={onRequireAuth}
      />

      {/* Worker Not Found Request Modal */}
      <WorkerNotFoundModal
        isOpen={isNotFoundModalOpen}
        onClose={() => setIsNotFoundModalOpen(false)}
        categories={categories}
      />
    </div>
  );
};
