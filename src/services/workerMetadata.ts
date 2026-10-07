import { PriceUnit } from '../types';

export interface WorkerMetadata {
  price_unit?: PriceUnit;
  custom_price_unit?: string | null;
  is_active?: boolean;
  is_mobile_public?: boolean;
  legacy_skills?: string | null;
}

const KM_META_REGEX = /(?:\r?\n)?\[KM_META:(\{.*?\})\]\s*$/;

/**
 * Extracts clean user description and optional embedded metadata from the about_text field.
 */
export function extractAboutAndMetadata(rawAbout?: string | null): {
  about: string;
  metadata: WorkerMetadata;
} {
  if (!rawAbout || typeof rawAbout !== 'string') {
    return {
      about: '',
      metadata: {
        price_unit: 'day',
        custom_price_unit: null,
        is_active: true,
        is_mobile_public: true,
        legacy_skills: null,
      },
    };
  }

  const match = rawAbout.match(KM_META_REGEX);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanAbout = rawAbout.replace(KM_META_REGEX, '').trim();
      const rawUnit = parsed.price_unit === 'custom' ? 'other' : parsed.price_unit;
      return {
        about: cleanAbout,
        metadata: {
          price_unit: rawUnit || 'day',
          custom_price_unit: parsed.custom_price_unit || null,
          is_active: parsed.is_active !== undefined ? Boolean(parsed.is_active) : true,
          is_mobile_public: parsed.is_mobile_public !== undefined ? Boolean(parsed.is_mobile_public) : true,
          legacy_skills: parsed.legacy_skills || null,
        },
      };
    } catch {}
  }

  return {
    about: rawAbout,
    metadata: {
      price_unit: 'day',
      custom_price_unit: null,
      is_active: true,
      is_mobile_public: true,
      legacy_skills: null,
    },
  };
}

/**
 * Encodes metadata into the about_text field while preserving human user description.
 */
export function appendMetadataToAbout(
  userAbout: string | null | undefined,
  meta: Partial<WorkerMetadata>,
  existingRawAbout?: string | null
): string {
  const current = extractAboutAndMetadata(existingRawAbout).metadata;
  const baseAbout =
    userAbout !== undefined && userAbout !== null
      ? userAbout.replace(KM_META_REGEX, '').trim()
      : extractAboutAndMetadata(existingRawAbout).about;

  const normalizedUnit = meta.price_unit === 'custom' ? 'other' : meta.price_unit;
  const merged: WorkerMetadata = {
    price_unit: normalizedUnit !== undefined ? normalizedUnit : current.price_unit,
    custom_price_unit:
      meta.custom_price_unit !== undefined ? meta.custom_price_unit : current.custom_price_unit,
    is_active: meta.is_active !== undefined ? meta.is_active : current.is_active,
    is_mobile_public:
      meta.is_mobile_public !== undefined ? meta.is_mobile_public : current.is_mobile_public,
    legacy_skills: meta.legacy_skills !== undefined ? meta.legacy_skills : current.legacy_skills,
  };

  const jsonStr = JSON.stringify(merged);
  return baseAbout ? `${baseAbout}\n[KM_META:${jsonStr}]` : `[KM_META:${jsonStr}]`;
}

/**
 * Parses worker metadata stored in the worker_profiles table.
 * Seamlessly handles JSON-encoded metadata in existing columns as well as native columns.
 */
export function parseWorkerMetadata(skillsField?: string | null): WorkerMetadata {

  if (!skillsField || typeof skillsField !== 'string') {
    return {
      price_unit: 'day',
      custom_price_unit: null,
      is_active: true,
      is_mobile_public: true,
      legacy_skills: null,
    };
  }

  const trimmed = skillsField.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawUnit = parsed.price_unit === 'custom' ? 'other' : parsed.price_unit;
      return {
        price_unit: rawUnit || 'day',
        custom_price_unit: parsed.custom_price_unit || null,
        is_active: parsed.is_active !== undefined ? Boolean(parsed.is_active) : true,
        is_mobile_public: parsed.is_mobile_public !== undefined ? Boolean(parsed.is_mobile_public) : true,
        legacy_skills: parsed.legacy_skills || null,
      };
    } catch {
      // not valid JSON, treat as raw text
    }
  }

  return {
    price_unit: 'day',
    custom_price_unit: null,
    is_active: true,
    is_mobile_public: true,
    legacy_skills: trimmed || null,
  };
}

/**
 * Serializes worker metadata to store in the existing Supabase worker_profiles table.
 */
export function serializeWorkerMetadata(
  data: Partial<WorkerMetadata>,
  existingSkills?: string | null
): string {
  const current = parseWorkerMetadata(existingSkills);
  const normalizedUnit = data.price_unit === 'custom' ? 'other' : data.price_unit;
  const merged: WorkerMetadata = {
    price_unit: normalizedUnit !== undefined ? normalizedUnit : current.price_unit,
    custom_price_unit: data.custom_price_unit !== undefined ? data.custom_price_unit : current.custom_price_unit,
    is_active: data.is_active !== undefined ? data.is_active : current.is_active,
    is_mobile_public: data.is_mobile_public !== undefined ? data.is_mobile_public : current.is_mobile_public,
    legacy_skills: data.legacy_skills !== undefined ? data.legacy_skills : current.legacy_skills,
  };
  return JSON.stringify(merged);
}
