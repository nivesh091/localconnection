import React from 'react';
import { PhoneMissed, Phone, MessageSquare, X, CheckCircle, Clock } from 'lucide-react';
import { CallRecord } from '../types/calling';
import { UserProfile } from '../types';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';

interface MissedCallsModalProps {
  missedCalls: CallRecord[];
  isOpen: boolean;
  onClose: () => void;
  onCallBack?: (caller: UserProfile) => void;
  onOpenChat?: (callerUserId: string, conversationId?: string) => void;
}

/**
 * Format timestamp in friendly localized Hindi
 */
function formatCallTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (diffMins < 1) {
    return 'अभी-अभी';
  }
  if (diffMins < 60) {
    return `${diffMins} मिनट पहले`;
  }
  if (isToday) {
    return `आज, ${timeStr}`;
  }
  if (isYesterday) {
    return `कल, ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString('hi-IN', {
    day: 'numeric',
    month: 'short',
  });
  return `${dateStr}, ${timeStr}`;
}

export const MissedCallsModal: React.FC<MissedCallsModalProps> = ({
  missedCalls,
  isOpen,
  onClose,
  onCallBack,
  onOpenChat,
}) => {
  usePopupBackDismiss(isOpen, onClose);

  if (!isOpen || !missedCalls || missedCalls.length === 0) {
    return null;
  }

  const count = missedCalls.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="missed-calls-title"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-5 pb-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-rose-50/80 via-white to-rose-50/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs shrink-0">
              <PhoneMissed className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 id="missed-calls-title" className="text-base font-bold text-slate-800 leading-tight">
                मिस्ड कॉल अलर्ट
              </h2>
              <p className="text-xs font-semibold text-rose-600">
                {count === 1 ? '1 नई मिस्ड इंटरनेट कॉल' : `${count} नई मिस्ड इंटरनेट कॉल`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
            aria-label="बंद करें"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subtitle notice */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-600 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>जब आप ऐप में उपलब्ध नहीं थे, तब आपको निम्नलिखित कॉल आई थीं:</span>
        </div>

        {/* Scrollable list of missed calls */}
        <div className="p-4 overflow-y-auto space-y-2.5 max-h-[50vh] divide-y divide-slate-100/80">
          {missedCalls.map((call) => {
            const callerProfile = call.caller as UserProfile | undefined;
            const callerName =
              callerProfile?.name?.trim() ||
              (callerProfile?.mobile ? `+${callerProfile.mobile}` : 'उपयोगकर्ता');
            const callerPhoto = callerProfile?.profile_photo;
            const timeLabel = formatCallTime(call.started_at || call.created_at);

            return (
              <div
                key={call.id}
                className="pt-2.5 first:pt-0 flex items-center justify-between gap-3"
              >
                {/* Caller Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    {callerPhoto ? (
                      <img
                        src={callerPhoto}
                        alt={callerName}
                        className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shadow-2xs"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 font-bold text-sm flex items-center justify-center shadow-2xs">
                        {callerName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center border-2 border-white shadow-2xs">
                      <PhoneMissed className="w-2.5 h-2.5" />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate leading-snug">
                      {callerName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md">
                        मिस्ड कॉल
                      </span>
                      {timeLabel && (
                        <span className="text-[11px] text-slate-500 truncate">
                          {timeLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {onCallBack && callerProfile && (
                    <button
                      type="button"
                      onClick={() => onCallBack(callerProfile)}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer"
                      title="कॉल बैक करें"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">कॉल</span>
                    </button>
                  )}

                  {onOpenChat && (
                    <button
                      type="button"
                      onClick={() => onOpenChat(call.caller_id, call.conversation_id || undefined)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                      title="मैसेज भेजें"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">चैट</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-98 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>समझ गया (Acknowledge)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
