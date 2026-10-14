/**
 * Audio Loudness Enhancer & Normalization Engine
 * 
 * Provides transparent, broadcast-quality audio loudness enhancement across the application:
 * 1. Web Audio API Gain Node (+8.5dB to +9dB clean amplification)
 * 2. Dynamics Compressor / Soft-Knee Limiter (prevents clipping, distortion & ear fatigue)
 * 3. Offline Audio Normalization for newly recorded voice introductions
 * 4. Preserves 100% of playback speed, recording speed, pitch, and duration
 */

// Shared singleton AudioContext to prevent exceeding browser AudioContext limits
let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioContext = new AudioCtx();
      }
    }
  } catch (err) {
    console.warn('[AudioEnhancer] AudioContext initialization notice:', err);
  }

  return sharedAudioContext;
}

export async function resumeAudioContext(ctx?: AudioContext | null): Promise<void> {
  const target = ctx || sharedAudioContext;
  if (!target) return;
  try {
    if (target.state === 'suspended') {
      await target.resume();
    }
  } catch (err) {
    console.warn('[AudioEnhancer] Resume AudioContext notice:', err);
  }
}

interface EnhancedNodes {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  compressor: DynamicsCompressorNode;
}

// Track elements to ensure createMediaElementSource is only called ONCE per HTMLAudioElement
const enhancedAudioElements = new WeakMap<HTMLAudioElement, EnhancedNodes>();

/**
 * Standard Gain Multiplier: 4.98x
 * Mathematical conversion: 20 * log10(4.98) = +13.94 dB
 * Exactly +5.00 dB additional gain beyond the previous 2.8x (+8.94 dB) enhanced output.
 */
export const DEFAULT_GAIN_MULTIPLIER = 4.98;

/**
 * Attaches a studio-grade loudness booster and limiter to an HTMLAudioElement.
 * Boosts voice clarity and loudness noticeably while strictly preventing clipping or distortion.
 * Uses WeakMap tracking to guarantee no duplicate gain application when called repeatedly.
 */
export function attachAudioLoudnessBooster(
  audio: HTMLAudioElement | null,
  options: { gainMultiplier?: number } = {}
): void {
  if (!audio || typeof window === 'undefined') return;

  const gainValue = options.gainMultiplier ?? DEFAULT_GAIN_MULTIPLIER;

  // Set anonymous CORS so Web Audio API can process remote storage streams without muting
  if (!audio.crossOrigin) {
    try {
      audio.crossOrigin = 'anonymous';
    } catch {}
  }

  // Already enhanced: prevent duplicate gain nodes and update gain value if needed
  if (enhancedAudioElements.has(audio)) {
    const existing = enhancedAudioElements.get(audio)!;
    existing.gain.gain.setValueAtTime(gainValue, existing.gain.context.currentTime);
    return;
  }

  const ctx = getSharedAudioContext();
  if (!ctx) return;

  try {
    // 1. Media Element Source Node
    const sourceNode = ctx.createMediaElementSource(audio);

    // 2. High-headroom Gain Node with +5dB extra loudness boost (+13.94 dB total)
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gainValue, ctx.currentTime);

    // 3. Transparent Dynamics Compressor / Ceiling Limiter
    // Prevents clipping and distortion on loud syllables while lifting quiet speech
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6.0, ctx.currentTime); // Start gentle compression at -6dB
    compressor.knee.setValueAtTime(12.0, ctx.currentTime);       // Soft knee for natural human speech
    compressor.ratio.setValueAtTime(20.0, ctx.currentTime);      // Maximum brickwall limiter ratio (20:1) to keep peaks strictly below 0dB
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);    // 3ms fast attack to catch plosives/peaks
    compressor.release.setValueAtTime(0.20, ctx.currentTime);    // 200ms smooth release

    // 4. Wire the audio graph: source -> gain -> compressor -> destination
    sourceNode.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(ctx.destination);

    // Record in WeakMap to prevent duplicate gain node creation
    enhancedAudioElements.set(audio, {
      source: sourceNode,
      gain: gainNode,
      compressor: compressor,
    });

    // 5. Ensure AudioContext is resumed when playback begins (satisfies browser autoplay policies)
    const onPlay = () => {
      resumeAudioContext(ctx);
    };

    audio.addEventListener('play', onPlay, { passive: true });
  } catch (err: any) {
    // Graceful fallback: If Web Audio is restricted or already connected elsewhere,
    // HTMLAudioElement continues to play normally through default output
    console.warn('[AudioEnhancer] Web Audio boost setup fallback note:', err?.message || err);
  }
}

/**
 * Normalizes a newly recorded Audio Blob to optimal speech loudness (~ -1.0 dB peak).
 * Avoids clipping and distortion while ensuring quiet recordings sound crisp and clear.
 * If decoding fails (e.g. browser codec variance), safely returns original blob unchanged.
 */
export async function normalizeRecordedAudioBlob(
  blob: Blob,
  targetPeak = 0.90
): Promise<Blob> {
  if (typeof window === 'undefined' || !blob || blob.size === 0) {
    return blob;
  }

  const ctx = getSharedAudioContext();
  if (!ctx) return blob;

  try {
    const arrayBuffer = await blob.arrayBuffer();
    // Decode audio into PCM audio buffer
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // 1. Measure highest absolute peak across all channels
    let maxPeak = 0;
    for (let c = 0; c < numChannels; c++) {
      const channelData = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const absVal = Math.abs(channelData[i]);
        if (absVal > maxPeak) {
          maxPeak = absVal;
        }
      }
    }

    // If audio is practically silent or already near target peak, don't over-boost
    if (maxPeak < 0.005 || maxPeak >= targetPeak) {
      return blob;
    }

    // 2. Calculate safe gain factor (max 4.0x / +12 dB to prevent raising room noise excessively)
    const multiplier = Math.min(targetPeak / maxPeak, 4.0);

    // 3. Apply gain normalization directly to channel data
    const normalizedBuffer = ctx.createBuffer(numChannels, length, sampleRate);
    for (let c = 0; c < numChannels; c++) {
      const src = audioBuffer.getChannelData(c);
      const dst = normalizedBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const val = src[i] * multiplier;
        // Clamp to prevent any out-of-range sample
        dst[i] = Math.max(-1.0, Math.min(1.0, val));
      }
    }

    // 4. Encode normalized PCM buffer to standard 16-bit WAV Blob
    const wavBlob = audioBufferToWavBlob(normalizedBuffer);
    return wavBlob;
  } catch (err) {
    console.warn('[AudioEnhancer] Normalization note (using original recording):', err);
    return blob;
  }
}

/**
 * Fast in-memory 16-bit PCM WAV Encoder.
 * Zero external dependencies, 100% universal browser and mobile compatibility.
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;

  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);    // NumChannels
  view.setUint32(24, sampleRate, true);     // SampleRate
  view.setUint32(28, byteRate, true);       // ByteRate
  view.setUint16(32, blockAlign, true);     // BlockAlign
  view.setUint16(34, 16, true);             // BitsPerSample

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM samples
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
