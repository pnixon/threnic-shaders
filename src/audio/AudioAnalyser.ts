/**
 * AudioAnalyser — Framework-agnostic Web Audio analyser for shader reactivity.
 *
 * Extracts bass/mid/high/energy bands from an audio source and provides
 * smoothed values suitable for driving shader uniforms.
 *
 * Supported sources:
 *   - HTMLMediaElement (audio/video element)
 *   - Microphone (getUserMedia)
 *   - Specific input/output device by deviceId (getUserMedia)
 *   - System audio / desktop loopback (getDisplayMedia with audio)
 *   - Any MediaStream directly
 */

export interface AudioBands {
  bass: number;
  mid: number;
  high: number;
  energy: number;
}

export interface AudioAnalyserOptions {
  /** FFT size (power of 2). Default: 2048 */
  fftSize?: number;
  /** Smoothing time constant (0–1). Default: 0.6 */
  smoothing?: number;
}

/** Device info returned by listDevices() */
export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

/**
 * Lightweight audio analyser that extracts frequency bands.
 * Connect to any audio source (HTMLAudioElement, MediaStream, system audio, specific device).
 */
export class AudioAnalyser {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private sampleRate = 44100;

  // Hold references to streams so we can stop tracks on disconnect
  private _activeStream: MediaStream | null = null;

  // Smoothed output values
  private _bass = 0;
  private _mid = 0;
  private _high = 0;
  private _energy = 0;

  private options: Required<AudioAnalyserOptions>;

  constructor(options: AudioAnalyserOptions = {}) {
    this.options = {
      fftSize: options.fftSize ?? 2048,
      smoothing: options.smoothing ?? 0.6,
    };
  }

  // ─── Connection Methods ─────────────────────────────────────

  /**
   * Connect to an HTMLAudioElement or HTMLVideoElement.
   * The element's audio will be routed through the analyser AND to speakers.
   */
  connectElement(element: HTMLMediaElement): void {
    this.disconnect();
    this.ensureContext();

    this.source = this.ctx!.createMediaElementSource(element);
    this.source.connect(this.analyser!);
    this.analyser!.connect(this.ctx!.destination);
  }

  /**
   * Connect to a raw MediaStream.
   * Does NOT route to destination (avoids feedback for mic/loopback).
   * Pass `playback: true` to also hear the audio.
   */
  connectStream(stream: MediaStream, options?: { playback?: boolean }): void {
    this.disconnect();
    this.ensureContext();

    this._activeStream = stream;
    this.source = this.ctx!.createMediaStreamSource(stream);
    this.source.connect(this.analyser!);

    if (options?.playback) {
      this.analyser!.connect(this.ctx!.destination);
    }
  }

