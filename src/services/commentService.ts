import { supabase, isSchemaCacheError, withNetworkRetry } from '../lib/supabase';
import { CommentItem, CommentAuthor } from '../types';
import { MediaService } from './mediaService';
import { UserNotificationService } from './userNotificationService';

export class CommentService {
  /**
   * Fetch comments and threaded replies for a specific target (Worker or Requirement).
   * Top-level comments are sorted NEWEST-FIRST (created_at DESC).
   * Thread replies under each parent maintain chronological order.
   */
  static async getComments(
    targetType: 'worker' | 'requirement',
    targetId: string
  ): Promise<{ comments: CommentItem[]; error?: string }> {
    try {
      // 1. Fetch all comments for this target
      const { data, error } = await withNetworkRetry(async () =>
        supabase
          .from('comments')
          .select(`
            id,
            author_id,
            target_type,
            target_id,
            parent_comment_id,
            text,
            voice_storage_path,
            created_at,
            updated_at,
            author:profiles!comments_author_id_fkey(id, name, profile_photo, mobile, is_mobile_public)
          `)
          .eq('target_type', targetType)
          .eq('target_id', targetId)
          .order('created_at', { ascending: true })
      );

      if (error) {
        if (isSchemaCacheError(error)) {
          console.warn('Comments table not yet in schema cache.');
          return { comments: [] };
        }
        return { comments: [], error: 'टिप्पणियाँ लोड करने में समस्या आई।' };
      }

      const rawItems = (data || []) as any[];

      // 2. Format items and resolve voice URLs
      const allComments: CommentItem[] = rawItems.map((item) => {
        let voiceUrl: string | null = null;
        if (item.voice_storage_path) {
          voiceUrl = MediaService.getCommentVoiceUrl(item.voice_storage_path);
        }

        const authorObj: CommentAuthor = item.author
          ? {
              id: item.author.id,
              name: item.author.name || 'उपयोगकर्ता',
              profile_photo: item.author.profile_photo || null,
              mobile: item.author.mobile || null,
              is_mobile_public: item.author.is_mobile_public !== false,
            }
          : {
              id: item.author_id,
              name: 'उपयोगकर्ता',
              profile_photo: null,
            };

        return {
          id: item.id,
          author_id: item.author_id,
          target_type: item.target_type,
          target_id: item.target_id,
          parent_comment_id: item.parent_comment_id || null,
          text: item.text || null,
          voice_storage_path: item.voice_storage_path || null,
          created_at: item.created_at,
          updated_at: item.updated_at,
          author: authorObj,
          voice_url: voiceUrl,
          replies: [],
          replies_count: 0,
        };
      });

      // 3. Separate top-level comments and thread replies under their respective parent
      const topLevelComments: CommentItem[] = [];
      const replyMap = new Map<string, CommentItem[]>();

      for (const item of allComments) {
        if (!item.parent_comment_id) {
          topLevelComments.push(item);
        } else {
          const list = replyMap.get(item.parent_comment_id) || [];
          list.push(item);
          replyMap.set(item.parent_comment_id, list);
        }
      }

      // Attach nested replies to top-level comments
      for (const parent of topLevelComments) {
        const replies = replyMap.get(parent.id) || [];
        parent.replies = replies;
        parent.replies_count = replies.length;
      }

      // Top-level comments: NEWEST-FIRST (created_at DESC)
      topLevelComments.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return { comments: topLevelComments };
    } catch (err) {
      console.error('getComments error:', err);
      return { comments: [], error: err instanceof Error ? err.message : 'त्रुटि हुई।' };
    }
  }

