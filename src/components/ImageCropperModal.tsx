import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, RotateCw, RotateCcw, Crop, Loader2 } from 'lucide-react';

interface ImageCropperModalProps {
  imageFile: File;
  aspectRatio?: number; // e.g. 1 for 1:1 square (Profile photo), or undefined for freeform
  title?: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  imageFile,
  aspectRatio: fixedAspectRatio,
  title = 'फ़ोटो काटें (Crop Photo)',
  onCropComplete,
  onCancel,
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [isCropping, setIsCropping] = useState<boolean>(false);

  // Container viewport size
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 320, height: 320 });

  // Display size of image inside viewport
  const [imageDisplay, setImageDisplay] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Crop box in imageDisplay coordinate space
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, width: 0, height: 0 });

  // Keep a ref to cropBox so window pointer handlers and confirmCrop always access fresh values
  const cropBoxRef = useRef<CropBox>(cropBox);
  cropBoxRef.current = cropBox;

  // Active dragging handle
  const [activeHandle, setActiveHandle] = useState<DragHandle | null>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialBox: CropBox;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hasInitializedCropRef = useRef<boolean>(false);

  // Close on Escape key without affecting outer routes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Load image object URL and read natural dimensions
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);

    const img = new Image();
    img.onload = () => {
      setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  // Measure container viewport on mount and on window resize
  const measureViewport = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = Math.max(140, Math.floor(rect.width) - 20);
    const h = Math.max(140, Math.floor(rect.height) - 20);
    setViewportSize({ width: w, height: h });
  }, []);

  useEffect(() => {
    // Immediate measurement + requestAnimationFrame to ensure CSS layout has stabilized
    measureViewport();
    const rafId = requestAnimationFrame(measureViewport);

    window.addEventListener('resize', measureViewport);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', measureViewport);
    };
  }, [measureViewport]);

  const currentRatio = fixedAspectRatio;

  // Compute image display dimensions whenever image, rotation, or viewport changes
  useEffect(() => {
    if (!naturalDimensions || viewportSize.width <= 0 || viewportSize.height <= 0) return;

    const isSideways = rotation % 180 !== 0;
    const natW = isSideways ? naturalDimensions.height : naturalDimensions.width;
    const natH = isSideways ? naturalDimensions.width : naturalDimensions.height;

    const imgAspect = natW / natH;
    let dispW = viewportSize.width;
    let dispH = viewportSize.width / imgAspect;

    if (dispH > viewportSize.height) {
      dispH = viewportSize.height;
      dispW = viewportSize.height * imgAspect;
    }

    // Minimum display bounds
    dispW = Math.max(100, Math.round(dispW));
    dispH = Math.max(100, Math.round(dispH));

    const prevDisplay = imageDisplay;
    setImageDisplay({ width: dispW, height: dispH });

    // Initialize or adjust crop box:
    // Only re-initialize from scratch on first mount or when rotation changes
    if (!hasInitializedCropRef.current || rotation !== 0) {
      let initW: number;
      let initH: number;

      if (currentRatio) {
        // Square or fixed ratio (e.g. 1:1 for profile photo)
        const maxSquare = Math.min(dispW, dispH) * 0.85;
        initW = maxSquare;
        initH = maxSquare / currentRatio;
        if (initH > dispH * 0.85) {
          initH = dispH * 0.85;
          initW = initH * currentRatio;
        }
      } else {
        initW = dispW * 0.85;
        initH = dispH * 0.85;
      }

      initW = Math.min(initW, dispW);
      initH = Math.min(initH, dispH);

      const initX = Math.max(0, (dispW - initW) / 2);
      const initY = Math.max(0, (dispH - initH) / 2);

      const initialBox: CropBox = {
        x: Math.round(initX),
        y: Math.round(initY),
        width: Math.round(initW),
        height: Math.round(initH),
      };

      setCropBox(initialBox);
      cropBoxRef.current = initialBox;
      hasInitializedCropRef.current = true;
    } else if (prevDisplay.width > 0 && prevDisplay.height > 0) {
      // Scale cropBox proportionally to viewport adjustments so user's selection is preserved
      const scaleX = dispW / prevDisplay.width;
      const scaleY = dispH / prevDisplay.height;
      const prevBox = cropBoxRef.current;

      const newW = Math.min(dispW, Math.round(prevBox.width * scaleX));
      const newH = currentRatio ? newW / currentRatio : Math.min(dispH, Math.round(prevBox.height * scaleY));
      const newX = Math.max(0, Math.min(dispW - newW, Math.round(prevBox.x * scaleX)));
      const newY = Math.max(0, Math.min(dispH - newH, Math.round(prevBox.y * scaleY)));

      const updatedBox: CropBox = {
        x: newX,
        y: newY,
        width: newW,
        height: newH,
      };
      setCropBox(updatedBox);
      cropBoxRef.current = updatedBox;
    }
  }, [naturalDimensions, rotation, viewportSize.width, viewportSize.height, currentRatio]);

  // Pointer down on a handle or crop-box body
  const handlePointerDown = (handle: DragHandle, e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();

    setActiveHandle(handle);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialBox: { ...cropBoxRef.current },
    };
  };

  // Global window pointer move & up listeners — eliminates stuck handles, dropped events, and touch glitches
  useEffect(() => {
    if (!activeHandle) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current || imageDisplay.width <= 0 || imageDisplay.height <= 0) return;
      e.preventDefault();

      const { clientX, clientY, initialBox } = dragStartRef.current;
      const dx = e.clientX - clientX;
      const dy = e.clientY - clientY;

      const minSize = Math.max(36, Math.min(imageDisplay.width * 0.15, imageDisplay.height * 0.15));
      const maxW = imageDisplay.width;
      const maxH = imageDisplay.height;

      // 1. Move entire crop area
      if (activeHandle === 'move') {
        const nextX = Math.max(0, Math.min(maxW - initialBox.width, initialBox.x + dx));
        const nextY = Math.max(0, Math.min(maxH - initialBox.height, initialBox.y + dy));
        const newBox: CropBox = {
          ...initialBox,
          x: Math.round(nextX),
          y: Math.round(nextY),
        };
        setCropBox(newBox);
        cropBoxRef.current = newBox;
        return;
      }

      // 2. Corner Resizing (Square / 1:1 Profile Photo or Freeform)
      let { x, y, width, height } = initialBox;

      if (activeHandle === 'se') {
        let nw = initialBox.width + dx;
        let nh = initialBox.height + dy;
        if (currentRatio) {
          const maxAvail = Math.min(maxW - x, maxH - y);
          const size = Math.max(minSize, Math.min(maxAvail, Math.max(nw, nh)));
          nw = size;
          nh = size / currentRatio;
        } else {
          nw = Math.max(minSize, Math.min(maxW - x, nw));
          nh = Math.max(minSize, Math.min(maxH - y, nh));
        }
        width = nw;
        height = nh;
      } else if (activeHandle === 'nw') {
        if (currentRatio) {
          const maxAvail = Math.min(initialBox.x + initialBox.width, initialBox.y + initialBox.height);
          const size = Math.max(minSize, Math.min(maxAvail, initialBox.width - dx, initialBox.height - dy));
          x = initialBox.x + initialBox.width - size;
          y = initialBox.y + initialBox.height - size;
          width = size;
          height = size;
        } else {
          const nx = Math.max(0, Math.min(initialBox.x + initialBox.width - minSize, initialBox.x + dx));
          const ny = Math.max(0, Math.min(initialBox.y + initialBox.height - minSize, initialBox.y + dy));
          width = initialBox.x + initialBox.width - nx;
          height = initialBox.y + initialBox.height - ny;
          x = nx;
          y = ny;
        }
      } else if (activeHandle === 'ne') {
        if (currentRatio) {
          const maxAvail = Math.min(maxW - initialBox.x, initialBox.y + initialBox.height);
          const size = Math.max(minSize, Math.min(maxAvail, initialBox.width + dx, initialBox.height - dy));
          y = initialBox.y + initialBox.height - size;
          width = size;
          height = size;
        } else {
          const ny = Math.max(0, Math.min(initialBox.y + initialBox.height - minSize, initialBox.y + dy));
          width = Math.max(minSize, Math.min(maxW - initialBox.x, initialBox.width + dx));
          height = initialBox.y + initialBox.height - ny;
          y = ny;
        }
      } else if (activeHandle === 'sw') {
        if (currentRatio) {
          const maxAvail = Math.min(initialBox.x + initialBox.width, maxH - initialBox.y);
          const size = Math.max(minSize, Math.min(maxAvail, initialBox.width - dx, initialBox.height + dy));
          x = initialBox.x + initialBox.width - size;
          width = size;
          height = size;
        } else {
          const nx = Math.max(0, Math.min(initialBox.x + initialBox.width - minSize, initialBox.x + dx));
          width = initialBox.x + initialBox.width - nx;
          height = Math.max(minSize, Math.min(maxH - initialBox.y, initialBox.height + dy));
          x = nx;
        }
      } else if (activeHandle === 'e') {
        width = Math.max(minSize, Math.min(maxW - x, initialBox.width + dx));
        if (currentRatio) height = Math.min(maxH - y, width / currentRatio);
      } else if (activeHandle === 'w') {
        const nx = Math.max(0, Math.min(initialBox.x + initialBox.width - minSize, initialBox.x + dx));
        width = initialBox.x + initialBox.width - nx;
        x = nx;
        if (currentRatio) height = Math.min(maxH - y, width / currentRatio);
      } else if (activeHandle === 's') {
        height = Math.max(minSize, Math.min(maxH - y, initialBox.height + dy));
        if (currentRatio) width = Math.min(maxW - x, height * currentRatio);
      } else if (activeHandle === 'n') {
        const ny = Math.max(0, Math.min(initialBox.y + initialBox.height - minSize, initialBox.y + dy));
        height = initialBox.y + initialBox.height - ny;
        y = ny;
        if (currentRatio) width = Math.min(maxW - x, height * currentRatio);
      }

      const clampedBox: CropBox = {
        x: Math.round(Math.max(0, Math.min(maxW - width, x))),
        y: Math.round(Math.max(0, Math.min(maxH - height, y))),
        width: Math.round(Math.max(minSize, Math.min(maxW - x, width))),
        height: Math.round(Math.max(minSize, Math.min(maxH - y, height))),
      };

      setCropBox(clampedBox);
      cropBoxRef.current = clampedBox;
    };

    const handlePointerUp = () => {
      setActiveHandle(null);
      dragStartRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [activeHandle, currentRatio, imageDisplay.height, imageDisplay.width]);

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    hasInitializedCropRef.current = false;
    setRotation((prev) => (prev + 90) % 360);
  };

  // Reset crop to full coverage
  const handleReset = () => {
    hasInitializedCropRef.current = false;
    setRotation(0);
    if (imageDisplay.width > 0 && imageDisplay.height > 0) {
      let initW = imageDisplay.width;
      let initH = imageDisplay.height;
      if (currentRatio) {
        const size = Math.min(imageDisplay.width, imageDisplay.height);
        initW = size;
        initH = size / currentRatio;
      }
      const newBox: CropBox = {
        x: Math.round((imageDisplay.width - initW) / 2),
        y: Math.round((imageDisplay.height - initH) / 2),
        width: Math.round(initW),
        height: Math.round(initH),
      };
      setCropBox(newBox);
      cropBoxRef.current = newBox;
    }
  };

  // Perform actual pixel crop using offscreen canvas with safe max-dimension clamping
  const handleConfirmCrop = useCallback(() => {
    if (isCropping) return;
    const img = imageRef.current;
    if (!img || !naturalDimensions || imageDisplay.width <= 0 || imageDisplay.height <= 0) return;

    setIsCropping(true);

    try {
      // 1. Create an offscreen canvas for the rotated image
      const rotRad = (rotation * Math.PI) / 180;
      const isSideways = rotation % 180 !== 0;

      const orientedW = isSideways ? img.naturalHeight : img.naturalWidth;
      const orientedH = isSideways ? img.naturalWidth : img.naturalHeight;

      const orientedCanvas = document.createElement('canvas');
      orientedCanvas.width = orientedW;
      orientedCanvas.height = orientedH;

      const oCtx = orientedCanvas.getContext('2d');
      if (!oCtx) {
        setIsCropping(false);
        return;
      }

      oCtx.imageSmoothingEnabled = true;
      oCtx.imageSmoothingQuality = 'high';

      oCtx.translate(orientedW / 2, orientedH / 2);
      oCtx.rotate(rotRad);
      oCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      // 2. Map display crop coordinates to orientedCanvas natural pixel coordinates
      const scaleFactorX = orientedW / imageDisplay.width;
      const scaleFactorY = orientedH / imageDisplay.height;

      const currentBox = cropBoxRef.current;
      const srcX = Math.max(0, Math.min(orientedW - 1, Math.round(currentBox.x * scaleFactorX)));
      const srcY = Math.max(0, Math.min(orientedH - 1, Math.round(currentBox.y * scaleFactorY)));
      const srcW = Math.max(1, Math.min(orientedW - srcX, Math.round(currentBox.width * scaleFactorX)));
      const srcH = Math.max(1, Math.min(orientedH - srcY, Math.round(currentBox.height * scaleFactorY)));

      // 3. Cap max export dimension to 1200px to prevent mobile browser memory crashes
      const maxDim = 1200;
      let outW = srcW;
      let outH = srcH;
      if (outW > maxDim || outH > maxDim) {
        if (outW >= outH) {
          outH = Math.round((outH * maxDim) / outW);
          outW = maxDim;
        } else {
          outW = Math.round((outW * maxDim) / outH);
          outH = maxDim;
        }
      }

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = outW;
      finalCanvas.height = outH;

      const fCtx = finalCanvas.getContext('2d');
      if (!fCtx) {
        setIsCropping(false);
        return;
      }

      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'high';
      fCtx.drawImage(orientedCanvas, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      // 4. Export clean blob
      finalCanvas.toBlob(
        (blob) => {
          setIsCropping(false);
          if (blob && blob.size > 0) {
            onCropComplete(blob);
          } else {
            onCancel();
          }
        },
        imageFile.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.92
      );
    } catch (err) {
      console.error('Failed to crop image:', err);
      setIsCropping(false);
    }
  }, [cropBox, imageDisplay.height, imageDisplay.width, imageFile.type, isCropping, naturalDimensions, onCancel, onCropComplete, rotation]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-xs flex flex-col justify-between p-2 sm:p-4 select-none h-[100dvh] max-h-[100dvh]"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
    >
      {/* Top Header: Title, Reset, Rotate, Close */}
      <div className="flex items-center justify-between px-2 py-2 text-white border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Crop className="w-5 h-5 text-teal-400 shrink-0" />
          <h3 className="text-sm sm:text-base font-bold truncate">{title}</h3>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRotate}
            className="p-1.5 sm:px-2.5 sm:py-1 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title="90° घुमाएं (Rotate 90°)"
          >
            <RotateCw className="w-4 h-4 text-teal-300" />
            <span className="hidden xs:inline">घुमाएं</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-1.5 sm:px-2.5 sm:py-1 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title="रीसेट करें (Reset)"
          >
            <RotateCcw className="w-4 h-4 text-slate-300" />
            <span className="hidden xs:inline">रीसेट</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
            className="p-1.5 text-slate-300 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
            title="रद्द करें (Cancel)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden relative p-2 w-full min-h-0"
        style={{ touchAction: 'none' }}
      >
        {imageSrc && imageDisplay.width > 0 && imageDisplay.height > 0 && (
          <div
            className="relative select-none"
            style={{
              width: `${imageDisplay.width}px`,
              height: `${imageDisplay.height}px`,
            }}
          >
            {/* The Source Image */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop target"
              draggable={false}
              style={{
                width: `${imageDisplay.width}px`,
                height: `${imageDisplay.height}px`,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
              className="absolute inset-0 object-contain pointer-events-none select-none"
            />

            {/* 4 Clean Mask Rectangles around the crop box - zero GPU composite bugs or flickering */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{ top: 0, left: 0, right: 0, height: `${cropBox.y}px` }}
            />
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{ top: `${cropBox.y + cropBox.height}px`, left: 0, right: 0, bottom: 0 }}
            />
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{ top: `${cropBox.y}px`, left: 0, width: `${cropBox.x}px`, height: `${cropBox.height}px` }}
            />
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{ top: `${cropBox.y}px`, left: `${cropBox.x + cropBox.width}px`, right: 0, height: `${cropBox.height}px` }}
            />

            {/* Interactive Crop Box */}
            <div
              className="absolute border-2 border-white shadow-2xl"
              style={{
                left: `${cropBox.x}px`,
                top: `${cropBox.y}px`,
                width: `${cropBox.width}px`,
                height: `${cropBox.height}px`,
                touchAction: 'none',
              }}
            >
              {/* Center Body (Move Handle) */}
              <div
                onPointerDown={(e) => handlePointerDown('move', e)}
                className="absolute inset-0 cursor-move"
                style={{ touchAction: 'none' }}
                title="फ़ोटो को खिसकाएं (Drag to position)"
              >
                {/* 3x3 Rule-of-thirds Grid Lines */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/30">
                  <div className="border-r border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-b border-white/30" />
                  <div className="border-r border-white/30" />
                  <div className="border-r border-white/30" />
                  <div />
                </div>

                {/* Circular guide for 1:1 Profile Photos */}
                {fixedAspectRatio === 1 && (
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-teal-300/80 pointer-events-none shadow-sm" />
                )}
              </div>

              {/* 4 Corner L-Brackets with Touch-Friendly Hit Targets */}
              {/* Top-Left */}
              <div
                onPointerDown={(e) => handlePointerDown('nw', e)}
                className="absolute -top-4 -left-4 w-10 h-10 flex items-start justify-start cursor-nwse-resize p-2 z-20"
                style={{ touchAction: 'none' }}
                title="कोने से आकार बदलें"
              >
                <div className="w-4 h-4 border-t-3 border-l-3 border-white shadow-md bg-teal-500/20" />
              </div>

              {/* Top-Right */}
              <div
                onPointerDown={(e) => handlePointerDown('ne', e)}
                className="absolute -top-4 -right-4 w-10 h-10 flex items-start justify-end cursor-nesw-resize p-2 z-20"
                style={{ touchAction: 'none' }}
                title="कोने से आकार बदलें"
              >
                <div className="w-4 h-4 border-t-3 border-r-3 border-white shadow-md bg-teal-500/20" />
              </div>

              {/* Bottom-Left */}
              <div
                onPointerDown={(e) => handlePointerDown('sw', e)}
                className="absolute -bottom-4 -left-4 w-10 h-10 flex items-end justify-start cursor-nesw-resize p-2 z-20"
                style={{ touchAction: 'none' }}
                title="कोने से आकार बदलें"
              >
                <div className="w-4 h-4 border-b-3 border-l-3 border-white shadow-md bg-teal-500/20" />
              </div>

              {/* Bottom-Right */}
              <div
                onPointerDown={(e) => handlePointerDown('se', e)}
                className="absolute -bottom-4 -right-4 w-10 h-10 flex items-end justify-end cursor-nwse-resize p-2 z-20"
                style={{ touchAction: 'none' }}
                title="कोने से आकार बदलें"
              >
                <div className="w-4 h-4 border-b-3 border-r-3 border-white shadow-md bg-teal-500/20" />
              </div>

              {/* Freeform edge handles only when not constrained to fixed aspect ratio */}
              {!fixedAspectRatio && (
                <>
                  {/* Top */}
                  <div
                    onPointerDown={(e) => handlePointerDown('n', e)}
                    className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-6 flex items-start justify-center cursor-ns-resize z-20"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="w-6 h-1 bg-white rounded-full shadow-md" />
                  </div>

                  {/* Bottom */}
                  <div
                    onPointerDown={(e) => handlePointerDown('s', e)}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-12 h-6 flex items-end justify-center cursor-ns-resize z-20"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="w-6 h-1 bg-white rounded-full shadow-md" />
                  </div>

                  {/* Left */}
                  <div
                    onPointerDown={(e) => handlePointerDown('w', e)}
                    className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-12 flex items-center justify-start cursor-ew-resize z-20"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="w-1 h-6 bg-white rounded-full shadow-md" />
                  </div>

                  {/* Right */}
                  <div
                    onPointerDown={(e) => handlePointerDown('e', e)}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 flex items-center justify-end cursor-ew-resize z-20"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="w-1 h-6 bg-white rounded-full shadow-md" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Bar: Cancel & Crop Button */}
      <div className="flex flex-col gap-2 py-2 px-2 max-w-sm mx-auto w-full shrink-0">
        <p className="text-[11px] text-center text-white/70 pointer-events-none">
          फ़ोटो को खिसकाएं या कोनों से आकार समायोजित करें
        </p>

        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
            className="py-3 px-4 bg-white/10 hover:bg-white/20 active:bg-white/25 text-white rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-1.5 cursor-pointer select-none"
          >
            <X className="w-4 h-4" />
            <span>रद्द करें (Cancel)</span>
          </button>

          <button
            type="button"
            disabled={isCropping}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleConfirmCrop();
            }}
            className="py-3 px-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg cursor-pointer select-none disabled:opacity-50"
          >
            {isCropping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>क्रॉप हो रहा है...</span>
              </>
            ) : (
              <>
                <Crop className="w-4 h-4 shrink-0" />
                <span>काटें व चुनें (Crop)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
