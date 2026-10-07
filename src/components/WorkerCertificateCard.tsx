import React from 'react';
import {
  User,
  Star,
  MapPin,
  Smartphone,
  ShieldCheck,
  Users,
  Shield,
  QrCode,
} from 'lucide-react';
import QRCode from 'qrcode';
import { WorkerProfile, UserProfile, getPriceUnitLabel } from '../types';
import { LocationService } from '../services/locationService';
import { brandingStore } from '../services/brandingService';
import { supabase } from '../lib/supabase';
import { ProfileService } from '../services/profileService';
import verificationLogo from '@/verificationlogo.png';

export interface CertificateData {
  name: string;
  photo: string | null;
  serviceType: string;
  experienceText: string;
  locationText: string;
  rateText: string;
  isVerified: boolean;
  qrDataUrl: string;
  profileUrl: string;
  lang: 'hi' | 'en';
  websiteName: string;
  websiteNameEn: string;
  websiteNameHi: string;
  websiteNameCombined: string;
  logoUrl?: string | null;
  userId?: string;
  isPhotoLoading?: boolean;
}

/**
 * EXACT MASTER BRAND LOGO:
 * Stylized figure with outstretched arms (white head & body) flanked by two green leaves
 * (left: lime green #84cc16, right: rich green #16a34a).
 * If a custom logo_url is set by admin, displays that logo image cleanly.
 */
