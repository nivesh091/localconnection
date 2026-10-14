import { UserLocation } from '../types';
import { LocationService } from './locationService';

export interface Coordinates {
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  district?: string | null;
  state?: string | null;
  place?: string | null;
}

/**
 * Earth's mean radius in kilometers
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Converts degrees to radians
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculates the great-circle distance between two geographic coordinates
 * (lat1, lon1) and (lat2, lon2) using the Haversine formula.
 *
 * Returns:
 * - Distance in kilometers, properly rounded (e.g., '0.8 km', '2.4 km', '15.7 km')
 *
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Formatted distance string in 'km', or empty string if invalid
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): string {
  if (
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2) ||
    !isFinite(lat1) ||
    !isFinite(lon1) ||
    !isFinite(lat2) ||
    !isFinite(lon2)
  ) {
    return '';
  }

  // Standard Haversine formula
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = EARTH_RADIUS_KM * c;

  if (isNaN(distanceKm) || distanceKm < 0) {
    return '';
  }

  // Display distance rounded sensibly in kilometers (e.g. 0.8 km, 2.4 km, 15.7 km)
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Distance Calculation Service
 *
 * Implements the standard Haversine formula to compute great-circle distance
 * between coordinates on Earth, validating coordinates and formatting
 * distances into kilometers ('km').
 */
export class DistanceService {
  private static readonly EARTH_RADIUS_KM = EARTH_RADIUS_KM;

