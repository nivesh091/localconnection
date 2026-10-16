import React, { useState, useEffect } from 'react';
import {
  Phone,
  CheckCircle,
  AlertCircle,
  Send,
  HelpCircle,
  X,
  ChevronRight,
} from 'lucide-react';
import { AdminSettings } from '../types';
import { AdminService } from '../services/adminService';
import { HelpService } from '../services/helpService';
import { VoiceRecorder } from './VoiceRecorder';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface GetHelpCardProps {
  showCallHelpline?: boolean;
  asModal?: boolean;
}

export const GetHelpCard: React.FC<GetHelpCardProps> = ({
  showCallHelpline = true,
  asModal = false,
}) => {
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const { websiteName } = useWebsiteBranding();

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Close modal via browser/mobile Back button cleanly
  usePopupBackDismiss(isOpen, () => {
    setIsOpen(false);
  });

  useEffect(() => {
    let isMounted = true;
    AdminService.getSettings().then((s) => {
      if (isMounted) {
        setSettings(s);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const headingText =
    lang === 'hi'
      ? 'हमें बताएं कि किस प्रकार की सहायता चाहिए'
      : (t?.helpHeading || 'What kind of help do you need? Tell us by voice.');

  const subText =
    lang === 'hi'
      ? 'माइक दबाएं और अपनी समस्या या सहायता का विवरण बोलकर बताएं।'
      : 'Tap the mic and describe your issue or needed help by voice.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceBlob) {
      setErrorMsg(
        lang === 'hi'
          ? 'कृपया पहले अपनी आवाज में सहायता अनुरोध रिकॉर्ड करें।'
          : 'Please record your voice help request first.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const guestId = user ? undefined : `guest_help_${Date.now()}`;
    const res = await HelpService.submitHelpRequest({
      voiceBlob,
      userId: user?.id,
      guestRequestId: guestId,
    });

    setIsSubmitting(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setIsSuccess(true);
      setVoiceBlob(null);
    }
  };

  // Secure Default: UNKNOWN -> HIDDEN
  // The contact number must NOT be rendered unless settings are loaded from DB,
  // showCallHelpline is true, admin_call_enabled is explicitly true,
  // and a valid non-empty contact number is configured.
  const isCallConfigured = Boolean(
    showCallHelpline &&
      settings &&
      settings.admin_call_enabled === true &&
      typeof settings.admin_contact_number === 'string' &&
      settings.admin_contact_number.trim().length > 0
  );

  const adminPhone = isCallConfigured ? settings!.admin_contact_number.trim() : '';

  const handleClose = () => {
    setIsOpen(false);
  };

  // Shared Form & Content Component
  const renderHelpContent = () => (
    <div className="space-y-4">
      {/* Problem Description Subtitle */}
      <div className="text-center px-2">
        <p className="text-xs sm:text-sm text-slate-600">
          {subText}
        </p>
      </div>

      {isSuccess ? (
        <div className="bg-white border border-emerald-200 rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">
            {lang === 'hi' ? 'सहायता संदेश प्राप्त हो गया है!' : 'Help request received!'}
          </h3>
          <p className="text-xs text-slate-600">
            {websiteName}{' '}
            {lang === 'hi'
              ? 'टीम आपके आवाज संदेश को सुनकर जल्द ही सहायता उपलब्ध कराएगी।'
              : 'team will listen to your voice message and provide assistance soon.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setIsSuccess(false);
              setVoiceBlob(null);
            }}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
          >
            {lang === 'hi' ? 'नया संदेश भेजें' : 'Send New Message'}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4"
        >
          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Voice-Only Workflow: Record, Stop, Play/Preview, Delete, Re-record */}
          <VoiceRecorder
            onRecordingChange={(blob) => {
              setVoiceBlob(blob);
              if (blob) setErrorMsg(null);
            }}
            title={lang === 'hi' ? 'अपनी समस्या बोलकर बताएं' : 'Explain your problem by voice'}
            subtitle={lang === 'hi' ? 'माइक दबाकर अपनी बात खुलकर बोलें' : 'Tap the microphone and speak freely'}
          />

          {/* Send Button: "हमें भेजें" */}
          <button
            type="submit"
            disabled={!voiceBlob || isSubmitting}
            className="w-full py-3 bg-gradient-to-r from-[#094838] to-[#083a2d] hover:brightness-110 active:scale-[0.98] text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span style={{ fontSize: '15px' }}>
              {isSubmitting
                ? (t?.loading || (lang === 'hi' ? 'भेज रहे हैं...' : 'Sending...'))
                : (lang === 'hi' ? 'हमें भेजें' : (t?.sendHelp || 'Send to Us'))}
            </span>
          </button>
        </form>
      )}

      {/* Direct Call Helpline for emergencies: Rendered ONLY if confirmed ON by Admin setting */}
      {isCallConfigured && adminPhone && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 text-center space-y-2">
          <p className="text-xs text-amber-900 font-medium">
            {lang === 'hi'
              ? 'तत्काल सहायता के लिए हमारे हेल्पलाइन नंबर पर कॉल करें:'
              : 'Call our helpline for immediate assistance:'}
          </p>
          <a
            href={`tel:${adminPhone}`}
            className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition"
          >
            <Phone className="w-4 h-4" />
            <span>
              {t?.callAdmin || (lang === 'hi' ? 'Admin को Call करें' : 'Call Admin')} ({adminPhone})
            </span>
          </a>
        </div>
      )}
    </div>
  );

  // If asModal is false: Render the full expanded form in place (used on dedicated HelpPage)
  if (!asModal) {
    return (
      <div className="w-full space-y-4">
        {/* Title / Heading */}
        <div
          className="text-center space-y-1"
          style={{ marginLeft: '0px', paddingLeft: '10px', paddingRight: '10px' }}
        >
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight text-center">
            <span style={{ fontSize: '17px' }}>{headingText}</span>
          </h2>
          <p
            style={{
              fontSize: '14px',
              marginBottom: '0px',
              paddingTop: '0px',
              paddingBottom: '6px',
            }}
            className="text-xs text-slate-500"
          >
            {subText}
          </p>
        </div>

        {renderHelpContent()}
      </div>
    );
  }

  // If asModal is true: Render compact clickable card/button + popup modal (matching Favorites pattern)
  return (
    <>
      {/* Compact Button / Card on Profile Page */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between p-3.5 sm:p-4 bg-white hover:bg-emerald-50/40 active:scale-[0.99] border border-slate-200/90 rounded-2xl shadow-2xs hover:shadow-xs transition cursor-pointer text-left group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs group-hover:scale-105 transition-transform">
            <HelpCircle className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base tracking-tight truncate">
                {headingText}
              </h3>
              {voiceBlob && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                  {lang === 'hi' ? 'रिकॉर्डेड' : 'Recorded'}
                </span>
              )}
            </div>
            <p className="text-[12px] sm:text-xs text-slate-500 truncate mt-0.5">
              {lang === 'hi'
                ? 'माइक दबाकर बोलें और सहायता अनुरोध भेजें'
                : 'Tap to record voice and request help'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-600 transition shrink-0 ml-2">
          <ChevronRight className="w-5 h-5" />
        </div>
      </button>

      {/* Help Popup / Modal (matches Favorites popup interaction style) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[45] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
          onClick={handleClose}
        >
          <div
            className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#fff4e9] px-4 sm:px-5 py-3.5 border-b border-[#ebdcc4] flex items-center justify-between z-20 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 shadow-2xs">
                  <HelpCircle className="w-4 h-4 text-emerald-700" />
                </div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight truncate">
                  {headingText}
                </h2>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
                  aria-label={lang === 'hi' ? 'बंद करें' : 'Close'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-3 sm:p-5">
              {renderHelpContent()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
