/**
 * Ringtone & Audio Tone Synthesizer using Web Audio API
 * Generates reliable incoming & outgoing call tones without external MP3 asset dependency.
 * Enforces strict lifecycle cleanup to prevent lingering playback in background.
 */

class RingtoneService {
  private audioCtx: AudioContext | null = null;
  private ringIntervalId: any = null;
  private dialIntervalId: any = null;
  private isRinging: boolean = false;
  private isDialing: boolean = false;

  // Active oscillator and gain tracking for instant, unconditional termination
  private activeIncomingOscillators: Set<OscillatorNode> = new Set();
  private activeOutgoingOscillators: Set<OscillatorNode> = new Set();
  private incomingMasterGain: GainNode | null = null;
  private outgoingMasterGain: GainNode | null = null;

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
    // If already ringing, don't duplicate
    if (this.isRinging) return;

    // Clean up any lingering tones first
    this.stopIncomingRingtone();

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

        // Master gain for incoming ringtone to allow instantaneous muting
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(1.0, now);
        masterGain.connect(ctx.destination);
        this.incomingMasterGain = masterGain;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const burstGain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now); // A4
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now); // Harmonic ring

        // Burst 1: 0.8s
        burstGain.gain.setValueAtTime(0, now);
        burstGain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        burstGain.gain.setValueAtTime(0.25, now + 0.8);
        burstGain.gain.linearRampToValueAtTime(0, now + 0.85);

        // Burst 2: 0.8s after 0.2s pause
        burstGain.gain.setValueAtTime(0, now + 1.05);
        burstGain.gain.linearRampToValueAtTime(0.25, now + 1.1);
        burstGain.gain.setValueAtTime(0.25, now + 1.9);
        burstGain.gain.linearRampToValueAtTime(0, now + 1.95);

        osc1.connect(burstGain);
        osc2.connect(burstGain);
        burstGain.connect(masterGain);

        this.activeIncomingOscillators.add(osc1);
        this.activeIncomingOscillators.add(osc2);

        const cleanupOscillators = () => {
          this.activeIncomingOscillators.delete(osc1);
          this.activeIncomingOscillators.delete(osc2);
        };

        osc1.onended = cleanupOscillators;
        osc2.onended = cleanupOscillators;

        // Check again before starting: ringtone could have been cancelled synchronously
        if (!this.isRinging) {
          try {
            osc1.stop();
            osc2.stop();
            osc1.disconnect();
            osc2.disconnect();
            masterGain.disconnect();
          } catch {}
          this.activeIncomingOscillators.clear();
          return;
        }

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
   * Stop incoming ringtone immediately and unconditionally
   */
  public stopIncomingRingtone(): void {
    this.isRinging = false;

    if (this.ringIntervalId) {
      clearInterval(this.ringIntervalId);
      this.ringIntervalId = null;
    }

    // Cancel vibration immediately
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(0);
      }
    } catch {}

    // Immediately silence and disconnect incoming master gain
    try {
      if (this.incomingMasterGain) {
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
          this.incomingMasterGain.gain.cancelScheduledValues(0);
          this.incomingMasterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        }
        this.incomingMasterGain.disconnect();
        this.incomingMasterGain = null;
      }
    } catch {}

    // Immediately remove ended handlers, stop, and disconnect all active incoming oscillators
    this.activeIncomingOscillators.forEach((osc) => {
      try {
        osc.onended = null;
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeIncomingOscillators.clear();
  }

  /**
   * Start Outgoing Ringback Dial Tone
   * 400Hz + 450Hz, 1s on, 2s off
   */
  public startOutgoingTone(): void {
    if (this.isDialing) return;

    this.stopOutgoingTone();
    this.isDialing = true;

    const playDialBurst = () => {
      if (!this.isDialing) return;
      try {
        const ctx = this.getAudioContext();
        const now = ctx.currentTime;

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(1.0, now);
        masterGain.connect(ctx.destination);
        this.outgoingMasterGain = masterGain;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const burstGain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(400, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(450, now);

        burstGain.gain.setValueAtTime(0, now);
        burstGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        burstGain.gain.setValueAtTime(0.12, now + 1.0);
        burstGain.gain.linearRampToValueAtTime(0, now + 1.05);

        osc1.connect(burstGain);
        osc2.connect(burstGain);
        burstGain.connect(masterGain);

        this.activeOutgoingOscillators.add(osc1);
        this.activeOutgoingOscillators.add(osc2);

        const cleanupOscillators = () => {
          this.activeOutgoingOscillators.delete(osc1);
          this.activeOutgoingOscillators.delete(osc2);
        };

        osc1.onended = cleanupOscillators;
        osc2.onended = cleanupOscillators;

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.1);
        osc2.stop(now + 1.1);
      } catch (err) {
        console.warn('Outgoing dial tone error:', err);
      }
    };

    playDialBurst();
    this.dialIntervalId = setInterval(playDialBurst, 3000);
  }

  /**
   * Stop outgoing dial tone immediately
   */
  public stopOutgoingTone(): void {
    this.isDialing = false;

    if (this.dialIntervalId) {
      clearInterval(this.dialIntervalId);
      this.dialIntervalId = null;
    }

    try {
      if (this.outgoingMasterGain) {
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
          this.outgoingMasterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
          this.outgoingMasterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        }
        this.outgoingMasterGain.disconnect();
        this.outgoingMasterGain = null;
      }
    } catch {}

    this.activeOutgoingOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeOutgoingOscillators.clear();
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
    this.stopIncomingRingtone();
    this.stopOutgoingTone();
  }

  public isIncomingRinging(): boolean {
    return this.isRinging;
  }

  public isOutgoingDialing(): boolean {
    return this.isDialing;
  }
}

export const ringtoneService = new RingtoneService();
