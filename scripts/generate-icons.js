import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const publicDir = path.resolve(process.cwd(), 'public');
const distDir = path.resolve(process.cwd(), 'dist');
function sanitizePublishableKey(input) {
  if (!input) return '';
  const match = input.match(/sb_publishable_[A-Za-z0-9_-]+/);
  if (match) return match[0];
  if (input.startsWith('eyJ')) return input.trim();
  return '';
}

const DEFAULT_SUPABASE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';
const DEFAULT_SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';

const rawUrl = process.env.VITE_SUPABASE_URL || '';
const rawKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

const supabaseUrl = (rawUrl && rawUrl.startsWith('http') ? rawUrl.trim() : '') || DEFAULT_SUPABASE_URL;
const supabaseKey = sanitizePublishableKey(rawKey) || DEFAULT_SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const DEFAULT_BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="104" fill="#0f766e"/>
  <g transform="translate(64, 64) scale(8)">
    <path d="M22 28 C15 28 6 22 5 12 C13 12 21 18 22 28 Z" fill="#84cc16"/>
    <path d="M26 28 C33 28 42 22 43 12 C35 12 27 18 26 28 Z" fill="#22c55e"/>
    <circle cx="24" cy="9" r="4.2" fill="#ffffff"/>
    <path d="M14 16 C17 23 24 25.5 24 37 C24 25.5 31 23 34 16" stroke="#ffffff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

/**
 * Fetch current active branding dynamically from Supabase admin_settings
 */
