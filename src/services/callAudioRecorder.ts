/**
 * Call Audio Mixer & Recorder
 * Combines local mic audio and remote peer audio into a single recorded audio stream
 * using Web Audio API MediaStreamAudioDestinationNode + MediaRecorder.
 */

export interface RecordedAudioResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  fileSizeBytes: number;
}

export class CallAudioRecorder {
  private audioContext: AudioContext | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private remoteSource: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime: number = 0;
  private isRecordingActive: boolean = false;
  private selectedMimeType: string = 'audio/webm';

  /**
   * Determine best supported audio MIME type
   */
  public static getSupportedMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    const candidateTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/aac',
    ];
    for (const type of candidateTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  /**
   * Start recording with local and optionally remote streams
   */
  public start(localStream?: MediaStream | null, remoteStream?: MediaStream | null): boolean {
    if (this.isRecordingActive) return true;

    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      this.destinationNode = this.audioContext.createMediaStreamDestination();

      let hasAnyTrack = false;

      // Connect local mic stream to mixer destination
      if (localStream && localStream.getAudioTracks().length > 0) {
        this.localSource = this.audioContext.createMediaStreamSource(localStream);
        this.localSource.connect(this.destinationNode);
        hasAnyTrack = true;
      }

      // Connect remote peer audio stream to mixer destination
      if (remoteStream && remoteStream.getAudioTracks().length > 0) {
        this.remoteSource = this.audioContext.createMediaStreamSource(remoteStream);
        this.remoteSource.connect(this.destinationNode);
        hasAnyTrack = true;
      }

      const mixedStream = hasAnyTrack && this.destinationNode
        ? this.destinationNode.stream
        : localStream || remoteStream;

      if (!mixedStream || mixedStream.getAudioTracks().length === 0) {
        console.warn('CallAudioRecorder: No audio tracks found to record');
        return false;
      }

      this.selectedMimeType = CallAudioRecorder.getSupportedMimeType();
      const options: MediaRecorderOptions = this.selectedMimeType
        ? { mimeType: this.selectedMimeType, audioBitsPerSecond: 64000 }
        : {};

      this.mediaRecorder = new MediaRecorder(mixedStream, options);
      this.recordedChunks = [];
      this.startTime = Date.now();

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // Collect data every 1 second
      this.mediaRecorder.start(1000);
      this.isRecordingActive = true;
      return true;
    } catch (err) {
      console.error('CallAudioRecorder start failed:', err);
      this.cleanup();
      return false;
    }
  }

  /**
   * Dynamically attach remote audio stream if it arrives after recording already started
   */
  public attachRemoteStream(remoteStream: MediaStream): void {
    if (!this.audioContext || !this.destinationNode || !this.isRecordingActive) return;
    try {
      if (remoteStream.getAudioTracks().length > 0 && !this.remoteSource) {
        this.remoteSource = this.audioContext.createMediaStreamSource(remoteStream);
        this.remoteSource.connect(this.destinationNode);
      }
    } catch (err) {
      console.warn('Could not attach remote stream to active recorder:', err);
    }
  }

  /**
   * Stop recording and return combined audio result
   */
  public async stop(): Promise<RecordedAudioResult | null> {
    if (!this.mediaRecorder || !this.isRecordingActive) {
      this.cleanup();
      return null;
    }

    return new Promise<RecordedAudioResult | null>((resolve) => {
      const durationSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

      this.mediaRecorder!.onstop = () => {
        try {
          const finalMime = this.selectedMimeType || 'audio/webm';
          const blob = new Blob(this.recordedChunks, { type: finalMime });
          const fileSizeBytes = blob.size;

          this.cleanup();

          if (fileSizeBytes === 0) {
            resolve(null);
          } else {
            resolve({
              blob,
              mimeType: finalMime,
              durationSeconds,
              fileSizeBytes,
            });
          }
        } catch (err) {
          console.error('Error assembling recorded audio blob:', err);
          this.cleanup();
          resolve(null);
        }
      };

      try {
        if (this.mediaRecorder!.state !== 'inactive') {
          this.mediaRecorder!.stop();
        } else {
          this.cleanup();
          resolve(null);
        }
      } catch (err) {
        console.error('Failed to stop mediaRecorder:', err);
        this.cleanup();
        resolve(null);
      }
    });
  }

  public isRecording(): boolean {
    return this.isRecordingActive;
  }

  private cleanup(): void {
    this.isRecordingActive = false;

    try {
      if (this.localSource) {
        this.localSource.disconnect();
        this.localSource = null;
      }
      if (this.remoteSource) {
        this.remoteSource.disconnect();
        this.remoteSource = null;
      }
      if (this.destinationNode) {
        this.destinationNode.disconnect();
        this.destinationNode = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
    } catch {}

    this.mediaRecorder = null;
  }
}
