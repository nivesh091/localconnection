import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';

dotenv.config();

const publicDir = path.resolve(process.cwd(), 'public');
const distDir = path.resolve(process.cwd(), 'dist');
const defaultLogoPath = path.join(publicDir, 'logo.jpg');

const supabaseUrl =
  process.env.VITE_SUPABASE_URL || 'https://hhvxanktvbncyeedzzdf.supabase.co';
const supabaseKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

/**
 * Fetch current active branding from Supabase admin_settings
 */
export async function fetchRemoteBranding() {
  const fallback = {
    name: 'Talent',
    short_name: 'Talent',
    name_en: 'Talent',
    name_hi: 'टैलेंट',
    logo_url: null,
  };

  if (!supabaseUrl || !supabaseKey) {
    return fallback;
  }

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/admin_settings?id=eq.app_branding&select=*`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
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
            if (parsed.logo_url) logoUrl = parsed.logo_url;
          } catch {}
        }

        const en = (nameEn || '').trim();
        const hi = (nameHi || '').trim();
        const exactName = en || hi || fallback.name;

        return {
          name: exactName,
          short_name: exactName,
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
      console.warn(`[generate-icons.js] Remote logo fetch returned status ${res.status}, falling back to default logo.jpg`);
    } catch (err) {
      console.warn('[generate-icons.js] Failed to fetch remote logo URL:', err);
    }
  }

  // 4. Default fallback: public/logo.jpg
  if (fs.existsSync(defaultLogoPath)) {
    return fs.readFileSync(defaultLogoPath);
  }

  throw new Error(`Default logo file not found at ${defaultLogoPath}`);
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

  const sourceDesc = targetSource ? (typeof targetSource === 'string' ? targetSource : 'Buffer') : 'public/logo.jpg (default)';
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
