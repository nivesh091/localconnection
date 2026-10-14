import { supabase, isSchemaCacheError, withNetworkRetry, ADMIN_EMAIL } from '../lib/supabase';
import { safeStorage } from '../lib/storage';
import { CommentItem, CommentAuthor, ReportedComment } from '../types';
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
   * Delete comment or reply (Comment Author or Admin ONLY).
   * Profile owner CANNOT delete another user's comment on their profile.
   * Also cleans up associated voice recordings from storage.
   */
  static async deleteComment(params: {
    commentId: string;
    currentUserId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      if (!params.commentId || !params.currentUserId) {
        return { success: false, error: 'अनुमति नहीं है। लॉग इन करें।' };
      }

      // 1. Fetch target comment to verify actual author_id
      const { data: targetComment, error: fetchErr } = await supabase
        .from('comments')
        .select('id, author_id, voice_storage_path')
        .eq('id', params.commentId)
        .maybeSingle();

      if (fetchErr) {
        return { success: false, error: 'टिप्पणी की जांच करने में समस्या आई।' };
      }
      if (!targetComment) {
        return { success: false, error: 'टिप्पणी नहीं मिली या पहले ही हटाई जा चुकी है।' };
      }

      // 2. Strict permission enforcement:
      // - Rule 1: Comment author can delete only their own comments
      // - Rule 2: Admin can delete any user's comment
      // - Rule 3: Profile owner cannot delete another user's comment on their profile
      const isAuthor = Boolean(params.currentUserId && targetComment.author_id === params.currentUserId);
      let isAdmin = false;

      if (params.currentUserId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72') {
        isAdmin = true;
      } else {
        try {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.email && authData.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            isAdmin = true;
          } else {
            const { data: dbAdmin } = await supabase.rpc('is_admin');
            if (dbAdmin === true) {
              isAdmin = true;
            }
          }
        } catch {
          // not admin
        }
      }

      if (!isAuthor && !isAdmin) {
        return {
          success: false,
          error: 'अनुमति नहीं है। केवल टिप्पणी लेखक या व्यवस्थापक ही हटा सकते हैं।',
        };
      }

      // 3. Fetch child replies to collect voice storage paths
      const { data: childReplies } = await supabase
        .from('comments')
        .select('id, voice_storage_path')
        .eq('parent_comment_id', params.commentId);

      const voicePathsToClean: string[] = [];
      if (targetComment.voice_storage_path) {
        voicePathsToClean.push(targetComment.voice_storage_path);
      }
      if (childReplies) {
        for (const row of childReplies) {
          if (row.voice_storage_path) {
            voicePathsToClean.push(row.voice_storage_path);
          }
        }
      }

      // 4. Perform delete in database (with author_id guard for non-admins)
      let deleteQuery = supabase
        .from('comments')
        .delete()
        .eq('id', params.commentId);

      if (!isAdmin) {
        deleteQuery = deleteQuery.eq('author_id', params.currentUserId);
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        return { success: false, error: 'टिप्पणी हटाने में समस्या आई या अनुमति नहीं है।' };
      }

      // 5. Clean up voice files from storage asynchronously
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

  /**
   * Submit a report for an inappropriate comment for moderator review.
   * Tracks report in public.reported_comments table (with offline/graceful fallback).
   */
  static async reportComment(params: {
    commentId: string;
    reporterId: string;
    reason: string;
    details?: string;
  }): Promise<{ success: boolean; alreadyReported?: boolean; error?: string }> {
    try {
      if (!params.commentId || !params.reporterId) {
        return { success: false, error: 'टिप्पणी या उपयोगकर्ता आईडी अमान्य है।' };
      }

      // Check if already reported locally or in DB
      const localKey = `reported_comment_${params.reporterId}_${params.commentId}`;
      const alreadyReportedLocal = safeStorage.getItem(localKey);
      if (alreadyReportedLocal) {
        return {
          success: false,
          alreadyReported: true,
          error: 'आप पहले ही इस टिप्पणी की रिपोर्ट कर चुके हैं। मॉडरेटर समीक्षा कर रहे हैं।',
        };
      }

      // 1. Insert into reported_comments table
      const { error } = await supabase
        .from('reported_comments')
        .insert({
          comment_id: params.commentId,
          reporter_id: params.reporterId,
          reason: params.reason,
          details: params.details?.trim() || null,
          status: 'pending',
        });

      if (error) {
        // Check for duplicate constraint violation
        if (
          error.code === '23505' ||
          error.message?.includes('duplicate') ||
          error.message?.includes('uq_reported_comments')
        ) {
          safeStorage.setItem(localKey, 'true');
          return {
            success: false,
            alreadyReported: true,
            error: 'आप पहले ही इस टिप्पणी की रिपोर्ट कर चुके हैं। मॉडरेटर समीक्षा कर रहे हैं।',
          };
        }

        if (isSchemaCacheError(error)) {
          // Table not yet in schema cache, store in local fallback
          console.warn('reported_comments table not in schema cache; saving to local fallback.');
          safeStorage.setItem(localKey, 'true');
          const fallbackList: any[] = JSON.parse(
            safeStorage.getItem('local_reported_comments') || '[]'
          );
          fallbackList.push({
            id: 'local-' + Date.now(),
            comment_id: params.commentId,
            reporter_id: params.reporterId,
            reason: params.reason,
            details: params.details?.trim() || null,
            status: 'pending',
            created_at: new Date().toISOString(),
          });
          safeStorage.setItem('local_reported_comments', JSON.stringify(fallbackList));
          return { success: true };
        }

        console.warn('Error submitting comment report:', error);
        return {
          success: false,
          error: 'रिपोर्ट दर्ज करने में समस्या आई। कृपया पुनः प्रयास करें।',
        };
      }

      safeStorage.setItem(localKey, 'true');
      return { success: true };
    } catch (err) {
      console.error('Exception reporting comment:', err);
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि हुई।' };
    }
  }

  /**
   * Fetch all reported comments for moderator review (Admin only).
   */
  static async getReportedComments(params?: {
    status?: string;
  }): Promise<{ reports: ReportedComment[]; error?: string }> {
    try {
      let query = supabase
        .from('reported_comments')
        .select(`
          id,
          comment_id,
          reporter_id,
          reason,
          details,
          status,
          created_at,
          updated_at,
          reporter:profiles!reported_comments_reporter_id_fkey(id, name, profile_photo, mobile),
          comment:comments(id, author_id, text, voice_storage_path, target_type, target_id, created_at, author:profiles!comments_author_id_fkey(id, name, profile_photo))
        `)
        .order('created_at', { ascending: false });

      if (params?.status && params.status !== 'all') {
        query = query.eq('status', params.status);
      }

      const { data, error } = await query;

      if (error) {
        if (isSchemaCacheError(error)) {
          const fallbackList: any[] = JSON.parse(
            safeStorage.getItem('local_reported_comments') || '[]'
          );
          return { reports: fallbackList as ReportedComment[] };
        }
        return { reports: [], error: error.message };
      }

      return { reports: (data || []) as unknown as ReportedComment[] };
    } catch (err) {
      return { reports: [], error: err instanceof Error ? err.message : 'त्रुटि हुई।' };
    }
  }

  /**
   * Update report status (e.g. reviewed, dismissed, action_taken).
   */
  static async updateReportStatus(params: {
    reportId: string;
    status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      if (params.reportId.startsWith('local-')) {
        const fallbackList: any[] = JSON.parse(
          safeStorage.getItem('local_reported_comments') || '[]'
        );
        const idx = fallbackList.findIndex((r) => r.id === params.reportId);
        if (idx !== -1) {
          fallbackList[idx].status = params.status;
          fallbackList[idx].updated_at = new Date().toISOString();
          safeStorage.setItem('local_reported_comments', JSON.stringify(fallbackList));
        }
        return { success: true };
      }

      const { error } = await supabase
        .from('reported_comments')
        .update({
          status: params.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.reportId);

      if (error) {
        if (isSchemaCacheError(error)) {
          const fallbackList: any[] = JSON.parse(
            safeStorage.getItem('local_reported_comments') || '[]'
          );
          const idx = fallbackList.findIndex((r) => r.id === params.reportId);
          if (idx !== -1) {
            fallbackList[idx].status = params.status;
            safeStorage.setItem('local_reported_comments', JSON.stringify(fallbackList));
          }
          return { success: true };
        }
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'त्रुटि हुई।' };
    }
  }

  /**
   * Delete an individual reported comment record (Admin only).
   * Strictly deletes only the record from reported_comments; leaves the original comment intact.
   */
  static async deleteReport(params: {
    reportId: string;
    currentUserId?: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Backend / Service level Admin permission check
      let isAdmin = false;
      if (params.currentUserId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72') {
        isAdmin = true;
      } else {
        try {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.email && authData.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            isAdmin = true;
          } else {
            const { data: dbAdmin } = await supabase.rpc('is_admin');
            if (dbAdmin === true) {
              isAdmin = true;
            }
          }
        } catch {
          // not admin
        }
      }

      if (!isAdmin) {
        return {
          success: false,
          error: 'अनधिकृत। केवल एडमिन ही रिपोर्ट हटा सकते हैं।',
        };
      }

      // Handle local fallback report if applicable
      if (params.reportId.startsWith('local-')) {
        const fallbackList: any[] = JSON.parse(
          safeStorage.getItem('local_reported_comments') || '[]'
        );
        const filtered = fallbackList.filter((r) => r.id !== params.reportId);
        safeStorage.setItem('local_reported_comments', JSON.stringify(filtered));
        return { success: true };
      }

      // 2. Database deletion in reported_comments table only
      const { error } = await supabase
        .from('reported_comments')
        .delete()
        .eq('id', params.reportId);

      if (error) {
        if (isSchemaCacheError(error)) {
          const fallbackList: any[] = JSON.parse(
            safeStorage.getItem('local_reported_comments') || '[]'
          );
          const filtered = fallbackList.filter((r) => r.id !== params.reportId);
          safeStorage.setItem('local_reported_comments', JSON.stringify(filtered));
          return { success: true };
        }
        return { success: false, error: error.message };
      }

      // Also clean up from local fallback if present
      const fallbackList: any[] = JSON.parse(
        safeStorage.getItem('local_reported_comments') || '[]'
      );
      const filtered = fallbackList.filter((r) => r.id !== params.reportId);
      safeStorage.setItem('local_reported_comments', JSON.stringify(filtered));

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'रिपोर्ट हटाने में त्रुटि हुई।' };
    }
  }

  /**
   * Clear all report notifications/records (Admin only).
   * Strictly deletes all records from reported_comments table; does NOT touch original comments or other notifications.
   */
  static async clearAllReports(params: {
    currentUserId?: string | null;
  }): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      // 1. Backend / Service level Admin permission check
      let isAdmin = false;
      if (params.currentUserId === '18aa47ec-9ecc-4c2e-ae51-e29f92dc9a72') {
        isAdmin = true;
      } else {
        try {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.email && authData.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            isAdmin = true;
          } else {
            const { data: dbAdmin } = await supabase.rpc('is_admin');
            if (dbAdmin === true) {
              isAdmin = true;
            }
          }
        } catch {
          // not admin
        }
      }

      if (!isAdmin) {
        return {
          success: false,
          error: 'अनधिकृत। केवल एडमिन ही सभी रिपोर्ट हटा सकते हैं।',
        };
      }

      // 2. Database deletion in reported_comments table
      // In Supabase PostgreSQL, deleting without WHERE is blocked by safety checks unless using neq with impossible uuid or gte
      const { data, error } = await supabase
        .from('reported_comments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select('id');

      // Clear local storage mirror
      safeStorage.setItem('local_reported_comments', JSON.stringify([]));

      if (error) {
        if (isSchemaCacheError(error)) {
          return { success: true, count: 0 };
        }
        return { success: false, error: error.message };
      }

      return { success: true, count: data?.length || 0 };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'सभी रिपोर्ट हटाने में त्रुटि हुई।' };
    }
  }

  /**
   * Get set of comment IDs reported by the current user to display report badge/state in UI.
   */
  static async getUserReportedCommentIds(userId: string): Promise<Set<string>> {
    const set = new Set<string>();
    if (!userId) return set;
    try {
      const { data, error } = await supabase
        .from('reported_comments')
        .select('comment_id')
        .eq('reporter_id', userId);

      if (!error && data) {
        for (const row of data) {
          if (row.comment_id) set.add(row.comment_id);
        }
      }
    } catch {
      // ignore
    }

    // Also check local fallback storage
    try {
      const fallbackList: any[] = JSON.parse(
        safeStorage.getItem('local_reported_comments') || '[]'
      );
      for (const item of fallbackList) {
        if (item.reporter_id === userId && item.comment_id) {
          set.add(item.comment_id);
        }
      }
    } catch {
      // ignore
    }

    return set;
  }
}
