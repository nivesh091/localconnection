import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';

interface VoiceRecorderProps {
  onRecordingComplete?: (blob: Blob) => void;
  onRecordingChange?: (blob: Blob | null) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  saveLabel?: string;
  isSaving?: boolean;
  style?: React.CSSProperties;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onRecordingComplete,
  onRecordingChange,
  onCancel,
  title = 'अपनी आवाज में बोलें',
  subtitle,
  saveLabel = 'सहेजें (Save)',
  isSaving = false,
  style,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

        // Inform listeners of the ready recording for preview
        onRecordingChange?.(blob);

        // Stop all audio tracks
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
      console.warn('Microphone access error:', err);
      setPermissionError('माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन की अनुमति दें।');
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
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordSeconds(0);
    setIsRecording(false);
    onRecordingChange?.(null);
  };

  const reRecord = async () => {
    deleteRecording();
    await startRecording();
  };

  const handleSave = () => {
    if (recordedBlob && onRecordingComplete) {
      onRecordingComplete(recordedBlob);
    }
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div
      className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 text-center"
      style={style}
    >
      {title && <h3 style={{ fontSize: '17px' }} className="font-semibold text-slate-800 mb-1">{title}</h3>}
      {subtitle && <p style={{ fontSize: '14px' }} className="text-slate-500 mb-3">{subtitle}</p>}

      {permissionError && (
        <div className="flex items-center gap-2 p-2.5 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-left">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{permissionError}</span>
        </div>
      )}

      {/* Recording State */}
      {isRecording ? (
        <div className="py-4 space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
            <span className="text-sm font-mono font-bold text-rose-700">
              रिकॉर्डिंग जारी है... {formatTimer(recordSeconds)}
            </span>
          </div>

          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-sm font-bold rounded-full shadow-md transition"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>रोकें (Stop)</span>
          </button>
        </div>
      ) : recordedBlob && recordedUrl ? (
        /* Preview State (Play/Preview, Delete, Re-record) */
        <div className="py-2 space-y-3">
          <AudioPlayer src={recordedUrl} title="आपकी आवाज (Preview)" />

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={deleteRecording}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold transition"
              title="रिकॉर्डिंग हटाएं"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>हटाएं</span>
            </button>

            <button
              type="button"
              onClick={reRecord}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition shadow-2xs"
              title="दोबारा रिकॉर्ड करें"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>दोबारा रिकॉर्ड करें</span>
            </button>

            {onRecordingComplete && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'सहेज रहे हैं...' : saveLabel}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Initial Ready State */
        <div className="py-4 space-y-2">
          <button
            type="button"
            onClick={startRecording}
            className="w-16 h-16 mx-auto rounded-full bg-teal-700 hover:bg-teal-800 active:scale-95 text-white flex items-center justify-center shadow-lg transition"
            title="रिकॉर्ड शुरू करें"
          >
            <Mic className="w-7 h-7" />
          </button>
          <p style={{ fontSize: '14px' }} className="font-medium text-slate-600">माइक दबाकर बोलना शुरू करें (Record)</p>
        </div>
      )}
    </div>
  );
};
