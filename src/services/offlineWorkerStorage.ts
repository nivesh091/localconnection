import { WorkerProfile, WorkerCategory, SearchFilterState } from '../types';
import { safeStorage } from '../lib/storage';
import { DistanceService } from './distanceService';
import { LocationService } from './locationService';

const STORAGE_KEY_WORKERS = 'kaammitra_offline_workers_v1';
const STORAGE_KEY_DETAILS = 'kaammitra_offline_details_v1';
const STORAGE_KEY_SEARCH = 'kaammitra_offline_search_v1';
const STORAGE_KEY_CATEGORIES = 'kaammitra_offline_categories_v1';

const MAX_OFFLINE_WORKERS = 150;
const MAX_SEARCH_QUERIES = 40;
const MAX_OFFLINE_DETAILS = 50;

interface StoredWorkerEntry {
  worker: WorkerProfile;
  updatedAt: number;
}

interface StoredSearchEntry {
  cacheKey: string;
  result: {
    workers: WorkerProfile[];
    hasMore: boolean;
  };
  updatedAt: number;
}

/**
 * Service Worker & Local Storage offline persistence layer
 * Ensures worker profiles, search results, and categories remain accessible
 * when network is unstable, intermittent, or completely offline.
 */
export class OfflineWorkerStorage {
  /**
   * Save a list of worker profiles to offline storage
   */
  static saveWorkers(workers: WorkerProfile[]): void {
    if (!workers || workers.length === 0) return;

    try {
      const existing = this.getWorkersMap();
      const now = Date.now();

      for (const w of workers) {
        if (!w || !w.user_id) continue;
        const prev = existing[w.user_id];
        // Merge without losing existing detailed fields like voice_recording or work_photos
        existing[w.user_id] = {
          worker: {
            ...prev?.worker,
            ...w,
            voice_recording: w.voice_recording || prev?.worker?.voice_recording || null,
            work_photos: w.work_photos && w.work_photos.length > 0 ? w.work_photos : prev?.worker?.work_photos || [],
          },
          updatedAt: now,
        };
      }

      // Trim oldest if exceeds MAX_OFFLINE_WORKERS to prevent quota issues
      const entries = Object.entries(existing);
      if (entries.length > MAX_OFFLINE_WORKERS) {
        entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
        const trimmed = Object.fromEntries(entries.slice(0, MAX_OFFLINE_WORKERS));
        safeStorage.setItem(STORAGE_KEY_WORKERS, JSON.stringify(trimmed));
      } else {
        safeStorage.setItem(STORAGE_KEY_WORKERS, JSON.stringify(existing));
      }
    } catch (err) {
      console.warn('[OfflineWorkerStorage] Failed to save workers:', err);
    }
  }

  /**
   * Remove a worker completely from offline storage (used when account is deleted)
   */
  static removeWorker(userId: string): void {
    if (!userId) return;
    try {
      // 1. Remove from general workers map
      const existing = this.getWorkersMap();
      if (existing[userId]) {
        delete existing[userId];
        safeStorage.setItem(STORAGE_KEY_WORKERS, JSON.stringify(existing));
      }

      // 2. Remove from dedicated details cache
      const detailsMap = this.getDetailsMap();
      if (detailsMap[userId]) {
        delete detailsMap[userId];
        safeStorage.setItem(STORAGE_KEY_DETAILS, JSON.stringify(detailsMap));
      }

      // 3. Clear stored searches so deleted worker no longer appears in cached search results
      safeStorage.removeItem(STORAGE_KEY_SEARCH);
    } catch (err) {
      console.warn('[OfflineWorkerStorage] Failed to remove worker from offline storage:', err);
    }
  }