  /**
   * Calculates the distance between two coordinates (lat1, lon1) and (lat2, lon2),
   * returning kilometers properly rounded.
   */
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): string {
    return calculateDistance(lat1, lon1, lat2, lon2);
  }

  /**
   * Extracts clean numeric { lat, lng } or null if invalid.
   * Handles numeric values and numeric strings without treating valid 0 coordinates as falsy.
   * If explicit numeric latitude/longitude are missing, resolves verified district coordinates.
   */
  static extractCoordinates(coord?: Coordinates | UserLocation | { lat?: number | string | null; lng?: number | string | null } | null): { lat: number; lng: number } | null {
    if (!coord) return null;

    const latRaw =
      'latitude' in coord && coord.latitude !== undefined && coord.latitude !== null
        ? coord.latitude
        : 'lat' in coord && (coord as any).lat !== undefined && (coord as any).lat !== null
        ? (coord as any).lat
        : null;

    const lngRaw =
      'longitude' in coord && coord.longitude !== undefined && coord.longitude !== null
        ? coord.longitude
        : 'lng' in coord && (coord as any).lng !== undefined && (coord as any).lng !== null
        ? (coord as any).lng
        : null;

    let lat = latRaw !== null && latRaw !== '' ? Number(latRaw) : NaN;
    let lng = lngRaw !== null && lngRaw !== '' ? Number(lngRaw) : NaN;

    // 1. If explicit valid latitude and longitude exist, ALWAYS use them directly without district fallback
    if (
      !isNaN(lat) &&
      !isNaN(lng) &&
      isFinite(lat) &&
      isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng };
    }

    // 2. Only if explicit coordinates genuinely do not exist, check district fallback
    if ((isNaN(lat) || isNaN(lng)) && 'district' in coord && coord.district) {
      const resolved = LocationService.resolveDistrictCoordinates(coord.district);
      if (resolved && !isNaN(Number(resolved.latitude)) && !isNaN(Number(resolved.longitude))) {
        lat = Number(resolved.latitude);
        lng = Number(resolved.longitude);
      }
    }

    if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
      return null;
    }

    // Valid Earth geographic coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return null;
    }

    return { lat, lng };
  }

  /**
   * Validates whether a coordinate object has valid numeric latitude and longitude.
   */
  static isValidCoordinate(coord?: Coordinates | UserLocation | null): boolean {
    return this.extractCoordinates(coord) !== null;
  }

  /**
   * Calculates geographic distance in kilometers using the Haversine formula.
   * Returns null if either coordinate is invalid.
   */
  static calculateHaversineDistanceKm(
    coord1?: Coordinates | UserLocation | null,
    coord2?: Coordinates | UserLocation | null
  ): number | null {
    const p1 = this.extractCoordinates(coord1);
    const p2 = this.extractCoordinates(coord2);

    if (!p1 || !p2) {
      return null;
    }

    const dLat = deg2rad(p2.lat - p1.lat);
    const dLon = deg2rad(p2.lng - p1.lng);

    const lat1Rad = deg2rad(p1.lat);
    const lat2Rad = deg2rad(p2.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = this.EARTH_RADIUS_KM * c;

    return distanceKm >= 0 && !isNaN(distanceKm) ? distanceKm : null;
  }

  /**
   * Formats distance into kilometers rounded to 1 decimal place (e.g. 0.8 km, 2.4 km, 15.7 km)
   */
  static formatDistance(distanceKm: number | null): string | null {
    if (distanceKm === null || isNaN(distanceKm) || distanceKm < 0) {
      return null;
    }
    return `${distanceKm.toFixed(1)} km`;
  }

  /**
   * Calculates distance between user coordinates and worker coordinates,
   * returning the conditionally rendered string ('km') or null.
   */
  static getFormattedDistanceBetween(
    userLocation?: Coordinates | UserLocation | { lat?: number | string | null; lng?: number | string | null } | null,
    workerLocation?: Coordinates | UserLocation | { lat?: number | string | null; lng?: number | string | null } | null
  ): string | null {
    const p1 = this.extractCoordinates(userLocation);
    const p2 = this.extractCoordinates(workerLocation);

    if (!p1 || !p2) {
      return null;
    }

    const res = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    return res || null;
  }

  /**
   * Logical 20 KM Distance Slot:
   * Slot 1: 0 km to 20 km (inclusive)
   * Slot 2: >20 km to 40 km (inclusive)
   * Slot 3: >40 km to 60 km (inclusive)
   * Slot 4: >60 km to 80 km (inclusive)
   * Slot 5: >80 km to 100 km (inclusive)
   * Continued for larger distances.
   * If distance is null/undefined or coordinates unavailable, placed in maximum slot.
   */
  static getDistanceSlot(distanceKm: number | null | undefined): number {
    if (distanceKm === null || distanceKm === undefined || isNaN(distanceKm)) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (distanceKm <= 0) return 1;
    return Math.max(1, Math.ceil(distanceKm / 20));
  }

  /**
   * Sorts items according to the 20 KM Distance Slot + Preference hierarchy:
   * 1. Distance Slot ASC (Slot 1: 0-20km, Slot 2: >20-40km, ...)
   * 2. Preference / Priority Points DESC within that slot
   * 3. Exact distance ASC when preference is equal
   * 4. Created at / stable ordering fallback
   */
  static sortByDistanceSlotAndPreference<T>(
    items: T[],
    getItemDistanceKm: (item: T) => number | null,
    getItemPreference: (item: T) => number,
    getItemCreatedAt?: (item: T) => string | number | undefined
  ): T[] {
    return [...items].sort((a, b) => {
      const distA = getItemDistanceKm(a);
      const distB = getItemDistanceKm(b);

      const slotA = DistanceService.getDistanceSlot(distA);
      const slotB = DistanceService.getDistanceSlot(distB);

      // 1. Distance Slot ASC (Slot 1 comes before Slot 2, etc.)
      if (slotA !== slotB) {
        return slotA - slotB;
      }

      // 2. Preference DESC within that slot (Higher preference comes first)
      const prefA = getItemPreference(a) ?? 50;
      const prefB = getItemPreference(b) ?? 50;
      if (prefA !== prefB) {
        return prefB - prefA;
      }

      // 3. Exact distance ASC when preference is equal
      const dA = distA !== null && !isNaN(distA) ? distA : Number.MAX_SAFE_INTEGER;
      const dB = distB !== null && !isNaN(distB) ? distB : Number.MAX_SAFE_INTEGER;
      if (dA !== dB) {
        return dA - dB;
      }

      // 4. Stable tie-breaker: created_at DESC (newest first)
      if (getItemCreatedAt) {
        const timeA = new Date(getItemCreatedAt(a) || 0).getTime();
        const timeB = new Date(getItemCreatedAt(b) || 0).getTime();
        if (timeA !== timeB) {
          return timeB - timeA;
        }
      }

      return 0;
    });
  }
}
