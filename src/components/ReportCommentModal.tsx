import React, { useState } from 'react';
import { Flag, X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { CommentItem, ReportReason } from '../types';
import { CommentService } from '../services/commentService';
import { useTranslation } from '../hooks/useTranslation';

export interface ReportCommentModalProps {
  isOpen: boolean;
  comment: CommentItem | null;
  currentUserId: string;
  onClose: () => void;
  onReportSuccess: (commentId: string) => void;
}

const REPORT_REASONS: {
  value: ReportReason;
  labelHi: string;
  labelEn: string;
  descHi: string;
  descEn: string;
}[] = [
  {
    value: 'inappropriate',
    labelHi: 'अनुचित या आपत्तिजनक सामग्री',
    labelEn: 'Inappropriate Content',
    descHi: 'अश्लील, भड़काऊ या अभद्र टिप्पणी',
    descEn: 'Vulgar, offensive, or inappropriate language',
  },
  {
    value: 'harassment',
    labelHi: 'उत्पीड़न या अभद्र व्यवहार',
    labelEn: 'Harassment or Abuse',
    descHi: 'व्यक्तिगत हमला, धमकी या गाली-गलौज',
    descEn: 'Personal attacks, threats, or insults',
  },
  {
    value: 'spam',
    labelHi: 'स्पैम या अवांछित प्रचार',
    labelEn: 'Spam or Advertising',
    descHi: 'बार-बार एक ही संदेश या अनधिकृत विज्ञापन',
    descEn: 'Commercial advertising, repetitive or irrelevant spam',
  },
  {
    value: 'hate_speech',
    labelHi: 'नफरत फैलाने वाली भाषा',
    labelEn: 'Hate Speech',
    descHi: 'धर्म, जाति या समुदाय के विरुद्ध अपमानजनक बातें',
    descEn: 'Discrimination or hatred based on identity',
  },
  {
    value: 'misinformation',
    labelHi: 'धोखाधड़ी या गलत जानकारी',
    labelEn: 'Fraud or Misinformation',
    descHi: 'नकली प्रस्ताव, धोखाधड़ी या भ्रामक दावे',
    descEn: 'Scams, fraud, or deliberately misleading content',
  },
  {
    value: 'other',
    labelHi: 'अन्य कारण',
    labelEn: 'Other',
    descHi: 'अन्य कोई कारण जो नियमों के विरुद्ध है',
    descEn: 'Any other violation of community guidelines',
  },
];

export const ReportCommentModal: React.FC<ReportCommentModalProps> = ({
  isOpen,
  comment,
  currentUserId,
  onClose,
  onReportSuccess,
}) => {
  const { lang } = useTranslation();

  const [selectedReason, setSelectedReason] = useState<ReportReason>('inappropriate');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !comment) return null;

  const authorName = comment.author?.name || (lang === 'hi' ? 'उपयोगकर्ता' : 'User');
  const previewText =
    comment.text ||
    (comment.voice_url ? (lang === 'hi' ? '🎤 ऑडियो संदेश' : '🎤 Voice message') : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      setErrorMsg(
        lang === 'hi'
          ? 'रिपोर्ट करने के लिए कृपया पहले लॉगिन करें।'
          : 'Please sign in to report a comment.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await CommentService.reportComment({
        commentId: comment.id,
        reporterId: currentUserId,
        reason: selectedReason,
        details: details.trim() || undefined,
      });

      if (res.success) {
        setSuccessMsg(
          lang === 'hi'
            ? 'धन्यवाद! आपकी रिपोर्ट मॉडरेटर समीक्षा के लिए दर्ज कर ली गई है।'
            : 'Thank you! Your report has been submitted for moderator review.'
        );
        onReportSuccess(comment.id);
        setTimeout(() => {
          setIsSubmitting(false);
          setSuccessMsg(null);
          setDetails('');
          setSelectedReason('inappropriate');
          onClose();
        }, 1400);
      } else if (res.alreadyReported) {
        setErrorMsg(
          lang === 'hi'
            ? 'आप पहले ही इस टिप्पणी की रिपोर्ट कर चुके हैं। हमारे मॉडरेटर इसकी समीक्षा कर रहे हैं।'
            : 'You have already reported this comment. Our moderators are reviewing it.'
        );
        onReportSuccess(comment.id);
        setIsSubmitting(false);
      } else {
        setErrorMsg(
          res.error ||
            (lang === 'hi'
              ? 'रिपोर्ट भेजने में समस्या आई।'
              : 'Failed to submit report. Please try again.')
        );
        setIsSubmitting(false);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : lang === 'hi'
          ? 'अज्ञात त्रुटि हुई।'
          : 'An unexpected error occurred.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-amber-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
              <Flag className="w-5 h-5 fill-amber-600 text-amber-700" />
            </div>
            <div>
              <h3 id="report-modal-title" className="text-sm sm:text-base font-bold text-slate-900">
                {lang === 'hi' ? 'टिप्पणी की रिपोर्ट करें' : 'Report Comment'}
              </h3>
              <p className="text-xs text-slate-500">
                {lang === 'hi'
                  ? 'मॉडरेटर समीक्षा के लिए सामग्री को फ्लैग करें'
                  : 'Flag inappropriate content for moderator review'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Comment Snippet Preview */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
            <div className="flex items-center gap-2 font-medium text-slate-700">
              <span className="text-slate-400">{lang === 'hi' ? 'टिप्पणीकर्ता:' : 'Author:'}</span>
              <span className="font-bold text-slate-800">{authorName}</span>
            </div>
            {previewText && (
              <p className="text-slate-600 line-clamp-3 italic bg-white p-2 rounded-lg border border-slate-200/80">
                &ldquo;{previewText}&rdquo;
              </p>
            )}
          </div>

          {/* Reason Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              {lang === 'hi' ? 'रिपोर्ट का कारण चुनें *' : 'Select Reason for Reporting *'}
            </label>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => {
                const isSelected = selectedReason === r.value;
                return (
                  <label
                    key={r.value}
                    className={`flex items-start gap-3 p-2.5 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-400'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={r.value}
                      checked={isSelected}
                      onChange={() => setSelectedReason(r.value)}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800">
                        {lang === 'hi' ? r.labelHi : r.labelEn}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {lang === 'hi' ? r.descHi : r.descEn}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Additional Details */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              {lang === 'hi'
                ? 'अतिरिक्त विवरण (वैकल्पिक)'
                : 'Additional Details (Optional)'}
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                lang === 'hi'
                  ? 'बताएं कि यह टिप्पणी क्यों अनुचित है ताकि मॉडरेटर त्वरित निर्णय ले सकें...'
                  : 'Explain why this comment is inappropriate to help moderators review quickly...'
              }
              className="w-full p-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-amber-600 bg-white placeholder:text-slate-400"
            />
            <div className="text-right text-[10px] text-slate-400">
              {details.length}/500
            </div>
          </div>

          {/* Feedback states */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs text-emerald-800">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer disabled:opacity-50"
            >
              {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(successMsg)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{lang === 'hi' ? 'भेज रहे हैं...' : 'Submitting...'}</span>
                </>
              ) : (
                <>
                  <Flag className="w-3.5 h-3.5 fill-white" />
                  <span>{lang === 'hi' ? 'रिपोर्ट सबमिट करें' : 'Submit Report'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
