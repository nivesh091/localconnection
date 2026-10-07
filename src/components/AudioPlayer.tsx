import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Volume2, AlertCircle, Download, Clock } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  isMine?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title = 'आवाज सुनें',
  isMine = false,
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

    const handleReady = () => {
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

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleReady);
    audio.addEventListener('canplay', handleReady);
    audio.addEventListener('canplaythrough', handleReady);
    audio.addEventListener('loadeddata', handleReady);
    audio.addEventListener('durationchange', handleReady);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('error', handleError);

    // If audio is already ready in browser cache
    if (audio.readyState >= 1) {
      handleReady();
    }

    // Force browser to load the media resource with the new signed URL
    try {
      audio.load();
    } catch {
      // Ignored
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleReady);
      audio.removeEventListener('canplay', handleReady);
      audio.removeEventListener('canplaythrough', handleReady);
      audio.removeEventListener('loadeddata', handleReady);
      audio.removeEventListener('durationchange', handleReady);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('error', handleError);
    };
  }, [src]);

  const togglePlay = () => {
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
            setIsLoading(false);
          });
      }
    }
  };

  const seek = (seconds: number) => {
    if (!audioRef.current) return;
    const target = Math.max(0, Math.min(duration || 9999, audioRef.current.currentTime + seconds));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0 || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleRetry = () => {
    if (audioRef.current) {
      setHasError(false);
      setIsLoading(true);
      try {
        audioRef.current.load();
      } catch {
        // Ignored
      }
    }
  };

  if (hasError) {
    return (
      <div className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-xs ${
        isMine ? 'bg-emerald-100 border-emerald-300 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}>
        <div className="flex items-center gap-2">
          <AlertCircle className={`w-4 h-4 shrink-0 ${isMine ? 'text-emerald-800' : 'text-amber-600'}`} />
          <span>ऑडियो लोड नहीं हो सका।</span>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
            isMine ? 'bg-emerald-700 hover:bg-emerald-800 text-white' : 'bg-amber-200 hover:bg-amber-300 text-amber-900'
          }`}
        >
          पुनः प्रयास
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-3 shadow-2xs border ${
        isMine
          ? 'bg-emerald-200/50 border-emerald-300/80 text-emerald-950'
          : 'bg-teal-50/70 border-teal-200/80 text-slate-900'
      }`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Header: Title + Time + Download */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Volume2 className={`w-4 h-4 ${isMine ? 'text-emerald-800' : 'text-teal-700'}`} />
          <span className="truncate max-w-[120px]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-mono ${isMine ? 'text-emerald-900 font-semibold' : 'text-slate-500'}`}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          {src && (
            <a
              href={src}
              download="voice_recording.webm"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`p-1 rounded-md transition ${
                isMine ? 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-200' : 'text-slate-500 hover:text-teal-800 hover:bg-teal-100'
              }`}
              title="ऑडियो डाउनलोड करें"
              aria-label="ऑडियो डाउनलोड करें"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Progress slider */}
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        onChange={handleSliderChange}
        className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer mb-2 ${
          isMine ? 'bg-emerald-300 accent-emerald-700' : 'bg-teal-200 accent-teal-700'
        }`}
      />

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Rewind 5s */}
        <button
          type="button"
          onClick={() => seek(-5)}
          title="5 सेकंड पीछे"
          className={`p-1.5 rounded-full transition ${
            isMine ? 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-200' : 'text-slate-600 hover:text-teal-800 hover:bg-white'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Play/Pause Button with real loading state */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-10 h-10 rounded-full flex items-center justify-center shadow-xs transition active:scale-95 ${
            isMine
              ? 'bg-emerald-700 text-white hover:bg-emerald-800 font-bold'
              : 'bg-teal-700 text-white hover:bg-teal-800'
          }`}
          aria-label={isPlaying ? 'रोकें' : 'चलाएं'}
        >
          {isLoading ? (
            <Clock className="w-5 h-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </button>

        {/* Fast forward 5s */}
        <button
          type="button"
          onClick={() => seek(5)}
          title="5 सेकंड आगे"
          className={`p-1.5 rounded-full transition ${
            isMine ? 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-200' : 'text-slate-600 hover:text-teal-800 hover:bg-white'
          }`}
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
