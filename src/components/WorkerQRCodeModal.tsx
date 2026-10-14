import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Share2,
  Download,
  Copy,
  Check,
  Printer,
  QrCode,
} from 'lucide-react';
import QRCode from 'qrcode';
import { WorkerProfile, UserProfile } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { supabase } from '../lib/supabase';
import { ProfileService } from '../services/profileService';
import {
  TalentBrandLogo,
  WorkerCertificateCard,
  downloadCertificateCard,
  renderCertificateToCanvas,
  resolveWorkerCertificateData,
  CertificateData,
} from './WorkerCertificateCard';

export {
  TalentBrandLogo,
  WorkerCertificateCard,
  downloadCertificateCard,
  renderCertificateToCanvas,
  resolveWorkerCertificateData,
};
export type { CertificateData };

export interface WorkerQRCodeModalProps {
  worker: WorkerProfile;
  user?: UserProfile | null;
  onClose: () => void;
  overrides?: Partial<CertificateData>;
}

export const WorkerQRCodeModal: React.FC<WorkerQRCodeModalProps> = ({
  worker,
  user: passedUser,
  onClose,
  overrides,
}) => {
  const { lang } = useTranslation();
  const branding = useWebsiteBranding();
  usePopupBackDismiss(true, onClose);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isGeneratingDownload, setIsGeneratingDownload] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Dynamic photo state ensuring worker profile photo is always resolved asynchronously
  const targetUserId = worker?.user_id || passedUser?.id || (worker as any)?.id;
  const initialPhoto =
    overrides?.photo ||
    passedUser?.profile_photo ||
    (passedUser as any)?.avatar_url ||
    worker?.profile?.profile_photo ||
    (worker?.profile as any)?.avatar_url ||
    (worker as any)?.profile_photo ||
    (worker as any)?.avatar_url ||
    null;

  const [dynamicPhoto, setDynamicPhoto] = useState<string | null>(initialPhoto);
  const [isPhotoLoading, setIsPhotoLoading] = useState<boolean>(!initialPhoto && Boolean(targetUserId));

  useEffect(() => {
    let isMounted = true;

    if (initialPhoto) {
      setDynamicPhoto(initialPhoto);
      setIsPhotoLoading(false);
    }

    if (targetUserId) {
      if (!initialPhoto) setIsPhotoLoading(true);
      (async () => {
        try {
          // 1. Fast cache lookup
          const cachedProfile = await ProfileService.getProfile(targetUserId);
          if (!isMounted) return;
          if (cachedProfile?.profile_photo) {
            setDynamicPhoto(cachedProfile.profile_photo);
            setIsPhotoLoading(false);
            return;
          }

          // 2. Direct database query fallback
          const { data, error } = await supabase
            .from('profiles')
            .select('profile_photo')
            .eq('id', targetUserId)
            .maybeSingle();

          if (!isMounted) return;
          if (!error && data?.profile_photo) {
            setDynamicPhoto(data.profile_photo);
          }
        } catch {
          // ignore
        } finally {
          if (isMounted) setIsPhotoLoading(false);
        }
      })();
    }

    return () => {
      isMounted = false;
    };
  }, [targetUserId, initialPhoto]);

  // Exact URL to open this worker profile directly
  const profileUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?worker=${encodeURIComponent(worker.user_id)}`
    : '';

  // Generate crisp high-res QR code on mount with matching dark green modules
  useEffect(() => {
    if (!profileUrl) return;

    let isMounted = true;
    QRCode.toDataURL(profileUrl, {
      width: 480,
      margin: 1,
      color: {
        dark: '#083a2d',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
        }
      })
      .catch((err) => {
        console.error('Error generating QR code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [profileUrl]);

  // Unified Certificate Data from SINGLE source of truth with dynamically resolved photo
  const certificateData = useMemo(() => {
    const effectivePhoto = dynamicPhoto || initialPhoto || null;
    return resolveWorkerCertificateData(
      worker,
      passedUser,
      lang,
      branding,
      qrDataUrl,
      {
        ...overrides,
        ...(effectivePhoto ? { photo: effectivePhoto } : {}),
        userId: targetUserId,
        isPhotoLoading: isPhotoLoading && !effectivePhoto,
      }
    );
  }, [worker, passedUser, lang, branding, qrDataUrl, overrides, dynamicPhoto, initialPhoto, targetUserId, isPhotoLoading]);

  // Handle Download High-Res Card Image (EXACT 1:1 Canvas Rendering)
  const handleDownloadCard = async () => {
    if (!qrDataUrl) return;
    setIsGeneratingDownload(true);

    try {
      await downloadCertificateCard(certificateData);
    } catch (err) {
      console.error('Failed to generate card image for download:', err);
    } finally {
      setIsGeneratingDownload(false);
    }
  };

  // Handle Copy Link
  const handleCopyLink = async () => {
    if (!profileUrl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(profileUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = profileUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error('Failed to copy profile link:', err);
    }
  };

  // Handle Share (Web Share API with WhatsApp fallback)
  const handleShare = async () => {
    const shareTitle = `${certificateData.name} (${certificateData.serviceType}) — ${certificateData.websiteNameCombined}`;
    const shareText =
      lang === 'hi'
        ? `${certificateData.websiteName} पर ${certificateData.name} (${certificateData.serviceType}) की प्रोफाइल देखें और सीधे संपर्क करें:\n${profileUrl}`
        : `View ${certificateData.name}'s (${certificateData.serviceType}) profile on ${certificateData.websiteName} and connect directly:\n${profileUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: profileUrl,
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // Handle Direct Print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white"
      onClick={onClose}
    >
      <div
        className="bg-[#f8faf8] border border-[#d5e2da] rounded-3xl w-full max-w-lg max-h-[96vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto text-slate-800 print:border-none print:shadow-none print:max-w-none print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Modal Top Bar (Print-hidden) */}
        <div className="sticky top-0 bg-[#fff4e9] px-4 sm:px-5 py-3 border-b border-[#ebdcc4] flex items-center justify-between z-20 shadow-2xs print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-100 border border-teal-300 flex items-center justify-center text-teal-800">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                {lang === 'hi' ? 'प्रोफ़ाइल QR कोड पहचान पत्र' : 'Profile QR Identity Card'}
              </h2>
              <p
                className="text-[12px] text-slate-500 font-medium break-words leading-tight"
                style={{ fontSize: '12px' }}
              >
                {certificateData.name} ({certificateData.serviceType})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white hover:bg-slate-200 border border-slate-300 text-slate-600 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Unified Certificate Card Preview */}
        <div className="p-4 sm:p-6 space-y-4">
          <WorkerCertificateCard data={certificateData} />

          {/* Quick Action Buttons (Print-hidden) */}
          <div className="space-y-2.5 print:hidden">
            {/* Primary Download Button */}
            <button
              type="button"
              onClick={handleDownloadCard}
              disabled={isGeneratingDownload || !qrDataUrl}
              className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 active:scale-98 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-4 h-4 ${isGeneratingDownload ? 'animate-bounce' : ''}`} />
              <span>
                {isGeneratingDownload
                  ? (lang === 'hi' ? 'कार्ड तैयार हो रहा है...' : 'Generating Identity Card...')
                  : (lang === 'hi' ? 'QR पहचान पत्र डाउनलोड करें (Download Badge)' : 'Download Identity Badge')}
              </span>
            </button>

            {/* Secondary Action Buttons Grid */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="py-2.5 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5 text-teal-700" />
                <span>{shareSuccess ? (lang === 'hi' ? 'साझा हुआ!' : 'Shared!') : (lang === 'hi' ? 'साझा करें' : 'Share')}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="py-2.5 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>{copied ? (lang === 'hi' ? 'कॉपी हुआ!' : 'Copied!') : (lang === 'hi' ? 'लिंक कॉपी' : 'Copy Link')}</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="py-2.5 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>{lang === 'hi' ? 'प्रिंट करें' : 'Print'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