  /**
   * Post a new comment or reply (text, voice, or text+voice).
   * Dispatches notifications to target owner and/or original comment author.
   */
  static async createComment(params: {
    authorId: string;
    targetType: 'worker' | 'requirement';
    targetId: string;
    targetOwnerId?: string;
    text?: string;
    voiceBlob?: Blob;
    parentCommentId?: string;
    authorProfile?: { name: string; profile_photo?: string | null };
  }): Promise<{ comment: CommentItem | null; error?: string }> {
    try {
      const trimmedText = params.text?.trim() || null;
      if (!trimmedText && !params.voiceBlob) {
        return { comment: null, error: 'कृपया टिप्पणी लिखें या आवाज रिकॉर्ड करें।' };
      }

      let voiceStoragePath: string | null = null;
      let voiceUrl: string | null = null;

      // Upload voice recording if provided
      if (params.voiceBlob) {
        const uploadRes = await MediaService.uploadCommentVoice(params.authorId, params.voiceBlob);
        if (uploadRes.error || !uploadRes.path) {
          return { comment: null, error: uploadRes.error || 'आवाज अपलोड करने में विफल।' };
        }
        voiceStoragePath = uploadRes.path;
        voiceUrl = uploadRes.url;
      }

      // Insert comment row into Supabase
      const { data, error } = await supabase
        .from('comments')
        .insert({
          author_id: params.authorId,
          target_type: params.targetType,
          target_id: params.targetId,
          parent_comment_id: params.parentCommentId || null,
          text: trimmedText,
          voice_storage_path: voiceStoragePath,
        })
        .select(`
          id,
          author_id,
          target_type,
          target_id,
          parent_comment_id,
          text,
          voice_storage_path,
          created_at,
          updated_at,
          author:profiles!comments_author_id_fkey(id, name, profile_photo, mobile, is_mobile_public)
        `)
        .single();

      if (error || !data) {
        // Cleanup voice if comment insert failed
        if (voiceStoragePath) {
          await MediaService.deleteCommentVoice(voiceStoragePath);
        }
        return { comment: null, error: error?.message || 'टिप्पणी पोस्ट करने में समस्या आई।' };
      }

      const item = data as any;
      const authorObj: CommentAuthor = item.author
        ? {
            id: item.author.id,
            name: item.author.name || params.authorProfile?.name || 'उपयोगकर्ता',
            profile_photo: item.author.profile_photo || params.authorProfile?.profile_photo || null,
            mobile: item.author.mobile || null,
            is_mobile_public: item.author.is_mobile_public !== false,
          }
        : {
            id: params.authorId,
            name: params.authorProfile?.name || 'उपयोगकर्ता',
            profile_photo: params.authorProfile?.profile_photo || null,
          };

      const newComment: CommentItem = {
        id: item.id,
        author_id: item.author_id,
        target_type: item.target_type,
        target_id: item.target_id,
        parent_comment_id: item.parent_comment_id || null,
        text: item.text || null,
        voice_storage_path: item.voice_storage_path || null,
        created_at: item.created_at,
        updated_at: item.updated_at,
        author: authorObj,
        voice_url: voiceUrl || (item.voice_storage_path ? MediaService.getCommentVoiceUrl(item.voice_storage_path) : null),
        replies: [],
        replies_count: 0,
      };

      // 4. Dispatch in-app notifications
      try {
        let preview = trimmedText ? trimmedText.slice(0, 80) : '';
        if (voiceStoragePath) {
          preview = preview ? `${preview} (🎤)` : '🎤 आवाज संदेश';
        }

        const senderProfile = {
          name: authorObj.name,
          profile_photo: authorObj.profile_photo,
          mobile: authorObj.mobile,
        };

        let resolvedOwnerId = params.targetOwnerId;
        if (!resolvedOwnerId) {
          if (params.targetType === 'worker') {
            resolvedOwnerId = params.targetId;
          } else {
            const { data: reqRow } = await supabase
              .from('requirements')
              .select('owner_id')
              .eq('id', params.targetId)
              .maybeSingle();
            resolvedOwnerId = reqRow?.owner_id;
          }
        }

        if (!params.parentCommentId) {
          // A. Top-level comment -> Notify target owner
          if (resolvedOwnerId && resolvedOwnerId !== params.authorId) {
            await UserNotificationService.createNotification({
              userId: resolvedOwnerId,
              senderId: params.authorId,
              notificationType: 'comment',
              targetType: params.targetType,
              targetId: params.targetId,
              commentId: newComment.id,
              commentPreview: preview,
              hasVoice: Boolean(voiceStoragePath),
              senderProfile,
            });
          }
        } else {
          // B. Threaded reply -> Notify original comment author AND target owner
          const recipients = new Set<string>();

          const { data: parentData } = await supabase
            .from('comments')
            .select('author_id')
            .eq('id', params.parentCommentId)
            .maybeSingle();

          if (parentData?.author_id && parentData.author_id !== params.authorId) {
            recipients.add(parentData.author_id);
          }

          if (resolvedOwnerId && resolvedOwnerId !== params.authorId) {
            recipients.add(resolvedOwnerId);
          }

          for (const recipientId of recipients) {
            await UserNotificationService.createNotification({
              userId: recipientId,
              senderId: params.authorId,
              notificationType: 'reply',
              targetType: params.targetType,
              targetId: params.targetId,
              commentId: newComment.id,
              commentPreview: preview,
              hasVoice: Boolean(voiceStoragePath),
              senderProfile,
            });
          }
        }
      } catch (notifErr) {
        console.warn('Background notification error:', notifErr);
      }

      return { comment: newComment };
    } catch (err) {
      console.error('createComment error:', err);
      return { comment: null, error: err instanceof Error ? err.message : 'त्रुटि हुई।' };
    }
  }

  /**
   * Edit comment text (Author only)
   */
  static async updateComment(params: {
    commentId: string;
    authorId: string;
    text: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const trimmed = params.text.trim();
      if (!trimmed) {
        return { success: false, error: 'टिप्पणी खाली नहीं हो सकती।' };
      }

      const { error } = await supabase
        .from('comments')
        .update({
          text: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.commentId)
        .eq('author_id', params.authorId);

      if (error) {
        return { success: false, error: 'टिप्पणी अपडेट करने में विफल।' };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि हुई।' };
    }
  }

  /**
   * Delete comment or reply (Author, Target Owner, or Admin)
   * Also cleans up associated voice recordings from storage.
   */
  static async deleteComment(params: {
    commentId: string;
    currentUserId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Fetch comment and its child replies to collect voice storage paths
      const { data: toDeleteList } = await supabase
        .from('comments')
        .select('id, voice_storage_path')
        .or(`id.eq.${params.commentId},parent_comment_id.eq.${params.commentId}`);

      const voicePathsToClean: string[] = [];
      if (toDeleteList) {
        for (const row of toDeleteList) {
          if (row.voice_storage_path) {
            voicePathsToClean.push(row.voice_storage_path);
          }
        }
      }

      // 2. Perform delete in database (RLS enforces permission)
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', params.commentId);

      if (error) {
        return { success: false, error: 'टिप्पणी हटाने में समस्या आई या अनुमति नहीं है।' };
      }

      // 3. Clean up voice files from storage asynchronously
      for (const vp of voicePathsToClean) {
        try {
          await MediaService.deleteCommentVoice(vp);
        } catch (storageErr) {
          console.warn('Comment voice storage cleanup notice:', storageErr);
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि हुई।' };
    }
  }
}
