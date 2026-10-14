import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Trash2, Loader2, AlertCircle, Crop } from 'lucide-react';
import { ImageCropperModal } from './ImageCropperModal';
import { MediaService } from '../services/mediaService';
import { ProfileService } from '../services/profileService';

interface ProfilePhotoViewerModalProps {
  userId: string;
  userName: string;
  photoUrl: string | null;
  onClose: () => void;
  onPhotoUpdated: () => Promise<void>;
}

export const ProfilePhotoViewerModal: React.FC<ProfilePhotoViewerModalProps> = ({
  userId,
  userName,
  photoUrl,
  onClose,
  onPhotoUpdated,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFileForCrop, setSelectedFileForCrop] = useState<File | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Smooth pinch-to-zoom & pan state
  const [zoomScale, setZoomScale] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const firstLetter = (userName.trim().charAt(0) || 'U').toUpperCase();

  // Close on ESC key safely (never mutates history or navigates away)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Reset zoom & pan when photo changes
  useEffect(() => {
    setZoomScale(1);
    setOffset({ x: 0, y: 0 });
    setIsConfirmingDelete(false);
  }, [photoUrl]);

  // Touch handlers for 2-finger pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = zoomScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = currentDist / pinchStartDistRef.current;
      const nextZoom = Math.min(4, Math.max(1, +(pinchStartZoomRef.current * scale).toFixed(2)));
      setZoomScale(nextZoom);
      if (nextZoom <= 1) {
        setOffset({ x: 0, y: 0 });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
    }
  };

  // Dragging while zoomed
  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoomScale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || zoomScale <= 1) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Double-tap zoom toggle
  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (zoomScale > 1.2) {
        setZoomScale(1);
        setOffset({ x: 0, y: 0 });
      } else {
        setZoomScale(2.5);
      }
    }
    lastTapRef.current = now;
  };

  // User selects an image file to upload/change
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileForCrop(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // User wants to re-crop the current photo
  const handleCropCurrentPhoto = async () => {
    if (!photoUrl) {
      fileInputRef.current?.click();
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await fetch(photoUrl);
      const blob = await res.blob();
      const file = new File([blob], `avatar_${userId}_edit.jpg`, {
        type: blob.type || 'image/jpeg',
      });
      setSelectedFileForCrop(file);
    } catch {
      fileInputRef.current?.click();
    } finally {
      setIsProcessing(false);
    }
  };

  // After crop is confirmed, upload to profile-media and update user profile
  const handleCropComplete = async (croppedBlob: Blob) => {
    setSelectedFileForCrop(null);
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const croppedFile = new File([croppedBlob], `avatar_${userId}_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });

      const uploadRes = await MediaService.uploadProfilePhoto(userId, croppedFile);
      if (uploadRes.error || !uploadRes.url) {
        setErrorMsg(uploadRes.error || 'फ़ोटो अपलोड में समस्या आई।');
        setIsProcessing(false);
        return;
      }

      const updateRes = await ProfileService.updateProfile(userId, {
        profile_photo: uploadRes.url,
      });

      if (!updateRes.success) {
        setErrorMsg(updateRes.error || 'प्रोफ़ाइल अपडेट असफल।');
        setIsProcessing(false);
        return;
      }

      await onPhotoUpdated();
      setIsProcessing(false);
      onClose();
    } catch (err) {
      setIsProcessing(false);
      setErrorMsg(err instanceof Error ? err.message : 'त्रुटि हुई');
    }
  };

  // Real Profile Photo Deletion: Database ('profiles') + Supabase Storage ('profile-media')
  const handleExecuteDelete = async () => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      // 1. Clear profile_photo reference in database 'profiles' first
      const updateRes = await ProfileService.updateProfile(userId, {
        profile_photo: null,
      });

      if (!updateRes.success) {
        setErrorMsg(updateRes.error || 'फ़ोटो हटाने में समस्या आई।');
        setIsProcessing(false);
        return;
      }

      // 2. Invalidate profile cache so fresh data is loaded
      ProfileService.invalidateCache(userId);

      // 3. Clean up physical files from Supabase Storage 'profile-media'
      try {
        await MediaService.deleteProfilePhoto(userId, photoUrl);
      } catch (storageErr) {
        console.warn('Storage cleanup non-blocking notice:', storageErr);
      }

      // 4. Immediately refresh user in AuthContext so UI shows default avatar/initial
      await onPhotoUpdated();
      setIsProcessing(false);
      setIsConfirmingDelete(false);
      onClose();
    } catch (err) {
      setIsProcessing(false);
      setErrorMsg(err instanceof Error ? err.message : 'त्रुटि हुई');
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xs flex flex-col justify-between p-3 select-none animate-in fade-in duration-150"
        onClick={onClose}
      >
        {/* Top Header: Prominent Close (X) Button + User Name */}
        <div
          className="flex items-center justify-between px-2 py-2 text-white border-b border-white/10 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold truncate max-w-[200px]">{userName}</span>
          </div>

          {/* Prominent, easily visible X / Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-full transition cursor-pointer font-bold text-xs border border-white/20 shadow-md"
            aria-label="बंद करें"
            title="बंद करें (ESC)"
          >
            <X className="w-5 h-5 text-white" />
            <span>बंद करें (Close)</span>
          </button>
        </div>

        {/* Center Viewport: Large Centered Photo with Smooth Pinch Zoom & Pan */}
        <div
          className="flex-1 flex flex-col items-center justify-center p-2 overflow-hidden relative"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: 'none' }}
        >
          {errorMsg && (
            <div className="mb-3 px-3 py-1.5 bg-rose-500/90 text-white rounded-xl text-xs max-w-xs text-center z-10 flex items-center gap-1.5 shadow-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isProcessing ? (
            <div className="flex flex-col items-center gap-2.5 text-white bg-black/50 px-6 py-4 rounded-2xl border border-white/10">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <span className="text-xs font-semibold">प्रोफ़ाइल फ़ोटो हटाई जा रही है...</span>
            </div>
          ) : photoUrl ? (
            <div className="max-h-[70vh] max-w-full overflow-hidden flex items-center justify-center">
              <img
                src={photoUrl}
                alt={userName}
                draggable={false}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onClick={handleImageClick}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoomScale})`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease',
                  transformOrigin: 'center center',
                  cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                  touchAction: 'none',
                }}
                className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-2xl select-none"
              />
            </div>
          ) : (
            <div className="w-44 h-44 rounded-full border-4 border-white/20 bg-teal-900 flex items-center justify-center text-6xl font-bold text-white shadow-2xl">
              {firstLetter}
            </div>
          )}
        </div>

        {/* Bottom Actions: Change, Delete, and Cancel/Close Buttons */}
        <div
          className="flex flex-col gap-2 max-w-sm mx-auto w-full p-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* In-Modal Delete Confirmation Box (Prevents iframe window.confirm blocks) */}
          {isConfirmingDelete ? (
            <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-3.5 space-y-2.5 text-white shadow-2xl animate-in zoom-in-95 duration-100">
              <p className="text-xs text-center font-bold text-rose-200">
                क्या आप सच में अपनी प्रोफ़ाइल फ़ोटो हटाना चाहते हैं?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={isProcessing}
                  className="py-2.5 px-3 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  नहीं (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  disabled={isProcessing}
                  className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>हाँ, हटाएं (Delete)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {photoUrl ? (
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {/* 1. Crop / Edit Current Photo */}
                  <button
                    type="button"
                    onClick={handleCropCurrentPhoto}
                    disabled={isProcessing}
                    className="py-2.5 px-2 bg-teal-700 hover:bg-teal-800 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-md transition disabled:opacity-50 cursor-pointer"
                    title="फ़ोटो काटें / संपादित करें"
                  >
                    <Crop className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">क्रॉप (Crop)</span>
                  </button>

                  {/* 2. Select New Photo */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="py-2.5 px-2 bg-slate-700 hover:bg-slate-600 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-md transition disabled:opacity-50 cursor-pointer"
                    title="नई फ़ोटो चुनें"
                  >
                    <Camera className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">बदलें (Change)</span>
                  </button>

                  {/* 3. Delete Photo */}
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    disabled={isProcessing}
                    className="py-2.5 px-2 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-md transition disabled:opacity-50 cursor-pointer"
                    title="फ़ोटो हटाएं"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">हटाएं (Delete)</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>फ़ोटो जोड़ें (Add Photo)</span>
                </button>
              )}

              {/* Explicit Cancel / Close Button at bottom - Real styled button */}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-slate-800/90 hover:bg-slate-700 active:scale-98 text-slate-200 hover:text-white border border-slate-700 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
              >
                <span>रद्द करें (Cancel)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Embedded Crop Modal if user selects a new image */}
      {selectedFileForCrop && (
        <ImageCropperModal
          imageFile={selectedFileForCrop}
          aspectRatio={1} // 1:1 circular/square profile photo
          title="प्रोफ़ाइल फ़ोटो काटें (Crop Photo)"
          onCropComplete={handleCropComplete}
          onCancel={() => setSelectedFileForCrop(null)}
        />
      )}
    </>
  );
};