export async function fetchRemoteBranding() {
  const fallback = {
    name: 'Kaam Mitra',
    short_name: 'Kaam Mitra',
    name_en: 'Kaam Mitra',
    name_hi: 'काम मित्र',
    logo_url: null,
  };

  if (!supabaseUrl || !supabaseKey) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('id', 'app_branding')
      .maybeSingle();

    if (!error && data) {
      let nameEn = data.home_welcome_en;
      let nameHi = data.home_welcome_hi;
      let logoUrl = null;

      if (data.about_kaammitra_en) {
        try {
          const parsed = JSON.parse(data.about_kaammitra_en);
          if (parsed.name_en) nameEn = parsed.name_en;
          if (parsed.name_hi) nameHi = parsed.name_hi;
          if (parsed.logo_url && parsed.logo_url !== '/logo.jpg' && parsed.logo_url !== 'logo.jpg') {
            logoUrl = parsed.logo_url;
          }
        } catch {}
      }

      const en = (nameEn || '').trim();
      const hi = (nameHi || '').trim();
      const shortName = en || hi || fallback.short_name;
      const combinedName =
        en && hi && en.toLowerCase() !== hi.toLowerCase()
          ? `${en} — ${hi}`
          : (en || hi || fallback.name);

      return {
        name: combinedName,
        short_name: shortName,
        name_en: en || fallback.name_en,
        name_hi: hi || fallback.name_hi,
        logo_url: logoUrl ? logoUrl.trim() : null,
      };
    }
  } catch (err) {
    console.warn('[generate-icons.js] Supabase client fetch warning:', err);
  }

  // Fallback to direct HTTP fetch with accept-profile header
  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/admin_settings?id=eq.app_branding&select=*`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'accept-profile': 'public',
        },
        signal: AbortSignal.timeout(3000),
      }
    );

    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows[0]) {
        const row = rows[0];
        let nameEn = row.home_welcome_en;
        let nameHi = row.home_welcome_hi;
        let logoUrl = null;

        if (row.about_kaammitra_en) {
          try {
            const parsed = JSON.parse(row.about_kaammitra_en);
            if (parsed.name_en) nameEn = parsed.name_en;
            if (parsed.name_hi) nameHi = parsed.name_hi;
            if (parsed.logo_url && parsed.logo_url !== '/logo.jpg' && parsed.logo_url !== 'logo.jpg') {
              logoUrl = parsed.logo_url;
            }
          } catch {}
        }

        const en = (nameEn || '').trim();
        const hi = (nameHi || '').trim();
        const shortName = en || hi || fallback.short_name;
        const combinedName =
          en && hi && en.toLowerCase() !== hi.toLowerCase()
            ? `${en} — ${hi}`
            : (en || hi || fallback.name);

        return {
          name: combinedName,
          short_name: shortName,
          name_en: en || fallback.name_en,
          name_hi: hi || fallback.name_hi,
          logo_url: logoUrl ? logoUrl.trim() : null,
        };
      }
    }
  } catch (err) {
    console.warn('[generate-icons.js] Failed to fetch Admin branding from Supabase:', err);
  }

  return fallback;
}

/**
 * Convert any logo input (URL, base64 Data URL, or Buffer) to a raw image Buffer
 */
async function resolveImageBuffer(logoSource) {
  // If explicitly null, empty, or stale logo.jpg, return default brand SVG
  if (!logoSource || logoSource === '/logo.jpg' || logoSource === 'logo.jpg') {
    return Buffer.from(DEFAULT_BRAND_SVG);
  }

  // 1. Buffer directly provided
  if (Buffer.isBuffer(logoSource)) {
    return logoSource;
  }

  // 2. Data URL provided (e.g. data:image/png;base64,...)
  if (typeof logoSource === 'string' && logoSource.startsWith('data:')) {
    const base64Part = logoSource.split(',')[1];
    if (base64Part) {
      return Buffer.from(base64Part, 'base64');
    }
  }

  // 3. HTTP / HTTPS URL provided
  if (typeof logoSource === 'string' && (logoSource.startsWith('http://') || logoSource.startsWith('https://'))) {
    try {
      const res = await fetch(logoSource);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length > 0) {
          return buf;
        }
      }
      console.warn(`[generate-icons.js] Remote logo fetch returned status ${res.status}, falling back to default brand logo`);
    } catch (err) {
      console.warn('[generate-icons.js] Failed to fetch remote logo URL:', err);
    }
  }

  // 4. Default fallback: vector brand SVG
  return Buffer.from(DEFAULT_BRAND_SVG);
}

/**
 * Master PWA icon generator.
 * Uses the active Admin logo (or fallback to public/logo.jpg) to generate all required PWA icon sizes.
 */
export async function generatePwaIcons(logoSource) {
  let targetSource = logoSource;

  // If no source provided explicitly, query remote Supabase admin branding
  if (targetSource === undefined) {
    const branding = await fetchRemoteBranding();
    targetSource = branding.logo_url;
  }

  const imageBuffer = await resolveImageBuffer(targetSource);

  // Validate that sharp can read this buffer
  await sharp(imageBuffer).metadata();

  // Targets to write to (public/ and dist/ if built)
  const targetDirs = [publicDir];
  if (fs.existsSync(distDir)) {
    targetDirs.push(distDir);
  }

  const generatedFiles = [];

  // Generate 192x192 PNG
  const buf192 = await sharp(imageBuffer)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toBuffer();

  // Generate 512x512 PNG
  const buf512 = await sharp(imageBuffer)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toBuffer();

  // Generate Maskable 512x512 PNG (fits 410x410 with 51px safe-zone padding)
  const bufMaskable = await sharp(imageBuffer)
    .resize(410, 410, { fit: 'contain', background: { r: 15, g: 118, b: 110, alpha: 1 } })
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: '#0f766e',
    })
    .png()
    .toBuffer();

  // Generate Apple Touch Icon 180x180 PNG
  const bufApple = await sharp(imageBuffer)
    .resize(180, 180, { fit: 'cover' })
    .png()
    .toBuffer();

  // Generate Favicon 32x32 PNG/ICO
  const bufFavicon = await sharp(imageBuffer)
    .resize(32, 32, { fit: 'cover' })
    .png()
    .toBuffer();

  for (const dir of targetDirs) {
    fs.writeFileSync(path.join(dir, 'pwa-192x192.png'), buf192);
    fs.writeFileSync(path.join(dir, 'pwa-512x512.png'), buf512);
    fs.writeFileSync(path.join(dir, 'pwa-maskable-512x512.png'), bufMaskable);
    fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), bufApple);
    fs.writeFileSync(path.join(dir, 'favicon.ico'), bufFavicon);

    generatedFiles.push(
      path.join(dir, 'pwa-192x192.png'),
      path.join(dir, 'pwa-512x512.png'),
      path.join(dir, 'pwa-maskable-512x512.png'),
      path.join(dir, 'apple-touch-icon.png'),
      path.join(dir, 'favicon.ico')
    );

    // Remove old competing icon.svg if it exists
    const oldSvgPath = path.join(dir, 'icon.svg');
    if (fs.existsSync(oldSvgPath)) {
      try {
        fs.unlinkSync(oldSvgPath);
      } catch {}
    }
  }

  const sourceDesc = targetSource ? (typeof targetSource === 'string' ? targetSource : 'Buffer') : 'Default Brand Logo SVG';
  console.log(`[generate-icons.js] Successfully generated PWA icons using source: ${sourceDesc}`);

  return {
    success: true,
    source: sourceDesc,
    generatedFiles,
  };
}

/**
 * Builds the dynamic W3C Web App Manifest JSON with active branding icons
 */
export function buildManifest(branding, version = Date.now()) {
  const v = version ? `?v=${version}` : '';

  return {
    id: '/',
    name: branding.name,
    short_name: branding.short_name,
    description: 'ग्रामीण और कस्बाई क्षेत्रों के लिए काम और सेवा प्रदाताओं का विश्वसनीय मंच',
    theme_color: '#0f766e',
    background_color: '#f8fafc',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    icons: [
      {
        src: `/pwa-192x192.png${v}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/pwa-512x512.png${v}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/pwa-maskable-512x512.png${v}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

// Execute directly if run via `node scripts/generate-icons.js`
if (process.argv[1] && process.argv[1].endsWith('generate-icons.js')) {
  const argSource = process.argv[2] || undefined;
  generatePwaIcons(argSource)
    .then((res) => {
      console.log('Result:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[generate-icons.js] Error:', err);
      process.exit(1);
    });
}
