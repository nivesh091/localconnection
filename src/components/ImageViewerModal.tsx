import React, { useState, useEffect, useRef } from 'react';
import { X, Download } from 'lucide-react';

interface ImageViewerModalProps {
  imageUrl: string;
  title?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  imageUrl,
  title,
  onClose,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Two-finger pinch state
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);

  // Close on ESC key safely without route change
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

  // Reset zoom & pan when image changes
  useEffect(() => {
    setZoomScale(1);
    setOffset({ x: 0, y: 0 });
  }, [imageUrl]);

  // One-Finger Pan Dragging
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

  // Two-Finger Pinch-to-Zoom Touch Gestures
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

  // Double-tap zoom toggle
  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap detected
      if (zoomScale > 1.2) {
        setZoomScale(1);
        setOffset({ x: 0, y: 0 });
      } else {
        setZoomScale(2.5);
      }
    }
    lastTapRef.current = now;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1300] bg-black/95 backdrop-blur-xs flex flex-col justify-between p-2 sm:p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="w-full flex items-center justify-between z-10 px-2 py-2 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
            aria-label="बंद करें"
            title="बंद करें (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
          {title && (
            <span className="text-xs sm:text-sm font-bold text-slate-200 truncate max-w-[180px] sm:max-w-xs">
              {title}
            </span>
          )}
        </div>

        {/* Right Action: Download Button */}
        <div className="flex items-center gap-2">
          <a
            href={imageUrl}
            download="photo.jpg"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
            title="डाउनलोड करें"
          >
            <Download className="w-5 h-5" />
          </a>
        </div>
      </div>

      {/* Main Image Viewport with Pinch-to-Zoom */}
      <div
        className="flex-1 w-full flex items-center justify-center overflow-hidden p-2 relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={(e) => {
          e.preventDefault();
          if (e.deltaY < 0) {
            setZoomScale((prev) => Math.min(4, +(prev + 0.25).toFixed(2)));
          } else {
            setZoomScale((prev) => {
              const next = Math.max(1, +(prev - 0.25).toFixed(2));
              if (next <= 1) setOffset({ x: 0, y: 0 });
              return next;
            });
          }
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'none' }}
      >
        <img
          src={imageUrl}
          alt={title || 'Fullscreen Preview'}
          draggable={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleImageClick}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoomScale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            transformOrigin: 'center center',
            cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
            touchAction: 'none',
          }}
          className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl select-none"
        />
      </div>

      {/* Bottom Hint */}
      <div className="py-1 text-center text-[11px] text-white/60 pointer-events-none">
        {zoomScale > 1
          ? 'खींचकर आगे-पीछे देखें • डबल-टैप या रीसेट से सामान्य आकार'
          : 'दो उंगलियों से पिंच करके ज़ूम करें • डबल-टैप करें'}
      </div>
    </div>
  );
};
