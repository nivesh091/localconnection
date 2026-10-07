import { safeStorage } from '../lib/storage';
import { supabase } from '../lib/supabase';

export interface WebsiteBranding {
  name_en: string;
  name_hi: string;
  logo_url?: string | null;
  share_url?: string | null;
}

export const DEFAULT_BRANDING: WebsiteBranding = {
  name_en: 'Kaam Mitra',
  name_hi: 'काम मित्र',
  logo_url: '/logo.jpg',
  share_url: null,
};

const STORAGE_KEY = 'kaammitra_website_branding_v1';

class BrandingStore {
  private branding: WebsiteBranding;
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;

  constructor() {
    this.branding = this.loadFromStorage();
    this.updateDocumentMeta();
  }

  private loadFromStorage(): WebsiteBranding {
    try {
      const stored = safeStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.name_en === 'string' && typeof parsed.name_hi === 'string') {
          return {
            name_en: parsed.name_en.trim() || DEFAULT_BRANDING.name_en,
            name_hi: parsed.name_hi.trim() || DEFAULT_BRANDING.name_hi,
            logo_url: typeof parsed.logo_url === 'string' && parsed.logo_url.trim() ? parsed.logo_url.trim() : DEFAULT_BRANDING.logo_url,
            share_url: typeof parsed.share_url === 'string' && parsed.share_url.trim() ? parsed.share_url.trim() : null,
          };
        }
      }
    } catch (e) {
      console.warn('[BrandingStore] Error parsing stored branding:', e);
    }
    return { ...DEFAULT_BRANDING };
  }

  private saveToStorage(b: WebsiteBranding) {
    try {
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    } catch (e) {
      console.warn('[BrandingStore] Error saving branding to storage:', e);
    }
  }

  getBranding(): WebsiteBranding {
    return this.branding;
  }

  getLogoUrl(): string | null {
    return this.branding.logo_url || '/logo.jpg';
  }

  getShareUrl(): string | null {
    return this.branding.share_url?.trim() || null;
  }

  getResolvedShareUrl(): string {
    const configured = this.branding.share_url?.trim();
    if (configured) {
      return configured;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  getName(lang: 'hi' | 'en' = 'hi'): string {
    if (lang === 'hi') {
      return this.branding.name_hi || DEFAULT_BRANDING.name_hi;
    }
    return this.branding.name_en || DEFAULT_BRANDING.name_en;
  }

  getCombinedName(): string {
    const hi = this.branding.name_hi || DEFAULT_BRANDING.name_hi;
    const en = this.branding.name_en || DEFAULT_BRANDING.name_en;
    if (hi.toLowerCase() === en.toLowerCase() || !hi) {
      return en || hi;
    }
    if (!en) {
      return hi;
    }
    return `${en} — ${hi}`;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    // Update document title and og:title whenever branding changes
    this.updateDocumentMeta();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[BrandingStore] Listener error:', err);
      }
    }
  }

  updateDocumentMeta() {
    if (typeof document === 'undefined') return;
    const exactName = (this.branding.name_en || this.branding.name_hi || DEFAULT_BRANDING.name_en).trim();
    const effectiveLogo = this.branding.logo_url || '/logo.jpg';

    document.title = exactName;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        const match = selector.match(/meta\[([a-zA-Z0-9_:-]+)="([^"]+)"\]/);
        if (match) {
          el.setAttribute(match[1], match[2]);
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    const setLink = (rel: string, href: string, type?: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = href;
      if (type) el.type = type;
    };

    setMeta('meta[property="og:title"]', 'content', exactName);
    setMeta('meta[property="og:site_name"]', 'content', exactName);
    setMeta('meta[name="twitter:title"]', 'content', exactName);
    setMeta('meta[name="apple-mobile-web-app-title"]', 'content', exactName);
    setMeta('meta[name="application-name"]', 'content', exactName);
    setMeta('meta[property="og:url"]', 'content', this.getResolvedShareUrl());
    setMeta('meta[property="og:image"]', 'content', effectiveLogo);
    setMeta('meta[name="twitter:image"]', 'content', effectiveLogo);

    // Dynamic browser & PWA icon updates
    setLink('icon', effectiveLogo);
    setLink('apple-touch-icon', effectiveLogo);
    setLink('shortcut icon', effectiveLogo);
    setLink('manifest', `/manifest.webmanifest?v=${Date.now()}`);
  }

  /**
   * Set and persist branding locally and to Supabase
   */
  async setBranding(newBranding: Partial<WebsiteBranding>): Promise<{ success: boolean; error?: string }> {
    const updated: WebsiteBranding = {
      name_en: (newBranding.name_en !== undefined ? newBranding.name_en.trim() : this.branding.name_en) || DEFAULT_BRANDING.name_en,
      name_hi: (newBranding.name_hi !== undefined ? newBranding.name_hi.trim() : this.branding.name_hi) || DEFAULT_BRANDING.name_hi,
      logo_url: newBranding.logo_url !== undefined ? newBranding.logo_url : (this.branding.logo_url ?? null),
      share_url: newBranding.share_url !== undefined ? (newBranding.share_url ? newBranding.share_url.trim() : null) : (this.branding.share_url ?? null),
    };

    this.branding = updated;
    this.saveToStorage(updated);
    this.notify();

    // Sync PWA icons on server so installed PWA icon updates immediately
    if (typeof window !== 'undefined' && newBranding.logo_url !== undefined) {
      fetch('/api/branding/sync-icons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: updated.logo_url }),
      }).catch((err) => {
        console.warn('[BrandingStore] Sync PWA icons call note:', err);
      });
    }

    try {
      // Persist to Supabase in admin_settings table row 'app_branding'
      const { error } = await supabase.from('admin_settings').upsert({
        id: 'app_branding',
        home_welcome_en: updated.name_en,
        home_welcome_hi: updated.name_hi,
        about_kaammitra_en: JSON.stringify(updated),
        about_kaammitra_hi: `${updated.name_hi} / ${updated.name_en}`,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('[BrandingStore] Remote update warning:', error.message);
        // Note: local state & storage is already saved and will persist for current user
        return { success: true };
      }
      return { success: true };
    } catch (err) {
      console.warn('[BrandingStore] Remote update exception:', err);
      return { success: true };
    }
  }

  /**
   * Initialize branding from Supabase admin_settings
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.updateDocumentMeta();

    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('id', 'app_branding')
        .maybeSingle();

      if (!error && data) {
        let name_en = data.home_welcome_en;
        let name_hi = data.home_welcome_hi;
        let logo_url: string | null = null;
        let share_url: string | null = null;

        if (data.about_kaammitra_en) {
          try {
            const parsed = JSON.parse(data.about_kaammitra_en);
            if (parsed.name_en) name_en = parsed.name_en;
            if (parsed.name_hi) name_hi = parsed.name_hi;
            if (parsed.logo_url !== undefined) logo_url = parsed.logo_url;
            if (parsed.share_url !== undefined) share_url = parsed.share_url;
          } catch {}
        }

        if (name_en || name_hi || logo_url !== null || share_url !== null) {
          this.branding = {
            name_en: name_en?.trim() || DEFAULT_BRANDING.name_en,
            name_hi: name_hi?.trim() || DEFAULT_BRANDING.name_hi,
            logo_url: logo_url || this.branding.logo_url || null,
            share_url: share_url !== null ? share_url : (this.branding.share_url || null),
          };
          this.saveToStorage(this.branding);
          this.notify();
        }
      }
    } catch (err) {
      console.warn('[BrandingStore] Failed to fetch remote branding:', err);
    }
  }
}

export const brandingStore = new BrandingStore();
// Auto-initialize on import
brandingStore.init();

/**
 * Upload a cropped logo blob to storage or convert to resilient data URL
 */
export async function uploadBrandingLogo(blob: Blob): Promise<string> {
  try {
    const ext = blob.type.includes('png') ? 'png' : 'webp';
    const filePath = `branding/logo_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('profile-media')
      .upload(filePath, blob, {
        upsert: true,
        contentType: blob.type || 'image/png',
      });

    if (!uploadError) {
      const { data } = supabase.storage.from('profile-media').getPublicUrl(filePath);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }
  } catch (err) {
    console.warn('[BrandingStore] Storage upload failed, falling back to base64 data URL:', err);
  }

  // Resilient fallback: convert to base64 Data URL so logo works 100% of the time
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode logo'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
