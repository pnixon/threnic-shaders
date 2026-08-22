/**
 * AudioAnalyser — Framework-agnostic Web Audio analyser for shader reactivity.
 *
 * Extracts bass/mid/high/energy bands from an audio source and provides
 * smoothed values suitable for driving shader uniforms.
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

/**
 * Lightweight audio analyser that extracts frequency bands.
 * Connect to any audio source (HTMLAudioElement, MediaStream, AudioBufferSource).
 */
export class AudioAnalyser {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private sampleRate = 44100;

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

  // ─── Connection ─────────────────────────────────────────────

  /**
   * Connect to an HTMLAudioElement or HTMLVideoElement.
   * The element's audio will be routed through the analyser.
   */
  connectElement(element: HTMLMediaElement): void {
    this.ensureContext();
    if (this.source) this.source.disconnect();

    this.source = this.ctx!.createMediaElementSource(element);
    this.source.connect(this.analyser!);
    this.analyser!.connect(this.ctx!.destination);
  }

  /**
   * Connect to a MediaStream (e.g. microphone).
   * Does NOT route to destination (avoids feedback).
   */
  connectStream(stream: MediaStream): void {
    this.ensureContext();
    if (this.source) this.source.disconnect();

    this.source = this.ctx!.createMediaStreamSource(stream);
    this.source.connect(this.analyser!);
    // Note: NOT connecting to destination to avoid mic feedback
  }

  /**
   * Connect to a microphone. Requests permission and connects the stream.
   */
  async connectMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.connectStream(stream);
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
   * Disconnect and release audio resources.
   */
  destroy(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
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
