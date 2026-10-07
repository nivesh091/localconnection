import React, { useState, useRef, useEffect } from 'react';
import { X, Mic, Square, Trash2, Play, Pause, AlertCircle, CheckCircle2, Loader2, Volume2 } from 'lucide-react';
import { UserProfile, WorkerProfile } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { ComplaintService } from '../services/complaintService';

export interface ReportProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: UserProfile;
  worker?: WorkerProfile | null;
  currentUser: UserProfile;
}

export const ReportProviderModal: React.FC<ReportProviderModalProps> = ({
  isOpen,
  onClose,
  provider,
  worker,
  currentUser,
}) => {
  const { lang } = useTranslation();

  // Handle browser back button dismissing modal cleanly
  usePopupBackDismiss(isOpen, onClose);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Audio playback preview state
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount or URL change
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [recordedUrl]);

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setIsRecording(false);
      setRecordedBlob(null);
      setRecordedUrl(null);
      setRecordSeconds(0);
      setPermissionError(null);
      setSubmitError(null);
      setIsSuccess(false);
      setIsPlayingPreview(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getSupportedMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/aac',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };

  const startRecording = async () => {
    setPermissionError(null);
    setSubmitError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalType });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('Microphone permission error:', err);
      setPermissionError(
        lang === 'hi'
          ? 'माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन की अनुमति दें।'
          : 'Microphone access denied. Please allow microphone access in your browser settings.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const deleteRecording = () => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordSeconds(0);
    setIsRecording(false);
    setIsPlayingPreview(false);
  };

  const togglePreviewPlay = () => {
    if (!audioPreviewRef.current) return;
    if (isPlayingPreview) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleSubmit = async () => {
    if (!recordedBlob) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const { complaint, error } = await ComplaintService.submitComplaint({
      userId: currentUser.id,
      providerId: provider.id,
      providerName: provider.name,
      voiceBlob: recordedBlob,
    });

    setIsSubmitting(false);

    if (error || !complaint) {
      setSubmitError(
        error ||
          (lang === 'hi'
            ? 'शिकायत दर्ज करने में समस्या आई। कृपया पुनः प्रयास करें।'
            : 'Could not submit complaint. Please try again.')
      );
      return;
    }

    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2400);
  };

  const providerCategory = worker?.category?.name_hi && lang === 'hi'
    ? worker.category.name_hi
    : worker?.category?.name_en || worker?.other_category || '';

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#fff8f6] px-4 sm:px-5 py-3.5 border-b border-[#f3d9d4] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
              {lang === 'hi' ? 'शिकायत दर्ज करें' : 'Report Service Provider'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            aria-label="बंद करें"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Success Notification */}
          {isSuccess ? (
            <div className="py-6 flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {lang === 'hi' ? 'शिकायत सफलतापूर्वक दर्ज हुई' : 'Complaint Submitted Successfully'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-xs leading-relaxed">
                {lang === 'hi'
                  ? 'आपकी आवाज में दर्ज शिकायत व्यवस्थापक (Admin) तक पहुंच गई है। इसकी शीघ्र समीक्षा की जाएगी।'
                  : 'Your voice complaint has been submitted to the Admin for review.'}
              </p>
            </div>
          ) : (
            <>
              {/* Target Service Provider Info Banner */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-600 text-sm">
                  {provider.profile_photo ? (
                    <img
                      src={provider.profile_photo}
                      alt={provider.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{provider.name?.charAt(0) || 'P'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500 font-medium">
                    {lang === 'hi' ? 'सेवा प्रदाता' : 'Service Provider'}
                  </p>
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {provider.name}
                  </p>
                  {providerCategory && (
                    <p className="text-[11px] text-teal-700 font-medium truncate">
                      {providerCategory}
                    </p>
                  )}
                </div>
              </div>

              {/* Exact Prompt Question */}
              <div className="text-center pt-1 px-1">
                <h3 className="text-sm sm:text-base font-bold text-slate-800 leading-snug">
                  {lang === 'hi'
                    ? 'बताइए, आपको इस Service Provider से क्या समस्या हुई?'
                    : 'Please tell us what problem you faced with this Service Provider.'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
                  {lang === 'hi'
                    ? 'अपनी समस्या नीचे दिए गए माइक को दबाकर केवल अपनी आवाज में रिकॉर्ड करें।'
                    : 'Please record your problem using your voice only using the microphone below.'}
                </p>
              </div>

              {/* Error alerts */}
              {permissionError && (
                <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{permissionError}</span>
                </div>
              )}

              {submitError && (
                <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* VOICE RECORDER CARD (Voice Only - No Text Field) */}
              <div className="bg-[#faf8f5] border border-[#ebdcc4] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center">
                {!isRecording && !recordedBlob && (
                  <div className="flex flex-col items-center py-2 space-y-3">
                    <button
                      type="button"
                      onClick={startRecording}
                      className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition cursor-pointer"
                      title={lang === 'hi' ? 'रिकॉर्ड शुरू करें' : 'Start Recording'}
                    >
                      <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
                    </button>
                    <p className="text-xs font-semibold text-slate-700">
                      {lang === 'hi' ? 'माइक दबाकर बोलना शुरू करें' : 'Tap microphone to speak'}
                    </p>
                  </div>
                )}

                {/* Actively Recording State */}
                {isRecording && (
                  <div className="flex flex-col items-center py-2 space-y-3 w-full">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
                      <span className="text-base font-bold text-rose-600 font-mono">
                        {formatTimer(recordSeconds)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium">
                      {lang === 'hi' ? 'रिकॉर्डिंग चालू है... अपनी समस्या बताएं' : 'Recording in progress... speak now'}
                    </p>

                    <button
                      type="button"
                      onClick={stopRecording}
                      className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md hover:bg-slate-800 active:scale-95 transition cursor-pointer mt-1"
                      title={lang === 'hi' ? 'रिकॉर्डिंग रोकें' : 'Stop Recording'}
                    >
                      <Square className="w-6 h-6 fill-white" />
                    </button>
                    <span className="text-[11px] text-slate-500">
                      {lang === 'hi' ? 'पूरा होने पर रोकें (Stop)' : 'Tap to stop when finished'}
                    </span>
                  </div>
                )}

                {/* Recorded Audio Preview State */}
                {!isRecording && recordedBlob && recordedUrl && (
                  <div className="w-full flex flex-col items-center space-y-3 py-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <Volume2 className="w-4 h-4 text-teal-700" />
                      <span>
                        {lang === 'hi' ? 'रिकॉर्ड किया गया ऑडियो' : 'Recorded Audio'} ({formatTimer(recordSeconds)})
                      </span>
                    </div>

                    {/* Audio Preview Element */}
                    <audio
                      ref={audioPreviewRef}
                      src={recordedUrl}
                      onEnded={() => setIsPlayingPreview(false)}
                      className="hidden"
                    />

                    {/* Playback & Delete Controls */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={togglePreviewPlay}
                        className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-xs"
                      >
                        {isPlayingPreview ? (
                          <>
                            <Pause className="w-3.5 h-3.5 fill-white" />
                            <span>{lang === 'hi' ? 'रोकें' : 'Pause'}</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>{lang === 'hi' ? 'सुनें (Play)' : 'Play Preview'}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={deleteRecording}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title={lang === 'hi' ? 'हटाएं व पुनः रिकॉर्ड करें' : 'Delete & record again'}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-600" />
                        <span>{lang === 'hi' ? 'पुनः रिकॉर्ड' : 'Re-record'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!recordedBlob || isRecording || isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{lang === 'hi' ? 'भेजा जा रहा है...' : 'Submitting...'}</span>
                    </>
                  ) : (
                    <span>{lang === 'hi' ? 'शिकायत भेजें' : 'Submit Complaint'}</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
