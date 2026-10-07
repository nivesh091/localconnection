import { supabase, isSchemaCacheError, withNetworkRetry } from '../lib/supabase';
import { WorkerProfile, WorkerCategory, SearchFilterState, WorkerMedia } from '../types';
import { LocationService } from './locationService';
import { DistanceService } from './distanceService';
import {
  parseWorkerMetadata,
  serializeWorkerMetadata,
  extractAboutAndMetadata,
  appendMetadataToAbout,
} from './workerMetadata';
import { OfflineWorkerStorage } from './offlineWorkerStorage';

let mapCacheInvalidator: (() => void) | null = null;
export function setMapCacheInvalidator(fn: () => void): void {
  mapCacheInvalidator = fn;
}

let cachedExtendedSupport: { worker: boolean; profile: boolean } | null = null;
let extendedSupportInFlight: Promise<{ worker: boolean; profile: boolean }> | null = null;

export async function checkExtendedSchemaSupport(): Promise<{ worker: boolean; profile: boolean }> {
  if (cachedExtendedSupport) return cachedExtendedSupport;
  if (extendedSupportInFlight) return extendedSupportInFlight;

  extendedSupportInFlight = (async () => {
    try {
      const [{ error: wErr }, { error: pErr }] = await Promise.all([
        supabase.from('worker_profiles').select('is_active').limit(1),
        supabase.from('profiles').select('is_mobile_public').limit(1),
      ]);
      const res = {
        worker: !wErr,
        profile: !pErr,
      };
      cachedExtendedSupport = res;
      return res;
    } catch {
      return { worker: false, profile: false };
    } finally {
      extendedSupportInFlight = null;
    }
  })();

  return extendedSupportInFlight;
}

export const BASE_WORKER_COLUMNS = `
  user_id,
  category_id,
  other_category,
  experience_years,
  price_per_day,
  about_text,
  priority_points,
  created_at,
  updated_at,
  category:categories(id, name_hi, name_en),
  profile:profiles(id, name, mobile, address, profile_photo, locations(id, place, district, state, landmark, latitude, longitude, location_source))
`;

export function buildWorkerSelectQuery(support: { worker: boolean; profile: boolean }): string {
  const profileCols = support.profile
    ? 'id, name, mobile, is_mobile_public, address, profile_photo, locations(id, place, district, state, landmark, latitude, longitude, location_source)'
    : 'id, name, mobile, address, profile_photo, locations(id, place, district, state, landmark, latitude, longitude, location_source)';

  if (support.worker) {
    return `
      user_id,
      category_id,
      other_category,
      experience_years,
      price_per_day,
      price_unit,
      custom_price_unit,
      is_active,
      about_text,
      priority_points,
      created_at,
      updated_at,
      category:categories(id, name_hi, name_en),
      profile:profiles(${profileCols})
    `;
  }

  return `
    user_id,
    category_id,
    other_category,
    experience_years,
    price_per_day,
    about_text,
    priority_points,
    created_at,
    updated_at,
    category:categories(id, name_hi, name_en),
    profile:profiles(${profileCols})
  `;
}