  /**
   * Save full worker profile details (including media/voice/photos)
   */
  static saveWorkerDetail(worker: WorkerProfile): void {
    if (!worker || !worker.user_id) return;

    try {
      // 1. Update general workers map
      this.saveWorkers([worker]);

      // 2. Update dedicated details cache
      const detailsMap = this.getDetailsMap();
      detailsMap[worker.user_id] = {
        worker,
        updatedAt: Date.now(),
      };

      // Trim if needed
      const entries = Object.entries(detailsMap);
      if (entries.length > MAX_OFFLINE_DETAILS) {
        entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
        safeStorage.setItem(
          STORAGE_KEY_DETAILS,
          JSON.stringify(Object.fromEntries(entries.slice(0, MAX_OFFLINE_DETAILS)))
        );
      } else {
        safeStorage.setItem(STORAGE_KEY_DETAILS, JSON.stringify(detailsMap));
      }
    } catch (err) {
      console.warn('[OfflineWorkerStorage] Failed to save worker detail:', err);
    }
  }

  /**
   * Retrieve cached worker detail for offline viewing
   */
  static getWorkerDetail(userId: string): WorkerProfile | null {
    if (!userId) return null;
    try {
      // Check details map first
      const detailsMap = this.getDetailsMap();
      if (detailsMap[userId]?.worker) {
        return detailsMap[userId].worker;
      }

      // Check general workers map
      const workersMap = this.getWorkersMap();
      if (workersMap[userId]?.worker) {
        return workersMap[userId].worker;
      }
    } catch (err) {
      console.warn('[OfflineWorkerStorage] Failed to get worker detail:', err);
    }
    return null;
  }

  /**
   * Save exact search query results
   */
  static saveSearchResult(
    cacheKey: string,
    result: { workers: WorkerProfile[]; hasMore: boolean }
  ): void {
    if (!cacheKey || !result) return;
    try {
      const searchMap = this.getSearchMap();
      searchMap[cacheKey] = {
        cacheKey,
        result,
        updatedAt: Date.now(),
      };

      // Trim
      const entries = Object.entries(searchMap);
      if (entries.length > MAX_SEARCH_QUERIES) {
        entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
        safeStorage.setItem(
          STORAGE_KEY_SEARCH,
          JSON.stringify(Object.fromEntries(entries.slice(0, MAX_SEARCH_QUERIES)))
        );
      } else {
        safeStorage.setItem(STORAGE_KEY_SEARCH, JSON.stringify(searchMap));
      }

      // Also index individual workers into workers map
      if (result.workers.length > 0) {
        this.saveWorkers(result.workers);
      }
    } catch (err) {
      console.warn('[OfflineWorkerStorage] Failed to save search result:', err);
    }
  }

  /**
   * Get exact cached search query result
   */
  static getSearchResult(
    cacheKey: string
  ): { workers: WorkerProfile[]; hasMore: boolean } | null {
    if (!cacheKey) return null;
    try {
      const searchMap = this.getSearchMap();
      const entry = searchMap[cacheKey];
      if (entry && entry.result) {
        return entry.result;
      }
    } catch {}
    return null;
  }

