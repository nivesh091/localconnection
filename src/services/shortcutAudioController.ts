/**
 * Shared audio controller for Home Screen Worker Card and Requirement Card shortcuts.
 * Guarantees that only ONE shortcut recording can play at a time across the entire app.
 * Preserves individual paused playback positions when switching between recordings or pausing.
 * Resets playback to 0:00 only when a recording naturally finishes to the end.
 * 
 * Features:
 * - Instant visible loading spinner feedback on play button
 * - In-memory LRU audio element caching to eliminate repeated network fetches and buffering
 * - Duplicate click prevention while audio is loading
 * - Clear error/retry state on network or audio decoding failure
 * - Preserves studio-grade loudness boosting (+13.94 dB) and brickwall limiter
 */

import { attachAudioLoudnessBooster, DEFAULT_GAIN_MULTIPLIER, resumeAudioContext } from './audioEnhancer';

type PlaybackListener = () => void;

class ShortcutAudioController {
  private activeId: string | null = null;
  private loadingId: string | null = null;
  private errorId: string | null = null;
  private isPlayingState = false;

  private currentAudio: HTMLAudioElement | null = null;
  private audioPool: Map<string, HTMLAudioElement> = new Map();
  private maxPoolSize = 30;

  private savedPositions: Map<string, number> = new Map();
  private completedIds: Set<string> = new Set();
  private listeners: Set<PlaybackListener> = new Set();

  public isPlaying(id: string): boolean {
    return this.activeId === id && this.isPlayingState;
  }

  public isLoading(id: string): boolean {
    return this.loadingId === id;
  }

  public hasError(id: string): boolean {
    return this.errorId === id;
  }

  public getActiveId(): string | null {
    return this.activeId;
  }

  public subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[ShortcutAudio] Listener notification error:', err);
      }
    });
  }

  /**
   * Retrieves an existing cached audio element or creates a new one.
   * Caches in memory to eliminate repeated network requests and buffering.
   */
  private getOrCreateAudio(url: string): HTMLAudioElement {
    if (this.audioPool.has(url)) {
      return this.audioPool.get(url)!;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.src = url;

    // Attach studio-grade loudness booster and limiter (+13.94 dB total)
    attachAudioLoudnessBooster(audio, { gainMultiplier: DEFAULT_GAIN_MULTIPLIER });

    // Evict oldest entry if pool exceeds limit
    if (this.audioPool.size >= this.maxPoolSize) {
      const oldestKey = this.audioPool.keys().next().value;
      if (oldestKey && oldestKey !== url) {
        const oldAudio = this.audioPool.get(oldestKey);
        if (oldAudio && oldAudio !== this.currentAudio) {
          oldAudio.pause();
          oldAudio.src = '';
          this.audioPool.delete(oldestKey);
        }
      }
    }

    this.audioPool.set(url, audio);
    return audio;
  }

  /**
   * Pre-warms/pre-buffers an audio URL when user hovers or touches the shortcut button.
   * Avoids downloading every audio file in advance while making user-initiated playback start instantly.
   */
  public preloadAudio(url?: string | null) {
    if (!url || typeof window === 'undefined') return;
    try {
      this.getOrCreateAudio(url);
    } catch {}
  }

  /**
   * Toggles playback for a specific card recording:
   * - If currently playing this card -> Pause and save exact position
   * - If currently loading this card -> Safely ignore repeated clicks (prevents duplicate requests/play)
   * - If switching from another card -> Pause previous, save its position, play new card
   * - If previously finished -> Restart from 0:00
   */
  public toggle(id: string, url: string) {
    if (!url || typeof window === 'undefined') return;

    // Requirement 6: While the same audio is loading, ignore repeated clicks
    if (this.loadingId === id) {
      return;
    }

    // 1. Tapping Pause on the currently playing recording
    if (this.activeId === id && this.isPlayingState && this.currentAudio) {
      if (!this.currentAudio.ended) {
        this.savedPositions.set(id, this.currentAudio.currentTime);
      }
      this.currentAudio.pause();
      this.isPlayingState = false;
      this.activeId = null;
      this.loadingId = null;
      this.notify();
      return;
    }

    // 2. Pause any currently playing audio from another card
    if (this.currentAudio && !this.currentAudio.paused) {
      if (this.activeId && !this.currentAudio.ended) {
        this.savedPositions.set(this.activeId, this.currentAudio.currentTime);
      }
      this.currentAudio.pause();
    }

    // Requirement 4: Immediately show visible loading indicator on Play button
    this.activeId = id;
    this.loadingId = id;
    this.errorId = null;
    this.isPlayingState = false;
    this.notify();

    // Unlock Web Audio API synchronously in user gesture
    resumeAudioContext();

    // 3. Resolve target seek position
    let targetTime = 0;
    if (this.completedIds.has(id)) {
      this.completedIds.delete(id);
      this.savedPositions.delete(id);
      targetTime = 0;
    } else if (this.savedPositions.has(id)) {
      targetTime = this.savedPositions.get(id) || 0;
    }

    const audio = this.getOrCreateAudio(url);
    this.currentAudio = audio;

    // Detach any previous event listeners on this audio element to prevent duplicates
    audio.onplaying = null;
    audio.onwaiting = null;
    audio.onpause = null;
    audio.onended = null;
    audio.onerror = null;

    // Requirement 5: When playback starts, replace loading indicator with Pause button
    audio.onplaying = () => {
      if (this.activeId === id) {
        this.isPlayingState = true;
        this.loadingId = null;
        this.errorId = null;
        this.notify();
      }
    };

    audio.onwaiting = () => {
      if (this.activeId === id) {
        this.loadingId = id;
        this.notify();
      }
    };

    audio.onpause = () => {
      if (this.activeId === id && !this.loadingId) {
        this.isPlayingState = false;
        this.notify();
      }
    };

    audio.onended = () => {
      if (this.activeId === id) {
        this.completedIds.add(id);
        this.savedPositions.delete(id);
        this.isPlayingState = false;
        this.loadingId = null;
        this.activeId = null;
        this.notify();
      }
    };

    // Requirement 7: Show clear error/retry state on network failure
    audio.onerror = () => {
      if (this.activeId === id) {
        console.warn('[ShortcutAudio] Playback error encountered for URL:', url);
        this.isPlayingState = false;
        this.loadingId = null;
        this.errorId = id;
        this.notify();
      }
    };

    // Apply seek time if returning to paused position
    if (targetTime > 0) {
      try {
        audio.currentTime = targetTime;
      } catch {}
    }

    // Begin playback immediately without waiting for full download
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (err.name === 'AbortError') {
          // Play was deliberately paused by user or superseded
          return;
        }
        console.warn('[ShortcutAudio] Play initiation failed:', err);
        if (this.activeId === id) {
          this.isPlayingState = false;
          this.loadingId = null;
          this.errorId = id;
          this.notify();
        }
      });
    }
  }

  public pauseAll() {
    if (this.currentAudio && !this.currentAudio.paused) {
      if (this.activeId) {
        this.savedPositions.set(this.activeId, this.currentAudio.currentTime);
      }
      this.currentAudio.pause();
    }
    this.isPlayingState = false;
    this.loadingId = null;
    this.activeId = null;
    this.notify();
  }
}

export const shortcutAudioController = new ShortcutAudioController();