function normalizeCatName(name: string): string {

  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// In-memory caches for fast navigation, request deduplication, and offline resilience
let cachedCategories: { data: WorkerCategory[]; timestamp: number } | null = null;
let categoriesInFlight: Promise<WorkerCategory[]> | null = null;
const CATEGORIES_TTL = 60000;

const workersCache = new Map<string, { data: { workers: WorkerProfile[]; hasMore: boolean }; timestamp: number }>();
const workersInFlight = new Map<string, Promise<{ workers: WorkerProfile[]; hasMore: boolean }>>();
const WORKERS_TTL = 30000;

const workerDetailCache = new Map<string, { data: WorkerProfile; timestamp: number }>();
const workerDetailInFlight = new Map<string, Promise<WorkerProfile | null>>();
const WORKER_DETAIL_TTL = 60000;

// In-memory cache for fast worker validation lookups
const verifiedWorkerCache = new Map<string, boolean>();

export class WorkerService {
  static invalidateCache(userId?: string): void {
    if (userId) {
      workerDetailCache.delete(userId);
      workerDetailInFlight.delete(userId);
      verifiedWorkerCache.delete(userId);
    } else {
      workerDetailCache.clear();
      workerDetailInFlight.clear();
      verifiedWorkerCache.clear();
    }
    workersCache.clear();
    workersInFlight.clear();
    try {
      mapCacheInvalidator?.();
    } catch {}
  }

  /**
   * Synchronously returns any cached verified worker user IDs from memory or offline storage
   */
  static getCachedWorkerUserIds(userIds: string[]): Set<string> {
    const verified = new Set<string>();
    for (const id of userIds) {
      if (!id) continue;
      if (verifiedWorkerCache.get(id) === true) {
        verified.add(id);
      } else if (workerDetailCache.has(id)) {
        const w = workerDetailCache.get(id)?.data;
        if (w && w.is_active !== false) {
          verifiedWorkerCache.set(id, true);
          verified.add(id);
        }
      } else {
        const offline = OfflineWorkerStorage.getWorkerDetail(id);
        if (offline && offline.is_active !== false) {
          verifiedWorkerCache.set(id, true);
          verified.add(id);
        }
      }
    }
    return verified;
  }

  /**
   * Batch check which user IDs have a valid Worker ID / Service Provider ID in worker_profiles
   */
  static async getValidWorkerUserIds(userIds: string[]): Promise<Set<string>> {
    const verified = new Set<string>();
    const missing: string[] = [];

    for (const id of userIds) {
      if (!id) continue;
      const cached = verifiedWorkerCache.get(id);
      if (cached === true) {
        verified.add(id);
      } else if (cached === false) {
        // known non-worker
      } else if (workerDetailCache.has(id)) {
        const w = workerDetailCache.get(id)?.data;
        if (w && w.is_active !== false) {
          verifiedWorkerCache.set(id, true);
          verified.add(id);
        } else {
          verifiedWorkerCache.set(id, false);
        }
      } else {
        const offline = OfflineWorkerStorage.getWorkerDetail(id);
        if (offline && offline.is_active !== false) {
          verifiedWorkerCache.set(id, true);
          verified.add(id);
        } else {
          missing.push(id);
        }
      }
    }

    if (missing.length === 0) {
      return verified;
    }

    try {
      const { data, error } = await supabase
        .from('worker_profiles')
        .select('user_id, is_active')
        .in('user_id', missing);

      if (!error && data) {
        const activeIds = new Set<string>();
        for (const row of data as any[]) {
          if (row.is_active !== false) {
            activeIds.add(row.user_id);
          }
        }
        for (const id of missing) {
          const isAct = activeIds.has(id);
          verifiedWorkerCache.set(id, isAct);
          if (isAct) verified.add(id);
        }
        return verified;
      }
    } catch {}

    // Fallback if is_active column doesn't exist in schema
    try {
      const { data } = await supabase
        .from('worker_profiles')
        .select('user_id')
        .in('user_id', missing);

      if (data) {
        const found = new Set((data as any[]).map((r) => r.user_id));
        for (const id of missing) {
          const isW = found.has(id);
          verifiedWorkerCache.set(id, isW);
          if (isW) verified.add(id);
        }
      }
    } catch {}

    return verified;
  }

  /**
   * Fetch active categories (Both Admin-created + Automatically discovered worker categories)
   */
  static async getCategories(): Promise<WorkerCategory[]> {
    const now = Date.now();
    if (cachedCategories && now - cachedCategories.timestamp < CATEGORIES_TTL) {
      return cachedCategories.data;
    }

    if (categoriesInFlight) {
      return categoriesInFlight;
    }

    categoriesInFlight = (async () => {
      try {
        const { data: adminCats, error } = await supabase
          .from('categories')
          .select('*')
          .eq('is_active', true)
          .order('name_hi', { ascending: true });

        if (error && !isSchemaCacheError(error)) {
          console.error('Error fetching categories:', error);
        }

        const normalizedKnown = new Set<string>();
        const result: WorkerCategory[] = [];

        // 1. Add all active Admin categories
        for (const cat of adminCats || []) {
          if (cat.name_hi) normalizedKnown.add(normalizeCatName(cat.name_hi));
          if (cat.name_en) normalizedKnown.add(normalizeCatName(cat.name_en));
          result.push(cat);
        }

        // 2. Discover worker-created categories from worker_profiles
        try {
          const { data: workerCats } = await supabase
            .from('worker_profiles')
            .select('other_category')
            .not('other_category', 'is', null);

          if (workerCats) {
            for (const row of workerCats) {
              const raw = (row.other_category || '').trim();
              if (!raw) continue;
              const norm = normalizeCatName(raw);
              if (!normalizedKnown.has(norm)) {
                normalizedKnown.add(norm);
                result.push({
                  id: `worker_cat:${encodeURIComponent(norm)}`,
                  name_hi: raw,
                  name_en: raw,
                  is_active: true,
                });
              }
            }
          }
        } catch {
          // Ignore background error
        }

        cachedCategories = { data: result, timestamp: Date.now() };
        OfflineWorkerStorage.saveCategories(result);
        return result;
      } catch (err) {
        const offline = OfflineWorkerStorage.getCategories();
        if (offline && offline.length > 0) {
          cachedCategories = { data: offline, timestamp: Date.now() };
          return offline;
        }
        if (cachedCategories) return cachedCategories.data;
        return [];
      } finally {
        categoriesInFlight = null;
      }
    })();

    return categoriesInFlight;
  }

  /**
   * List workers with filters, ranking (Priority Points DESC, then created_at DESC)
   * Initial 20, 10 on show more (Section 25)
   */
  static async getWorkers(
    filters: SearchFilterState = {},
    offset = 0,
    limit = 20
  ): Promise<{ workers: WorkerProfile[]; hasMore: boolean }> {
    const cacheKey = JSON.stringify({ filters, offset, limit });
    const now = Date.now();

    const cached = workersCache.get(cacheKey);
    if (cached && now - cached.timestamp < WORKERS_TTL) {
      return cached.data;
    }

    if (workersInFlight.has(cacheKey)) {
      return workersInFlight.get(cacheKey)!;
    }

    // Immediate offline check: if device is offline, serve cached search or run offline search immediately
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineSearchResult = OfflineWorkerStorage.getSearchResult(cacheKey);
      if (offlineSearchResult && offlineSearchResult.workers.length > 0) {
        return offlineSearchResult;
      }
      const offlineSearch = OfflineWorkerStorage.searchWorkersOffline(filters, offset, limit);
      if (offlineSearch.workers.length > 0) {
        return { workers: offlineSearch.workers, hasMore: offlineSearch.hasMore };
      }
    }

    const fetchPromise = (async () => {
      try {
        let rawData: any[] | null = null;

        const support = await checkExtendedSchemaSupport();
        const selectCols = buildWorkerSelectQuery(support);

        const buildQuery = (columns: string) => {
          let q = supabase
            .from('worker_profiles')
            .select(columns as any)
            .order('priority_points', { ascending: false })
            .order('created_at', { ascending: false });

          if (filters.categoryId) {
            if (filters.categoryId.startsWith('worker_cat:')) {
              const rawNorm = decodeURIComponent(filters.categoryId.replace(/^worker_cat:/, ''));
              q = q.ilike('other_category', rawNorm);
            } else {
              q = q.eq('category_id', filters.categoryId);
            }
          }

          if (filters.maxPricePerDay && filters.maxPricePerDay > 0) {
            q = q.lte('price_per_day', filters.maxPricePerDay);
          }

          if (filters.minExperienceYears && filters.minExperienceYears > 0) {
            q = q.gte('experience_years', filters.minExperienceYears);
          }

          return q.range(offset, offset + limit - 1);
        };

        let { data, error } = await withNetworkRetry(async () => buildQuery(selectCols));

        if (error && selectCols !== BASE_WORKER_COLUMNS) {
          // If error was due to missing column (42703/PGRST204), retry with guaranteed baseline columns
          const fallbackRes = await withNetworkRetry(async () => buildQuery(BASE_WORKER_COLUMNS));
          data = fallbackRes.data;
          error = fallbackRes.error;
        }

        if (error) {
          if (isSchemaCacheError(error)) {
            console.warn('Supabase worker_profiles table not found in schema cache.');
          }
          if (cached) return cached.data;
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const offline = OfflineWorkerStorage.searchWorkersOffline(filters, offset, limit);
            if (offline.workers.length > 0) {
              return { workers: offline.workers, hasMore: offline.hasMore };
            }
          }
          // Critical: Never silently swallow database/query errors into empty array
          throw error;
        }

        rawData = data || [];

        // Check viewer identity to protect mobile numbers of private profiles (Feature 3)
        let viewerUserId: string | undefined;
        let isViewerAdmin = false;
        try {
          const { data: sessData } = await supabase.auth.getSession();
          viewerUserId = sessData?.session?.user?.id;
          const email = sessData?.session?.user?.email?.toLowerCase();
          isViewerAdmin = email === 'niveshkumar1230@gmail.com' || viewerUserId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72';
        } catch {}

        const rawList = (rawData || []) as any[];
        let list: WorkerProfile[] = rawList
          .map((row) => {
            const { about: cleanAbout, metadata: aboutMeta } = extractAboutAndMetadata(row.about_text);
            const skillsMeta = parseWorkerMetadata(row.skills);
            const profileLocations = row.profile?.locations;
            let rawLoc = Array.isArray(profileLocations)
              ? profileLocations[0] || null
              : profileLocations || null;
            let loc = LocationService.extractCanonicalLocation(rawLoc || row, row.profile?.address);

            if (loc) {
              const hasExact =
                loc.latitude !== undefined &&
                loc.latitude !== null &&
                (loc.latitude as any) !== '' &&
                !isNaN(Number(loc.latitude)) &&
                loc.longitude !== undefined &&
                loc.longitude !== null &&
                (loc.longitude as any) !== '' &&
                !isNaN(Number(loc.longitude));

              if (hasExact) {
                // ALWAYS prioritize exact numeric coordinates stored in database
                loc = {
                  ...loc,
                  latitude: Number(loc.latitude),
                  longitude: Number(loc.longitude),
                };
              } else if (loc.district) {
                // Immediate synchronous fallback while async geocoding resolves
                const districtCoords = LocationService.resolveDistrictCoordinates(loc.district);
                if (districtCoords) {
                  loc = {
                    ...loc,
                    latitude: districtCoords.latitude,
                    longitude: districtCoords.longitude,
                  };
                }
              }
            }

            const isActive =
              row.is_active !== undefined && row.is_active !== null
                ? Boolean(row.is_active)
                : aboutMeta.is_active !== undefined
                ? Boolean(aboutMeta.is_active)
                : skillsMeta.is_active !== undefined
                ? Boolean(skillsMeta.is_active)
                : true;

            const priceUnit =
              row.price_unit || aboutMeta.price_unit || skillsMeta.price_unit || 'day';
            const customPriceUnit =
              row.custom_price_unit || aboutMeta.custom_price_unit || skillsMeta.custom_price_unit || null;

            // Feature 3: Enforce mobile privacy at API/service boundary
            // In public worker discovery listings, if mobile is private, it is sanitized for all viewers (including owner), unless admin
            const isMobilePublic =
              row.profile?.is_mobile_public !== undefined && row.profile?.is_mobile_public !== null
                ? Boolean(row.profile.is_mobile_public)
                : aboutMeta.is_mobile_public !== undefined
                ? Boolean(aboutMeta.is_mobile_public)
                : skillsMeta.is_mobile_public !== undefined
                ? Boolean(skillsMeta.is_mobile_public)
                : true;

            let sanitizedMobile = row.profile?.mobile || '';
            if (!isViewerAdmin && !isMobilePublic) {
              sanitizedMobile = '';
            }

            const sanitizedProfile = row.profile
              ? {
                  ...row.profile,
                  mobile: sanitizedMobile,
                  is_mobile_public: isMobilePublic,
                  locations: loc,
                  location: loc,
                }
              : null;

            return {
              ...row,
              about_text: cleanAbout,
              price_unit: priceUnit,
              custom_price_unit: customPriceUnit,
              is_active: isActive,
              is_mobile_public: isMobilePublic,
              profile: sanitizedProfile,
              location: loc,
            } as WorkerProfile;
          });

        // Asynchronously resolve most specific coordinates for any workers missing exact coordinates
        list = await Promise.all(
          list.map(async (worker) => {
            const loc = worker.location;
            if (loc) {
              const rawProfileLoc = (worker.profile as any)?.locations;
              const hasDbExact =
                rawProfileLoc &&
                rawProfileLoc.latitude !== undefined &&
                rawProfileLoc.latitude !== null &&
                rawProfileLoc.latitude !== '' &&
                !isNaN(Number(rawProfileLoc.latitude)) &&
                rawProfileLoc.longitude !== undefined &&
                rawProfileLoc.longitude !== null &&
                rawProfileLoc.longitude !== '' &&
                !isNaN(Number(rawProfileLoc.longitude));

              // Only resolve if exact coordinates were genuinely missing from the DB
              if (!hasDbExact && (loc.place || loc.landmark || loc.district)) {
                const resolved = await LocationService.resolveLocationCoordinates({
                  village: loc.place,
                  subdistrict: loc.landmark || undefined,
                  district: loc.district,
                  state: loc.state,
                });
                if (resolved) {
                  const updatedLoc = {
                    ...loc,
                    latitude: resolved.latitude,
                    longitude: resolved.longitude,
                  };
                  return {
                    ...worker,
                    location: updatedLoc,
                    profile: worker.profile
                      ? { ...worker.profile, location: updatedLoc, locations: updatedLoc }
                      : worker.profile,
                  };
                }
              }
            }
            return worker;
          })
        );
        // Feature 1: Filter out deactivated service providers from public discovery
        list = list.filter((w) => w.is_active !== false);

        // In-memory text search filtering if search term provided
        if (filters.searchTerm && filters.searchTerm.trim()) {
          const term = filters.searchTerm.trim().toLowerCase();
          list = list.filter((w) => {
            const name = w.profile?.name?.toLowerCase() || '';
            const catHi = w.category?.name_hi?.toLowerCase() || '';
            const catEn = w.category?.name_en?.toLowerCase() || '';
            const other = w.other_category?.toLowerCase() || '';
            const about = w.about_text?.toLowerCase() || '';
            const place = w.location?.place?.toLowerCase() || '';
            const district = w.location?.district?.toLowerCase() || '';
            return (
              name.includes(term) ||
              catHi.includes(term) ||
              catEn.includes(term) ||
              other.includes(term) ||
              about.includes(term) ||
              place.includes(term) ||
              district.includes(term)
            );
          });
        }

        // Radius filtering using DistanceService and application's numeric coordinates
        if (filters.radiusKm !== undefined && filters.radiusKm > 0) {
          let userCoords: { lat: number; lng: number } | null = null;
          if (filters.userLat !== undefined && filters.userLng !== undefined) {
            userCoords = DistanceService.extractCoordinates({
              lat: filters.userLat,
              lng: filters.userLng,
            });
          } else {
            const lastPos = LocationService.getLastKnownPosition();
            if (lastPos) {
              userCoords = DistanceService.extractCoordinates({
                lat: lastPos.latitude,
                lng: lastPos.longitude,
              });
            }
          }

          if (userCoords) {
            list = list.filter((w) => {
              const workerLoc =
                w.location ||
                w.profile?.location ||
                ((w.profile as any)?.locations && Array.isArray((w.profile as any).locations)
                  ? (w.profile as any).locations[0]
                  : null);

              if (!workerLoc) return false;

              // Calculate numeric Haversine distance using existing DistanceService
              const distKm = DistanceService.calculateHaversineDistanceKm(userCoords, workerLoc);
              if (distKm === null) return false;

              // Compare actual calculated distance against selected radius (workerDistance <= selectedRadius)
              // Standard decimal rounding boundary rule (e.g. 50.04 km rounds to 50.0 km, matching worker card calculation)
              const roundedDist = Math.round(distKm * 10) / 10;
              return roundedDist <= filters.radiusKm!;
            });
          }
        }

        // 20 KM Distance Slot & Preference Ranking (Parts 6, 7, 8, 11)
        let effectiveUserCoords: { lat: number; lng: number } | null = null;
        if (filters.userLat !== undefined && filters.userLng !== undefined) {
          effectiveUserCoords = DistanceService.extractCoordinates({
            lat: filters.userLat,
            lng: filters.userLng,
          });
        } else {
          const lastPos = LocationService.getLastKnownPosition();
          if (lastPos) {
            effectiveUserCoords = DistanceService.extractCoordinates({
              lat: lastPos.latitude,
              lng: lastPos.longitude,
            });
          }
        }

        if (effectiveUserCoords) {
          list = DistanceService.sortByDistanceSlotAndPreference(
            list,
            (w) => {
              const workerLoc =
                w.location ||
                w.profile?.location ||
                ((w.profile as any)?.locations && Array.isArray((w.profile as any).locations)
                  ? (w.profile as any).locations[0]
                  : null);
              if (!workerLoc) return null;
              return DistanceService.calculateHaversineDistanceKm(effectiveUserCoords, workerLoc);
            },
            (w) => w.priority_points ?? 50,
            (w) => w.created_at
          );
        }

        // Batch load voice recordings for workers (used by home screen card audio shortcut)
        const workerUserIds = list.map((w) => w.user_id).filter(Boolean);
        if (workerUserIds.length > 0) {
          try {
            const { data: mediaList } = await supabase
              .from('worker_media')
              .select('*')
              .in('worker_user_id', workerUserIds)
              .eq('media_type', 'voice');

            if (mediaList && mediaList.length > 0) {
              const voiceMap = new Map<string, WorkerMedia>();
              for (const item of mediaList) {
                const { data: pubData } = supabase.storage
                  .from('worker-media')
                  .getPublicUrl(item.storage_path);
                voiceMap.set(item.worker_user_id, {
                  ...item,
                  public_url: pubData.publicUrl,
                });
              }
              list = list.map((w) => {
                const voice = voiceMap.get(w.user_id) || null;
                return voice ? { ...w, voice_recording: voice } : w;
              });
            }
          } catch (err) {
            console.warn('Worker voice media batch fetch warning:', err);
          }
        }

        const hasMore = (data?.length || 0) === limit;
        const result = { workers: list, hasMore };
        workersCache.set(cacheKey, { data: result, timestamp: Date.now() });
        OfflineWorkerStorage.saveWorkers(list);
        OfflineWorkerStorage.saveSearchResult(cacheKey, result);
        return result;
      } catch (err) {
        if (cached) return cached.data;
        const offlineResult = OfflineWorkerStorage.getSearchResult(cacheKey);
        if (offlineResult && offlineResult.workers.length > 0) {
          return offlineResult;
        }
        const offlineSearch = OfflineWorkerStorage.searchWorkersOffline(filters, offset, limit);
        if (offlineSearch.workers.length > 0) {
          return { workers: offlineSearch.workers, hasMore: offlineSearch.hasMore };
        }
        if (!isSchemaCacheError(err)) {
          console.error('getWorkers catch:', err);
        }
        return { workers: [], hasMore: false };
      } finally {
        workersInFlight.delete(cacheKey);
      }
    })();

    workersInFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Invalidate or update cached worker detail in-memory
   */
  static invalidateWorkerCache(userId: string): void {
    workerDetailCache.delete(userId);
    workerDetailInFlight.delete(userId);
    workersCache.clear();
  }

  static updateCachedWorkerPhotos(userId: string, photos: WorkerMedia[]): void {
    const cached = workerDetailCache.get(userId);
    if (cached) {
      cached.data = {
        ...cached.data,
        work_photos: photos,
      };
      cached.timestamp = Date.now();
    }
  }

  /**
   * Fetch full worker profile detail including voice recording and work photos
   */
  static async getWorkerDetail(userId: string, skipCache = false): Promise<WorkerProfile | null> {
    const now = Date.now();
    const cached = workerDetailCache.get(userId);
    if (!skipCache && cached && now - cached.timestamp < WORKER_DETAIL_TTL) {
      return cached.data;
    }

    // Immediate offline check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineWorker = OfflineWorkerStorage.getWorkerDetail(userId);
      if (offlineWorker) {
        return offlineWorker;
      }
    }

    if (workerDetailInFlight.has(userId)) {
      return workerDetailInFlight.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        let raw: any = null;

        const support = await checkExtendedSchemaSupport();
        const selectCols = buildWorkerSelectQuery(support);

        let { data, error } = await supabase
          .from('worker_profiles')
          .select(selectCols as any)
          .eq('user_id', userId)
          .maybeSingle();

        if (error && selectCols !== BASE_WORKER_COLUMNS) {
          const fbRes = await supabase
            .from('worker_profiles')
            .select(BASE_WORKER_COLUMNS as any)
            .eq('user_id', userId)
            .maybeSingle();
          data = fbRes.data;
          error = fbRes.error;
        }

        if (error) {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const offlineWorker = OfflineWorkerStorage.getWorkerDetail(userId);
            if (offlineWorker) return offlineWorker;
          }
          throw error;
        }

        raw = data;

        if (!raw) {
          if (cached) return cached.data;
          return null;
        }

        const { about: cleanAbout, metadata: aboutMeta } = extractAboutAndMetadata(raw.about_text);
        const meta = parseWorkerMetadata(raw.skills);

        // Check viewer identity to protect mobile numbers of private profiles (Feature 3)
        let viewerUserId: string | undefined;
        let isViewerAdmin = false;
        try {
          const { data: sessData } = await supabase.auth.getSession();
          viewerUserId = sessData?.session?.user?.id;
          const email = sessData?.session?.user?.email?.toLowerCase();
          isViewerAdmin = email === 'niveshkumar1230@gmail.com' || viewerUserId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72';
        } catch {}

        const profileLocations = raw.profile?.locations;
        let rawLoc = Array.isArray(profileLocations)
          ? profileLocations[0] || null
          : profileLocations || null;
        let loc = LocationService.extractCanonicalLocation(rawLoc || raw, raw.profile?.address);

        if (loc) {
          const hasDbExact =
            loc.latitude !== undefined &&
            loc.latitude !== null &&
            (loc.latitude as any) !== '' &&
            !isNaN(Number(loc.latitude)) &&
            loc.longitude !== undefined &&
            loc.longitude !== null &&
            (loc.longitude as any) !== '' &&
            !isNaN(Number(loc.longitude));

          if (hasDbExact) {
            loc = {
              ...loc,
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude),
            };
          } else if (loc.place || loc.landmark || loc.district) {
            // First check synchronous district coords as baseline
            if (loc.district) {
              const districtCoords = LocationService.resolveDistrictCoordinates(loc.district);
              if (districtCoords) {
                loc = {
                  ...loc,
                  latitude: districtCoords.latitude,
                  longitude: districtCoords.longitude,
                };
              }
            }
            // Asynchronously resolve most specific coordinates (village/subdistrict)
            const resolved = await LocationService.resolveLocationCoordinates({
              village: loc.place,
              subdistrict: loc.landmark || undefined,
              district: loc.district,
              state: loc.state,
            });
            if (resolved) {
              loc = {
                ...loc,
                latitude: resolved.latitude,
                longitude: resolved.longitude,
              };
            }
          }
        }

        const isActive =
          raw.is_active !== undefined && raw.is_active !== null
            ? Boolean(raw.is_active)
            : aboutMeta.is_active !== undefined
            ? Boolean(aboutMeta.is_active)
            : meta.is_active !== undefined
            ? Boolean(meta.is_active)
            : true;

        const priceUnit = raw.price_unit || aboutMeta.price_unit || meta.price_unit || 'day';
        const customPriceUnit = raw.custom_price_unit || aboutMeta.custom_price_unit || meta.custom_price_unit || null;

        const isMobilePublic =
          raw.profile?.is_mobile_public !== undefined && raw.profile?.is_mobile_public !== null
            ? Boolean(raw.profile.is_mobile_public)
            : aboutMeta.is_mobile_public !== undefined
            ? Boolean(aboutMeta.is_mobile_public)
            : meta.is_mobile_public !== undefined
            ? Boolean(meta.is_mobile_public)
            : true;

        let sanitizedMobile = raw.profile?.mobile || '';
        if (!isViewerAdmin && !isMobilePublic) {
          sanitizedMobile = '';
        }

        const sanitizedProfile = raw.profile
          ? {
              ...raw.profile,
              mobile: sanitizedMobile,
              is_mobile_public: isMobilePublic,
            }
          : null;

        const worker: WorkerProfile = {
          ...raw,
          about_text: cleanAbout,
          is_active: isActive,
          price_unit: priceUnit,
          custom_price_unit: customPriceUnit,
          is_mobile_public: isMobilePublic,
          profile: sanitizedProfile,
          location: loc,
        };

        // Fetch worker media (voice & photos)
        const { data: mediaList } = await supabase
          .from('worker_media')
          .select('*')
          .eq('worker_user_id', userId)
          .order('sort_order', { ascending: true });

        if (mediaList && mediaList.length > 0) {
          const photos: WorkerMedia[] = [];
          let voice: WorkerMedia | null = null;

          for (const item of mediaList) {
            const { data: pubData } = supabase.storage
              .from('worker-media')
              .getPublicUrl(item.storage_path);

            const fullItem = { ...item, public_url: pubData.publicUrl };
            if (item.media_type === 'voice') {
              voice = fullItem;
            } else {
              photos.push(fullItem);
            }
          }

          worker.voice_recording = voice;
          worker.work_photos = photos;
        }

        workerDetailCache.set(userId, { data: worker, timestamp: Date.now() });
        OfflineWorkerStorage.saveWorkerDetail(worker);
        return worker;
      } catch {
        if (cached) return cached.data;
        const offlineWorker = OfflineWorkerStorage.getWorkerDetail(userId);
        if (offlineWorker) {
          return offlineWorker;
        }
        return null;
      } finally {
        workerDetailInFlight.delete(userId);
      }
    })();

    workerDetailInFlight.set(userId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Save / Update Worker Profile (safely handles RLS for both insert and update)
   */
  static async saveWorkerProfile(
    userId: string,
    params: {
      category_id?: string | null;
      other_category?: string | null;
      experience_years: number;
      price_per_day: number;
      price_unit?: import('../types').PriceUnit;
      custom_price_unit?: string | null;
      is_active?: boolean;
      is_mobile_public?: boolean;
      about_text?: string | null;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Invalidate cache immediately
      workerDetailCache.delete(userId);
      workersCache.clear();

      // Check if worker profile already exists for this user and retrieve existing skills/metadata
      const { data: existing } = await supabase
        .from('worker_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const existingSkills = existing?.skills || '';
      const existingMetaSkills = parseWorkerMetadata(existingSkills);
      const { metadata: existingMetaAbout, about: cleanExistingAbout } = extractAboutAndMetadata(
        existing?.about_text
      );

      // Security: If account was deactivated by Admin, normal user edit cannot reactivate it
      const resolvedIsActive = existing
        ? existing.is_active === false ||
          existingMetaAbout.is_active === false ||
          existingMetaSkills.is_active === false
          ? false
          : params.is_active !== undefined
          ? params.is_active
          : true
        : params.is_active !== undefined
        ? params.is_active
        : true;

      const resolvedPriceUnit = params.price_unit
        ? params.price_unit === 'custom'
          ? 'other'
          : params.price_unit
        : existing
        ? existing.price_unit ||
          existingMetaAbout.price_unit ||
          existingMetaSkills.price_unit ||
          'day'
        : 'day';

      const resolvedCustomPriceUnit =
        resolvedPriceUnit === 'other' || resolvedPriceUnit === 'custom'
          ? params.custom_price_unit?.trim() || null
          : null;

      const support = await checkExtendedSchemaSupport();

      const updatedAbout = appendMetadataToAbout(
        params.about_text !== undefined ? params.about_text : cleanExistingAbout,
        {
          price_unit: resolvedPriceUnit,
          custom_price_unit: resolvedCustomPriceUnit,
          is_active: resolvedIsActive,
          is_mobile_public: params.is_mobile_public,
        },
        existing?.about_text
      );

      const payload: Record<string, any> = {
        category_id: params.category_id || null,
        other_category: params.other_category || null,
        experience_years: params.experience_years,
        price_per_day: params.price_per_day,
        about_text: updatedAbout,
        updated_at: new Date().toISOString(),
      };

      if (support.worker) {
        payload.price_unit = resolvedPriceUnit;
        payload.custom_price_unit = resolvedCustomPriceUnit;
        payload.is_active = resolvedIsActive;
      }

      const baselinePayload: Record<string, any> = {
        category_id: params.category_id || null,
        other_category: params.other_category || null,
        experience_years: params.experience_years,
        price_per_day: params.price_per_day,
        about_text: updatedAbout,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        let { error } = await supabase
          .from('worker_profiles')
          .update(payload)
          .eq('user_id', userId);

        if (error) {
          const { error: fbErr } = await supabase
            .from('worker_profiles')
            .update(baselinePayload)
            .eq('user_id', userId);
          error = fbErr;
        }

        if (error) return { success: false, error: error.message };

        WorkerService.invalidateCache(userId);
        return { success: true };
      } else {
        let { error } = await supabase
          .from('worker_profiles')
          .insert({
            user_id: userId,
            ...payload,
            priority_points: 50,
          });

        if (error) {
          if (error.code === '23505') {
            const { error: updateErr } = await supabase
              .from('worker_profiles')
              .update(payload)
              .eq('user_id', userId);
            if (updateErr) return { success: false, error: updateErr.message };
            WorkerService.invalidateCache(userId);
            return { success: true };
          }
          // Retry with baseline
          const { error: fbInsertErr } = await supabase
            .from('worker_profiles')
            .insert({
              user_id: userId,
              ...baselinePayload,
              priority_points: 50,
            });
          if (fbInsertErr) {
            return { success: false, error: fbInsertErr.message };
          }
        }

        WorkerService.invalidateCache(userId);
        return { success: true };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Delete Worker Profile ONLY (preserves user account, profile, chats, location) (Section 84 & 133)
   */
  static async deleteWorkerProfile(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      workerDetailCache.delete(userId);
      workersCache.clear();

      // 1. Fetch worker media to delete storage files
      const { data: mediaList } = await supabase
        .from('worker_media')
        .select('storage_path')
        .eq('worker_user_id', userId);

      if (mediaList && mediaList.length > 0) {
        const paths = mediaList.map((m) => m.storage_path);
        await supabase.storage.from('worker-media').remove(paths);
      }

      // 2. Delete worker media records
      await supabase.from('worker_media').delete().eq('worker_user_id', userId);

      // 3. Delete worker profile row
      const { error } = await supabase.from('worker_profiles').delete().eq('user_id', userId);

      if (error) return { success: false, error: error.message };
      workerDetailCache.delete(userId);
      workersCache.clear();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }
}