  /**
   * Connect to the default microphone. Requests permission.
   */
  async connectMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.connectStream(stream);
  }

  /**
   * Connect to a specific audio device by deviceId.
   *
   * Works for input devices (microphones, line-in, virtual cables like VB-Audio).
   * For output device loopback on Windows, use a virtual audio cable that mirrors
   * system output as an input device, then pass that device's ID here.
   *
   * @param deviceId - The deviceId from enumerateDevices() or listDevices()
   * @param playback - Whether to route audio to speakers (default: false)
   */
  async connectDevice(deviceId: string, options?: { playback?: boolean }): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        // Disable processing for cleanest signal
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.connectStream(stream, options);
  }

  /**
   * Capture system/desktop audio via getDisplayMedia.
   *
   * This triggers the browser's native screen/tab picker where the user can
   * select a Chrome tab (with its audio), entire screen, or window.
   * The video track is immediately stopped — only audio is kept.
   *
   * NOTE: This is the most reliable way to capture "what's playing" without
   * needing a virtual audio cable. Works in Chrome/Edge. Firefox support varies.
   *
   * @param playback - Whether to also play the captured audio through speakers (default: false)
   */
  async connectSystemAudio(options?: { playback?: boolean }): Promise<void> {
    // getDisplayMedia with audio captures system/tab audio
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true, // Required by spec, but we discard it immediately
    });

    // Stop all video tracks — we only need audio
    for (const track of stream.getVideoTracks()) {
      track.stop();
      stream.removeTrack(track);
    }

    // Verify we got audio tracks
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        'No audio track captured. Make sure you selected a tab/screen with audio playing, ' +
        'and checked "Share audio" in the picker dialog.',
      );
    }

    this.connectStream(stream, options);
  }

  // ─── Device Enumeration ─────────────────────────────────────

  /**
   * List available audio input and output devices.
   * Requires user gesture / prior permission for labels to be populated.
   *
   * Tip: Output devices appear as 'audiooutput'. To capture system audio on Windows
   * without getDisplayMedia, use a virtual audio cable (VB-Audio, Voicemeeter)
   * that mirrors system output as an input device — it will appear as 'audioinput'.
   */
  static async listDevices(): Promise<AudioDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d): d is MediaDeviceInfo & { kind: 'audioinput' | 'audiooutput' } =>
        d.kind === 'audioinput' || d.kind === 'audiooutput',
      )
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `${d.kind === 'audioinput' ? 'Input' : 'Output'} ${d.deviceId.slice(0, 8)}`,
        kind: d.kind,
      }));
  }

  // ─── Analysis ───────────────────────────────────────────────

  /**
   * Update band values from the current FFT data.
   * Call this once per frame (in your rAF loop).
   */
  update(): AudioBands {
    if (!this.analyser || !this.freqData) {
      return { bass: 0, mid: 0, high: 0, energy: 0 };
    }

    this.analyser.getByteFrequencyData(this.freqData);

    const raw = {
      bass: this.bandAvg(20, 200),
      mid: this.bandAvg(200, 2000),
      high: this.bandAvg(2000, 8000),
      energy: 0,
    };
    raw.energy = (raw.bass + raw.mid + raw.high) / 3;

    // Fast attack / slow release peak follower
    this._bass = this.follow(this._bass, raw.bass);
    this._mid = this.follow(this._mid, raw.mid);
    this._high = this.follow(this._high, raw.high);
    this._energy = this.follow(this._energy, raw.energy);

    return this.bands;
  }

  /** Get the current smoothed band values without updating. */
  get bands(): AudioBands {
    return {
      bass: this._bass,
      mid: this._mid,
      high: this._high,
      energy: this._energy,
    };
  }

  /** Whether the analyser is connected and ready. */
  get connected(): boolean {
    return this.ctx !== null && this.source !== null;
  }

  // ─── Cleanup ────────────────────────────────────────────────

  /**
   * Disconnect the current source without destroying the context.
   * Call before connecting a new source.
   */
  disconnect(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    // Stop any active stream tracks (mic/system)
    if (this._activeStream) {
      for (const track of this._activeStream.getTracks()) {
        track.stop();
      }
      this._activeStream = null;
    }
    // Disconnect analyser from destination (if connected)
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch { /* may not be connected */ }
    }
    // Reset smoothed values
    this._bass = 0;
    this._mid = 0;
    this._high = 0;
    this._energy = 0;
  }

  /**
   * Disconnect and release ALL audio resources (context, analyser, streams).
   */
  destroy(): void {
    this.disconnect();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.analyser = null;
    this.freqData = null;
  }

  // ─── Private ────────────────────────────────────────────────

  private ensureContext(): void {
    if (this.ctx) return;

    this.ctx = new AudioContext();
    this.sampleRate = this.ctx.sampleRate;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.options.fftSize;
    this.analyser.smoothingTimeConstant = this.options.smoothing;

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  /** Average amplitude in a frequency range (Hz), normalized 0–1. */
  private bandAvg(loHz: number, hiHz: number): number {
    if (!this.freqData) return 0;
    const nyq = this.sampleRate / 2;
    const n = this.freqData.length;
    const lo = Math.max(1, Math.floor((loHz / nyq) * n));
    const hi = Math.min(n - 1, Math.ceil((hiHz / nyq) * n));
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += this.freqData[i];
    return sum / Math.max(1, hi - lo + 1) / 255;
  }

  /** Fast attack / slow release peak follower. */
  private follow(prev: number, raw: number): number {
    const atk = 0.5;
    const rel = 0.06;
    return raw > prev ? prev + (raw - prev) * atk : prev + (raw - prev) * rel;
  }
}
