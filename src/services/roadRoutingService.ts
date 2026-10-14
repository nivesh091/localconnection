/**
 * Road Routing & Real Road Distance Service
 *
 * Calculates real, routable road travel distance between two geographic coordinates
 * using real OpenStreetMap OSRM routing engines (with automatic mirror fallback),
 * multi-tier memory + session caching, and request deduplication.
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * - STRAIGHT-LINE DISPLACEMENT (Haversine in DistanceService) is used for geographic
 *   proximity, map radius circle rendering, and radius filtering.
 * - ROAD DISTANCE (RoadRoutingService) is used exclusively for displaying actual road
 *   travel distance to users on worker cards, search results, and worker profiles.
 * - Straight-line distance must NEVER be substituted or labeled as road distance.
 */

export interface RoadCoordinate {
  lat: number;
  lng: number;
}

export interface RoadDistanceResult {
  success: boolean;
  distanceKm: number | null;
  distanceMeters: number | null;
  durationMinutes: number | null;
  formattedCardDistance: string;
  formattedProfileDistance: string;
  isCached?: boolean;
  error?: string;
}

// In-memory cache for ultra-fast instant lookups during component re-renders
const memoryCache = new Map<string, { result: RoadDistanceResult; timestamp: number }>();

// In-flight request deduplication map to prevent multiple parallel network calls for identical coordinates
const pendingRequests = new Map<string, Promise<RoadDistanceResult>>();

// Cache expiration: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Session storage key prefix
const SESSION_CACHE_PREFIX = 'km_road_dist_';

/**
 * Creates a normalized cache key from two coordinates rounded to 4 decimal places (~11 meters precision)
 */
function createCacheKey(origin: RoadCoordinate, destination: RoadCoordinate): string {
  const oLat = origin.lat.toFixed(4);
  const oLng = origin.lng.toFixed(4);
  const dLat = destination.lat.toFixed(4);
  const dLng = destination.lng.toFixed(4);
  return `${oLat},${oLng}->${dLat},${dLng}`;
}

/**
 * Reads from sessionStorage safely (handling SSR or quota exceeded)
 */
function readSessionCache(key: string): RoadDistanceResult | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.timestamp === 'number') {
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        return parsed.result;
      }
      sessionStorage.removeItem(SESSION_CACHE_PREFIX + key);
    }
  } catch {}
  return null;
}

/**
 * Writes to sessionStorage safely
 */
function writeSessionCache(key: string, result: RoadDistanceResult): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.setItem(
      SESSION_CACHE_PREFIX + key,
      JSON.stringify({ result, timestamp: Date.now() })
    );
  } catch {}
}

