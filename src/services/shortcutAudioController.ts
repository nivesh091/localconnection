/**
 * Shared audio controller for Home Screen Worker Card and Requirement Card shortcuts.
 * Guarantees that only ONE shortcut recording can play at a time across the entire app.
 * Preserves individual paused playback positions when switching between recordings or pausing.
 * Resets playback to 0:00 only when a recording naturally finishes to the end.
 */

type PlaybackListener = (activeId: string | null) => void;

class ShortcutAudioController {
  private audio: HTMLAudioElement | null = null;
  private activeId: string | null = null;
  private savedPositions: Map<string, number> = new Map();
  private completedIds: Set<string> = new Set();
  private listeners: Set<PlaybackListener> = new Set();
  private pendingSeekTime: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'metadata';

      this.audio.addEventListener('ended', () => {
        if (this.activeId) {
          // Scenario 6: Mark recording as naturally completed and reset its position for next run
          this.completedIds.add(this.activeId);
          this.savedPositions.delete(this.activeId);
          this.activeId = null;
          this.pendingSeekTime = null;
          this.notify();
        }
      });

      this.audio.addEventListener('error', (e) => {
        console.warn('[ShortcutAudio] Playback error encountered:', e);
        if (this.activeId) {
          this.activeId = null;
          this.pendingSeekTime = null;
          this.notify();
        }
      });

      this.audio.addEventListener('loadedmetadata', () => {
        if (this.audio && this.pendingSeekTime !== null && this.pendingSeekTime > 0) {
          try {
            this.audio.currentTime = this.pendingSeekTime;
          } catch {}
          this.pendingSeekTime = null;
        }
      });
    }
  }

  public isPlaying(id: string): boolean {
    return this.activeId === id;
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
        listener(this.activeId);
      } catch (err) {
        console.error('[ShortcutAudio] Listener error:', err);
      }
    });
  }

  /**
   * Toggles playback for a specific card recording:
   * - If currently playing this card -> Pause and save exact position
   * - If switching from another card -> Pause previous, save its position, play new card from saved position or 0:00
   * - If previously finished -> Restart from 0:00
   */
  public toggle(id: string, url: string) {
    if (!this.audio || !url) return;

    // 1. Tapping Pause on the currently playing recording
    if (this.activeId === id) {
      if (!this.audio.ended) {
        this.savedPositions.set(id, this.audio.currentTime);
      }
      this.audio.pause();
      this.activeId = null;
      this.pendingSeekTime = null;
      this.notify();
      return;
    }

    // 2. Switching from another active recording: automatically pause previous & preserve its position
    if (this.activeId !== null && this.activeId !== id) {
      if (!this.audio.ended) {
        this.savedPositions.set(this.activeId, this.audio.currentTime);
      }
      this.audio.pause();
    }

    // 3. Resolve target start time
    let targetTime = 0;
    if (this.completedIds.has(id)) {
      // Finished previously to the end -> restart from 0:00
      this.completedIds.delete(id);
      this.savedPositions.delete(id);
      targetTime = 0;
    } else if (this.savedPositions.has(id)) {
      // Resume from saved position
      targetTime = this.savedPositions.get(id) || 0;
    } else {
      // First playback -> start from 0:00
      targetTime = 0;
    }

    this.activeId = id;
    this.notify();

    // Check if source URL needs to change
    const isSameSrc =
      this.audio.src === url ||
      this.audio.src.endsWith(encodeURI(url)) ||
      this.audio.src.endsWith(url);

    if (!isSameSrc) {
      this.pendingSeekTime = targetTime;
      this.audio.src = url;

      const handleCanPlay = () => {
        if (!this.audio) return;
        this.audio.removeEventListener('canplay', handleCanPlay);

        try {
          this.audio.currentTime = this.pendingSeekTime !== null ? this.pendingSeekTime : 0;
        } catch {}
        this.pendingSeekTime = null;

        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('[ShortcutAudio] Audio play failed:', err);
            if (this.activeId === id) {
              this.activeId = null;
              this.pendingSeekTime = null;
              this.notify();
            }
          });
        }
      };

      this.audio.addEventListener('canplay', handleCanPlay);
      this.audio.load();
    } else {
      // Reusing same src
      try {
        this.audio.currentTime = targetTime;
      } catch {}
      this.pendingSeekTime = null;

      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[ShortcutAudio] Audio play failed:', err);
          if (this.activeId === id) {
            this.activeId = null;
            this.notify();
          }
        });
      }
    }
  }

  public pauseAll() {
    if (this.audio && this.activeId) {
      this.savedPositions.set(this.activeId, this.audio.currentTime);
      this.audio.pause();
      this.activeId = null;
      this.pendingSeekTime = null;
      this.notify();
    }
  }
}

export const shortcutAudioController = new ShortcutAudioController();
