import { supabase, isSchemaCacheError, formatError } from '../lib/supabase';
import { Requirement, RequirementFilterState } from '../types';
import { DistanceService } from './distanceService';

let cachedKeywordsSupported: boolean | null = null;
let cachedPhotosSupported: boolean | null = null;

const REQ_CACHE_TTL = 15000; // 15 seconds
const userRequirementsCache = new Map<string, { data: Requirement[]; timestamp: number }>();
const userRequirementsInFlight = new Map<string, Promise<Requirement[]>>();

const publicRequirementsCache = new Map<string, { data: Requirement[]; timestamp: number }>();
const publicRequirementsInFlight = new Map<string, Promise<Requirement[]>>();

export function invalidateRequirementsCache(userId?: string): void {
  if (userId) {
    userRequirementsCache.delete(userId);
    userRequirementsInFlight.delete(userId);
    try {
      sessionStorage.removeItem(`km_user_reqs_${userId}`);
    } catch {}
  } else {
    userRequirementsCache.clear();
    userRequirementsInFlight.clear();
    try {
      // Clear all km_user_reqs keys from sessionStorage
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('km_user_reqs_')) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {}
  }
  publicRequirementsCache.clear();
  publicRequirementsInFlight.clear();
}

/**
 * Checks whether the requirements table currently has 'keywords' and 'photo_storage_paths' columns
 */
export async function checkRequirementsEnhancementSupport(forceRefresh = false): Promise<{
  keywords: boolean;
  photos: boolean;
}> {
  if (!forceRefresh && cachedKeywordsSupported !== null && cachedPhotosSupported !== null) {
    return { keywords: cachedKeywordsSupported, photos: cachedPhotosSupported };
  }

  try {
    const { error: kwErr } = await supabase.from('requirements').select('keywords').limit(1);
    cachedKeywordsSupported = !kwErr || !isSchemaCacheError(kwErr);

    const { error: phErr } = await supabase.from('requirements').select('photo_storage_paths').limit(1);
    cachedPhotosSupported = !phErr || !isSchemaCacheError(phErr);

    return { keywords: cachedKeywordsSupported, photos: cachedPhotosSupported };
  } catch {
    return { keywords: false, photos: false };
  }
}

export interface CreateRequirementParams {
  ownerId: string;
  category: string;
  shortRequirement: string;
  locationId?: string | null;
  place: string;
  district?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maximumBudget: number;
  minimumExperienceYears?: number | null;
  additionalInfo?: string | null;
  keywords?: string[];
  voiceBlob?: Blob | null;
  photoBlobs?: Blob[];
}

export interface UpdateRequirementParams {
  id: string;
  ownerId: string;
  category: string;
  shortRequirement: string;
  locationId?: string | null;
  place: string;
  district?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maximumBudget: number;
  minimumExperienceYears?: number | null;
  additionalInfo?: string | null;
  keywords?: string[];
  voiceBlob?: Blob | null;
  existingVoiceStoragePath?: string | null;
  removeExistingVoice?: boolean;
  newPhotoBlobs?: Blob[];
  remainingPhotoStoragePaths?: string[];
}

