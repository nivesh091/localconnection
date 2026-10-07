import { supabase, isSchemaCacheError } from '../lib/supabase';
import { UserProfile, UserLocation } from '../types';
import {
  parseWorkerMetadata,
  serializeWorkerMetadata,
  extractAboutAndMetadata,
  appendMetadataToAbout,
} from './workerMetadata';
import { LocationService } from './locationService';

// In-memory cache for user profiles and locations
const profileCache = new Map<string, { data: UserProfile; timestamp: number }>();
const profileInFlight = new Map<string, Promise<UserProfile | null>>();
const PROFILE_TTL = 60000;

const locationCache = new Map<string, { data: UserLocation | null; timestamp: number }>();
const locationInFlight = new Map<string, Promise<UserLocation | null>>();
const LOCATION_TTL = 60000;

export class ProfileService {
  static async getProfile(userId: string, skipCache = false): Promise<UserProfile | null> {
    const now = Date.now();
    const cached = profileCache.get(userId);
    if (!skipCache && cached && now - cached.timestamp < PROFILE_TTL) {
      return cached.data;
    }

    if (profileInFlight.has(userId)) {
      return profileInFlight.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          if (isSchemaCacheError(error)) {
            console.warn('Supabase profiles table not found in schema cache.');
          } else {
            console.warn('Profile fetch notice (offline or network retry):', error.message || error);
          }
          if (cached) return cached.data;
          return null;
        }

        if (data) {
          // Feature 3: Protect private mobile numbers at API/service boundary
          let viewerUserId: string | undefined;
          let isViewerAdmin = false;
          let sessUserMetadata: Record<string, any> | undefined;
          try {
            const { data: sessData } = await supabase.auth.getSession();
            viewerUserId = sessData?.session?.user?.id;
            sessUserMetadata = sessData?.session?.user?.user_metadata;
            const email = sessData?.session?.user?.email?.toLowerCase();
            isViewerAdmin = email === 'niveshkumar1230@gmail.com' || viewerUserId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72';
          } catch {}

          const isOwner = Boolean(viewerUserId && viewerUserId === userId);
          let isMobilePublic = true;
          if (data.is_mobile_public !== undefined && data.is_mobile_public !== null) {
            isMobilePublic = Boolean(data.is_mobile_public);
          } else {
            let found = false;
            try {
              const { data: wpRow } = await supabase
                .from('worker_profiles')
                .select('about_text')
                .eq('user_id', userId)
                .maybeSingle();
              if (wpRow?.about_text) {
                const { metadata: aboutMeta } = extractAboutAndMetadata(wpRow.about_text);
                if (aboutMeta.is_mobile_public !== undefined) {
                  isMobilePublic = Boolean(aboutMeta.is_mobile_public);
                  found = true;
                }
              }
            } catch {}

            if (!found) {
              // For normal users (or workers without skills metadata), check localStorage & user metadata
              if (typeof window !== 'undefined') {
                try {
                  const stored = localStorage.getItem(`kaammitra_mobile_public_${userId}`);
                  if (stored !== null) {
                    isMobilePublic = stored === 'true';
                    found = true;
                  }
                } catch {}
              }
              if (!found && sessUserMetadata?.is_mobile_public !== undefined) {
                isMobilePublic = Boolean(sessUserMetadata.is_mobile_public);
                found = true;
              }
            }
          }

          let sanitizedMobile = data.mobile || '';
          if (isOwner || isViewerAdmin) {
            if (!sanitizedMobile) {
              try {
                const { data: privData } = await supabase
                  .from('user_private_mobile')
                  .select('mobile')
                  .eq('user_id', userId)
                  .maybeSingle();
                if (privData?.mobile) {
                  sanitizedMobile = privData.mobile;
                }
              } catch {}
              if (!sanitizedMobile && isOwner) {
                const sessMetaMobile = sessUserMetadata?.mobile;
                if (sessMetaMobile) {
                  sanitizedMobile = String(sessMetaMobile);
                }
              }
            }
          } else if (!isMobilePublic) {
            sanitizedMobile = '';
          }

          const sanitized: UserProfile = {
            ...data,
            mobile: sanitizedMobile,
            is_mobile_public: isMobilePublic,
          };

          profileCache.set(userId, { data: sanitized, timestamp: Date.now() });
          return sanitized;
        }
        return null;
      } catch {
        if (cached) return cached.data;
        return null;
      } finally {
        profileInFlight.delete(userId);
      }
    })();

    profileInFlight.set(userId, fetchPromise);
    return fetchPromise;
  }

  static invalidateCache(userId?: string): void {
    if (userId) {
      profileCache.delete(userId);
      locationCache.delete(userId);
    } else {
      profileCache.clear();
      locationCache.clear();
    }
  }

  static async updateProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'name' | 'mobile' | 'address' | 'profile_photo' | 'is_mobile_public'>>
  ): Promise<{ success: boolean; data?: UserProfile; error?: string }> {
    try {
      profileCache.delete(userId);

      // Separate is_mobile_public from standard profiles columns to prevent PGRST204 column errors
      const { is_mobile_public, ...safeUpdates } = updates;

      let { data, error } = await supabase
        .from('profiles')
        .update({
          ...safeUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error) {
        // Fallback update without select in case RLS restricts select on update
        const { error: retryError } = await supabase
          .from('profiles')
          .update({
            ...safeUpdates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (retryError) {
          return { success: false, error: retryError.message };
        }
      }

      // Keep user_private_mobile in sync
      if (safeUpdates.mobile) {
        try {
          await supabase.from('user_private_mobile').upsert({
            user_id: userId,
            mobile: safeUpdates.mobile.trim(),
            updated_at: new Date().toISOString(),
          });
        } catch {}
      } else if (is_mobile_public === true) {
        try {
          const { data: privRow } = await supabase
            .from('user_private_mobile')
            .select('mobile')
            .eq('user_id', userId)
            .maybeSingle();
          if (privRow?.mobile) {
            await supabase.from('profiles').update({ mobile: privRow.mobile }).eq('id', userId);
          }
        } catch {}
      }

      // Feature 3: Persist is_mobile_public setting
      if (is_mobile_public !== undefined) {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`kaammitra_mobile_public_${userId}`, String(is_mobile_public));
          } catch {}
        }
        try {
          await supabase.auth.updateUser({ data: { is_mobile_public: is_mobile_public } });
        } catch {}

        // Persist to worker_profiles for service providers if worker profile exists
        try {
          const { data: wpRow } = await supabase
            .from('worker_profiles')
            .select('about_text')
            .eq('user_id', userId)
            .maybeSingle();
          if (wpRow) {
            const updatedAbout = appendMetadataToAbout(
              wpRow.about_text,
              { is_mobile_public: is_mobile_public },
              wpRow.about_text
            );
            await supabase
              .from('worker_profiles')
              .update({
                about_text: updatedAbout,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', userId);
          }
        } catch {}
      }

      const resultProfile: UserProfile | undefined = data
        ? {
            ...data,
            is_mobile_public: is_mobile_public !== undefined ? is_mobile_public : (data.is_mobile_public !== false),
          }
        : undefined;

      if (resultProfile) {
        profileCache.set(userId, { data: resultProfile, timestamp: Date.now() });
      }
      return { success: true, data: resultProfile };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'अपडेट असफल' };
    }
  }

  static async getUserLocation(userId: string): Promise<UserLocation | null> {
    const now = Date.now();
    const cached = locationCache.get(userId);
    if (cached && now - cached.timestamp < LOCATION_TTL) {
      return cached.data;
    }

    if (locationInFlight.has(userId)) {
      return locationInFlight.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          if (cached) return cached.data;
          return null;
        }
        locationCache.set(userId, { data: data || null, timestamp: Date.now() });
        return data || null;
      } catch {
        if (cached) return cached.data;
        return null;
      } finally {
        locationInFlight.delete(userId);
      }
    })();

    locationInFlight.set(userId, fetchPromise);
    return fetchPromise;
  }

  static async saveUserLocation(location: UserLocation): Promise<{ success: boolean; error?: string }> {
    try {
      const villageName = (location.place || location.village || (location as any).city || (location as any).town || '').toString().trim();
      const subdistrictName = (location.landmark || location.subdistrict || location.tehsil || '')?.toString().trim() || null;

      const rawLat = (location as any).latitude;
      const rawLng = (location as any).longitude;
      const hasLat = rawLat !== undefined && rawLat !== null && rawLat !== '' && !isNaN(Number(rawLat));
      const hasLng = rawLng !== undefined && rawLng !== null && rawLng !== '' && !isNaN(Number(rawLng));

      let finalLat: number | null = hasLat ? Number(rawLat) : null;
      let finalLng: number | null = hasLng ? Number(rawLng) : null;

      // If coordinates are missing, resolve real coordinates before persisting
      if (finalLat === null || finalLng === null) {
        const resolved = await LocationService.resolveLocationCoordinates({
          village: villageName,
          subdistrict: subdistrictName || undefined,
          district: location.district,
          state: location.state,
        });
        if (resolved) {
          finalLat = resolved.latitude;
          finalLng = resolved.longitude;
        }
      }

      const updatedLoc: UserLocation = {
        ...location,
        place: villageName,
        village: villageName,
        landmark: subdistrictName,
        subdistrict: subdistrictName || undefined,
        tehsil: subdistrictName || undefined,
        latitude: finalLat !== null ? finalLat : undefined,
        longitude: finalLng !== null ? finalLng : undefined,
      };

      const { error } = await supabase.from('locations').upsert(
        {
          user_id: location.user_id,
          state: location.state,
          district: location.district,
          place: villageName,
          landmark: subdistrictName,
          latitude: finalLat,
          longitude: finalLng,
          location_source: location.location_source,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) return { success: false, error: error.message };
      locationCache.set(location.user_id, { data: updatedLoc, timestamp: Date.now() });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  static async deleteUserLocation(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('locations').delete().eq('user_id', userId);
      if (error) return { success: false, error: error.message };
      locationCache.set(userId, { data: null, timestamp: Date.now() });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }
}