export class RoadRoutingService {
  /**
   * Primary and backup routing endpoints using the OpenStreetMap OSRM network.
   * Both endpoints are free, require no secret API keys, support CORS, and compute
   * driving distances along real roads.
   */
  private static readonly ROUTING_ENDPOINTS = [
    'https://router.project-osrm.org/route/v1/driving',
    'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  ];

  /**
   * Formats distance in km for worker card display.
   * Example: "500 km दूर (सड़क मार्ग)" or "0.8 km दूर (सड़क मार्ग)"
   */
  static formatCardDistance(distanceKm: number | null, lang: 'hi' | 'en' = 'hi'): string {
    if (distanceKm === null || isNaN(distanceKm) || distanceKm < 0) {
      return lang === 'hi' ? 'सड़क मार्ग की दूरी उपलब्ध नहीं है' : 'Road distance unavailable';
    }

    let rounded: string;
    if (distanceKm < 1) {
      rounded = distanceKm.toFixed(1);
    } else if (distanceKm < 10) {
      rounded = distanceKm.toFixed(1);
    } else {
      rounded = Math.round(distanceKm).toString();
    }

    if (lang === 'hi') {
      return `${rounded} km दूर (सड़क मार्ग)`;
    }
    return `${rounded} km away (by road)`;
  }

  /**
   * Formats distance in km for worker profile display.
   * Example: "सड़क मार्ग से दूरी: लगभग 500 km"
   */
  static formatProfileDistance(distanceKm: number | null, lang: 'hi' | 'en' = 'hi'): string {
    if (distanceKm === null || isNaN(distanceKm) || distanceKm < 0) {
      return lang === 'hi' ? 'सड़क मार्ग की दूरी उपलब्ध नहीं है' : 'Road distance unavailable';
    }

    let rounded: string;
    if (distanceKm < 1) {
      rounded = distanceKm.toFixed(1);
    } else if (distanceKm < 10) {
      rounded = distanceKm.toFixed(1);
    } else {
      rounded = Math.round(distanceKm).toString();
    }

    if (lang === 'hi') {
      return `सड़क मार्ग से दूरी: लगभग ${rounded} km`;
    }
    return `Road distance: approx ${rounded} km`;
  }

  /**
   * Calculates actual road distance between origin and destination coordinates.
   *
   * @param origin - User's coordinates
   * @param destination - Worker's coordinates
   * @param lang - Hindi or English for formatted text
   * @returns RoadDistanceResult with actual road distance and localized formatted strings
   */
  static async calculateRoadDistance(
    origin?: RoadCoordinate | null,
    destination?: RoadCoordinate | null,
    lang: 'hi' | 'en' = 'hi'
  ): Promise<RoadDistanceResult> {
    // 1. Validation: check if both coordinates exist and are within valid bounds
    if (
      !origin ||
      !destination ||
      isNaN(origin.lat) ||
      isNaN(origin.lng) ||
      isNaN(destination.lat) ||
      isNaN(destination.lng) ||
      origin.lat < -90 ||
      origin.lat > 90 ||
      origin.lng < -180 ||
      origin.lng > 180 ||
      destination.lat < -90 ||
      destination.lat > 90 ||
      destination.lng < -180 ||
      destination.lng > 180
    ) {
      return {
        success: false,
        distanceKm: null,
        distanceMeters: null,
        durationMinutes: null,
        formattedCardDistance: this.formatCardDistance(null, lang),
        formattedProfileDistance: this.formatProfileDistance(null, lang),
        error: 'स्थान निर्देशांक अनुपलब्ध हैं।',
      };
    }

    // 2. Immediate zero/near-zero distance check (< 50 meters)
    const latDiff = Math.abs(origin.lat - destination.lat);
    const lngDiff = Math.abs(origin.lng - destination.lng);
    if (latDiff < 0.00045 && lngDiff < 0.00045) {
      const zeroResult: RoadDistanceResult = {
        success: true,
        distanceKm: 0,
        distanceMeters: 0,
        durationMinutes: 0,
        formattedCardDistance: lang === 'hi' ? '0 km दूर (सड़क मार्ग)' : '0 km away (by road)',
        formattedProfileDistance: lang === 'hi' ? 'सड़क मार्ग से दूरी: 0 km' : 'Road distance: 0 km',
        isCached: true,
      };
      return zeroResult;
    }

    const cacheKey = createCacheKey(origin, destination);

    // 3. In-memory Cache Check
    const mem = memoryCache.get(cacheKey);
    if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
      return {
        ...mem.result,
        formattedCardDistance: this.formatCardDistance(mem.result.distanceKm, lang),
        formattedProfileDistance: this.formatProfileDistance(mem.result.distanceKm, lang),
        isCached: true,
      };
    }

    // 4. Session Storage Check
    const sess = readSessionCache(cacheKey);
    if (sess) {
      memoryCache.set(cacheKey, { result: sess, timestamp: Date.now() });
      return {
        ...sess,
        formattedCardDistance: this.formatCardDistance(sess.distanceKm, lang),
        formattedProfileDistance: this.formatProfileDistance(sess.distanceKm, lang),
        isCached: true,
      };
    }

    // 5. In-flight Request Deduplication
    if (pendingRequests.has(cacheKey)) {
      const inFlight = await pendingRequests.get(cacheKey)!;
      return {
        ...inFlight,
        formattedCardDistance: this.formatCardDistance(inFlight.distanceKm, lang),
        formattedProfileDistance: this.formatProfileDistance(inFlight.distanceKm, lang),
      };
    }

    // 6. Network Fetch with Timeout and Automatic Mirror Fallback
    const fetchPromise = (async (): Promise<RoadDistanceResult> => {
      let lastError: string | null = null;

      for (const endpoint of this.ROUTING_ENDPOINTS) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6500);

          // OSRM expects coordinates in lng,lat order
          const url = `${endpoint}/${origin.lng.toFixed(6)},${origin.lat.toFixed(6)};${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}?overview=false&alternatives=false&steps=false`;

          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
            },
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            lastError = `HTTP error ${response.status}`;
            continue;
          }

