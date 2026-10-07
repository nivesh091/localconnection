import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square, RotateCcw, Volume2, Mic, Clock, AlertCircle } from 'lucide-react';

interface CompactAudioPlayerProps {
  src: string;
  title?: string;
  theme?: 'requirement' | 'default';
  className?: string;
}

export const CompactAudioPlayer: React.FC<CompactAudioPlayerProps> = ({
  src,
  title = 'आवश्यकता की रिकॉर्डिंग',
  theme = 'requirement',
  className = '',
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    setIsLoading(true);
    setHasError(false);
    setIsPlaying(false);
    setCurrentTime(0);

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setIsLoading(false);
      setHasError(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    if (audio.readyState >= 1) {
      handleLoadedMetadata();
    }

    try {
      audio.load();
    } catch {}

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [src]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || hasError) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsLoading(false);
          })
          .catch((err) => {
            console.warn('Audio play error:', err);
            setHasError(true);
            setIsPlaying(false);
          });
      }
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0 || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (hasError) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-[#e2e8f0] rounded-xl p-[2px] shadow-[0_2px_4px_rgba(0,0,0,0.06)] ${className}`}
      >
        <div className="bg-[#f8fafc] rounded-[10px] py-1.5 px-2.5 flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-medium">ऑडियो लोड नहीं हो सका</span>
          </div>
        </div>
      </div>
    );
  }

  // Theme styling: Requirement Card uses deep indigo-slate bevel; compact height matching location row
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`bg-[#364f6b]/70 rounded-xl p-[2px] shadow-[0_3px_6px_rgba(0,0,0,0.08)] ${className}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="bg-[#f4f7fb] rounded-[10px] py-1.5 sm:py-2 px-2.5 sm:px-3 flex items-center justify-between gap-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.04)]">
        {/* Left: Mic icon + Title + Live Time */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2d4a70] shrink-0" />
          <span className="text-[11px] sm:text-xs font-semibold text-[#1e293b] truncate">
            {title}
          </span>
          {duration > 0 && (
            <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-1">
              ({formatTime(currentTime)} / {formatTime(duration)})
            </span>
          )}
        </div>

        {/* Right: Controls (Replay, Stop, Play/Pause) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Restart / Replay button */}
          <button
            type="button"
            onClick={handleRestart}
            title="शुरुआत से बजाएं (Restart)"
            className="p-1 rounded-md text-slate-600 hover:text-[#1e3a5f] hover:bg-slate-200/70 transition cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Stop button */}
          {isPlaying && (
            <button
              type="button"
              onClick={handleStop}
              title="रोकें (Stop)"
              className="p-1 rounded-md text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition cursor-pointer active:scale-95"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          )}

          {/* Play / Pause button */}
          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? 'रोकें (Pause)' : 'चलाएं (Play)'}
            className="w-7 h-7 rounded-full bg-gradient-to-b from-[#2d4a70] to-[#1b3252] text-white flex items-center justify-center shadow-xs hover:brightness-110 active:scale-95 transition cursor-pointer"
          >
            {isLoading ? (
              <Clock className="w-3.5 h-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
