import React, { useState, useEffect } from 'react';
import { X, Send, Crop, RotateCcw } from 'lucide-react';
import { usePopupBackDismiss } from '../hooks/usePopupBackDismiss';
import { ImageCropperModal } from './ImageCropperModal';

interface ChatImagePreviewModalProps {
  file: File;
  onSend: (finalFile: File) => void;
  onCancel: () => void;
}

export const ChatImagePreviewModal: React.FC<ChatImagePreviewModalProps> = ({
  file,
  onSend,
  onCancel,
}) => {
  usePopupBackDismiss(true, onCancel);

  const [currentFile, setCurrentFile] = useState<File>(file);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [showCrop, setShowCrop] = useState(false);

  useEffect(() => {
    setCurrentFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleCropComplete = (croppedBlob: Blob) => {
    const croppedFile = new File([croppedBlob], file.name || 'image.jpg', {
      type: croppedBlob.type || 'image/jpeg',
    });
    setCurrentFile(croppedFile);
    const newUrl = URL.createObjectURL(croppedBlob);
    setPreviewUrl(newUrl);
    setShowCrop(false);
  };

  const handleResetToOriginal = () => {
    setCurrentFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-xs flex flex-col justify-between p-3 select-none animate-in fade-in duration-150"
      >
        {/* Top Header: Cancel button & Title & Crop button */}
        <div className="flex items-center justify-between px-2 py-2 text-white">
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition"
            title="रद्द करें"
          >
            <X className="w-5 h-5" />
          </button>

          <span className="text-xs font-semibold opacity-80">फ़ोटो भेजें (Preview)</span>

          <div className="flex items-center gap-1.5">
            {currentFile !== file && (
              <button
                type="button"
                onClick={handleResetToOriginal}
                className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition"
                title="मूल फ़ोटो पर वापस जाएं"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCrop(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-full text-xs font-semibold transition"
              title="फ़ोटो काटें (Crop)"
            >
              <Crop className="w-3.5 h-3.5" />
              <span>काटें (Crop)</span>
            </button>
          </div>
        </div>

        {/* Center: Large Preview */}
        <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Chat preview"
              className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl"
            />
          )}
        </div>

        {/* Bottom Actions: Cancel and Send */}
        <div className="flex items-center justify-between gap-3 p-3 max-w-md mx-auto w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs transition"
          >
            रद्द करें (Cancel)
          </button>

          <button
            type="button"
            onClick={() => onSend(currentFile)}
            className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg"
          >
            <Send className="w-4 h-4" />
            <span>भेजें (Send)</span>
          </button>
        </div>
      </div>

      {/* Embedded Crop Modal if activated */}
      {showCrop && (
        <ImageCropperModal
          imageFile={currentFile}
          title="फ़ोटो काटें (Crop Image)"
          onCropComplete={handleCropComplete}
          onCancel={() => setShowCrop(false)}
        />
      )}
    </>
  );
};