          const data = await response.json();

          if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
            const primaryRoute = data.routes[0];
            const distanceMeters = Number(primaryRoute.distance);
            const durationSeconds = Number(primaryRoute.duration);

            if (!isNaN(distanceMeters) && distanceMeters >= 0) {
              const distanceKm = distanceMeters / 1000;
              const durationMinutes = Math.round(durationSeconds / 60);

              const result: RoadDistanceResult = {
                success: true,
                distanceKm,
                distanceMeters,
                durationMinutes,
                formattedCardDistance: this.formatCardDistance(distanceKm, lang),
                formattedProfileDistance: this.formatProfileDistance(distanceKm, lang),
              };

              // Populate caches
              memoryCache.set(cacheKey, { result, timestamp: Date.now() });
              writeSessionCache(cacheKey, result);

              return result;
            }
          } else if (data && data.code === 'NoRoute') {
            lastError = 'सड़क मार्ग उपलब्ध नहीं है।';
            break; // Valid response indicating no routable road exists between these points
          }
        } catch (err: any) {
          lastError = err?.name === 'AbortError' ? 'समय समाप्त (Timeout)' : err?.message || 'नेटवर्क त्रुटि';
        }
      }

      // If all endpoints failed or no road route is found:
      // STRICT REQUIREMENT: NEVER fall back to Haversine straight-line distance.
      // Return clear fallback message as explicitly required.
      const failureResult: RoadDistanceResult = {
        success: false,
        distanceKm: null,
        distanceMeters: null,
        durationMinutes: null,
        formattedCardDistance: this.formatCardDistance(null, lang),
        formattedProfileDistance: this.formatProfileDistance(null, lang),
        error: lastError || 'सड़क मार्ग की दूरी उपलब्ध नहीं है',
      };

      return failureResult;
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Synchronous cache peek: returns cached result immediately if available, null otherwise.
   * Allows components to render 0ms cached road distances synchronously without flickering.
   */
  static getCachedRoadDistance(
    origin?: RoadCoordinate | null,
    destination?: RoadCoordinate | null,
    lang: 'hi' | 'en' = 'hi'
  ): RoadDistanceResult | null {
    if (!origin || !destination) return null;
    const cacheKey = createCacheKey(origin, destination);
    const mem = memoryCache.get(cacheKey);
    if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
      return {
        ...mem.result,
        formattedCardDistance: this.formatCardDistance(mem.result.distanceKm, lang),
        formattedProfileDistance: this.formatProfileDistance(mem.result.distanceKm, lang),
        isCached: true,
      };
    }
    const sess = readSessionCache(cacheKey);
    if (sess) {
      memoryCache.set(cacheKey, { result: sess, timestamp: Date.now() });
      return {
        ...sess,
        formattedCardDistance: this.formatCardDistance(sess.distanceKm, lang),
        formattedProfileDistance: this.formatProfileDistance(sess.distanceKm, lang),
        isCached: true,
      };
    }
    return null;
  }
}
