import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  Search,
  Filter,
  Play,
  Pause,
  Trash2,
  Shield,
  Disc,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  Save,
  Check,
  X,
} from 'lucide-react';
import { CallingService } from '../services/callingService';
import { CallRecording } from '../types/calling';
import { RecordingGuidelinesModal } from './RecordingGuidelinesModal';
import { AdminService } from '../services/adminService';
import { formatAppTimestamp } from '../lib/dateTime';

export const AdminCallRecordingsSection: React.FC = () => {
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'admin_evidence' | 'personal'>('all');

  // Retention setting state (Requirement 11)
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [isSavingRetention, setIsSavingRetention] = useState<boolean>(false);
  const [retentionNotice, setRetentionNotice] = useState<string | null>(null);

  // Playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [playProgress, setPlayProgress] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  // Deletion state
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState<boolean>(false);
  const [confirmSingleDeleteCallId, setConfirmSingleDeleteCallId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [showGuidelines, setShowGuidelines] = useState<boolean>(false);

  // Fetch admin settings to load current retention days
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await AdminService.getSettings();
        if (settings?.call_recording_retention_days) {
          setRetentionDays(settings.call_recording_retention_days);
        }
      } catch (err) {
        console.warn('Failed to load admin call settings:', err);
      }
    };
    fetchSettings();
  }, []);

  // Fetch recordings
  const loadRecordings = async () => {
    setIsLoading(true);
    setActionNotice(null);
    try {
      const data = await CallingService.getAdminRecordings({
        recordingType: filterType,
        searchTerm,
      });
      setRecordings(data);
    } catch (err: any) {
      console.warn('Failed to load admin recordings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecordings();
  }, [filterType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadRecordings();
  };

  // Save Call Recording Deletion Date (Requirement 11)
  const handleSaveRetention = async () => {
    setIsSavingRetention(true);
    setRetentionNotice(null);

    const res = await CallingService.updateRetentionSetting(retentionDays);
    setIsSavingRetention(false);

    if (res.success) {
      setRetentionNotice('कॉल रिकॉर्डिंग हटाने की समयावधि सफलतापूर्वक सहेजी गई और सभी रिकॉर्डिंग्स की अंतिम तिथि पुनः निर्धारित की गई।');
      setTimeout(() => setRetentionNotice(null), 4000);
      loadRecordings();
    } else {
      setRetentionNotice(res.error || 'सेटिंग सहेजने में त्रुटि');
      setTimeout(() => setRetentionNotice(null), 4000);
    }
  };

  // Toggle Playback
  const handleTogglePlay = async (rec: CallRecording) => {
    if (playingId === rec.id) {
      const audio = audioRefs.current[rec.id];
      if (audio) audio.pause();
      setPlayingId(null);
      return;
    }

    if (playingId && audioRefs.current[playingId]) {
      audioRefs.current[playingId].pause();
    }

    let url = signedUrls[rec.id];
    if (!url) {
      const signed = await CallingService.getRecordingSignedUrl(rec.storage_path, 300);
      if (!signed) {
        setActionNotice('ऑडियो लिंक प्राप्त करने में विफल।');
        setTimeout(() => setActionNotice(null), 3000);
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
    }

    try {
      await audio.play();
      setPlayingId(rec.id);
    } catch {
      setActionNotice('ऑडियो प्लेबैक में त्रुटि।');
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  // Permanent Delete Call Recordings (Requirement 10)
  const handleExecutePermanentDelete = async (callId: string) => {
    setConfirmSingleDeleteCallId(null);
    setDeletingCallId(callId);
    try {
      const res = await CallingService.adminPermanentDeleteCallRecordings(callId);
      if (res.success) {
        setRecordings((prev) => prev.filter((r) => r.call_id !== callId));
        setActionNotice('इस कॉल की सभी रिकॉर्डिंग्स स्टोरेज व डेटाबेस से स्थायी रूप से हटा दी गईं।');
      } else {
        setActionNotice(res.error || 'हटाने में विफलता आई।');
      }
    } catch (err: any) {
      setActionNotice(err?.message || 'हटाने में त्रुटि आई।');
    } finally {
      setDeletingCallId(null);
      setTimeout(() => setActionNotice(null), 3500);
      await loadRecordings();
    }
  };

  // Bulk Permanent Delete All Recordings (Task 1A)
  const handleExecuteDeleteAllRecordings = async () => {
    setConfirmDeleteAllOpen(false);
    if (recordings.length === 0) return;

    setIsDeletingAll(true);
    setActionNotice(null);

    try {
      const res = await CallingService.adminDeleteAllRecordings(filterType);
      if (res.success) {
        setActionNotice(`सफलता: कुल ${res.deletedCount} कॉल रिकॉर्डिंग्स डेटाबेस और स्टोरेज से स्थायी रूप से हटा दी गईं।`);
      } else {
        setActionNotice(res.error || 'रिकॉर्डिंग्स हटाने में आंशिक या पूर्ण त्रुटि आई।');
      }
      await loadRecordings();
    } catch (err: any) {
      setActionNotice(err?.message || 'सभी रिकॉर्डिंग्स हटाने में त्रुटि आई।');
      await loadRecordings();
    } finally {
      setIsDeletingAll(false);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. CALL RECORDING DELETION DATE RETENTION SETTING (Requirement 11)
      ====================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-700" />
            <span>Call Recording Deletion Date (कॉल रिकॉर्डिंग हटाने की तारीख)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            सर्वर पर कॉल रिकॉर्डिंग्स कितने दिनों बाद स्वचालित रूप से हटाई जाएं (1, 10, 15, या 30 दिन)। बदलने पर सभी रिकॉर्डिंग्स की अंतिम तिथि स्वतः पुनः निर्धारित हो जाएगी।
          </p>
        </div>

        {retentionNotice && (
          <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{retentionNotice}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {[1, 10, 15, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRetentionDays(days)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  retentionDays === days
                    ? 'bg-teal-800 text-white border-teal-800 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {days} दिन ({days} Days)
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isSavingRetention}
            onClick={handleSaveRetention}
            className="px-4 py-2 bg-teal-800 hover:bg-teal-900 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            {isSavingRetention ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>सहेजें (Save Retention)</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. CALL RECORDINGS LIST & AUDIT SECTION (Requirement 10)
      ====================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-teal-700" />
              <span>कॉल रिकॉर्डिंग्स (Call Recordings & Evidence)</span>
              <span className="text-xs bg-slate-100 px-2.5 py-0.5 rounded-full text-slate-600 font-bold">
                {recordings.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              प्लेटफ़ॉर्म पर की गई इंटरनेट कॉल्स की प्रशासनिक साक्ष्य एवं व्यक्तिगत रिकॉर्डिंग्स का प्रबंधन
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Delete All Recordings button (Task 1A) */}
            <button
              type="button"
              disabled={isDeletingAll || isLoading || recordings.length === 0}
              onClick={() => setConfirmDeleteAllOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 border border-rose-300 text-xs font-bold transition cursor-pointer"
              title="सभी रिकॉर्डिंग्स स्थायी रूप से हटाएं"
            >
              {isDeletingAll ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              )}
              <span>सभी रिकॉर्डिंग्स हटाएं (Delete All Recordings)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGuidelines(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-teal-50 text-slate-600 hover:text-teal-800 border border-slate-200 text-xs font-bold transition cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-teal-700" />
              <span>रिकॉर्डिंग दिशानिर्देश</span>
            </button>

            <button
              type="button"
              onClick={loadRecordings}
              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition cursor-pointer"
              title="रिफ्रेश करें"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-700' : ''}`} />
            </button>
          </div>
        </div>

        {actionNotice && (
          <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="नाम, मोबाइल या कॉल ID से खोजें..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-700"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 bg-teal-800 text-white rounded-xl text-xs font-bold hover:bg-teal-900 transition cursor-pointer"
            >
              खोजें
            </button>
          </form>

          {/* Type Filter */}
          <div className="flex gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              सभी (All)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('admin_evidence')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterType === 'admin_evidence'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              प्रशासनिक साक्ष्य (Admin)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('personal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterType === 'personal'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              व्यक्तिगत (Personal)
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-teal-700" />
            <span>रिकॉर्डिंग्स लोड हो रही हैं...</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && recordings.length === 0 && (
          <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <Disc className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">कोई कॉल रिकॉर्डिंग नहीं मिली</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              इंटरनेट कॉल्स की रिकॉर्डिंग्स यहाँ दिखाई देंगी।
            </p>
          </div>
        )}

        {/* Recordings Table / List */}
        {!isLoading && recordings.length > 0 && (
          <div className="space-y-3">
            {recordings.map((rec) => {
              const caller = rec.call?.caller;
              const receiver = rec.call?.receiver;
              const isPlaying = playingId === rec.id;
              const progress = playProgress[rec.id] || 0;
              const isAdminEvidence = rec.recording_type === 'admin_evidence';

              const formattedTimestamp = formatAppTimestamp(rec.created_at);

              return (
                <div
                  key={rec.id}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Participant Details */}
                    <div className="flex items-center gap-3">
                      {/* Type Badge */}
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                          isAdminEvidence
                            ? 'bg-teal-100/70 border-teal-300 text-teal-800'
                            : 'bg-slate-200/60 border-slate-300 text-slate-700'
                        }`}
                      >
                        {isAdminEvidence ? (
                          <Shield className="w-5 h-5 text-teal-800" />
                        ) : (
                          <Disc className="w-5 h-5 text-slate-700" />
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {caller?.name || 'कॉलर'} ({caller?.mobile || 'नंबर उपलब्ध नहीं'})
                          </span>
                          <span className="text-xs text-slate-400">➔</span>
                          <span className="text-xs font-bold text-slate-900">
                            {receiver?.name || 'प्राप्तकर्ता'} ({receiver?.mobile || 'नंबर उपलब्ध नहीं'})
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formattedTimestamp}</span>
                          </span>
                          <span>•</span>
                          <span>अवधि: <b>{formatSeconds(rec.duration_seconds || rec.call?.duration_seconds || 0)}</b></span>
                          <span>•</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            ID: {rec.call_id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Deletion Badges */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1 ${
                          isAdminEvidence
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isAdminEvidence ? (
                          <>
                            <Shield className="w-3 h-3 text-teal-700" />
                            <span>प्रशासनिक साक्ष्य (Admin Evidence)</span>
                          </>
                        ) : (
                          <>
                            <Disc className="w-3 h-3 text-slate-600" />
                            <span>व्यक्तिगत कॉपी (Personal Copy)</span>
                          </>
                        )}
                      </span>

                      {/* Expiry Date */}
                      <span className="text-[10px] text-slate-400 bg-white px-2 py-1 rounded-xl border border-slate-200" title={`Expiry: ${rec.expires_at}`}>
                        हटाने की तारीख: {formatAppTimestamp(rec.expires_at, { includeTime: false })}
                      </span>
                    </div>
                  </div>

                  {/* Playback & Action Controls */}
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-3">
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

                    {/* Progress Bar */}
                    <div className="flex-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-teal-700 h-1.5 rounded-full transition-all duration-150"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Permanent Delete Button (Permanent removal of all call copies) */}
                    <button
                      type="button"
                      disabled={deletingCallId === rec.call_id}
                      onClick={() => setConfirmSingleDeleteCallId(rec.call_id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      title="इस कॉल की सभी साक्ष्य व व्यक्तिगत रिकॉर्डिंग्स को सर्वर व स्टोरेज से स्थायी रूप से हटाएं"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>स्थायी रूप से हटाएं (Permanent Delete)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal: Delete All Recordings (Task 1A) */}
      {confirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold text-slate-900 leading-snug">
                  सभी कॉल रिकॉर्डिंग्स स्थायी रूप से हटाएं?
                </h4>
                <p className="text-xs text-rose-700 font-semibold mt-0.5">
                  Permanent & Irreversible Deletion
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
              <p className="font-semibold text-rose-900">
                सावधानी: यह क्रिया पूरी तरह अपरिवर्तनीय है।
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>
                  वर्तमान में फ़िल्टर की गई कुल <strong>{recordings.length}</strong> कॉल रिकॉर्डिंग्स हटाई जाएंगी।
                </li>
                <li>
                  सभी वास्तविक ऑडियो फाइल्स स्टोरेज (<strong>call-recordings</strong> बकेट) से हमेशा के लिए नष्ट हो जाएंगी।
                </li>
                <li>डेटाबेस से सभी संबंधित रिकॉर्ड्स स्थायी रूप से मिटा दिए जाएंगे।</li>
                <li>
                  रद्द (Cancel) करने पर कोई भी फ़ाइल या डेटाबेस रिकॉर्ड नहीं हटाया जाएगा।
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
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={handleExecuteDeleteAllRecordings}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>हटाया जा रहा है...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>हाँ, सभी रिकॉर्डिंग्स हटाएं (Delete All)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Single Call Permanent Delete */}
      {confirmSingleDeleteCallId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold text-slate-900 leading-snug">
                  कॉल रिकॉर्डिंग स्थायी रूप से हटाएं?
                </h4>
                <p className="text-xs text-rose-700 font-semibold mt-0.5">
                  Permanent Delete of All Copies
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              क्या आप इस कॉल की सभी प्रशासनिक साक्ष्य व व्यक्तिगत रिकॉर्डिंग्स को स्टोरेज और डेटाबेस से हमेशा के लिए नष्ट करना चाहते हैं? यह क्रिया वापस नहीं ली जा सकती।
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={deletingCallId !== null}
                onClick={() => setConfirmSingleDeleteCallId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                रद्द करें (Cancel)
              </button>
              <button
                type="button"
                disabled={deletingCallId !== null}
                onClick={() => handleExecutePermanentDelete(confirmSingleDeleteCallId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deletingCallId === confirmSingleDeleteCallId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>हटाया जा रहा है...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>हाँ, स्थायी रूप से हटाएं</span>
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
      />
    </div>
  );
};
