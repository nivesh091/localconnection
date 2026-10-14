import { supabase } from '../lib/supabase';
import { WorkerMedia } from '../types';

export class MediaService {
  // Buckets
  static BUCKET_PROFILE = 'profile-media';
  static BUCKET_WORKER = 'worker-media';
  static BUCKET_CHAT = 'chat-media';
  static BUCKET_HELP = 'help-media';
  static BUCKET_COMMENT = 'comment-media';

  // Allowed file constraints
  static MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
  static MAX_VOICE_SIZE = 10 * 1024 * 1024; // 10 MB
  static MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25 MB

  /**
   * Upload Profile Photo to 'profile-media'
   */
  static async uploadProfilePhoto(
    userId: string,
    file: Blob | File
  ): Promise<{ url: string | null; error: string | null }> {
    try {
      if (file.size > this.MAX_PHOTO_SIZE) {
        return { url: null, error: 'फ़ोटो का साइज़ 5MB से कम होना चाहिए।' };
      }

      const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
      const filePath = `${userId}/profile_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(this.BUCKET_PROFILE)
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || 'image/jpeg',
        });

      if (uploadError) {
        return { url: null, error: uploadError.message };
      }

      const { data } = supabase.storage.from(this.BUCKET_PROFILE).getPublicUrl(filePath);
      return { url: data.publicUrl, error: null };
    } catch (err) {
      return { url: null, error: err instanceof Error ? err.message : 'अपलोड विफल' };
    }
  }

  /**
   * Delete Profile Photo files from 'profile-media'
   */
  static async deleteProfilePhoto(
    userId: string,
    currentUrl?: string | null
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const pathsToDelete: string[] = [];

      // 1. If exact URL is known, extract path directly
      if (currentUrl) {
        const marker = `/${this.BUCKET_PROFILE}/`;
        if (currentUrl.includes(marker)) {
          const rawExtracted = currentUrl.split(marker)[1];
          if (rawExtracted) {
            const clean = rawExtracted.split('?')[0].split('#')[0];
            pathsToDelete.push(decodeURIComponent(clean));
          }
        }
      }

      // 2. Also attempt to list and remove any files in userId folder
      try {
        const { data: files, error: listError } = await supabase.storage
          .from(this.BUCKET_PROFILE)
          .list(userId);

        if (!listError && files && files.length > 0) {
          for (const file of files) {
            const p = `${userId}/${file.name}`;
            if (!pathsToDelete.includes(p)) {
              pathsToDelete.push(p);
            }
          }
        }
      } catch {
        // Safe fallback if list is restricted
      }

      if (pathsToDelete.length > 0) {
        try {
          await supabase.storage.from(this.BUCKET_PROFILE).remove(pathsToDelete);
        } catch (removeErr) {
          console.warn('Storage delete profile photo notice:', removeErr);
        }
      }

      return { success: true, error: null };
    } catch (err) {
      console.warn('Profile photo deletion error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'फ़ाइल हटाने में त्रुटि' };
    }
  }

  /**
   * Upload Worker Voice Recording to 'worker-media'
   * Replaces existing voice recording (Section 17)
   */
  static async uploadWorkerVoice(
    userId: string,
    audioBlob: Blob
  ): Promise<{ media: WorkerMedia | null; error: string | null }> {
    try {
      if (audioBlob.size > this.MAX_VOICE_SIZE) {
        return { media: null, error: 'आवाज रिकॉर्डिंग का साइज़ 10MB से कम होना चाहिए।' };
      }

      // Check existing voice in worker_media to delete old storage file
      const { data: existingVoices } = await supabase
        .from('worker_media')
        .select('*')
        .eq('worker_user_id', userId)
        .eq('media_type', 'voice');

      const filePath = `${userId}/voice/about_${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from(this.BUCKET_WORKER)
        .upload(filePath, audioBlob, {
          upsert: true,
          contentType: audioBlob.type || 'audio/webm',
        });

      if (uploadError) {
        return { media: null, error: uploadError.message };
      }

      // Clean up previous voice files from storage and table
      if (existingVoices && existingVoices.length > 0) {
        for (const old of existingVoices) {
          await supabase.storage.from(this.BUCKET_WORKER).remove([old.storage_path]);
        }
        await supabase
          .from('worker_media')
          .delete()
          .eq('worker_user_id', userId)
          .eq('media_type', 'voice');
      }

      // Insert new voice record
      const { data: mediaRecord, error: insertError } = await supabase
        .from('worker_media')
        .insert({
          worker_user_id: userId,
          media_type: 'voice',
          storage_path: filePath,
          sort_order: 0,
        })
        .select()
        .single();

      if (insertError) {
        // Rollback uploaded storage file
        await supabase.storage.from(this.BUCKET_WORKER).remove([filePath]);
        return { media: null, error: insertError.message };
      }

      const { data: publicData } = supabase.storage.from(this.BUCKET_WORKER).getPublicUrl(filePath);
      return {
        media: {
          ...mediaRecord,
          public_url: publicData.publicUrl,
        },
        error: null,
      };
    } catch (err) {
      return { media: null, error: err instanceof Error ? err.message : 'आवाज अपलोड असफल' };
    }
  }

  /**
   * Fast client-side image downscaling/compression to prevent uploading massive raw camera files (e.g. 8-12MB)
   * Converts huge photos to crisp high-fidelity 1600px JPEG (~200KB-400KB) in ~50ms
   */
  static async optimizeWorkPhoto(
    file: Blob | File,
    maxDimension = 1600,
    quality = 0.85
  ): Promise<{ file: Blob | File; ext: string }> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
      return { file, ext };
    }