export const TalentBrandLogo: React.FC<{ size?: number; className?: string; logoUrl?: string | null }> = ({
  size = 34,
  className = '',
  logoUrl: propLogoUrl,
}) => {
  const currentLogo = propLogoUrl !== undefined ? propLogoUrl : brandingStore.getLogoUrl();

  if (currentLogo) {
    return (
      <img
        src={currentLogo}
        alt="Brand Logo"
        width={size}
        height={size}
        className={`shrink-0 object-contain rounded-lg ${className}`}
        style={{ width: `${size}px`, height: `${size}px` }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Brand Logo"
    >
      <path
        d="M22 28 C15 28 6 22 5 12 C13 12 21 18 22 28 Z"
        fill="#84cc16"
      />
      <path
        d="M26 28 C33 28 42 22 43 12 C35 12 27 18 26 28 Z"
        fill="#16a34a"
      />
      <circle cx="24" cy="9" r="4.2" fill="#ffffff" />
      <path
        d="M14 16 C17 23 24 25.5 24 37 C24 25.5 31 23 34 16"
        stroke="#ffffff"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * Helper to draw the exact Brand Logo on HTML5 Canvas
 */
export function drawBrandLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale = 1,
  customLogoImg?: HTMLImageElement | null
) {
  if (customLogoImg && customLogoImg.complete && customLogoImg.naturalWidth > 0) {
    const size = 48 * scale;
    ctx.save();
    const x = centerX - size / 2;
    const y = centerY - size / 2;
    drawCanvasRoundRect(ctx, x, y, size, size, 8 * scale);
    ctx.clip();
    ctx.drawImage(customLogoImg, x, y, size, size);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(centerX - 24 * scale, centerY - 24 * scale);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#84cc16';
  ctx.beginPath();
  ctx.moveTo(22, 28);
  ctx.bezierCurveTo(15, 28, 6, 22, 5, 12);
  ctx.bezierCurveTo(13, 12, 21, 18, 22, 28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.moveTo(26, 28);
  ctx.bezierCurveTo(33, 28, 42, 22, 43, 12);
  ctx.bezierCurveTo(35, 12, 27, 18, 26, 28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(24, 9, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(14, 16);
  ctx.bezierCurveTo(17, 23, 24, 25.5, 24, 37);
  ctx.moveTo(34, 16);
  ctx.bezierCurveTo(31, 23, 24, 25.5, 24, 37);
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper to draw rounded rects on Canvas
 */
export function drawCanvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * STRICT RESOLUTION OF WORKER CERTIFICATE DATA:
 * Incorporates temporary admin live edits seamlessly without modifying database.
 */
export interface BrandingInput {
  websiteName?: string;
  websiteNameEn?: string;
  websiteNameHi?: string;
  websiteNameCombined?: string;
  logoUrl?: string | null;
  name_en?: string;
  name_hi?: string;
  logo_url?: string | null;
}

export function resolveWorkerCertificateData(
  worker: WorkerProfile,
  passedUser?: UserProfile | null,
  lang: 'hi' | 'en' = 'hi',
  branding?: BrandingInput | any,
  qrDataUrl: string = '',
  overrides?: Partial<CertificateData>
): CertificateData {
  const user = passedUser || worker.profile;

  // 1. Actual Worker Name
  // MUST come from worker profile!
  let rawName = overrides?.name !== undefined ? overrides.name : (user?.name?.trim() || '');
  if (!rawName) {
    rawName = (worker as any).name || (user as any)?.full_name || (lang === 'hi' ? 'रमेश कुमार' : 'Ramesh Kumar');
  }
  const name = rawName;

  // 3. Photo
  const photo = overrides?.photo !== undefined
    ? overrides.photo
    : (user?.profile_photo || worker.profile?.profile_photo || (worker as any).profile_photo || (user as any)?.avatar_url || (worker as any)?.avatar_url || null);

  // 4. Verification state
  const isVerified = overrides?.isVerified !== undefined ? overrides.isVerified : (worker.is_active !== false);

  // 5. Service / category
  let serviceType = overrides?.serviceType;
  if (!serviceType) {
    const raw =
      lang === 'hi'
        ? worker.category?.name_hi || worker.other_category || worker.category?.name_en || 'कुशल कारीगर'
        : worker.category?.name_en || worker.other_category || worker.category?.name_hi || 'Skilled Professional';
    let clean = raw.trim();
    clean = clean.replace(/\s+(Services|Service|सेवाएं|सेवाएँ|सेवा)$/i, '').trim();
    serviceType = clean || raw;
  }

  // 6. Experience
  let experienceText = overrides?.experienceText;
  if (!experienceText) {
    const expYears = worker.experience_years;
    experienceText =
      expYears !== undefined && expYears !== null && expYears > 0
        ? (lang === 'hi' ? `${expYears} वर्ष` : `${expYears} ${expYears === 1 ? 'Year' : 'Years'}`)
        : (lang === 'hi' ? 'नया' : 'New');
  }

  // 7. Rate
  let rateText = overrides?.rateText;
  if (!rateText) {
    const dailyWage =
      worker.price_per_day !== undefined && worker.price_per_day !== null
        ? worker.price_per_day
        : 0;
    const priceUnitText = getPriceUnitLabel(worker.price_unit, worker.custom_price_unit, lang);
    rateText = `₹${dailyWage} / ${priceUnitText}`;
  }

  // 8. Location
  let locationText = overrides?.locationText;
  if (!locationText) {
    const workerLocation = LocationService.extractCanonicalLocation(worker, worker.profile?.address);
    const cardLoc = LocationService.formatWorkerCard(workerLocation, '', lang);
    locationText = cardLoc || worker.profile?.address || (lang === 'hi' ? 'स्थान उपलब्ध नहीं' : 'Location unavailable');
  }

  const profileUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?worker=${encodeURIComponent(worker.user_id)}`
    : '';

  const brandEn = branding?.websiteNameEn || branding?.name_en || 'Talent';
  const brandHi = branding?.websiteNameHi || branding?.name_hi || 'टैलेंट';
  const brandCombined = branding?.websiteNameCombined || `${brandHi} — ${brandEn}`;
  const brandName = branding?.websiteName || (lang === 'hi' ? brandHi : brandEn);
  const brandLogo = branding?.logoUrl !== undefined ? branding.logoUrl : (branding?.logo_url || null);

  return {
    name,
    photo,
    serviceType,
    experienceText,
    locationText,
    rateText,
    isVerified,
    qrDataUrl,
    profileUrl,
    lang,
    websiteName: brandName,
    websiteNameEn: brandEn,
    websiteNameHi: brandHi,
    websiteNameCombined: brandCombined,
    logoUrl: brandLogo,
    userId: overrides?.userId || worker.user_id || passedUser?.id || (worker as any)?.id || undefined,
    isPhotoLoading: overrides?.isPhotoLoading || false,
  };
}

/**
 * Helper to wrap text cleanly within a maximum width on HTML5 Canvas
 * Guarantees text never gets cut off, truncated with ellipsis, or overflows horizontally.
 */
export function wrapCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const normalized = (text || '').replace(/,([^\s])/g, ', $1').trim();
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Individual token exceeds maxWidth, break by character
        let chunk = '';
        for (const char of word) {
          if (ctx.measureText(chunk + char).width <= maxWidth) {
            chunk += char;
          } else {
            if (chunk) lines.push(chunk);
            chunk = char;
          }
        }
        currentLine = chunk;
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [text];
}

/**
 * Safely loads an image URL for HTML5 Canvas export without tainting the canvas
 * or failing due to browser CORS cache conflicts.
 * Ensures the image is 100% loaded before resolving.
 */
export async function loadCorsSafeImage(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1. Data URLs and local Blob URLs are already local and origin-clean
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) resolve(img);
        else resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = trimmed;
    });
  }

  // 2. Fetch image with CORS mode and convert to a local Blob Object URL.
  // Drawing a local Blob URL to canvas is 100% CORS-safe and never taints the canvas.
  const fetchAsBlobImage = async (fetchUrl: string): Promise<HTMLImageElement | null> => {
    try {
      const res = await fetch(fetchUrl, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size === 0) return null;
      const objectUrl = URL.createObjectURL(blob);
      return new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (img.naturalWidth > 0) {
            setTimeout(() => {
              try { URL.revokeObjectURL(objectUrl); } catch {}
            }, 10000);
            resolve(img);
          } else {
            try { URL.revokeObjectURL(objectUrl); } catch {}
            resolve(null);
          }
        };
        img.onerror = () => {
          try { URL.revokeObjectURL(objectUrl); } catch {}
          resolve(null);
        };
        img.src = objectUrl;
      });
    } catch {
      return null;
    }
  };

  // Attempt standard fetch first
  let loaded = await fetchAsBlobImage(trimmed);
  if (loaded) return loaded;

  // Attempt cache-busted fetch to bypass any non-CORS response cached by browser
  const separator = trimmed.includes('?') ? '&' : '?';
  const cacheBustedUrl = `${trimmed}${separator}_t=${Date.now()}`;
  loaded = await fetchAsBlobImage(cacheBustedUrl);
  if (loaded) return loaded;

  // 3. Fallback: Image element with crossOrigin = 'anonymous'
  const loadViaImageElement = (srcUrl: string): Promise<HTMLImageElement | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (img.naturalWidth > 0) resolve(img);
        else resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = srcUrl;
    });
  };

  loaded = await loadViaImageElement(cacheBustedUrl);
  if (loaded) return loaded;

  loaded = await loadViaImageElement(trimmed);
  if (loaded) return loaded;

  // 4. Fallback: Check if the preview DOM element already has this image loaded
  if (typeof document !== 'undefined') {
    const domImages = document.querySelectorAll<HTMLImageElement>('#qr-badge-card img');
    for (const el of Array.from(domImages)) {
      if ((el.src === trimmed || el.currentSrc === trimmed) && el.complete && el.naturalWidth > 0) {
        return el;
      }
    }
  }

  return null;
}

/**
 * THE ACTUAL GENERATED / DOWNLOADED CERTIFICATE (CANVAS SOURCE OF TRUTH)
 * Every visual requirement is rendered here with mathematical precision.
 */
export async function renderCertificateToCanvas(
  canvas: HTMLCanvasElement,
  data: CertificateData
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const width = 800;
  const height = 1200;
  canvas.width = width;
  canvas.height = height;

  // Preload custom logo image if provided or default /logo.jpg
  let customLogoImg: HTMLImageElement | null = null;
  const targetLogoUrl = data.logoUrl || '/logo.jpg';
  if (targetLogoUrl) {
    customLogoImg = await loadCorsSafeImage(targetLogoUrl);
  }

  // Preload EXISTING ORIGINAL verification badge
  let verificationBadgeImg: HTMLImageElement | null = null;
  try {
    const vImg = new Image();
    vImg.crossOrigin = 'anonymous';
    await new Promise<void>((resolve) => {
      vImg.onload = () => resolve();
      vImg.onerror = () => resolve();
      vImg.src = verificationLogo;
    });
    if (vImg.complete && vImg.naturalWidth > 0) {
      verificationBadgeImg = vImg;
    }
  } catch {
    // fallback
  }

  // Preload QR image
  let qrImg: HTMLImageElement | null = null;
  if (data.qrDataUrl) {
    try {
      const qImg = new Image();
      qImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        qImg.onload = () => resolve();
        qImg.onerror = () => resolve();
        qImg.src = data.qrDataUrl;
      });
      if (qImg.complete && qImg.naturalWidth > 0) {
        qrImg = qImg;
      }
    } catch {
      // fallback
    }
  }

  // 1. Base Card Background (soft cream/mint with rounded borders)
  ctx.fillStyle = '#f8faf8';
  ctx.fillRect(0, 0, width, height);

  // Card outer frame border
  ctx.strokeStyle = '#d5e2da';
  ctx.lineWidth = 3;
  drawCanvasRoundRect(ctx, 12, 12, width - 24, height - 24, 32);
  ctx.stroke();

  // Subtle decorative corner leaf shadows
  ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
  ctx.beginPath();
  ctx.arc(30, 30, 80, 0, Math.PI * 2);
  ctx.arc(width - 30, height - 30, 100, 0, Math.PI * 2);
  ctx.fill();

  // 2. Top Header Banner with curved bottom edge
  ctx.save();
  ctx.beginPath();
  drawCanvasRoundRect(ctx, 14, 14, width - 28, height - 28, 30);
  ctx.clip();

  const headerGrad = ctx.createLinearGradient(0, 14, width, 160);
  headerGrad.addColorStop(0, '#094838');
  headerGrad.addColorStop(0.5, '#0b5442');
  headerGrad.addColorStop(1, '#083a2d');
  ctx.fillStyle = headerGrad;

  // Curved wave header path
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(width - 14, 14);
  ctx.lineTo(width - 14, 145);
  ctx.bezierCurveTo(width * 0.75, 160, width * 0.35, 135, 14, 155);
  ctx.closePath();
  ctx.fill();

  // Brand Logo at top center
  drawBrandLogoOnCanvas(ctx, 230, 62, 0.88, customLogoImg);

  // Website Name text (dynamic)
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 36px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.websiteNameCombined, 268, 62);

  // Hindi Tagline/Subtitle
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('विश्वसनीय स्थानीय सेवा विशेषज्ञों का मंच', width / 2, 104);

  // Top right slogan
  ctx.fillStyle = '#86efac';
  ctx.font = 'bold italic 13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  const rightNotes = data.lang === 'hi'
    ? ['सही सेवा,', 'सही लोग,', 'आपके लिए']
    : ['Right Service,', 'Right People,', 'For You'];
  ctx.fillText(rightNotes[0], width - 45, 60);
  ctx.fillText(rightNotes[1], width - 45, 78);
  ctx.fillText(rightNotes[2], width - 45, 96);

  ctx.strokeStyle = '#86efac';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width - 105, 104);
  ctx.quadraticCurveTo(width - 70, 108, width - 45, 102);
  ctx.stroke();

  ctx.restore();

  // 3. Worker Profile Header Area (CENTERED PHOTO)
  const photoCenterX = width / 2;
  const photoCenterY = 228;
  const photoRadius = 65;
  const firstLetter = data.name.charAt(0).toUpperCase();

  // Outer teal ring
  ctx.strokeStyle = '#094838';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(photoCenterX, photoCenterY, photoRadius + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Inner white ring
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(photoCenterX, photoCenterY, photoRadius + 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Draw worker photo (or letter initial)
  let photoDrawn = false;
  if (data.photo) {
    try {
      const avatarImg = await loadCorsSafeImage(data.photo);
      if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(photoCenterX, photoCenterY, photoRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          avatarImg,
          photoCenterX - photoRadius,
          photoCenterY - photoRadius,
          photoRadius * 2,
          photoRadius * 2
        );
        ctx.restore();
        photoDrawn = true;
      }
    } catch (err) {
      console.warn('[renderCertificateToCanvas] Failed to render profile photo:', err);
    }
  }

  if (!photoDrawn) {
    ctx.fillStyle = '#0f766e';
    ctx.beginPath();
    ctx.arc(photoCenterX, photoCenterY, photoRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(firstLetter, photoCenterX, photoCenterY);
  }

  // Bottom-Right Corner Badge overlapping the circular photo
  if (data.isVerified) {
    const badgeX = photoCenterX + photoRadius * 0.707;
    const badgeY = photoCenterY + photoRadius * 0.707;
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(badgeX - 6.5, badgeY);
    ctx.lineTo(badgeX - 1, badgeY + 5.5);
    ctx.lineTo(badgeX + 7.5, badgeY - 5.5);
    ctx.stroke();
  }

  // 4. ACTUAL WORKER NAME + EXISTING ORIGINAL VERIFICATION BADGE (ONE CENTERED GROUP)
  ctx.font = '900 34px system-ui, -apple-system, sans-serif';
  const truncatedName = data.name.length > 22 ? `${data.name.slice(0, 20)}...` : data.name;
  const nameWidth = ctx.measureText(truncatedName).width;
  const badgeSize = 34;
  const badgeGap = 2;
  const totalGroupW = data.isVerified ? (nameWidth + badgeGap + badgeSize) : nameWidth;
  const nameStartX = (width - totalGroupW) / 2;
  const nameY = 345;

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(truncatedName, nameStartX, nameY);

  if (data.isVerified) {
    const bX = nameStartX + nameWidth + badgeGap;
    const bY = nameY - 28;
    if (verificationBadgeImg && verificationBadgeImg.complete && verificationBadgeImg.naturalWidth > 0) {
      ctx.drawImage(verificationBadgeImg, bX, bY, badgeSize, badgeSize);
    } else {
      const bCenterX = bX + badgeSize / 2;
      const bCenterY = bY + badgeSize / 2;
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(bCenterX, bCenterY, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bCenterX - 3.5, bCenterY);
      ctx.lineTo(bCenterX - 0.5, bCenterY + 3.2);
      ctx.lineTo(bCenterX + 4.2, bCenterY - 3.2);
      ctx.stroke();
    }
  }

  // 6. SERVICE PILL (PINK BACKGROUND, NO CHECK ICON, WRAPPED CLEANLY, CENTERED)
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  const maxPillTextWidth = width - 140; // 660px max width
  const pillLines = wrapCanvasTextLines(ctx, data.serviceType, maxPillTextWidth);
  const longestLineWidth = pillLines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
  const pillW = Math.max(160, Math.min(width - 80, longestLineWidth + 48));
  const pillX = (width - pillW) / 2;
  const pillLineHeight = 30;
  const pillH = pillLines.length <= 1 ? 40 : 18 + pillLines.length * pillLineHeight;
  const pillY = 360;

  // Soft pink background (NOT red)
  ctx.fillStyle = '#FFF0F5';
  drawCanvasRoundRect(ctx, pillX, pillY, pillW, pillH, 20);
  ctx.fill();
  ctx.strokeStyle = '#f520bc';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Service text wrapped cleanly inside pill
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (pillLines.length <= 1) {
    ctx.fillText(pillLines[0] || data.serviceType, width / 2, pillY + pillH / 2);
  } else {
    const startTextY = pillY + (pillH - (pillLines.length - 1) * pillLineHeight) / 2;
    pillLines.forEach((line, idx) => {
      ctx.fillText(line, width / 2, startTextY + idx * pillLineHeight);
    });
  }

  // 7. Subtitle traits (HORIZONTALLY CENTERED, CLEAN SPACING)
  ctx.fillStyle = '#475569';
  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const traitsText = data.lang === 'hi'
    ? 'कुशल   •   भरोसेमंद   •   स्थानीय'
    : 'Skilled   •   Reliable   •   Local';
  ctx.fillText(traitsText, width / 2, 438);

  // 8. 4-Quadrant Information Grid Container (INCREASED TYPOGRAPHY, ZERO OVERLAP)
  const gridX = 45;
  const gridY = 470;
  const gridW = width - 90;
  const gridH = 196;

  ctx.fillStyle = '#f3f7f4';
  drawCanvasRoundRect(ctx, gridX, gridY, gridW, gridH, 20);
  ctx.fill();
  ctx.strokeStyle = '#e0eae3';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Vertical grid divider line
  ctx.strokeStyle = '#e2ece5';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gridX + gridW / 2, gridY + 16);
  ctx.lineTo(gridX + gridW / 2, gridY + gridH - 16);
  ctx.stroke();

  // Horizontal grid divider line
  ctx.beginPath();
  ctx.moveTo(gridX + 20, gridY + gridH / 2);
  ctx.lineTo(gridX + gridW - 20, gridY + gridH / 2);
  ctx.stroke();

  // Cell 1: सेवा (Service) - PERSON / SERVICE PROVIDER ICON (NO HAMMER/WRENCH/KEY)
  const c1X = gridX + 22;
  const c1Y = gridY + 18;
  ctx.fillStyle = '#0a5241';
  ctx.beginPath();
  ctx.arc(c1X + 24, c1Y + 30, 22, 0, Math.PI * 2);
  ctx.fill();

  // Draw clean person head and shoulders icon in white
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c1X + 24, c1Y + 23, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c1X + 24, c1Y + 40, 11.5, Math.PI, 0, false);
  ctx.fill();

  // Text aligned LEFT with clear separation from icon (ZERO OVERLAP)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.lang === 'hi' ? 'सेवा' : 'Service', c1X + 56, c1Y + 22);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  const c1StartX = c1X + 56;
  const dividerX = gridX + gridW / 2;
  const maxC1Width = dividerX - c1StartX - 16;
  const serviceLines = wrapCanvasTextLines(ctx, data.serviceType, maxC1Width);
  if (serviceLines.length <= 1) {
    ctx.fillText(serviceLines[0] || data.serviceType, c1StartX, c1Y + 50);
  } else if (serviceLines.length === 2) {
    ctx.fillText(serviceLines[0], c1StartX, c1Y + 45);
    ctx.fillText(serviceLines[1], c1StartX, c1Y + 68);
  } else {
    ctx.fillText(serviceLines[0], c1StartX, c1Y + 41);
    ctx.fillText(serviceLines[1], c1StartX, c1Y + 60);
    ctx.fillText(serviceLines[2], c1StartX, c1Y + 79);
  }

  // Cell 2: अनुभव (Experience) - Star icon in amber circle
  const c2X = gridX + gridW / 2 + 22;
  const c2Y = gridY + 18;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(c2X + 24, c2Y + 30, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★', c2X + 24, c2Y + 38);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.lang === 'hi' ? 'अनुभव' : 'Experience', c2X + 56, c2Y + 22);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  const c2StartX = c2X + 56;
  const maxC2Width = (gridX + gridW) - c2StartX - 16;
  const expLines = wrapCanvasTextLines(ctx, data.experienceText, maxC2Width);
  if (expLines.length <= 1) {
    ctx.fillText(expLines[0] || data.experienceText, c2StartX, c2Y + 50);
  } else if (expLines.length === 2) {
    ctx.fillText(expLines[0], c2StartX, c2Y + 45);
    ctx.fillText(expLines[1], c2StartX, c2Y + 68);
  } else {
    ctx.fillText(expLines[0], c2StartX, c2Y + 41);
    ctx.fillText(expLines[1], c2StartX, c2Y + 60);
    ctx.fillText(expLines[2], c2StartX, c2Y + 79);
  }

  // Cell 3: स्थान (Location) - MapPin in blue circle
  const c3X = gridX + 22;
  const c3Y = gridY + gridH / 2 + 12;
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.arc(c3X + 24, c3Y + 30, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📍', c3X + 24, c3Y + 37);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.lang === 'hi' ? 'स्थान' : 'Location', c3X + 56, c3Y + 22);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';

  // Dynamic automatic text wrapping based on exact available width of Location cell
  // Guarantees Location text strictly stays inside cell and NEVER overlaps Rate column
  const locStartX = c3X + 56;
  const maxLocationWidth = dividerX - locStartX - 16; // strict safety padding before center divider

  // Tokenize and measure text against available width
  const normalizedLoc = (data.locationText || '').replace(/,([^\s])/g, ', $1').trim();
  const locWords = normalizedLoc.split(/\s+/);
  const locLines: string[] = [];
  let currentLocLine = '';

  for (const word of locWords) {
    if (!word) continue;
    const testLine = currentLocLine ? `${currentLocLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxLocationWidth) {
      currentLocLine = testLine;
    } else {
      if (currentLocLine) {
        locLines.push(currentLocLine);
        currentLocLine = word;
      } else {
        // Individual token exceeds maxLocationWidth, break by character
        let chunk = '';
        for (const char of word) {
          if (ctx.measureText(chunk + char).width <= maxLocationWidth) {
            chunk += char;
          } else {
            if (chunk) locLines.push(chunk);
            chunk = char;
          }
        }
        currentLocLine = chunk;
      }
    }
  }
  if (currentLocLine) {
    locLines.push(currentLocLine);
  }

  // Render wrapped lines dynamically within available vertical cell space
  if (locLines.length <= 1) {
    ctx.fillText(locLines[0] || data.locationText, locStartX, c3Y + 50);
  } else if (locLines.length === 2) {
    ctx.fillText(locLines[0], locStartX, c3Y + 45);
    ctx.fillText(locLines[1], locStartX, c3Y + 67);
  } else if (locLines.length === 3) {
    ctx.fillText(locLines[0], locStartX, c3Y + 41);
    ctx.fillText(locLines[1], locStartX, c3Y + 59);
    ctx.fillText(locLines[2], locStartX, c3Y + 77);
  } else {
    // 4 or more lines
    const lineStep = 16;
    const startY = c3Y + 36;
    locLines.slice(0, 4).forEach((line, i) => {
      ctx.fillText(line, locStartX, startY + i * lineStep);
    });
  }

  // Cell 4: दर (Rate) - Rupee in purple circle
  const c4X = gridX + gridW / 2 + 22;
  const c4Y = gridY + gridH / 2 + 12;
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.arc(c4X + 24, c4Y + 30, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('₹', c4X + 24, c4Y + 39);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.lang === 'hi' ? 'दर' : 'Rate', c4X + 56, c4Y + 22);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  const c4StartX = c4X + 56;
  const maxC4Width = (gridX + gridW) - c4StartX - 16;
  const rateLines = wrapCanvasTextLines(ctx, data.rateText, maxC4Width);
  if (rateLines.length <= 1) {
    ctx.fillText(rateLines[0] || data.rateText, c4StartX, c4Y + 50);
  } else if (rateLines.length === 2) {
    ctx.fillText(rateLines[0], c4StartX, c4Y + 45);
    ctx.fillText(rateLines[1], c4StartX, c4Y + 67);
  } else if (rateLines.length === 3) {
    ctx.fillText(rateLines[0], c4StartX, c4Y + 41);
    ctx.fillText(rateLines[1], c4StartX, c4Y + 59);
    ctx.fillText(rateLines[2], c4StartX, c4Y + 77);
  } else {
    const lineStep = 16;
    const startY = c4Y + 36;
    rateLines.slice(0, 4).forEach((line, i) => {
      ctx.fillText(line, c4StartX, startY + i * lineStep);
    });
  }

  // 9. Middle QR Code Section
  const qrSectionY = 676;
  const qrLeftW = 345;
  const qrRightW = 345;
  const qrBoxH = 228;

  // Left Box: Instructions & Hand-drawn arrow
  const leftBoxX = 45;
  ctx.fillStyle = '#edf7f1';
  drawCanvasRoundRect(ctx, leftBoxX, qrSectionY, qrLeftW, qrBoxH, 20);
  ctx.fill();
  ctx.strokeStyle = '#d3eadb';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Smartphone icon in dark green circle outline
  ctx.strokeStyle = '#0d5647';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(leftBoxX + 46, qrSectionY + 46, 22, 0, Math.PI * 2);
  ctx.stroke();
  drawCanvasRoundRect(ctx, leftBoxX + 38, qrSectionY + 32, 16, 28, 4);
  ctx.stroke();
  ctx.fillStyle = '#0d5647';
  ctx.beginPath();
  ctx.arc(leftBoxX + 46, qrSectionY + 54, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Instruction Headings
  ctx.textAlign = 'left';
  ctx.fillStyle = '#084033';
  ctx.font = 'bold 23px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.lang === 'hi' ? 'QR स्कैन करके' : 'Scan QR to', leftBoxX + 80, qrSectionY + 42);
  ctx.fillText(data.lang === 'hi' ? 'पूरी प्रोफाइल देखें' : 'View Full Profile', leftBoxX + 80, qrSectionY + 70);

  ctx.fillStyle = '#475569';
  ctx.font = '500 16px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.lang === 'hi' ? 'फोन का कैमरा खोलें और' : 'Open phone camera &', leftBoxX + 80, qrSectionY + 104);
  ctx.fillText(data.lang === 'hi' ? 'QR Code स्कैन करें' : 'scan QR Code directly', leftBoxX + 80, qrSectionY + 128);

  // Curved hand-drawn arrow pointing to QR code
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(leftBoxX + 245, qrSectionY + 122);
  ctx.quadraticCurveTo(leftBoxX + 285, qrSectionY + 122, leftBoxX + 325, qrSectionY + 138);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftBoxX + 314, qrSectionY + 130);
  ctx.lineTo(leftBoxX + 325, qrSectionY + 138);
  ctx.lineTo(leftBoxX + 316, qrSectionY + 148);
  ctx.stroke();

  // ORIGINAL YELLOW CALLOUT ("सीधे जुड़ें, तुरंत भरोसा पाएं" - MUST BE YELLOW, NOT PINK)
  const noteY = qrSectionY + 180;
  ctx.fillStyle = '#fef08a'; // Soft warm yellow highlighter
  ctx.beginPath();
  ctx.roundRect(leftBoxX + 20, noteY - 8, 305, 34, 6);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'italic bold 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.lang === 'hi' ? 'सीधे जुड़ें, तुरंत भरोसा पाएं' : 'Connect directly, get trust instantly', leftBoxX + 30, noteY + 15);

  ctx.strokeStyle = '#ca8a04'; // Warm golden/yellow accent
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(leftBoxX + 10, noteY + 6);
  ctx.lineTo(leftBoxX + 18, noteY - 2);
  ctx.moveTo(leftBoxX + 12, noteY + 16);
  ctx.lineTo(leftBoxX + 19, noteY + 20);
  ctx.stroke();

  // Right Box: White QR Card Container with Viewfinder Brackets
  const rightBoxX = width - qrRightW - 45;
  ctx.fillStyle = '#ffffff';
  drawCanvasRoundRect(ctx, rightBoxX, qrSectionY, qrRightW, qrBoxH, 20);
  ctx.fill();
  ctx.strokeStyle = '#e2ece5';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Viewfinder Brackets in Dark Teal
  const bPad = 12;
  const bLen = 24;
  ctx.strokeStyle = '#094838';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(rightBoxX + bPad, qrSectionY + bPad + bLen);
  ctx.lineTo(rightBoxX + bPad, qrSectionY + bPad + 6);
  ctx.quadraticCurveTo(rightBoxX + bPad, qrSectionY + bPad, rightBoxX + bPad + 6, qrSectionY + bPad);
  ctx.lineTo(rightBoxX + bPad + bLen, qrSectionY + bPad);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightBoxX + qrRightW - bPad - bLen, qrSectionY + bPad);
  ctx.lineTo(rightBoxX + qrRightW - bPad - 6, qrSectionY + bPad);
  ctx.quadraticCurveTo(rightBoxX + qrRightW - bPad, qrSectionY + bPad, rightBoxX + qrRightW - bPad, qrSectionY + bPad + 6);
  ctx.lineTo(rightBoxX + qrRightW - bPad, qrSectionY + bPad + bLen);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightBoxX + bPad, qrSectionY + qrBoxH - bPad - bLen);
  ctx.lineTo(rightBoxX + bPad, qrSectionY + qrBoxH - bPad - 6);
  ctx.quadraticCurveTo(rightBoxX + bPad, qrSectionY + qrBoxH - bPad, rightBoxX + bPad + 6, qrSectionY + qrBoxH - bPad);
  ctx.lineTo(rightBoxX + bPad + bLen, qrSectionY + qrBoxH - bPad);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightBoxX + qrRightW - bPad - bLen, qrSectionY + qrBoxH - bPad);
  ctx.lineTo(rightBoxX + qrRightW - bPad - 6, qrSectionY + qrBoxH - bPad);
  ctx.quadraticCurveTo(rightBoxX + qrRightW - bPad, qrSectionY + qrBoxH - bPad, rightBoxX + qrRightW - bPad, qrSectionY + qrBoxH - bPad - 6);
  ctx.lineTo(rightBoxX + qrRightW - bPad, qrSectionY + qrBoxH - bPad - bLen);
  ctx.stroke();

  // QR Image drawing
  if (qrImg) {
    const qrRenderSize = 192;
    const qrRenderX = rightBoxX + (qrRightW - qrRenderSize) / 2;
    const qrRenderY = qrSectionY + (qrBoxH - qrRenderSize) / 2;
    ctx.drawImage(qrImg, qrRenderX, qrRenderY, qrRenderSize, qrRenderSize);
  }

  // 10. Bottom Trust Badges (SLIGHTLY LOWER FOR BALANCED SPACING)
  const trustY = 950;
  const trustH = 104;
  const trustColW = (width - 90) / 4;

  ctx.fillStyle = '#f3f7f4';
  drawCanvasRoundRect(ctx, 45, trustY, width - 90, trustH, 20);
  ctx.fill();
  ctx.strokeStyle = '#e0eae3';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const trustItems = data.lang === 'hi'
    ? [
        { icon: 'shield', line1: 'प्रमाणित', line2: 'सेवा विशेषज्ञ' },
        { icon: 'map', line1: 'स्थानीय', line2: 'सेवा विशेषज्ञ' },
        { icon: 'users', line1: 'सत्यापित', line2: 'प्रोफाइल' },
        { icon: 'lock', line1: 'सुरक्षित', line2: 'और भरोसेमंद' },
      ]
    : [
        { icon: 'shield', line1: 'Certified', line2: 'Expert' },
        { icon: 'map', line1: 'Local', line2: 'Service' },
        { icon: 'users', line1: 'Verified', line2: 'Profile' },
        { icon: 'lock', line1: 'Safe &', line2: 'Trusted' },
      ];

  trustItems.forEach((item, idx) => {
    const colX = 45 + idx * trustColW;
    const centerX = colX + trustColW / 2;

    if (idx > 0) {
      ctx.strokeStyle = '#e2ece5';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(colX, trustY + 14);
      ctx.lineTo(colX, trustY + trustH - 14);
      ctx.stroke();
    }

    ctx.fillStyle = '#0d5647';
    ctx.beginPath();
    ctx.arc(centerX, trustY + 26, 17, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (item.icon === 'shield' || item.icon === 'lock') {
      ctx.beginPath();
      ctx.moveTo(centerX - 5, trustY + 25);
      ctx.lineTo(centerX - 1, trustY + 29);
      ctx.lineTo(centerX + 6, trustY + 22);
      ctx.stroke();
    } else if (item.icon === 'map') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX, trustY + 24, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.icon === 'users') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX - 4, trustY + 24, 3.5, 0, Math.PI * 2);
      ctx.arc(centerX + 4, trustY + 24, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(item.line1, centerX, trustY + 65);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 15px system-ui, -apple-system, sans-serif';
    ctx.fillText(item.line2, centerX, trustY + 86);
  });

  // 11. Bottom Curved Green Footer Banner
  ctx.save();
  ctx.beginPath();
  drawCanvasRoundRect(ctx, 14, 14, width - 28, height - 28, 30);
  ctx.clip();

  const footerGrad = ctx.createLinearGradient(0, height - 120, width, height);
  footerGrad.addColorStop(0, '#094838');
  footerGrad.addColorStop(0.5, '#0b5442');
  footerGrad.addColorStop(1, '#083a2d');
  ctx.fillStyle = footerGrad;

  ctx.beginPath();
  ctx.moveTo(14, height - 90);
  ctx.bezierCurveTo(width * 0.35, height - 110, width * 0.75, height - 85, width - 14, height - 100);
  ctx.lineTo(width - 14, height - 14);
  ctx.lineTo(14, height - 14);
  ctx.closePath();
  ctx.fill();

  drawBrandLogoOnCanvas(ctx, 195, height - 52, 0.78, customLogoImg);

  const footerBadgeText = `${data.websiteNameEn} Digital Identity Badge`;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(footerBadgeText, width / 2 + 12, height - 46);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.5;
  const textMetrics = ctx.measureText(footerBadgeText);
  const textHalfW = textMetrics.width / 2 + 28;

  ctx.beginPath();
  ctx.moveTo(width / 2 - textHalfW - 70, height - 52);
  ctx.lineTo(width / 2 - textHalfW, height - 52);
  ctx.moveTo(width / 2 + textHalfW, height - 52);
  ctx.lineTo(width / 2 + textHalfW + 70, height - 52);
  ctx.stroke();

  ctx.restore();
}

/**
 * Trigger download of the exact Canvas-rendered Certificate
 */
export async function downloadCertificateCard(data: CertificateData): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderCertificateToCanvas(canvas, data);

  const safeWorkerName = data.name.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '_');
  const safeAppName = (data.websiteNameEn || 'Talent').replace(/[^a-zA-Z0-9]/g, '_');
  const downloadLink = document.createElement('a');
  downloadLink.download = `${safeAppName}_${safeWorkerName}_QR.png`;
  downloadLink.href = canvas.toDataURL('image/png');
  downloadLink.click();
}

/**
 * PURE CERTIFICATE CARD PREVIEW COMPONENT
 * Mirrors the exact Canvas rendering specification 1:1 in HTML/React.
 * Used identically in WorkerQRCodeModal and AdminPage live preview.
 */
export const WorkerCertificateCard: React.FC<{
  data: CertificateData;
  className?: string;
}> = ({ data, className = '' }) => {
  const firstLetter = data.name.charAt(0).toUpperCase();

  // Dynamically resolve and reliably render profile photo matching the worker's profile photo
  const [previewPhoto, setPreviewPhoto] = React.useState<string | null>(data.photo || null);
  const [isResolving, setIsResolving] = React.useState<boolean>(Boolean(data.isPhotoLoading));
  const [imageFailed, setImageFailed] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isMounted = true;
    setImageFailed(false);

    if (data.photo) {
      setPreviewPhoto(data.photo);
      setIsResolving(false);
      setImageFailed(false);
      return;
    }

    if (data.userId && !data.photo) {
      setIsResolving(true);
      (async () => {
        try {
          // 1. Fast cache lookup
          const profile = await ProfileService.getProfile(data.userId!);
          if (!isMounted) return;
          if (profile?.profile_photo) {
            setPreviewPhoto(profile.profile_photo);
            setImageFailed(false);
            setIsResolving(false);
            return;
          }

          // 2. Direct database query fallback
          const { data: profileData, error } = await supabase
            .from('profiles')
            .select('profile_photo')
            .eq('id', data.userId)
            .maybeSingle();

          if (!isMounted) return;
          if (!error && profileData?.profile_photo) {
            setPreviewPhoto(profileData.profile_photo);
            setImageFailed(false);
          }
        } catch {
          // ignore error
        } finally {
          if (isMounted) setIsResolving(false);
        }
      })();
    } else {
      setIsResolving(Boolean(data.isPhotoLoading));
      setPreviewPhoto(null);
    }

    return () => {
      isMounted = false;
    };
  }, [data.photo, data.userId, data.isPhotoLoading]);

  return (
    <div
      id="qr-badge-card"
      className={`bg-[#f8faf8] border-2 border-[#d5e2da] rounded-3xl overflow-hidden shadow-xl text-slate-800 relative select-none ${className}`}
    >
      {/* 1. TOP HEADER BANNER */}
      <div className="relative bg-gradient-to-r from-[#094838] via-[#0b5442] to-[#083a2d] text-white pt-5 pb-7 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2.5">
            <TalentBrandLogo size={36} logoUrl={data.logoUrl} />
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                {data.websiteNameCombined}
              </h1>
            </div>
          </div>

          {/* Top Right Subtle Accent Note */}
          <div className="text-right leading-tight">
            <p className="text-[10px] sm:text-xs font-semibold text-emerald-200/90 italic">
              {data.lang === 'hi' ? 'सही सेवा,' : 'Right Service,'}
            </p>
            <p className="text-[10px] sm:text-xs font-semibold text-emerald-200/90 italic">
              {data.lang === 'hi' ? 'सही लोग,' : 'Right People,'}
            </p>
            <p className="text-[10px] sm:text-xs font-semibold text-emerald-200/90 italic">
              {data.lang === 'hi' ? 'आपके लिए' : 'For You'}
            </p>
          </div>
        </div>

        {/* Hindi Tagline / Subtitle */}
        <p className="text-center text-emerald-100 text-xs sm:text-sm font-bold tracking-wide mt-2">
          विश्वसनीय स्थानीय सेवा विशेषज्ञों का मंच
        </p>

        {/* Decorative organic bottom curved edge */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full h-4 text-[#f8faf8] fill-current"
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
        >
          <path d="M0 20 L0 0 Q50 20 100 5 L100 20 Z" />
        </svg>
      </div>

      {/* 2. PROFILE HEADER (PHOTO, WORKER ID, NAME, PINK PROFESSION PILL, TRAITS) */}
      <div className="px-4 sm:px-6 pt-5 pb-2 text-center flex flex-col items-center">
        {/* Centered Circular Avatar with double ring & overlapping check badge */}
        <div className="relative inline-block mx-auto">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-[#094838] p-[3px] bg-white shadow-sm">
            <div className="w-full h-full rounded-full overflow-hidden bg-teal-800 flex items-center justify-center text-white font-extrabold text-3xl">
              {previewPhoto && !imageFailed ? (
                <img
                  src={previewPhoto}
                  alt={data.name}
                  className="w-full h-full object-cover"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    setImageFailed(true);
                  }}
                />
              ) : isResolving ? (
                <div className="w-full h-full bg-teal-700/60 animate-pulse flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <span>{firstLetter}</span>
              )}
            </div>
          </div>

          {/* Overlapping Green Checkmark Badge at lower-right edge */}
          {data.isVerified && (
            <div className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#16a34a] border-2 border-white flex items-center justify-center text-white shadow-md">
              <svg className="w-4 h-4 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>

        {/* Main Worker Name (DIRECTLY BELOW PHOTO, HORIZONTALLY CENTERED WITH ORIGINAL BADGE) */}
        <div className="mt-3 w-full flex items-center justify-center px-2">
          <div className="inline-flex items-center justify-center min-w-0">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight truncate">
              {data.name}
            </h3>
            {data.isVerified && (
              <img
                src={verificationLogo}
                alt="Verified"
                className="w-5 h-5 object-contain inline-block shrink-0 shadow-2xs"
                style={{
                  paddingLeft: '0px',
                  paddingTop: '0px',
                  marginRight: '0px',
                  marginLeft: '2px',
                }}
              />
            )}
          </div>
        </div>

        {/* Worker's Actual Service / Profession Type Pill (PINK PILL, NO CHECK ICON, VISIBLY LARGER FONT, WRAPPED) */}
        <div
          className="inline-flex items-center justify-center bg-[#fce7f3] border border-[#fbcfe8] rounded-full text-[#9d174d] font-bold text-base sm:text-lg shadow-2xs max-w-full"
          style={{
            paddingTop: '2px',
            paddingBottom: '4px',
            paddingLeft: '18px',
            paddingRight: '18px',
            marginTop: '4px',
          }}
        >
          <span className="break-words text-center leading-snug">{data.serviceType}</span>
        </div>

        {/* Trait Subtitle */}
        <p className="mt-2 text-base sm:text-lg font-semibold text-slate-600">
          {data.lang === 'hi'
            ? 'कुशल   •   भरोसेमंद   •   स्थानीय'
            : 'Skilled   •   Reliable   •   Local'}
        </p>
      </div>

      {/* 3. 4-QUADRANT INFORMATION GRID (Service, Experience, Location, Rate - ZERO OVERLAP, WRAPPED) */}
      <div className="px-4 sm:px-6 py-2">
        <div className="bg-[#f3f7f4] border border-[#e0eae3] rounded-2xl p-3.5 sm:p-5 grid grid-cols-2 divide-x divide-slate-200/80">
          {/* Left Column: Service + Location */}
          <div className="space-y-4 pr-3 sm:pr-4" style={{ marginLeft: '-6px' }}>
            {/* Quadrant 1: सेवा (Service) - PERSON / SERVICE PROVIDER ICON (NO HAMMER/WRENCH) */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0a5241] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm sm:text-base font-bold text-slate-500 uppercase tracking-wider block">
                  {data.lang === 'hi' ? 'सेवा' : 'Service'}
                </span>
                <p
                  className="text-[17px] font-bold text-slate-900 leading-snug mt-0.5 break-words"
                  style={{ fontSize: '17px' }}
                >
                  {data.serviceType}
                </p>
              </div>
            </div>

            {/* Quadrant 3: स्थान (Location) */}
            <div className="flex items-start gap-3 pt-3 border-t border-slate-200/70">
              <div className="w-10 h-10 rounded-full bg-[#0284c7] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm sm:text-base font-bold text-slate-500 uppercase tracking-wider block">
                  {data.lang === 'hi' ? 'स्थान' : 'Location'}
                </span>
                <p
                  className="text-[12px] font-bold text-slate-900 leading-snug mt-0.5 break-words not-italic no-underline"
                  style={{ fontSize: '12px', fontWeight: 'bold', fontStyle: 'normal', textDecorationLine: 'none' }}
                >
                  {data.locationText}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Experience + Rate */}
          <div className="space-y-4 pl-3 sm:pl-4" style={{ marginRight: '6px' }}>
            {/* Quadrant 2: अनुभव (Experience) */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#f59e0b] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs">
                <Star className="w-5 h-5 fill-white text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm sm:text-base font-bold text-slate-500 uppercase tracking-wider block">
                  {data.lang === 'hi' ? 'अनुभव' : 'Experience'}
                </span>
                <p
                  className="text-[17px] font-bold text-slate-900 leading-snug mt-0.5 break-words"
                  style={{ fontSize: '17px' }}
                >
                  {data.experienceText}
                </p>
              </div>
            </div>

            {/* Quadrant 4: दर (Rate) */}
            <div className="flex items-start gap-3 pt-3 border-t border-slate-200/70">
              <div className="w-10 h-10 rounded-full bg-[#7c3aed] flex items-center justify-center text-white font-extrabold text-lg shrink-0 mt-0.5 shadow-2xs">
                <span>₹</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm sm:text-base font-bold text-slate-500 uppercase tracking-wider block">
                  {data.lang === 'hi' ? 'दर' : 'Rate'}
                </span>
                <p
                  className="text-[15px] text-left font-bold text-slate-900 leading-snug mt-0.5 break-words"
                  style={{ fontSize: '15px' }}
                >
                  {data.rateText}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MIDDLE QR CODE SECTION */}
      <div className="px-4 sm:px-6 pt-2 pb-1.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
          {/* Left Box: Smartphone & Instruction with curved arrow */}
          <div className="bg-[#edf7f1] border border-[#d3eadb] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between relative">
            <div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full border-2 border-[#0d5647] flex items-center justify-center text-[#0d5647] shrink-0 mt-0.5">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-[#084033] text-base sm:text-lg leading-tight">
                    {data.lang === 'hi' ? (
                      <>
                        <div>QR स्कैन करके</div>
                        <div>पूरी प्रोफाइल देखें</div>
                      </>
                    ) : (
                      <>
                        <div>Scan QR Code</div>
                        <div>View Full Profile</div>
                      </>
                    )}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-normal">
                    {data.lang === 'hi' ? 'फोन का कैमरा खोलें और QR Code स्कैन करें' : 'Open phone camera & scan QR code directly'}
                  </p>
                </div>
              </div>
            </div>

            {/* Curved Arrow Doodle towards QR */}
            <div className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2">
              <svg width="40" height="28" viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M2 14 C12 14 26 10 36 18"
                  stroke="#15803d"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M28 11 L36 18 L30 24"
                  stroke="#15803d"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* ORIGINAL YELLOW BRUSH HIGHLIGHT NOTE (MUST BE YELLOW, NOT PINK) */}
            <div className="mt-3.5 pt-1">
              <div className="relative inline-block">
                <span className="relative z-10 font-bold text-slate-900 text-xs sm:text-sm italic">
                  {data.lang === 'hi' ? 'सीधे जुड़ें, तुरंत भरोसा पाएं' : 'Connect directly, get trust instantly'}
                </span>
                <span className="absolute bottom-0 left-0 right-0 h-2.5 bg-yellow-300/85 -rotate-1 rounded-xs -z-0" />
              </div>
            </div>
          </div>

          {/* Right Box: White Container with 4 Dark Teal Viewfinder Corners */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-2xs relative flex items-center justify-center min-h-[180px] sm:min-h-[200px]">
            <div className="absolute top-2.5 left-2.5 w-4.5 h-4.5 sm:w-5 sm:h-5 border-t-3 border-l-3 border-[#094838] rounded-tl-md" />
            <div className="absolute top-2.5 right-2.5 w-4.5 h-4.5 sm:w-5 sm:h-5 border-t-3 border-r-3 border-[#094838] rounded-tr-md" />
            <div className="absolute bottom-2.5 left-2.5 w-4.5 h-4.5 sm:w-5 sm:h-5 border-b-3 border-l-3 border-[#094838] rounded-bl-md" />
            <div className="absolute bottom-2.5 right-2.5 w-4.5 h-4.5 sm:w-5 sm:h-5 border-b-3 border-r-3 border-[#094838] rounded-br-md" />

            {/* QR Image */}
            {data.qrDataUrl ? (
              <img
                src={data.qrDataUrl}
                alt={`QR Code for ${data.name}`}
                className="w-38 h-38 sm:w-44 sm:h-44 object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                <span>QR कोड तैयार हो रहा है...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. TRUST PILLARS */}
      <div className="px-4 sm:px-6 pt-1 pb-1">
        <div className="bg-[#f3f7f4] border border-[#e0eae3] rounded-2xl py-3 px-1 grid grid-cols-4 divide-x divide-slate-200/90 text-center">
          <div className="flex flex-col items-center px-1">
            <div className="w-8 h-8 rounded-full bg-[#0d5647] flex items-center justify-center text-white mb-2.5 shadow-2xs">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {data.lang === 'hi' ? 'प्रमाणित' : 'Certified'}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 leading-tight mt-0.5">
              {data.lang === 'hi' ? 'सेवा विशेषज्ञ' : 'Expert'}
            </p>
          </div>

          <div className="flex flex-col items-center px-1">
            <div className="w-8 h-8 rounded-full bg-[#0d5647] flex items-center justify-center text-white mb-2.5 shadow-2xs">
              <MapPin className="w-4.5 h-4.5" />
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {data.lang === 'hi' ? 'स्थानीय' : 'Local'}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 leading-tight mt-0.5">
              {data.lang === 'hi' ? 'सेवा विशेषज्ञ' : 'Service'}
            </p>
          </div>

          <div className="flex flex-col items-center px-1">
            <div className="w-8 h-8 rounded-full bg-[#0d5647] flex items-center justify-center text-white mb-2.5 shadow-2xs">
              <Users className="w-4.5 h-4.5" />
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {data.lang === 'hi' ? 'सत्यापित' : 'Verified'}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 leading-tight mt-0.5">
              {data.lang === 'hi' ? 'प्रोफाइल' : 'Profile'}
            </p>
          </div>

          <div className="flex flex-col items-center px-1">
            <div className="w-8 h-8 rounded-full bg-[#0d5647] flex items-center justify-center text-white mb-2.5 shadow-2xs">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {data.lang === 'hi' ? 'सुरक्षित' : 'Safe &'}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 leading-tight mt-0.5">
              {data.lang === 'hi' ? 'और भरोसेमंद' : 'Trusted'}
            </p>
          </div>
        </div>
      </div>

      {/* 6. BOTTOM FOOTER BANNER */}
      <div className="relative bg-gradient-to-r from-[#094838] via-[#0b5442] to-[#083a2d] text-white pt-4 pb-3.5 px-4 text-center overflow-hidden">
        <svg
          className="absolute top-0 left-0 right-0 w-full h-3 text-[#f8faf8] fill-current"
          viewBox="0 0 100 15"
          preserveAspectRatio="none"
        >
          <path d="M0 0 L100 0 Q50 15 0 0 Z" />
        </svg>

        <div className="flex items-center justify-center gap-2">
          <div className="h-[1px] bg-emerald-400/40 flex-1 max-w-[50px] hidden xs:block" />
          <TalentBrandLogo size={24} logoUrl={data.logoUrl} />
          <span className="text-sm sm:text-base font-bold tracking-wide text-white">
            {data.websiteNameEn} Digital Identity Badge
          </span>
          <div className="h-[1px] bg-emerald-400/40 flex-1 max-w-[50px] hidden xs:block" />
        </div>
      </div>
    </div>
  );
};