export class RequirementService {
  /**
   * Helper to resolve public URL for voice storage path
   */
  public static getVoicePublicUrl(storagePath?: string | null): string | null {
    if (!storagePath) return null;
    try {
      const { data } = supabase.storage
        .from('requirement-media')
        .getPublicUrl(storagePath);
      return data?.publicUrl || null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to resolve public URL for photo storage path
   */
  public static getPhotoPublicUrl(storagePath?: string | null): string | null {
    if (!storagePath) return null;
    try {
      const { data } = supabase.storage
        .from('requirement-media')
        .getPublicUrl(storagePath);
      return data?.publicUrl || null;
    } catch {
      return null;
    }
  }

  /**
   * Format raw database row to Requirement model with resolved voice and photo URLs
   */
  private static formatRequirementRow(row: any): Requirement {
    const rawPhotoPaths: string[] = Array.isArray(row.photo_storage_paths)
      ? row.photo_storage_paths
      : [];
    const photoUrls = rawPhotoPaths
      .map((p) => RequirementService.getPhotoPublicUrl(p))
      .filter(Boolean) as string[];

    const keywords: string[] = Array.isArray(row.keywords) ? row.keywords : [];
    const subdistrict =
      row.subdistrict ||
      row.tehsil ||
      row.location?.landmark ||
      row.location?.subdistrict ||
      null;

    // Default preference = 50 (Part 5: Existing requirements without a preference must safely behave as 50)
    let priorityPoints = 50;
    if (row.priority_points !== undefined && row.priority_points !== null) {
      priorityPoints = Number(row.priority_points) || 50;
    }
    // Check if admin has set a priority override locally
    try {
      const savedOverride = localStorage.getItem(`admin_req_priority_${row.id}`);
      if (savedOverride !== null) {
        priorityPoints = Number(savedOverride) || 50;
      }
    } catch {}

    return {
      ...row,
      subdistrict,
      tehsil: subdistrict,
      maximum_budget: Number(row.maximum_budget) || 0,
      minimum_experience_years:
        row.minimum_experience_years !== null && row.minimum_experience_years !== undefined
          ? Number(row.minimum_experience_years)
          : null,
      latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
      longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
      keywords,
      photo_storage_paths: rawPhotoPaths,
      photos: photoUrls,
      voice_url: RequirementService.getVoicePublicUrl(row.voice_storage_path),
      priority_points: priorityPoints,
    };
  }

  /**
   * Fetch a single requirement by ID
   */
  static async getRequirementById(id: string): Promise<Requirement | null> {
    if (!id) return null;
    try {
      const { data, error } = await supabase
        .from('requirements')
        .select('*, owner:profiles(id, name, mobile, address, profile_photo)')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) return null;
      return this.formatRequirementRow(data);
    } catch {
      return null;
    }
  }

  /**
   * Fetch active public requirements (including logged-in user's own requirements, per Points 37 & 38)
   */
  static async getPublicRequirements(
    filters: RequirementFilterState = {},
    currentUserId?: string
  ): Promise<Requirement[]> {
    const cacheKey = JSON.stringify(filters || {});
    const now = Date.now();
    const cached = publicRequirementsCache.get(cacheKey);
    if (cached && now - cached.timestamp < REQ_CACHE_TTL) {
      return cached.data;
    }

    if (publicRequirementsInFlight.has(cacheKey)) {
      return publicRequirementsInFlight.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        let query = supabase
          .from('requirements')
          .select('*, owner:profiles(id, name, mobile, address, profile_photo)')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        // Filter by selected categories if provided
        if (filters.categories && filters.categories.length > 0) {
          query = query.in('category', filters.categories);
        }

        const { data, error } = await query;

        if (error) {
          if (!isSchemaCacheError(error)) {
            console.warn('Error fetching requirements:', error.message);
          }
          return [];
        }

        let results: Requirement[] = (data || []).map((row: any) =>
          RequirementService.formatRequirementRow(row)
        );

        // In-memory text search across owner name, category, short requirement, keywords, and details (Points 20 & 22)
        if (filters.searchTerm && filters.searchTerm.trim()) {
          const term = filters.searchTerm.trim().toLowerCase();
          results = results.filter((req) => {
            const ownerName = req.owner?.name?.toLowerCase() || '';
            const cat = req.category?.toLowerCase() || '';
            const shortReq = req.short_requirement?.toLowerCase() || '';
            const place = req.place?.toLowerCase() || '';
            const addInfo = req.additional_info?.toLowerCase() || '';
            const keywordMatch = (req.keywords || []).some((kw) =>
              kw.toLowerCase().includes(term)
            );

            return (
              ownerName.includes(term) ||
              cat.includes(term) ||
              shortReq.includes(term) ||
              place.includes(term) ||
              addInfo.includes(term) ||
              keywordMatch
            );
          });
        }

        // Exact radius filter using DistanceService (Points 19 & 36)
        if (
          filters.radiusKm &&
          filters.userLat !== undefined &&
          filters.userLng !== undefined &&
          !isNaN(filters.userLat) &&
          !isNaN(filters.userLng)
        ) {
          const maxDist = filters.radiusKm;
          const userPoint = { lat: filters.userLat, lng: filters.userLng };
          results = results.filter((req) => {
            if (req.latitude === null || req.longitude === null) return false;
            const reqPoint = { lat: req.latitude, lng: req.longitude };
            const distKm = DistanceService.calculateHaversineDistanceKm(userPoint, reqPoint);
            if (distKm === null) return false;
            return distKm <= maxDist;
          });
        }

        // 20 KM Distance Slot & Preference Ranking (Parts 6, 7, 8, 12)
        let effectiveUserCoords: { lat: number; lng: number } | null = null;
        if (
          filters.userLat !== undefined &&
          filters.userLng !== undefined &&
          !isNaN(filters.userLat) &&
          !isNaN(filters.userLng)
        ) {
          effectiveUserCoords = { lat: filters.userLat, lng: filters.userLng };
        }

        results = DistanceService.sortByDistanceSlotAndPreference(
          results,
          (req) => {
            if (!effectiveUserCoords || req.latitude === null || req.latitude === undefined || req.longitude === null || req.longitude === undefined) {
              return null;
            }
            return DistanceService.calculateHaversineDistanceKm(effectiveUserCoords, {
              lat: req.latitude,
              lng: req.longitude,
            });
          },
          (req) => req.priority_points ?? 50,
          (req) => req.created_at
        );

        publicRequirementsCache.set(cacheKey, { data: results, timestamp: Date.now() });
        return results;
      } catch (err) {
        console.warn('RequirementService.getPublicRequirements error:', err);
        return [];
      } finally {
        publicRequirementsInFlight.delete(cacheKey);
      }
    })();

    publicRequirementsInFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Helper to retrieve cached user requirements synchronously (for 0ms initial render)
   */
  static getCachedUserRequirements(userId: string): Requirement[] | null {
    if (!userId) return null;
    const inMem = userRequirementsCache.get(userId);
    if (inMem?.data) {
      return inMem.data;
    }
    try {
      const stored = sessionStorage.getItem(`km_user_reqs_${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          userRequirementsCache.set(userId, { data: parsed, timestamp: Date.now() });
          return parsed;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Fetch logged-in user's own requirements with instant cache return and background revalidation
   */
  static async getUserRequirements(userId: string): Promise<Requirement[]> {
    if (!userId) return [];

    const cacheKey = userId;
    const now = Date.now();
    const cached = userRequirementsCache.get(cacheKey);

    // If fresh in-memory cache exists, return immediately
    if (cached && now - cached.timestamp < REQ_CACHE_TTL) {
      return cached.data;
    }

    // Check sessionStorage if memory cache was empty (e.g. after refresh)
    if (!cached) {
      try {
        const stored = sessionStorage.getItem(`km_user_reqs_${userId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            userRequirementsCache.set(cacheKey, { data: parsed, timestamp: now });
          }
        }
      } catch {}
    }

    if (userRequirementsInFlight.has(cacheKey)) {
      return userRequirementsInFlight.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('requirements')
          .select('*, owner:profiles(id, name, mobile, address, profile_photo)')
          .eq('owner_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          if (!isSchemaCacheError(error)) {
            console.warn('Error fetching user requirements:', error.message);
          }
          const fallback = userRequirementsCache.get(cacheKey)?.data;
          return fallback || [];
        }