    if (!file.type.startsWith('image/') || file.type.includes('svg')) {
      const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
      return { file, ext };
    }

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;

        // If image is already smaller than 800KB and within dimensions, use original directly
        if (width <= maxDimension && height <= maxDimension && file.size <= 800 * 1024) {
          const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
          resolve({ file, ext });
          return;
        }

        // Calculate bounded dimensions preserving aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ file, ext: 'jpg' });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve({ file: blob, ext: 'jpg' });
            } else {
              const ext = file.type.includes('png') ? 'png' : 'jpg';
              resolve({ file, ext });
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ file, ext: 'jpg' });
      };

      img.src = objectUrl;
    });
  }

  /**
   * Upload Worker Work Photo (max 10 photos per worker) (Section 18)
   */
  static async uploadWorkerWorkPhoto(
    userId: string,
    file: Blob | File
  ): Promise<{ media: WorkerMedia | null; error: string | null }> {
    try {
      // 1. Run count check and image optimization in parallel for maximum speed
      const [countRes, optimized] = await Promise.all([
        supabase
          .from('worker_media')
          .select('id', { count: 'exact', head: true })
          .eq('worker_user_id', userId)
          .eq('media_type', 'photo'),
        this.optimizeWorkPhoto(file),
      ]);

      const count = countRes.count || 0;
      if (!countRes.error && count >= 10) {
        return { media: null, error: 'अधिकतम 10 काम की तस्वीरें ही जोड़ी जा सकती हैं।' };
      }

      const uploadPayload = optimized.file;
      if (uploadPayload.size > this.MAX_PHOTO_SIZE) {
        return { media: null, error: 'फ़ोटो का साइज़ 5MB से कम होना चाहिए।' };
      }

      const ext = optimized.ext || 'jpg';
      const filePath = `${userId}/photos/work_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

      // 2. Upload to existing Supabase Storage worker-media bucket
      const { error: uploadError } = await supabase.storage
        .from(this.BUCKET_WORKER)
        .upload(filePath, uploadPayload, {
          contentType: uploadPayload.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('Work photo storage upload error:', uploadError);
        return { media: null, error: uploadError.message };
      }

      // 3. Insert record in existing worker_media database table
      const { data: mediaRecord, error: insertError } = await supabase
        .from('worker_media')
        .insert({
          worker_user_id: userId,
          media_type: 'photo',
          storage_path: filePath,
          sort_order: count + 1,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Work photo database insert error:', insertError);
        // Clean up storage object on database failure so no orphan is left
        await supabase.storage.from(this.BUCKET_WORKER).remove([filePath]);
        return { media: null, error: insertError.message };
      }

      const { data: publicData } = supabase.storage.from(this.BUCKET_WORKER).getPublicUrl(filePath);
      return {
        media: {
          ...mediaRecord,
          public_url: publicData.publicUrl,
        },
        error: null,
      };
    } catch (err) {
      console.error('Work photo upload unexpected error:', err);
      return { media: null, error: err instanceof Error ? err.message : 'फ़ोटो अपलोड असफल' };
    }
  }

  /**
   * Delete Worker Media (Photo or Voice)
   * Deletes from Supabase Storage first, then deletes database record upon success.
   */
  static async deleteWorkerMedia(
    mediaId: string,
    storagePath: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;

      // 1. Delete physical file using official Supabase Storage API
      const { error: removeError } = await supabase.storage
        .from(this.BUCKET_WORKER)
        .remove([cleanPath]);

      if (removeError) {
        console.error('Storage deletion failed:', removeError);
        return {
          success: false,
          error: `स्टोरेज से फ़ाइल हटाने में समस्या: ${removeError.message || 'त्रुटि'}`,
        };
      }

      // 2. After successful Storage deletion, delete corresponding worker_media database record
      const { error: dbError } = await supabase
        .from('worker_media')
        .delete()
        .eq('id', mediaId);

      if (dbError) {
        console.error('Database record deletion failed:', dbError);
        return {
          success: false,
          error: `डेटाबेस रिकॉर्ड हटाने में समस्या: ${dbError.message || 'त्रुटि'}`,
        };
      }

      return { success: true, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'हटाने में त्रुटि';
      return { success: false, error: msg };
    }
  }

  /**
   * Upload Voice for Help Request to 'help-media' (Section 47)
   */
  static async uploadHelpVoice(
    requestId: string,
    audioBlob: Blob
  ): Promise<{ path: string | null; error: string | null }> {
    try {
      const filePath = `${requestId}/voice_${Date.now()}.webm`;
      const { error } = await supabase.storage
        .from(this.BUCKET_HELP)
        .upload(filePath, audioBlob, {
          contentType: audioBlob.type || 'audio/webm',
        });

      if (error) return { path: null, error: error.message };
      return { path: filePath, error: null };
    } catch (err) {
      return { path: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Upload Voice for Service Provider Complaint to 'help-media'
   */
  static async uploadComplaintVoice(
    complaintId: string,
    audioBlob: Blob
  ): Promise<{ path: string | null; error: string | null }> {
    try {
      if (audioBlob.size > this.MAX_VOICE_SIZE) {
        return { path: null, error: 'आवाज रिकॉर्डिंग का साइज़ 10MB से कम होना चाहिए।' };
      }

      const filePath = `complaints/${complaintId}/voice_${Date.now()}.webm`;
      const { error } = await supabase.storage
        .from(this.BUCKET_HELP)
        .upload(filePath, audioBlob, {
          contentType: audioBlob.type || 'audio/webm',
        });

      if (error) return { path: null, error: error.message };
      return { path: filePath, error: null };
    } catch (err) {
      return { path: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Upload Private Chat Media to 'chat-media' (Section 41)
   */
  static async uploadChatMedia(
    conversationId: string,
    file: Blob | File,
    mediaType: 'photo' | 'video' | 'voice'
  ): Promise<{ path: string | null; error: string | null }> {
    try {
      const ext =
        mediaType === 'voice'
          ? 'webm'
          : mediaType === 'video'
          ? 'mp4'
          : file.type.includes('png')
          ? 'png'
          : 'jpg';

      const filePath = `${conversationId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

      const { error } = await supabase.storage
        .from(this.BUCKET_CHAT)
        .upload(filePath, file, {
          contentType: file.type || (mediaType === 'voice' ? 'audio/webm' : 'image/jpeg'),
        });

      if (error) return { path: null, error: error.message };
      return { path: filePath, error: null };
    } catch (err) {
      return { path: null, error: err instanceof Error ? err.message : 'त्रुटि' };
    }
  }

  /**
   * Get signed URL for private media (chat / help)
   * 24-hour expiration (86400s) to prevent premature expiration
   */
  static async getSignedUrl(bucket: string, path: string, expiresIn = 86400): Promise<string | null> {
    if (!path) return null;
    const cleanPath = path.replace(/^\/+/, '');
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  /**
   * Upload Admin Voice Recording for Broadcast or Direct communication
   */
  static async uploadAdminVoice(
    adminId: string,
    audioBlob: Blob
  ): Promise<{ url: string | null; error: string | null }> {
    try {
      if (audioBlob.size > this.MAX_VOICE_SIZE) {
        return { url: null, error: 'आवाज रिकॉर्डिंग का साइज़ 10MB से कम होना चाहिए।' };
      }

      const filePath = `admin/${adminId}/voice_${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from(this.BUCKET_WORKER)
        .upload(filePath, audioBlob, {
          upsert: true,
          contentType: audioBlob.type || 'audio/webm',
        });

      if (uploadError) {
        return { url: null, error: uploadError.message };
      }

      const { data } = supabase.storage.from(this.BUCKET_WORKER).getPublicUrl(filePath);
      return { url: data.publicUrl, error: null };
    } catch (err) {
      return { url: null, error: err instanceof Error ? err.message : 'आवाज अपलोड असफल' };
    }
  }

  /**
   * Upload Voice recording for a Comment or Reply to 'comment-media'
   */
  static async uploadCommentVoice(
    authorId: string,
    audioBlob: Blob
  ): Promise<{ path: string | null; url: string | null; error: string | null }> {
    try {
      if (audioBlob.size > this.MAX_VOICE_SIZE) {
        return { path: null, url: null, error: 'आवाज रिकॉर्डिंग का साइज़ 10MB से कम होना चाहिए।' };
      }

      const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
      const filePath = `${authorId}/comment_voice_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(this.BUCKET_COMMENT)
        .upload(filePath, audioBlob, {
          upsert: true,
          contentType: audioBlob.type || 'audio/webm',
        });

      if (uploadError) {
        // Fallback to worker-media bucket if comment-media bucket not yet created
        const { error: fallbackErr } = await supabase.storage
          .from(this.BUCKET_WORKER)
          .upload(filePath, audioBlob, {
            upsert: true,
            contentType: audioBlob.type || 'audio/webm',
          });

        if (fallbackErr) {
          return { path: null, url: null, error: uploadError.message };
        }

        const { data: fbData } = supabase.storage.from(this.BUCKET_WORKER).getPublicUrl(filePath);
        return { path: filePath, url: fbData.publicUrl, error: null };
      }

      const { data } = supabase.storage.from(this.BUCKET_COMMENT).getPublicUrl(filePath);
      return { path: filePath, url: data.publicUrl, error: null };
    } catch (err) {
      return { path: null, url: null, error: err instanceof Error ? err.message : 'आवाज अपलोड असफल' };
    }
  }

  /**
   * Resolve public URL for a comment voice file
   */
  static getCommentVoiceUrl(storagePath: string): string {
    if (!storagePath) return '';
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }
    const cleanPath = storagePath.replace(/^\/+/, '');
    const { data } = supabase.storage.from(this.BUCKET_COMMENT).getPublicUrl(cleanPath);
    return data.publicUrl;
  }

  /**
   * Delete comment voice file from storage
   */
  static async deleteCommentVoice(
    storagePath: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      if (!storagePath) return { success: true, error: null };
      const cleanPath = storagePath.replace(/^\/+/, '');
      await supabase.storage.from(this.BUCKET_COMMENT).remove([cleanPath]);
      // Also attempt cleanup on fallback bucket if exists
      try {
        await supabase.storage.from(this.BUCKET_WORKER).remove([cleanPath]);
      } catch {}
      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'आवाज फ़ाइल हटाने में त्रुटि' };
    }
  }
}
