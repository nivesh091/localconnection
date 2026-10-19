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
  AlertTriangle,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CallingService } from '../services/callingService';
import { CallRecording } from '../types/calling';
import { RecordingGuidelinesModal } from './RecordingGuidelinesModal';
import { ProfileService } from '../services/profileService';
import { useWebsiteBranding } from '../hooks/useWebsiteBranding';
import { formatAppTimestamp } from '../lib/dateTime';

interface CallRecordingsSectionProps {
  lang?: 'hi' | 'en';
}

export const CallRecordingsSection: React.FC<CallRecordingsSectionProps> = ({
  lang = 'hi',
}) => {
  const { user } = useAuth();
  const { websiteName, websiteNameEn } = useWebsiteBranding();
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
  const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState<boolean>(false);
  const [confirmSingleDeleteRec, setConfirmSingleDeleteRec] = useState<CallRecording | null>(null);
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
      a.download = `${websiteNameEn || 'Call'}_${rec.call_id.slice(0, 8)}.webm`;
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
          title: `${websiteName} Call Recording`,
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

  // Delete Individual Personal Recording (Task 1B)
  const handleExecuteDelete = async (rec: CallRecording) => {
    if (!user?.id) return;
    setConfirmSingleDeleteRec(null);
    setDeletingId(rec.id);
    try {
      const res = await CallingService.deletePersonalRecording(rec.id, rec.storage_path, user.id);
      if (res.success) {
        setRecordings((prev) => prev.filter((r) => r.id !== rec.id));
        if (playingId === rec.id && audioRefs.current[rec.id]) {
          audioRefs.current[rec.id].pause();
          setPlayingId(null);
        }
        setStatusNotice(
          lang === 'hi'
            ? 'रिकॉर्डिंग स्टोरेज व डेटाबेस से सफलतापूर्वक हटा दी गई।'
            : 'Recording deleted permanently from storage and database.'
        );
      } else {
        setStatusNotice(res.error || (lang === 'hi' ? 'हटाने में विफल।' : 'Failed to delete.'));
      }
    } catch (err: any) {
      setStatusNotice(err?.message || (lang === 'hi' ? 'त्रुटि आई।' : 'Error occurred.'));
    } finally {
      setDeletingId(null);
      setTimeout(() => setStatusNotice(null), 3500);
      await loadRecordings();
    }
  };

  // Delete All My Personal Recordings (Task 1B)
  const handleExecuteDeleteAll = async () => {
    if (!user?.id || recordings.length === 0) {
      setConfirmDeleteAllOpen(false);
      return;
    }

    setConfirmDeleteAllOpen(false);
    setIsDeletingAll(true);
    setStatusNotice(null);

    try {
      const res = await CallingService.deleteAllUserRecordings(user.id);
      if (res.success) {
        setRecordings([]);
        if (playingId && audioRefs.current[playingId]) {
          audioRefs.current[playingId].pause();
          setPlayingId(null);
        }
        setStatusNotice(
          lang === 'hi'
            ? `आपकी सभी कॉल रिकॉर्डिंग्स (${res.deletedCount} फाइलें) स्थायी रूप से हटा दी गईं।`
            : `All your call recordings (${res.deletedCount} files) were deleted permanently.`
        );
      } else {
        setStatusNotice(
          res.error || (lang === 'hi' ? 'रिकॉर्डिंग्स हटाने में त्रुटि आई।' : 'Failed to delete recordings.')
        );
      }
      await loadRecordings();
    } catch (err: any) {
      setStatusNotice(err?.message || (lang === 'hi' ? 'हटाने में त्रुटि आई।' : 'Error during deletion.'));
      await loadRecordings();
    } finally {
      setIsDeletingAll(false);
      setTimeout(() => setStatusNotice(null), 5000);
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Delete All My Recordings Button (Task 1B) */}
          <button
            type="button"
            disabled={isDeletingAll || isLoading || recordings.length === 0}
            onClick={() => setConfirmDeleteAllOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 border border-rose-200 text-[11px] font-bold transition cursor-pointer self-start sm:self-auto"
            title={lang === 'hi' ? 'मेरी सभी रिकॉर्डिंग्स स्थायी रूप से हटाएं' : 'Delete all my recordings'}
          >
            {isDeletingAll ? (
              <RefreshCw className="w-3 h-3 animate-spin text-rose-600" />
            ) : (
              <Trash2 className="w-3 h-3 text-rose-600" />
            )}
            <span>
              {lang === 'hi' ? 'मेरी सभी रिकॉर्डिंग्स हटाएं (Delete All My Recordings)' : 'Delete All My Recordings'}
            </span>
          </button>

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

            const formattedTimestamp = formatAppTimestamp(rec.created_at, { lang });

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
                          <span>{formattedTimestamp}</span>
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
                      onClick={() => setConfirmSingleDeleteRec(rec)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title={lang === 'hi' ? 'स्थायी रूप से हटाएं' : 'Permanently Delete'}
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

      {/* Confirmation Modal: Delete All My Recordings (Task 1B) */}
      {confirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold text-slate-900 leading-snug">
                  {lang === 'hi'
                    ? 'मेरी सभी कॉल रिकॉर्डिंग्स हटाएं?'
                    : 'Delete All My Call Recordings?'}
                </h4>
                <p className="text-xs text-rose-700 font-semibold mt-0.5">
                  {lang === 'hi'
                    ? 'स्थायी व अपरिवर्तनीय विलोपन'
                    : 'Permanent & Irreversible Deletion'}
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
              <p className="font-semibold text-rose-900">
                {lang === 'hi'
                  ? 'सावधानी: यह क्रिया वापस नहीं ली जा सकती।'
                  : 'Warning: This action cannot be undone.'}
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>
                  {lang === 'hi' ? (
                    <>
                      आपकी कुल <strong>{recordings.length}</strong> व्यक्तिगत कॉल रिकॉर्डिंग्स हमेशा के लिए हटाई जाएंगी।
                    </>
                  ) : (
                    <>
                      All <strong>{recordings.length}</strong> of your personal recordings will be deleted permanently.
                    </>
                  )}
                </li>
                <li>
                  {lang === 'hi'
                    ? 'सभी ऑडियो फाइल्स स्टोरेज से नष्ट कर दी जाएंगी।'
                    : 'All audio files will be deleted from storage.'}
                </li>
                <li>
                  {lang === 'hi'
                    ? 'डेटाबेस से सभी रिकॉर्ड्स मिटा दिए जाएंगे।'
                    : 'All database records will be removed.'}
                </li>
                <li>
                  {lang === 'hi'
                    ? 'रद्द (Cancel) करने पर कोई रिकॉर्डिंग नहीं हटेगी।'
                    : 'Cancelling will leave all recordings untouched.'}
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={() => setConfirmDeleteAllOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                {lang === 'hi' ? 'रद्द करें (Cancel)' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={handleExecuteDeleteAll}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{lang === 'hi' ? 'हटाया जा रहा है...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'hi'
                        ? 'हाँ, सभी हटाएं (Delete All)'
                        : 'Yes, Delete All'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Single Personal Recording Delete */}
      {confirmSingleDeleteRec && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold text-slate-900 leading-snug">
                  {lang === 'hi'
                    ? 'व्यक्तिगत रिकॉर्डिंग हटाएं?'
                    : 'Delete Personal Recording?'}
                </h4>
                <p className="text-xs text-rose-700 font-semibold mt-0.5">
                  {lang === 'hi'
                    ? 'स्थायी रूप से हटाएं'
                    : 'Permanent Deletion'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {lang === 'hi'
                ? 'क्या आप इस व्यक्तिगत कॉल रिकॉर्डिंग को हमेशा के लिए हटाना चाहते हैं? इसकी ऑडियो फ़ाइल स्टोरेज और डेटाबेस से पूरी तरह नष्ट कर दी जाएगी।'
                : 'Are you sure you want to permanently delete this personal recording? Its audio file and database record will be permanently deleted.'}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setConfirmSingleDeleteRec(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                {lang === 'hi' ? 'रद्द करें (Cancel)' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => handleExecuteDelete(confirmSingleDeleteRec)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deletingId === confirmSingleDeleteRec.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{lang === 'hi' ? 'हटाया जा रहा है...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{lang === 'hi' ? 'हाँ, हटाएं' : 'Yes, Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
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