  /**
   * Offline Search Engine: Filter and sort all cached workers locally
   * when offline or when network query fails.
   */
  static searchWorkersOffline(
    filters: SearchFilterState = {},
    offset = 0,
    limit = 20
  ): { workers: WorkerProfile[]; hasMore: boolean; isOffline: boolean } {
    try {
      const workersMap = this.getWorkersMap();
      let allWorkers = Object.values(workersMap).map((e) => e.worker);

      if (allWorkers.length === 0) {
        return { workers: [], hasMore: false, isOffline: true };
      }

      // 1. Exclude inactive workers
      allWorkers = allWorkers.filter((w) => w.is_active !== false);

      // 2. Category filtering
      if (filters.categoryId) {
        if (filters.categoryId.startsWith('worker_cat:')) {
          const rawNorm = decodeURIComponent(
            filters.categoryId.replace(/^worker_cat:/, '')
          ).toLowerCase();
          allWorkers = allWorkers.filter((w) =>
            (w.other_category || '').toLowerCase().includes(rawNorm)
          );
        } else {
          allWorkers = allWorkers.filter(
            (w) => w.category_id === filters.categoryId
          );
        }
      }

      // 3. Search term filtering across text fields
      if (filters.searchTerm && filters.searchTerm.trim()) {
        const term = filters.searchTerm.trim().toLowerCase();
        allWorkers = allWorkers.filter((w) => {
          const name = w.profile?.name?.toLowerCase() || '';
          const catHi = w.category?.name_hi?.toLowerCase() || '';
          const catEn = w.category?.name_en?.toLowerCase() || '';
          const other = w.other_category?.toLowerCase() || '';
          const about = w.about_text?.toLowerCase() || '';
          const place = w.location?.place?.toLowerCase() || '';
          const district = w.location?.district?.toLowerCase() || '';
          const landmark = w.location?.landmark?.toLowerCase() || '';
          const skills = typeof (w as any).skills === 'string' ? (w as any).skills.toLowerCase() : '';
          return (
            name.includes(term) ||
            catHi.includes(term) ||
            catEn.includes(term) ||
            other.includes(term) ||
            about.includes(term) ||
            place.includes(term) ||
            district.includes(term) ||
            landmark.includes(term) ||
            skills.includes(term)
          );
        });
      }

      // 4. Max price per day filter
      if (filters.maxPricePerDay && filters.maxPricePerDay > 0) {
        allWorkers = allWorkers.filter(
          (w) => (w.price_per_day || 0) <= filters.maxPricePerDay!
        );
      }

      // 5. Min experience years filter
      if (filters.minExperienceYears && filters.minExperienceYears > 0) {
        allWorkers = allWorkers.filter(
          (w) => (w.experience_years || 0) >= filters.minExperienceYears!
        );
      }

      // 6. Radius filtering (Haversine formula)
      if (filters.radiusKm !== undefined && filters.radiusKm > 0) {
        let userCoords: { lat: number; lng: number } | null = null;
        if (filters.userLat !== undefined && filters.userLng !== undefined) {
          userCoords = { lat: Number(filters.userLat), lng: Number(filters.userLng) };
        } else {
          const lastPos = LocationService.getLastKnownPosition();
          if (lastPos) {
            userCoords = { lat: Number(lastPos.latitude), lng: Number(lastPos.longitude) };
          }
        }

        if (userCoords) {
          allWorkers = allWorkers.filter((w) => {
            const workerLoc = w.location || (w.profile as any)?.locations?.[0] || null;
            if (!workerLoc) return false;
            const distKm = DistanceService.calculateHaversineDistanceKm(userCoords, workerLoc);
            if (distKm === null) return false;
            const roundedDist = Math.round(distKm * 10) / 10;
            return roundedDist <= filters.radiusKm!;
          });
        }
      }

      // 7. Sort by priority_points DESC, then created_at DESC
      allWorkers.sort((a, b) => {
        const pA = a.priority_points || 0;
        const pB = b.priority_points || 0;
        if (pB !== pA) return pB - pA;
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA;
      });

      // 8. Pagination slice
      const paginated = allWorkers.slice(offset, offset + limit);
      const hasMore = offset + limit < allWorkers.length;

      return {
        workers: paginated,
        hasMore,
        isOffline: true,
      };
    } catch (err) {
      console.warn('[OfflineWorkerStorage] Offline search error:', err);
      return { workers: [], hasMore: false, isOffline: true };
    }
  }

  /**
   * Save categories offline
   */
  static saveCategories(categories: WorkerCategory[]): void {
    if (!categories || categories.length === 0) return;
    try {
      safeStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
    } catch {}
  }

  /**
   * Retrieve cached categories offline
   */
  static getCategories(): WorkerCategory[] {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [];
  }

  /**
   * Total cached workers count
   */
  static getCachedWorkersCount(): number {
    try {
      return Object.keys(this.getWorkersMap()).length;
    } catch {
      return 0;
    }
  }

  private static getWorkersMap(): Record<string, StoredWorkerEntry> {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY_WORKERS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  private static getDetailsMap(): Record<string, StoredWorkerEntry> {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY_DETAILS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  private static getSearchMap(): Record<string, StoredSearchEntry> {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY_SEARCH);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }
}
