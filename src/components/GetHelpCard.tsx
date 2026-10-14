import React, { useState, useEffect } from 'react';
import { Phone, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { AdminSettings } from '../types';
import { AdminService } from '../services/adminService';
import { HelpService } from '../services/helpService';
import { VoiceRecorder } from './VoiceRecorder';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';

interface GetHelpCardProps {
  showCallHelpline?: boolean;
}

export const GetHelpCard: React.FC<GetHelpCardProps> = ({ showCallHelpline = true }) => {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceBlob) {
      setErrorMsg('कृपया पहले अपनी आवाज में सहायता अनुरोध रिकॉर्ड करें।');
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

  return (
    <div className="w-full space-y-4">
      {/* Title / Heading with Exact Required Text (Point 18) */}
      <div
        className="text-center space-y-1"
        style={{ marginLeft: '0px', paddingLeft: '10px', paddingRight: '10px' }}
      >
        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight text-center">
          <span style={{ fontSize: '17px' }}>हमें बताइए कि किस प्रकार की सहायता चाहिए।</span>
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
          माइक दबाएं और अपनी समस्या या सहायता का विवरण बोलकर बताएं।
        </p>
      </div>

      {isSuccess ? (
        <div className="bg-white border border-teal-200 rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <CheckCircle className="w-12 h-12 text-teal-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">सहायता संदेश प्राप्त हो गया है!</h3>
          <p className="text-xs text-slate-600">
            काम मित्र टीम आपके आवाज संदेश को सुनकर जल्द ही सहायता उपलब्ध कराएगी।
          </p>
          <button
            type="button"
            onClick={() => {
              setIsSuccess(false);
              setVoiceBlob(null);
            }}
            className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs rounded-xl transition"
          >
            नया संदेश भेजें
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4"
          style={{ borderColor: '#ffffff', backgroundColor: '#ffffff' }}
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
            title="अपनी समस्या बोलकर बताएं"
            subtitle="माइक दबाकर अपनी बात खुलकर बोलें"
            style={{ backgroundColor: '#daeeff' }}
          />

          {/* Send Button: "हमें भेजें" */}
          <button
            type="submit"
            disabled={!voiceBlob || isSubmitting}
            className="w-full py-3 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span style={{ fontSize: '15px' }}>{isSubmitting ? (t.loading || 'भेज रहे हैं...') : 'हमें भेजें'}</span>
          </button>
        </form>
      )}

      {/* Direct Call Helpline for emergencies: Rendered ONLY if confirmed ON by Admin setting */}
      {isCallConfigured && adminPhone && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 text-center space-y-2">
          <p className="text-xs text-amber-900 font-medium">
            तत्काल सहायता के लिए हमारे हेल्पलाइन नंबर पर कॉल करें:
          </p>
          <a
            href={`tel:${adminPhone}`}
            className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition"
          >
            <Phone className="w-4 h-4" />
            <span>{t.callAdmin || 'Admin को Call करें'} ({adminPhone})</span>
          </a>
        </div>
      )}
    </div>
  );
};