        const formatted = (data || []).map((row: any) => RequirementService.formatRequirementRow(row));
        userRequirementsCache.set(cacheKey, { data: formatted, timestamp: Date.now() });
        try {
          sessionStorage.setItem(`km_user_reqs_${userId}`, JSON.stringify(formatted));
          localStorage.setItem('km_active_user_id', userId);
        } catch {}
        return formatted;
      } catch (err) {
        console.warn('RequirementService.getUserRequirements error:', err);
        const fallback = userRequirementsCache.get(cacheKey)?.data;
        return fallback || [];
      } finally {
        userRequirementsInFlight.delete(cacheKey);
      }
    })();

    userRequirementsInFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Fetch all requirements for Admin (Points 41-46)
   */
  static async getAllRequirementsForAdmin(): Promise<Requirement[]> {
    try {
      const { data, error } = await supabase
        .from('requirements')
        .select('*, owner:profiles(id, name, mobile, address, profile_photo)')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching all requirements for admin:', error.message);
        return [];
      }

      return (data || []).map((row: any) => RequirementService.formatRequirementRow(row));
    } catch (err) {
      console.warn('RequirementService.getAllRequirementsForAdmin error:', err);
      return [];
    }
  }

  /**
   * Dynamically fetch unique categories used across active requirements (Point 18)
   */
  static async getActiveCategories(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('requirements')
        .select('category')
        .eq('is_active', true);

      if (error) {
        return [];
      }

      const set = new Set<string>();
      (data || []).forEach((row: any) => {
        const cat = (row.category || '').trim();
        if (cat) set.add(cat);
      });

      return Array.from(set).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  /**
   * Upload voice recording into requirement-media storage bucket under owner's path
   */
  private static async uploadVoiceRecording(
    ownerId: string,
    blob: Blob
  ): Promise<{ path: string | null; error?: string }> {
    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      const filename = `voice_${Date.now()}.${ext}`;
      const path = `${ownerId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from('requirement-media')
        .upload(path, blob, {
          cacheControl: '3600',
          upsert: true,
          contentType: blob.type || 'audio/webm',
        });

      if (uploadError) {
        return { path: null, error: uploadError.message };
      }

      return { path };
    } catch (err) {
      return {
        path: null,
        error: err instanceof Error ? err.message : 'वॉइस अपलोड करने में त्रुटि हुई।',
      };
    }
  }

  /**
   * Upload Requirement photos into requirement-media storage bucket (Points 28 & 30)
   */
  private static async uploadRequirementPhotos(
    ownerId: string,
    blobs: Blob[]
  ): Promise<{ paths: string[]; error?: string }> {
    const paths: string[] = [];
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      try {
        const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
        const filename = `photo_${Date.now()}_${i}.${ext}`;
        const path = `${ownerId}/photos/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from('requirement-media')
          .upload(path, blob, {
            cacheControl: '3600',
            upsert: true,
            contentType: blob.type || 'image/jpeg',
          });

        if (!uploadError) {
          paths.push(path);
        } else {
          console.warn('Error uploading photo:', uploadError.message);
        }
      } catch (err) {
        console.warn('Error processing photo blob:', err);
      }
    }
    return { paths };
  }

  /**
   * Create a new Requirement with real Supabase persistence
   */
  static async createRequirement(
    params: CreateRequirementParams
  ): Promise<{ requirement: Requirement | null; error?: string }> {
    let uploadedVoicePath: string | null = null;
    let uploadedPhotoPaths: string[] = [];

    try {
      // 1. Upload voice recording if provided
      if (params.voiceBlob) {
        const { path, error: voiceError } = await this.uploadVoiceRecording(
          params.ownerId,
          params.voiceBlob
        );
        if (voiceError || !path) {
          return {
            requirement: null,
            error: voiceError || 'वॉयस रिकॉर्डिंग अपलोड नहीं हो सकी। कृपया पुनः प्रयास करें।',
          };
        }
        uploadedVoicePath = path;
      }

      // 2. Upload photos if provided (Point 28)
      if (params.photoBlobs && params.photoBlobs.length > 0) {
        const { paths } = await this.uploadRequirementPhotos(params.ownerId, params.photoBlobs);
        uploadedPhotoPaths = paths;
      }

      // 3. Clean and sanitize keywords (Points 21 & 22)
      const cleanKeywords = (params.keywords || [])
        .map((k) => k.trim())
        .filter((k, idx, arr) => k.length > 0 && arr.indexOf(k) === idx);

      const support = await checkRequirementsEnhancementSupport();

      if (cleanKeywords.length > 0 && !support.keywords) {
        const toClean = [...(uploadedVoicePath ? [uploadedVoicePath] : []), ...uploadedPhotoPaths];
        if (toClean.length > 0) {
          await supabase.storage.from('requirement-media').remove(toClean).catch(() => {});
        }
        return {
          requirement: null,
          error:
            'कीवर्ड्स सेव करने के लिए डेटाबेस माइग्रेशन (20261004000000_requirements_keywords_photos_media.sql) लंबित है। कृपया Supabase SQL Editor में माइग्रेशन रन करें।',
        };
      }

      if (uploadedPhotoPaths.length > 0 && !support.photos) {
        const toClean = [...(uploadedVoicePath ? [uploadedVoicePath] : []), ...uploadedPhotoPaths];
        if (toClean.length > 0) {
          await supabase.storage.from('requirement-media').remove(toClean).catch(() => {});
        }
        return {
          requirement: null,
          error:
            'फ़ोटो सेव करने के लिए डेटाबेस माइग्रेशन (20261004000000_requirements_keywords_photos_media.sql) लंबित है। कृपया Supabase SQL Editor में माइग्रेशन रन करें।',
        };
      }

      // 4. Insert requirement row
      const payload: Record<string, any> = {
        owner_id: params.ownerId,
        category: params.category.trim(),
        short_requirement: params.shortRequirement.trim(),
        location_id: params.locationId || null,
        place: params.place.trim(),
        district: params.district?.trim() || null,
        state: params.state?.trim() || null,
        latitude: params.latitude ?? null,
        longitude: params.longitude ?? null,
        maximum_budget: Number(params.maximumBudget) || 0,
        minimum_experience_years:
          params.minimumExperienceYears !== null && params.minimumExperienceYears !== undefined
            ? Number(params.minimumExperienceYears)
            : null,
        additional_info: params.additionalInfo?.trim() || null,
        voice_storage_path: uploadedVoicePath,
        is_active: true,
      };

      if (support.keywords) {
        payload.keywords = cleanKeywords;
      }
      if (support.photos) {
        payload.photo_storage_paths = uploadedPhotoPaths;
      }

      const { data, error } = await supabase
        .from('requirements')
        .insert(payload)
        .select('*, owner:profiles(id, name, mobile, address, profile_photo)')
        .single();

      if (error) {
        // Orphan media cleanup if DB insert fails
        const toClean = [...(uploadedVoicePath ? [uploadedVoicePath] : []), ...uploadedPhotoPaths];
        if (toClean.length > 0) {
          await supabase.storage
            .from('requirement-media')
            .remove(toClean)
            .catch(() => {});
        }
        return { requirement: null, error: formatError(error, 'hi') };
      }

      return { requirement: RequirementService.formatRequirementRow(data) };
    } catch (err) {
      const toClean = [...(uploadedVoicePath ? [uploadedVoicePath] : []), ...uploadedPhotoPaths];
      if (toClean.length > 0) {
        await supabase.storage
          .from('requirement-media')
          .remove(toClean)
          .catch(() => {});
      }
      return {
        requirement: null,
        error: formatError(err, 'hi'),
      };
    }
  }

  /**
   * Update an existing requirement owned by the user
   */
  static async updateRequirement(
    params: UpdateRequirementParams
  ): Promise<{ requirement: Requirement | null; error?: string }> {
    let newVoicePath: string | null = null;
    let newlyUploadedPhotoPaths: string[] = [];

    try {
      let finalVoicePath = params.existingVoiceStoragePath || null;

      // Check if user uploaded a replacement voice recording
      if (params.voiceBlob) {
        const { path, error: voiceError } = await this.uploadVoiceRecording(
          params.ownerId,
          params.voiceBlob
        );
        if (voiceError || !path) {
          return {
            requirement: null,
            error: voiceError || 'नई वॉयस रिकॉर्डिंग अपलोड नहीं हो सकी।',
          };
        }
        newVoicePath = path;
        finalVoicePath = path;

        // Clean up previous voice file if replaced
        if (params.existingVoiceStoragePath && params.existingVoiceStoragePath !== path) {
          await supabase.storage
            .from('requirement-media')
            .remove([params.existingVoiceStoragePath])
            .catch(() => {});
        }
      } else if (params.removeExistingVoice) {
        if (params.existingVoiceStoragePath) {
          await supabase.storage
            .from('requirement-media')
            .remove([params.existingVoiceStoragePath])
            .catch(() => {});
        }
        finalVoicePath = null;
      }

      // Photos management
      if (params.newPhotoBlobs && params.newPhotoBlobs.length > 0) {
        const { paths } = await this.uploadRequirementPhotos(params.ownerId, params.newPhotoBlobs);
        newlyUploadedPhotoPaths = paths;
      }

      const finalPhotoPaths = [
        ...(params.remainingPhotoStoragePaths || []),
        ...newlyUploadedPhotoPaths,
      ];

      // Clean keywords
      const cleanKeywords = (params.keywords || [])
        .map((k) => k.trim())
        .filter((k, idx, arr) => k.length > 0 && arr.indexOf(k) === idx);

      const support = await checkRequirementsEnhancementSupport();

      if (cleanKeywords.length > 0 && !support.keywords) {
        return {
          requirement: null,
          error:
            'कीवर्ड्स सेव करने के लिए डेटाबेस माइग्रेशन (20261004000000_requirements_keywords_photos_media.sql) लंबित है। कृपया Supabase SQL Editor में माइग्रेशन रन करें।',
        };
      }

      if (newlyUploadedPhotoPaths.length > 0 && !support.photos) {
        return {
          requirement: null,
          error:
            'फ़ोटो सेव करने के लिए डेटाबेस माइग्रेशन (20261004000000_requirements_keywords_photos_media.sql) लंबित है। कृपया Supabase SQL Editor में माइग्रेशन रन करें।',
        };
      }

      const updatePayload: Record<string, any> = {
        category: params.category.trim(),
        short_requirement: params.shortRequirement.trim(),
        location_id: params.locationId || null,
        place: params.place.trim(),
        district: params.district?.trim() || null,
        state: params.state?.trim() || null,
        latitude: params.latitude ?? null,
        longitude: params.longitude ?? null,
        maximum_budget: Number(params.maximumBudget) || 0,
        minimum_experience_years:
          params.minimumExperienceYears !== null && params.minimumExperienceYears !== undefined
            ? Number(params.minimumExperienceYears)
            : null,
        additional_info: params.additionalInfo?.trim() || null,
        voice_storage_path: finalVoicePath,
        updated_at: new Date().toISOString(),
      };

      if (support.keywords) {
        updatePayload.keywords = cleanKeywords;
      }
      if (support.photos) {
        updatePayload.photo_storage_paths = finalPhotoPaths;
      }

      const { data, error } = await supabase
        .from('requirements')
        .update(updatePayload)
        .eq('id', params.id)
        .eq('owner_id', params.ownerId)
        .select('*, owner:profiles(id, name, mobile, address, profile_photo)')
        .single();

      if (error) {
        if (newVoicePath) {
          await supabase.storage
            .from('requirement-media')
            .remove([newVoicePath])
            .catch(() => {});
        }
        if (newlyUploadedPhotoPaths.length > 0) {
          await supabase.storage
            .from('requirement-media')
            .remove(newlyUploadedPhotoPaths)
            .catch(() => {});
        }
        return { requirement: null, error: formatError(error, 'hi') };
      }

      return { requirement: RequirementService.formatRequirementRow(data) };
    } catch (err) {
      if (newVoicePath) {
        await supabase.storage
          .from('requirement-media')
          .remove([newVoicePath])
          .catch(() => {});
      }
      if (newlyUploadedPhotoPaths.length > 0) {
        await supabase.storage
          .from('requirement-media')
          .remove(newlyUploadedPhotoPaths)
          .catch(() => {});
      }
      return {
        requirement: null,
        error: formatError(err, 'hi'),
      };
    }
  }

  /**
   * Delete an individual requirement owned by the user with COMPLETE PERMANENT MEDIA CLEANUP (Points 49-53)
   */
  static async deleteRequirement(
    id: string,
    ownerId: string,
    voiceStoragePath?: string | null,
    photoStoragePaths?: string[] | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Fetch current row to ensure all media paths are retrieved accurately
      const { data: currentReq } = await supabase
        .from('requirements')
        .select('voice_storage_path, photo_storage_paths')
        .eq('id', id)
        .eq('owner_id', ownerId)
        .maybeSingle();

      const pathsToDelete: string[] = [];
      const voicePath = currentReq?.voice_storage_path || voiceStoragePath;
      if (voicePath) pathsToDelete.push(voicePath);

      const photoPaths = currentReq?.photo_storage_paths || photoStoragePaths || [];
      if (Array.isArray(photoPaths)) {
        photoPaths.forEach((p) => {
          if (p && !pathsToDelete.includes(p)) pathsToDelete.push(p);
        });
      }

      // 2. Permanently delete media files from storage bucket
      if (pathsToDelete.length > 0) {
        await supabase.storage
          .from('requirement-media')
          .remove(pathsToDelete)
          .catch((err) => {
            console.warn('Storage removal warning during user deletion:', err);
          });
      }

      // 3. Genuine permanent delete of database record
      const { error } = await supabase
        .from('requirements')
        .delete()
        .eq('id', id)
        .eq('owner_id', ownerId);

      if (error) {
        return {
          success: false,
          error: formatError(error, 'hi'),
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: formatError(err, 'hi'),
      };
    }
  }

  /**
   * Delete requirement as Admin with COMPLETE PERMANENT MEDIA CLEANUP (Points 47-53)
   */
  static async deleteRequirementAsAdmin(
    id: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Fetch current row to get all media paths
      const { data: currentReq } = await supabase
        .from('requirements')
        .select('voice_storage_path, photo_storage_paths')
        .eq('id', id)
        .maybeSingle();

      const pathsToDelete: string[] = [];
      if (currentReq?.voice_storage_path) pathsToDelete.push(currentReq.voice_storage_path);
      if (Array.isArray(currentReq?.photo_storage_paths)) {
        currentReq.photo_storage_paths.forEach((p: string) => {
          if (p && !pathsToDelete.includes(p)) pathsToDelete.push(p);
        });
      }

      // 2. Permanently delete media files from requirement-media storage
      if (pathsToDelete.length > 0) {
        await supabase.storage
          .from('requirement-media')
          .remove(pathsToDelete)
          .catch((err) => {
            console.warn('Storage removal warning during admin deletion:', err);
          });
      }

      // 3. Genuine permanent delete of database record
      const { error } = await supabase
        .from('requirements')
        .delete()
        .eq('id', id);

      if (error) {
        return {
          success: false,
          error: formatError(error, 'hi'),
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: formatError(err, 'hi'),
      };
    }
  }
}
