import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Mic,
  CornerDownRight,
  Edit2,
  Trash2,
  Check,
  X,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';
import { CommentItem, CommentReference } from '../types';
import { CommentService } from '../services/commentService';
import { WorkerService } from '../services/workerService';
import { VoiceRecorder } from './VoiceRecorder';
import { CompactAudioPlayer } from './CompactAudioPlayer';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import verificationLogo from '@/verificationlogo.png';

export interface CommentsSectionProps {
  targetType: 'worker' | 'requirement';
  targetId: string;
  targetOwnerId?: string;
  onOpenAuthorProfile: (authorId: string, commentRef: CommentReference) => void;
  onRequireAuth: () => void;
  highlightCommentId?: string | null;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  targetType,
  targetId,
  targetOwnerId,
  onOpenAuthorProfile,
  onRequireAuth,
  highlightCommentId,
}) => {
  const { user, isAdmin } = useAuth();
  const { lang } = useTranslation();

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Collect all author IDs across all top-level comments and replies
  const authorIds = React.useMemo(() => {
    const ids = new Set<string>();
    const collect = (list: CommentItem[]) => {
      for (const c of list) {
        if (c.author_id) ids.add(c.author_id);
        if (c.replies) collect(c.replies);
      }
    };
    collect(comments);
    return Array.from(ids);
  }, [comments]);

  const [workerUserIds, setWorkerUserIds] = useState<Set<string>>(() =>
    WorkerService.getCachedWorkerUserIds(authorIds)
  );

  useEffect(() => {
    if (authorIds.length === 0) return;
    let isMounted = true;
    WorkerService.getValidWorkerUserIds(authorIds).then((set) => {
      if (isMounted) setWorkerUserIds(set);
    });
    return () => {
      isMounted = false;
    };
  }, [authorIds]);

  // Top-level new comment form state
  const [newText, setNewText] = useState('');
  const [newVoiceBlob, setNewVoiceBlob] = useState<Blob | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline reply form state
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyVoiceBlob, setReplyVoiceBlob] = useState<Blob | null>(null);
  const [showReplyVoiceRecorder, setShowReplyVoiceRecorder] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Inline edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Deletion confirm state
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load comments
  const loadComments = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const res = await CommentService.getComments(targetType, targetId);
    setIsLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setComments(res.comments);
    }
  };

  useEffect(() => {
    if (targetId) {
      loadComments();
    }
  }, [targetType, targetId]);

  // Scroll to and highlight targeted comment from notification
  useEffect(() => {
    if (!highlightCommentId || isLoading) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`comment-${highlightCommentId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [highlightCommentId, isLoading, comments]);

  // Determine permissions
  const isTargetOwner = Boolean(user && targetOwnerId && user.id === targetOwnerId);

  // Construct structured CommentReference for opening author profile -> chat
  const makeCommentReference = (item: CommentItem): CommentReference => {
    let preview = item.text?.trim() || '';
    if (!preview && item.voice_storage_path) {
      preview = lang === 'hi' ? '🎤 ऑडियो मैसेज भेजें' : '🎤 Voice comment';
    } else if (preview && item.voice_storage_path) {
      preview = `${preview} (🎤)`;
    }

    return {
      commentId: item.id,
      authorId: item.author_id,
      authorName: item.author?.name || (lang === 'hi' ? 'उपयोगकर्ता' : 'User'),
      textPreview: preview,
      hasVoice: Boolean(item.voice_storage_path),
      targetType,
      targetId,
    };
  };

  // Submit top-level comment (saved comment placed at the top — NEWEST FIRST)
  const handleCreateComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }

    const trimmed = newText.trim();
    if (!trimmed && !newVoiceBlob) {
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await CommentService.createComment({
      authorId: user.id,
      targetType,
      targetId,
      targetOwnerId,
      text: trimmed || undefined,
      voiceBlob: newVoiceBlob || undefined,
      authorProfile: {
        name: user.name || 'उपयोगकर्ता',
        profile_photo: user.profile_photo || null,
      },
    });

    setIsSubmitting(false);

    if (res.error || !res.comment) {
      setErrorMsg(res.error || (lang === 'hi' ? 'टिप्पणी पोस्ट नहीं हो सकी।' : 'Failed to post comment.'));
    } else {
      setNewText('');
      setNewVoiceBlob(null);
      setShowVoiceRecorder(false);
      // Newest comment added directly to top of list
      setComments((prev) => [res.comment!, ...prev]);
    }
  };

  // Submit reply
  const handleCreateReply = async (parentCommentId: string) => {
    if (!user) {
      onRequireAuth();
      return;
    }

    const trimmed = replyText.trim();
    if (!trimmed && !replyVoiceBlob) return;

    setIsSubmittingReply(true);
    setErrorMsg(null);

    const res = await CommentService.createComment({
      authorId: user.id,
      targetType,
      targetId,
      targetOwnerId,
      parentCommentId,
      text: trimmed || undefined,
      voiceBlob: replyVoiceBlob || undefined,
      authorProfile: {
        name: user.name || 'उपयोगकर्ता',
        profile_photo: user.profile_photo || null,
      },
    });

    setIsSubmittingReply(false);

    if (res.error || !res.comment) {
      setErrorMsg(res.error || (lang === 'hi' ? 'जवाब पोस्ट नहीं हो सका।' : 'Failed to post reply.'));
    } else {
      setReplyText('');
      setReplyVoiceBlob(null);
      setShowReplyVoiceRecorder(false);
      setReplyingCommentId(null);

      // Append reply to parent comment locally
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === parentCommentId) {
            const currentReplies = c.replies || [];
            return {
              ...c,
              replies: [...currentReplies, res.comment!],
              replies_count: (c.replies_count || 0) + 1,
            };
          }
          return c;
        })
      );
    }
  };

  // Submit edit
  const handleSaveEdit = async (commentId: string, parentCommentId?: string | null) => {
    if (!user) return;
    const trimmed = editText.trim();
    if (!trimmed) return;

    setIsSubmittingEdit(true);
    setErrorMsg(null);

    const res = await CommentService.updateComment({
      commentId,
      authorId: user.id,
      text: trimmed,
    });

    setIsSubmittingEdit(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setEditingCommentId(null);
      setEditText('');

      // Update local state
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return { ...c, text: trimmed, updated_at: new Date().toISOString() };
          }
          if (parentCommentId && c.id === parentCommentId) {
            return {
              ...c,
              replies: (c.replies || []).map((r) =>
                r.id === commentId ? { ...r, text: trimmed, updated_at: new Date().toISOString() } : r
              ),
            };
          }
          return c;
        })
      );
    }
  };

  // Submit delete
  const handleConfirmDelete = async (commentId: string, parentCommentId?: string | null) => {
    if (!user) return;
    setIsDeleting(true);
    setErrorMsg(null);

    const res = await CommentService.deleteComment({
      commentId,
      currentUserId: user.id,
    });

    setIsDeleting(false);
    setDeletingCommentId(null);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      // Remove from local state
      if (parentCommentId) {
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === parentCommentId) {
              const updatedReplies = (c.replies || []).filter((r) => r.id !== commentId);
              return {
                ...c,
                replies: updatedReplies,
                replies_count: Math.max(0, (c.replies_count || 1) - 1),
              };
            }
            return c;
          })
        );
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    }
  };

  // Helper format time
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // Render individual comment item (used for both parent comments and child replies)
  const renderCommentCard = (item: CommentItem, isReply = false, parentId?: string) => {
    const isOwn = user?.id === item.author_id;
    const canDelete = isOwn || isTargetOwner || isAdmin;
    const isEditingThis = editingCommentId === item.id;
    const isDeletingThis = deletingCommentId === item.id;
    const isEdited =
      item.updated_at &&
      new Date(item.updated_at).getTime() - new Date(item.created_at).getTime() > 2000;

    const authorPhoto = item.author?.profile_photo;
    const authorName = item.author?.name || (lang === 'hi' ? 'उपयोगकर्ता' : 'User');
    const firstLetter = authorName.charAt(0).toUpperCase();
    const isHighlighted = highlightCommentId === item.id;
    const isAuthorWorker = workerUserIds.has(item.author_id);

    return (
      <div
        key={item.id}
        id={`comment-${item.id}`}
        style={{
          paddingTop: '13px',
          paddingBottom: '11px',
          paddingLeft: '4px',
          paddingRight: '4px',
          marginRight: '0px',
          backgroundColor: isReply ? '#f4f4f4' : '#a9caca',
          ...(isReply ? { marginLeft: '40px' } : {}),
        }}
        className={`rounded-2xl transition-all ${
          isHighlighted
            ? targetType === 'worker'
              ? 'ring-2 ring-emerald-500 bg-emerald-50/80 border-2 border-emerald-500 shadow-md'
              : 'ring-2 ring-amber-500 bg-amber-50/80 border-2 border-amber-500 shadow-md'
            : isReply
            ? 'border border-slate-200/80 mt-2'
            : 'border border-slate-200 shadow-2xs'
        }`}
      >
        {/* Comment Header: Author Photo + Author Name (TAPPABLE to open author profile) */}
        <div
          style={{
            backgroundColor: '#f2fef6',
            borderRadius: '20px',
            paddingLeft: '10px',
            paddingRight: '5px',
            paddingTop: '4px',
            paddingBottom: '4px',
          }}
          className="flex items-center justify-between gap-2"
        >
          <button
            type="button"
            onClick={() => onOpenAuthorProfile(item.author_id, makeCommentReference(item))}
            className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none min-w-0"
            title={lang === 'hi' ? `${authorName} की प्रोफाइल देखें` : `View ${authorName}'s profile`}
          >
            {/* Real Author Profile Photo with fallback */}
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden bg-slate-200 shrink-0 border border-slate-300 shadow-2xs group-hover:ring-2 group-hover:ring-teal-700 transition">
              {authorPhoto ? (
                <img
                  src={authorPhoto}
                  alt={authorName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-teal-800 text-white flex items-center justify-center font-bold text-xs sm:text-sm">
                  {firstLetter}
                </div>
              )}
            </div>

            {/* Real Author Name */}
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center min-w-0">
                <span
                  style={{ fontSize: '14px' }}
                  className="text-[14px] font-bold text-slate-800 group-hover:text-teal-800 group-hover:underline transition truncate"
                >
                  {authorName}
                </span>
                {isAuthorWorker && (
                  <img
                    src={verificationLogo}
                    alt="Verified"
                    className="inline-block shrink-0 object-contain select-none"
                    style={{
                      width: '16px',
                      height: '16px',
                      marginLeft: '2px',
                    }}
                  />
                )}
              </div>
              <span
                style={{ fontSize: '11px', marginLeft: '0px', marginTop: '-4px' }}
                className="text-[11px] text-slate-400 block"
              >
                {formatTime(item.created_at)}
                {isEdited && (
                  <span className="ml-1 text-[10px] text-slate-400 italic">
                    ({lang === 'hi' ? 'संपादित' : 'edited'})
                  </span>
                )}
              </span>
            </div>
          </button>

          {/* Action icons for Edit / Delete */}
          <div className="flex items-center gap-1 shrink-0">
            {isOwn && !isEditingThis && (
              <button
                type="button"
                onClick={() => {
                  setEditingCommentId(item.id);
                  setEditText(item.text || '');
                }}
                className="p-1 text-slate-400 hover:text-teal-700 rounded-md hover:bg-slate-100 transition cursor-pointer"
                title={lang === 'hi' ? 'संपादित करें' : 'Edit'}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {canDelete && !isDeletingThis && (
              <button
                type="button"
                onClick={() => setDeletingCommentId(item.id)}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition cursor-pointer"
                title={lang === 'hi' ? 'हटाएं' : 'Delete'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Delete confirmation banner */}
        {isDeletingThis && (
          <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-800 animate-in fade-in duration-100">
            <span>{lang === 'hi' ? 'क्या आप इसे हटाना चाहते हैं?' : 'Delete permanently?'}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleConfirmDelete(item.id, parentId)}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : (lang === 'hi' ? 'हाँ, हटाएं' : 'Delete')}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingCommentId(null)}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-medium text-[11px] transition cursor-pointer"
              >
                {lang === 'hi' ? 'रद्द' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Comment Body */}
        <div className="mt-2 space-y-2">
          {/* Edit mode */}
          {isEditingThis ? (
            <div className="space-y-1.5 pt-1">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="w-full p-2 text-xs sm:text-sm rounded-xl border border-teal-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-700"
                placeholder="टिप्पणी संपादित करें..."
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  disabled={isSubmittingEdit || !editText.trim()}
                  onClick={() => handleSaveEdit(item.id, parentId)}
                  className="px-3 py-1 bg-teal-800 hover:bg-teal-900 text-white rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50 transition"
                >
                  {isSubmittingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>{lang === 'hi' ? 'सहेजें' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingEdit}
                  onClick={() => {
                    setEditingCommentId(null);
                    setEditText('');
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer transition"
                >
                  {lang === 'hi' ? 'रद्द' : 'Cancel'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Text comment */}
              {item.text && (
                <p
                  style={{
                    marginLeft: '20px',
                    backgroundColor: '#f1f1f1',
                    paddingLeft: '20px',
                    paddingRight: '20px',
                    paddingBottom: '10px',
                    paddingTop: '10px',
                    fontSize: '15px',
                    borderRadius: '10px',
                  }}
                  className="text-[15px] text-slate-800 whitespace-pre-line leading-relaxed break-words [overflow-wrap:anywhere]"
                >
                  {item.text}
                </p>
              )}

              {/* Voice comment audio player */}
              {item.voice_url && (
                <div className="pt-1">
                  <CompactAudioPlayer
                    src={item.voice_url}
                    title={lang === 'hi' ? 'ऑडियो मैसेज भेजें' : 'Voice Comment'}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Actions: Reply Button (Top-level comments only) */}
        {!isReply && (
          <div
            style={{
              marginLeft: '20px',
              paddingLeft: '10px',
              marginTop: '8px',
              marginBottom: '0px',
              paddingTop: '5px',
              paddingBottom: '5px',
              backgroundColor: '#fffcfc',
              fontSize: '16px',
              borderRadius: '10px',
            }}
            className="border-t border-slate-100 flex items-center justify-between"
          >
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onRequireAuth();
                  return;
                }
                setReplyingCommentId(replyingCommentId === item.id ? null : item.id);
                setReplyText('');
                setReplyVoiceBlob(null);
                setShowReplyVoiceRecorder(false);
              }}
              className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-teal-800 hover:text-teal-900 transition cursor-pointer"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span style={{ fontSize: '13px' }}>{lang === 'hi' ? 'जवाब दें (Reply)' : 'Reply'}</span>
              {Boolean(item.replies_count) && (
                <span className="text-[10px] text-slate-400 font-normal ml-1">
                  ({item.replies_count})
                </span>
              )}
            </button>
          </div>
        )}

        {/* Inline Reply Composer */}
        {replyingCommentId === item.id && (
          <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-2 animate-in fade-in duration-100">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={lang === 'hi' ? 'अपना जवाब लिखें...' : 'Write your reply...'}
                className="flex-1 min-w-0 h-9 px-3 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-teal-700 bg-white transition"
              />
              <button
                type="button"
                onClick={() => setShowReplyVoiceRecorder(!showReplyVoiceRecorder)}
                className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                  showReplyVoiceRecorder || replyVoiceBlob
                    ? 'bg-rose-100 text-rose-700 border border-rose-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title={lang === 'hi' ? 'आवाज में जवाब दें' : 'Record voice reply'}
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={isSubmittingReply || (!replyText.trim() && !replyVoiceBlob)}
                onClick={() => handleCreateReply(item.id)}
                className="h-9 px-3 bg-teal-800 hover:bg-teal-900 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-2xs active:scale-95 transition cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isSubmittingReply ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{lang === 'hi' ? 'भेजें' : 'Send'}</span>
              </button>
            </div>

            {/* Voice Recorder for reply */}
            {showReplyVoiceRecorder && (
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <VoiceRecorder
                  onRecordingChange={(blob) => setReplyVoiceBlob(blob)}
                  onRecordingComplete={(blob) => setReplyVoiceBlob(blob)}
                  title={lang === 'hi' ? 'आवाज जवाब रिकॉर्ड करें' : 'Record voice reply'}
                />
              </div>
            )}
          </div>
        )}

        {/* Render Threaded Replies */}
        {item.replies && item.replies.length > 0 && (
          <div className="space-y-2 mt-2">
            {item.replies.map((reply) => renderCommentCard(reply, true, item.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: '#f0f5f5' }} className="space-y-3">
      {/* Comments Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-teal-800 shrink-0" />
          <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
            {lang === 'hi' ? 'Comments' : 'Comments'}
          </h3>
          <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.2 rounded-full">
            {comments.length}
          </span>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* New Comment Box */}
      {user ? (
        <div
          style={{ backgroundColor: '#a6d7dd' }}
          className="border border-slate-200 rounded-2xl p-3 sm:p-3.5 shadow-2xs space-y-2"
        >
          <div className="flex items-start gap-2.5">
            {/* Current User Photo */}
            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0 border border-slate-300">
              {user.profile_photo ? (
                <img
                  src={user.profile_photo}
                  alt={user.name || ''}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-teal-800 text-white flex items-center justify-center font-bold text-xs">
                  {(user.name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="flex-1 min-w-0 space-y-2">
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder={
                  lang === 'hi'
                    ? 'अपनी टिप्पणी या सवाल यहाँ लिखें...'
                    : 'Write your comment or question here...'
                }
                rows={2}
                style={{ backgroundColor: '#dcf1eb' }}
                className="w-full p-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-700 transition resize-none"
              />

              {/* Action bar: Voice Mic & Submit */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    showVoiceRecorder || newVoiceBlob
                      ? 'bg-rose-50 text-rose-700 border border-rose-300'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span style={{ fontSize: '13px' }}>
                    {newVoiceBlob
                      ? (lang === 'hi' ? 'आवाज संलग्न' : 'Voice Attached')
                      : (lang === 'hi' ? 'ऑडियो मैसेज भेजें' : 'Voice Comment')}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || (!newText.trim() && !newVoiceBlob)}
                  onClick={handleCreateComment}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-teal-800 hover:bg-teal-900 active:scale-98 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span style={{ fontSize: '13px' }}>{lang === 'hi' ? 'कमेंट भेजें' : 'Post Comment'}</span>
                </button>
              </div>

              {/* Voice Recorder component when mic is toggled */}
              {showVoiceRecorder && (
                <div className="pt-2 border-t border-slate-100">
                  <VoiceRecorder
                    onRecordingChange={(blob) => setNewVoiceBlob(blob)}
                    onRecordingComplete={(blob) => setNewVoiceBlob(blob)}
                    title={lang === 'hi' ? 'अपनी आवाज रिकॉर्ड करें' : 'Record your voice'}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Guest login prompt */
        <div className="bg-slate-100/90 border border-slate-200 rounded-2xl p-3.5 text-center space-y-2">
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            {lang === 'hi'
              ? 'टिप्पणी करने या सवाल पूछने के लिए कृपया अपना खाता खोलें।'
              : 'Please login to post comments or ask questions.'}
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{lang === 'hi' ? 'लॉगिन करें' : 'Login'}</span>
          </button>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-2.5 pt-1">
        {isLoading ? (
          <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
            <span>{lang === 'hi' ? 'Comment लोड हो रही हैं...' : 'Loading comments...'}</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl p-4">
            <p className="font-medium">
              {lang === 'hi' ? 'अभी तक कोई टिप्पणी नहीं है।' : 'No comments yet.'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {lang === 'hi' ? 'पहली टिप्पणी या सवाल पूछें।' : 'Be the first to comment or ask a question.'}
            </p>
          </div>
        ) : (
          comments.map((comment) => renderCommentCard(comment))
        )}
      </div>
    </div>
  );
};
