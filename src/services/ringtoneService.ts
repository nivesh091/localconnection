/**
 * Ringtone & Audio Tone Synthesizer using Web Audio API
 * Generates reliable incoming & outgoing call tones without external MP3 asset dependency.
 */

class RingtoneService {
  private audioCtx: AudioContext | null = null;
  private ringOscillator1: OscillatorNode | null = null;
  private ringOscillator2: OscillatorNode | null = null;
  private ringGainNode: GainNode | null = null;
  private ringIntervalId: any = null;
  private isRinging: boolean = false;
  private isDialing: boolean = false;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Start Incoming Call Ringtone
   * Uses dual frequency (440Hz + 480Hz) cadence with vibration support
   */
  public startIncomingRingtone(): void {
    if (this.isRinging) return;
    this.stopAll();

    this.isRinging = true;

    // Trigger phone vibration if supported
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([500, 250, 500, 250, 500, 1000]);
      }
    } catch {}

    const playRingBurst = () => {
      if (!this.isRinging) return;
      try {
        const ctx = this.getAudioContext();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now); // A4
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now); // Harmonic ring

        // Burst 1: 0.8s
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        gain.gain.setValueAtTime(0.25, now + 0.8);
        gain.gain.linearRampToValueAtTime(0, now + 0.85);

        // Burst 2: 0.8s after 0.2s pause
        gain.gain.setValueAtTime(0, now + 1.05);
        gain.gain.linearRampToValueAtTime(0.25, now + 1.1);
        gain.gain.setValueAtTime(0.25, now + 1.9);
        gain.gain.linearRampToValueAtTime(0, now + 1.95);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);

        // Trigger vibration repetition
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([500, 250, 500]);
        }
      } catch (err) {
        console.warn('Ringtone playback error:', err);
      }
    };

    // Play first burst immediately, then repeat every 3.5 seconds
    playRingBurst();
    this.ringIntervalId = setInterval(playRingBurst, 3500);
  }

  /**
   * Start Outgoing Ringback Dial Tone
   * 400Hz + 450Hz, 1s on, 2s off
   */
  public startOutgoingTone(): void {
    if (this.isDialing) return;
    this.stopAll();

    this.isDialing = true;

    const playDialBurst = () => {
      if (!this.isDialing) return;
      try {
        const ctx = this.getAudioContext();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(400, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(450, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.0);
        gain.gain.linearRampToValueAtTime(0, now + 1.05);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.1);
        osc2.stop(now + 1.1);
      } catch (err) {
        console.warn('Outgoing dial tone error:', err);
      }
    };

    playDialBurst();
    this.ringIntervalId = setInterval(playDialBurst, 3000);
  }

  /**
   * Play short beep for connected or ended status
   */
  public playStatusBeep(type: 'connected' | 'ended' | 'error'): void {
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'connected') {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'ended') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(330, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch {}
  }

  /**
   * Stop all ringing, dial tones, and vibration
   */
  public stopAll(): void {
    this.isRinging = false;
    this.isDialing = false;

    if (this.ringIntervalId) {
      clearInterval(this.ringIntervalId);
      this.ringIntervalId = null;
    }

    try {
      if (this.ringOscillator1) {
        this.ringOscillator1.stop();
        this.ringOscillator1.disconnect();
        this.ringOscillator1 = null;
      }
      if (this.ringOscillator2) {
        this.ringOscillator2.stop();
        this.ringOscillator2.disconnect();
        this.ringOscillator2 = null;
      }
      if (this.ringGainNode) {
        this.ringGainNode.disconnect();
        this.ringGainNode = null;
      }
    } catch {}

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(0);
      }
    } catch {}
  }
}

export const ringtoneService = new RingtoneService();
