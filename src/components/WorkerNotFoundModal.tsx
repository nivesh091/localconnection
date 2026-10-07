import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { WorkerCategory } from '../types';
import { RequestService } from '../services/requestService';
import { VoiceRecorder } from './VoiceRecorder';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface WorkerNotFoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories?: WorkerCategory[];
}

export const WorkerNotFoundModal: React.FC<WorkerNotFoundModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const { t } = useTranslation();

  usePopupBackDismiss(isOpen, onClose);

  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceBlob) {
      setErrorMsg('कृपया पहले अपनी आवाज में बोलकर रिकॉर्ड करें।');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const guestId = user ? undefined : `guest_req_${Date.now()}`;
    const res = await RequestService.submitWorkerRequest({
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
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl relative space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header with Exact Required Text */}
        <div className="flex items-start justify-between pb-2 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900 leading-snug pr-2">
            आप हमें बोलकर बताएं कि किस प्रकार की सर्विस या सेवा प्रदाता आपको चाहिए।
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle className="w-12 h-12 text-teal-600 mx-auto" />
            <h4 className="text-base font-bold text-slate-900">अनुरोध दर्ज हो गया है!</h4>
            <p className="text-xs text-slate-600">
              आपकी आवाज हमें प्राप्त हो गई है। हमारी टीम जल्द ही आपसे संपर्क करके उपयुक्त सेवा प्रदाता उपलब्ध कराएगी।
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              title="अपनी जरूरत बोलकर बताएं"
              subtitle="माइक दबाएं और अपनी भाषा में कहें कि किस प्रकार की सर्विस या सेवा प्रदाता चाहिए"
            />

            {/* Action Buttons: "हमें भेजें" */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                {t.cancel || 'रद्द करें'}
              </button>
              <button
                type="submit"
                disabled={!voiceBlob || isSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? (t.loading || 'भेज रहे हैं...') : 'हमें भेजें'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
