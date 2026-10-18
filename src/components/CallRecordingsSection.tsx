import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Disc,
  Play,
  Pause,
  Download,
  Share2,
  Trash2,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  ShieldCheck,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CallingService } from '../services/callingService';
import { CallRecording } from '../types/calling';
import { RecordingGuidelinesModal } from './RecordingGuidelinesModal';
import { ProfileService } from '../services/profileService';

interface CallRecordingsSectionProps {
  lang?: 'hi' | 'en';
}

export const CallRecordingsSection: React.FC<CallRecordingsSectionProps> = ({
  lang = 'hi',
}) => {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Preference: Personal Call Recording ON/OFF
  const [personalRecordingEnabled, setPersonalRecordingEnabled] = useState<boolean>(() => {
    return user?.personal_call_recording_enabled !== false;
  });
  const [isUpdatingPreference, setIsUpdatingPreference] = useState(false);

  // Guidelines modal
  const [showGuidelines, setShowGuidelines] = useState(false);

  // Audio Playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [playProgress, setPlayProgress] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  // Deletion confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  // Load recordings
  const loadRecordings = async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await CallingService.getPersonalRecordings(user.id);
      setRecordings(data);
    } catch (err: any) {
      console.warn('Failed to load call recordings:', err);
      setError(
        lang === 'hi'
          ? 'रिकॉर्डिंग लोड करने में विफल। डेटाबेस सेटअप की पुष्टि करें।'
          : 'Failed to load recordings. Verify database setup.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecordings();
  }, [user?.id]);

  // Sync preference if user object changes
  useEffect(() => {
    if (user?.personal_call_recording_enabled !== undefined) {
      setPersonalRecordingEnabled(user.personal_call_recording_enabled);
    }
  }, [user]);

  // Toggle personal recording preference
  const handleTogglePreference = async () => {
    if (!user?.id || isUpdatingPreference) return;
    const nextVal = !personalRecordingEnabled;
    setPersonalRecordingEnabled(nextVal);
    setIsUpdatingPreference(true);
    CallingService.setLocalCallPreference(user.id, 'personalRecordingEnabled', nextVal);

    try {
      await ProfileService.updateProfile(user.id, {
        personal_call_recording_enabled: nextVal,
      } as any);
      setStatusNotice(
        nextVal
          ? (lang === 'hi' ? 'व्यक्तिगत कॉल रिकॉर्डिंग चालू की गई।' : 'Personal call recording turned ON.')
          : (lang === 'hi' ? 'व्यक्तिगत कॉल रिकॉर्डिंग बंद की गई।' : 'Personal call recording turned OFF.')
      );
      setTimeout(() => setStatusNotice(null), 3500);
    } catch (e) {
      console.warn('Failed to update personal recording preference:', e);
    } finally {
      setIsUpdatingPreference(false);
    }
  };

  // Play / Pause Audio
  const handleTogglePlay = async (rec: CallRecording) => {
    // If currently playing this audio, pause it
    if (playingId === rec.id) {
      const audio = audioRefs.current[rec.id];
      if (audio) audio.pause();
      setPlayingId(null);
      return;
    }

    // Stop previous audio
    if (playingId && audioRefs.current[playingId]) {
      audioRefs.current[playingId].pause();
    }

    // Fetch short-lived signed URL if not cached
    let url = signedUrls[rec.id];
    if (!url) {
      const signed = await CallingService.getRecordingSignedUrl(rec.storage_path, 300);
      if (!signed) {
        setStatusNotice(
          lang === 'hi'
            ? 'ऑडियो लिंक प्राप्त करने में विफल।'
            : 'Failed to obtain secure audio link.'
        );
        setTimeout(() => setStatusNotice(null), 3000);
        return;
      }
      url = signed;
      setSignedUrls((prev) => ({ ...prev, [rec.id]: url }));
    }

    let audio = audioRefs.current[rec.id];
    if (!audio) {
      audio = new Audio(url);
      audioRefs.current[rec.id] = audio;

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setPlayProgress((prev) => ({
            ...prev,
            [rec.id]: (audio.currentTime / audio.duration) * 100,
          }));
        }
      };

      audio.onended = () => {
        setPlayingId(null);
        setPlayProgress((prev) => ({ ...prev, [rec.id]: 0 }));
      };

      audio.onerror = () => {
        setPlayingId(null);
        setStatusNotice(
          lang === 'hi' ? 'ऑडियो प्लेबैक में त्रुटि।' : 'Audio playback error.'
        );
        setTimeout(() => setStatusNotice(null), 3000);
      };
    }

    try {
      await audio.play();
      setPlayingId(rec.id);
    } catch (err) {
      console.warn('Playback error:', err);
    }
  };

  // Download Recording
  const handleDownload = async (rec: CallRecording) => {
    let url = signedUrls[rec.id];
    if (!url) {
      url = (await CallingService.getRecordingSignedUrl(rec.storage_path, 300)) || '';
    }
    if (!url) return;

    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `KaamMitra_Call_${rec.call_id.slice(0, 8)}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  };

  // Share Recording
  const handleShare = async (rec: CallRecording) => {
    let url = signedUrls[rec.id];
    if (!url) {
      url = (await CallingService.getRecordingSignedUrl(rec.storage_path, 300)) || '';
    }
    if (!url) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'KaamMitra Call Recording',
          text: 'कॉल रिकॉर्डिंग (सुरक्षित लिंक):',
          url,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareId(rec.id);
      setTimeout(() => setCopiedShareId(null), 3000);
    } catch {}
  };

  // Delete Personal Recording
  const handleDelete = async (rec: CallRecording) => {
    if (!window.confirm(lang === 'hi' ? 'क्या आप इस व्यक्तिगत रिकॉर्डिंग को हटाना चाहते हैं?' : 'Are you sure you want to delete this personal recording?')) {
      return;
    }

    setDeletingId(rec.id);
    const res = await CallingService.deletePersonalRecording(rec.id, rec.storage_path);
    setDeletingId(null);

    if (res.success) {
      setRecordings((prev) => prev.filter((r) => r.id !== rec.id));
      if (playingId === rec.id && audioRefs.current[rec.id]) {
        audioRefs.current[rec.id].pause();
        setPlayingId(null);
      }
      setStatusNotice(
        lang === 'hi'
          ? 'रिकॉर्डिंग सफलतापूर्वक हटा दी गई।'
          : 'Recording deleted successfully.'
      );
      setTimeout(() => setStatusNotice(null), 3500);
    } else {
      setStatusNotice(res.error || (lang === 'hi' ? 'हटाने में विफल।' : 'Failed to delete.'));
      setTimeout(() => setStatusNotice(null), 3500);
    }
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* Notice Banner */}
      {statusNotice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Top Header Card: Title, Personal Toggle, and Guidelines */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-teal-50 text-teal-800 flex items-center justify-center border border-teal-100 shrink-0">
            <Disc className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span>{lang === 'hi' ? 'मेरी कॉल रिकॉर्डिंग्स' : 'My Call Recordings'}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {recordings.length}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {lang === 'hi'
                ? 'निजी इंटरनेट कॉल रिकॉर्डिंग्स (केवल आपके लिए उपलब्ध)'
                : 'Private Internet call recordings (visible only to you)'}
            </p>
          </div>
        </div>

        {/* Guidelines Button */}
        <button
          type="button"
          onClick={() => setShowGuidelines(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-teal-50 text-slate-600 hover:text-teal-800 border border-slate-200 text-[11px] font-bold transition cursor-pointer self-start sm:self-auto"
        >
          <HelpCircle className="w-3.5 h-3.5 text-teal-700" />
          <span>{lang === 'hi' ? 'रिकॉर्डिंग दिशानिर्देश' : 'Recording Guidelines'}</span>
        </button>
      </div>

      {/* Personal Recording ON/OFF Setting Toggle Card */}
      <div className="p-3.5 bg-gradient-to-r from-teal-50/60 to-slate-50 border border-teal-100 rounded-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Mic className={`w-4 h-4 ${personalRecordingEnabled ? 'text-teal-700' : 'text-slate-400'}`} />
          <div>
            <span className="text-xs font-bold text-slate-800 block">
              {lang === 'hi' ? 'व्यक्तिगत कॉल रिकॉर्डिंग' : 'Personal Call Recording'}
            </span>
            <span className="text-[11px] text-slate-500 block">
              {personalRecordingEnabled
                ? (lang === 'hi' ? 'आपकी इंटरनेट कॉल रिकॉर्ड की जाएगी (चालू)' : 'Your Internet calls will be recorded (ON)')
                : (lang === 'hi' ? 'आपकी कॉल रिकॉर्ड नहीं होगी (बंद)' : 'Your calls will not be recorded (OFF)')}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={isUpdatingPreference}
          onClick={handleTogglePreference}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            personalRecordingEnabled ? 'bg-teal-700' : 'bg-slate-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              personalRecordingEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-8 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-teal-700" />
          <span>{lang === 'hi' ? 'रिकॉर्डिंग लोड हो रही हैं...' : 'Loading recordings...'}</span>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadRecordings}
            className="text-[11px] font-bold text-teal-800 hover:underline cursor-pointer"
          >
            {lang === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && recordings.length === 0 && (
        <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="w-12 h-12 rounded-full bg-white shadow-2xs border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
            <Disc className="w-6 h-6 text-slate-400" />
          </div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-700 mb-1">
            {lang === 'hi' ? 'कोई कॉल रिकॉर्डिंग नहीं है' : 'No Call Recordings'}
          </h4>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            {lang === 'hi'
              ? 'जब आप इंटरनेट कॉल करेंगे और व्यक्तिगत रिकॉर्डिंग चालू होगी, तो आपकी रिकॉर्डिंग्स यहाँ सुरक्षित रूप से दिखाई देंगी।'
              : 'When you make Internet calls with personal recording enabled, your recordings will appear securely here.'}
          </p>
        </div>
      )}

      {/* Recording List */}
      {!isLoading && recordings.length > 0 && (
        <div className="space-y-3">
          {recordings.map((rec) => {
            const isCaller = rec.call?.caller_id === user?.id;
            const otherUser = isCaller ? rec.call?.receiver : rec.call?.caller;
            const otherName = otherUser?.name || (lang === 'hi' ? 'उपयोगकर्ता' : 'User');
            const otherPhoto = otherUser?.profile_photo;
            const isPlaying = playingId === rec.id;
            const progress = playProgress[rec.id] || 0;

            const dateStr = new Date(rec.created_at).toLocaleDateString(
              lang === 'hi' ? 'hi-IN' : 'en-US',
              { day: 'numeric', month: 'short', year: 'numeric' }
            );
            const timeStr = new Date(rec.created_at).toLocaleTimeString(
              lang === 'hi' ? 'hi-IN' : 'en-US',
              { hour: '2-digit', minute: '2-digit' }
            );

            return (
              <div
                key={rec.id}
                className="p-3.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl transition space-y-2.5"
              >
                {/* Info Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-teal-100 border border-teal-200 overflow-hidden flex items-center justify-center shrink-0">
                      {otherPhoto ? (
                        <img
                          src={otherPhoto}
                          alt={otherName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-teal-800">
                          {otherName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">{otherName}</span>
                        {isCaller ? (
                          <span
                            className="text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-100 flex items-center gap-0.5"
                            title="Outgoing"
                          >
                            <PhoneOutgoing className="w-2.5 h-2.5" />
                            <span>{lang === 'hi' ? 'आउटगोइंग' : 'Outgoing'}</span>
                          </span>
                        ) : (
                          <span
                            className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 flex items-center gap-0.5"
                            title="Incoming"
                          >
                            <PhoneIncoming className="w-2.5 h-2.5" />
                            <span>{lang === 'hi' ? 'इनकमिंग' : 'Incoming'}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{dateStr}, {timeStr}</span>
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-slate-700">
                          {formatSeconds(rec.duration_seconds || rec.call?.duration_seconds || 0)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Privacy Badge */}
                  <div className="flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-1 rounded-xl border border-teal-100 shrink-0">
                    <ShieldCheck className="w-3 h-3 text-teal-700" />
                    <span>निजी (Private)</span>
                  </div>
                </div>

                {/* Audio Progress Bar & Playback Controls */}
                <div className="bg-white p-2 rounded-xl border border-slate-200/80 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleTogglePlay(rec)}
                    className="w-8 h-8 rounded-full bg-teal-800 hover:bg-teal-900 text-white flex items-center justify-center shrink-0 shadow-2xs transition active:scale-95 cursor-pointer"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </button>

                  {/* Progress Seek Bar */}
                  <div className="flex-1">
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-teal-700 h-1.5 rounded-full transition-all duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Action Buttons: Download, Share, Delete */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownload(rec)}
                      className="p-1.5 text-slate-500 hover:text-teal-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                      title={lang === 'hi' ? 'डाउनलोड करें' : 'Download'}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShare(rec)}
                      className="p-1.5 text-slate-500 hover:text-teal-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                      title={lang === 'hi' ? 'शेयर करें' : 'Share'}
                    >
                      {copiedShareId === rec.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={deletingId === rec.id}
                      onClick={() => handleDelete(rec)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title={lang === 'hi' ? 'हटाएं' : 'Delete'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recording Guidelines Modal */}
      <RecordingGuidelinesModal
        isOpen={showGuidelines}
        onClose={() => setShowGuidelines(false)}
        lang={lang}
      />
    </div>
  );
};
