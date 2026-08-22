/**
 * ShaderCanvas — Drop-in WebGPU shader background canvas.
 *
 * Provides a complete, framework-agnostic solution:
 *   1. Initializes WebGPU on a canvas element
 *   2. Manages the ShaderOverlayPass lifecycle
 *   3. Integrates AudioAnalyser for reactivity
 *   4. Runs a rAF loop
 *
 * Usage:
 *   const canvas = createShaderCanvas(document.getElementById('canvas'));
 *   canvas.loadPreset('tunnel');
 *   canvas.connectAudio(audioElement);
 */

import { ShaderOverlayPass } from '../pass/ShaderOverlayPass';
import { AudioAnalyser, type AudioBands } from '../audio/AudioAnalyser';
import { getPresetById, getPaletteById } from '../presets';
import { DEFAULT_CONFIG, type ShaderOverlayConfig, type ShaderPreset, type ShaderPalette } from '../types';

// ─── Types ────────────────────────────────────────────────────

export interface ShaderCanvasOptions {
  /** Initial preset id. Default: 'tunnel' */
  preset?: string;
  /** Initial palette id. Default: preset's default */
  palette?: string;
  /** Initial config overrides */
  config?: Partial<ShaderOverlayConfig>;
  /** Device pixel ratio override. Default: window.devicePixelRatio (capped at 2) */
  dpr?: number;
  /** Whether to auto-start the render loop. Default: true */
  autoStart?: boolean;
}

export interface ShaderCanvas {
  /** Load a preset by id. Returns false if preset not found or shader failed to compile. */
  loadPreset(id: string): Promise<boolean>;
  /** Set the active palette by id. */
  setPalette(id: string): void;
  /** Update config values (partial merge). */
  setConfig(partial: Partial<ShaderOverlayConfig>): void;
  /** Get the current config. */
  getConfig(): ShaderOverlayConfig;
  /** Connect an HTML audio/video element for audio reactivity. */
  connectAudio(element: HTMLMediaElement): void;
  /** Connect a microphone for audio reactivity. */
  connectMicrophone(): Promise<void>;
  /** Start the render loop. */
  start(): void;
  /** Stop the render loop. */
  stop(): void;
  /** Whether the render loop is running. */
  readonly running: boolean;
  /** Destroy all resources (GPU, audio, animation). */
  destroy(): void;
  /** Get the underlying ShaderOverlayPass (for advanced use). */
  readonly pass: ShaderOverlayPass | null;
  /** Get the underlying AudioAnalyser (for advanced use). */
  readonly audio: AudioAnalyser;
}

// ─── Factory ──────────────────────────────────────────────────

/**
 * Create a ShaderCanvas on an existing <canvas> element.
 * Initializes WebGPU, loads the default preset, and starts rendering.
 *
 * @throws If WebGPU is not available in the browser.
 */
export async function createShaderCanvas(
  canvas: HTMLCanvasElement,
  options: ShaderCanvasOptions = {},
): Promise<ShaderCanvas> {
  // ── WebGPU init ──
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser. Use Chrome or Edge 113+.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No WebGPU adapter found. Check hardware acceleration settings.');
  }

  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();

  const ctx = canvas.getContext('webgpu');
  if (!ctx) {
    throw new Error('Failed to get WebGPU context from canvas.');
  }

  ctx.configure({ device, format, alphaMode: 'opaque' });

  // ── State ──
  const config: ShaderOverlayConfig = { ...DEFAULT_CONFIG, ...options.config };
  const dpr = Math.min(options.dpr ?? (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1), 2);
  const audioAnalyser = new AudioAnalyser();
  const pass = new ShaderOverlayPass(device, format);

  let rafId = 0;
  let running = false;
  let lastTime = 0;

  // ── Resize handling ──
  function resize(): void {
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx!.configure({ device, format, alphaMode: 'opaque' });
    }
  }

  // ── Frame loop ──
  function frame(now: number): void {
    if (!running) return;

    const dt = lastTime === 0 ? 0.016 : Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    resize();

    // Update audio
    const bands: AudioBands = audioAnalyser.connected
      ? audioAnalyser.update()
      : { bass: 0, mid: 0, high: 0, energy: 0 };

    // Render
    const textureView = ctx!.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder({ label: 'shader-canvas-frame' });

    // Clear pass (black background)
    const clearPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      }],
    });
    clearPass.end();

    // Shader overlay pass (draws on top)
    if (pass.currentPreset) {
      pass.render(
        textureView,
        encoder,
        config,
        dt,
        { bass: bands.bass, mid: bands.mid, high: bands.high, energy: bands.energy },
        [canvas.width, canvas.height],
      );
    }

    device.queue.submit([encoder.finish()]);
    rafId = requestAnimationFrame(frame);
  }

  // ── Load initial preset ──
  const presetId = options.preset ?? config.presetId;
  const preset = getPresetById(presetId);
  if (preset) {
    await pass.loadPreset(preset);
    config.presetId = preset.id;

    // Set palette
    const paletteId = options.palette ?? preset.palette;
    const palette = getPaletteById(paletteId);
    if (palette) {
      pass.setPalette(palette);
      config.paletteId = palette.id;
    }
  }

  // ── Public API ──
  const api: ShaderCanvas = {
    async loadPreset(id: string): Promise<boolean> {
      const p = getPresetById(id);
      if (!p) return false;
      const ok = await pass.loadPreset(p);
      if (ok) {
        config.presetId = p.id;
        // Auto-switch to preset's default palette
        const pal = getPaletteById(p.palette);
        if (pal) {
          pass.setPalette(pal);
          config.paletteId = pal.id;
        }
      }
      return ok;
    },

    setPalette(id: string): void {
      const pal = getPaletteById(id);
      if (pal) {
        pass.setPalette(pal);
        config.paletteId = pal.id;
      }
    },

    setConfig(partial: Partial<ShaderOverlayConfig>): void {
      Object.assign(config, partial);
      // If preset changed, load it
      if (partial.presetId && partial.presetId !== pass.currentPreset?.id) {
        const p = getPresetById(partial.presetId);
        if (p) pass.loadPreset(p);
      }
      // If palette changed, set it
      if (partial.paletteId) {
        const pal = getPaletteById(partial.paletteId);
        if (pal) pass.setPalette(pal);
      }
    },

    getConfig(): ShaderOverlayConfig {
      return { ...config };
    },

    connectAudio(element: HTMLMediaElement): void {
      audioAnalyser.connectElement(element);
    },

    async connectMicrophone(): Promise<void> {
      await audioAnalyser.connectMicrophone();
    },

    start(): void {
      if (running) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    },

    stop(): void {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },

    get running(): boolean {
      return running;
    },

    destroy(): void {
      api.stop();
      pass.destroy();
      audioAnalyser.destroy();
      device.destroy();
    },

    get pass(): ShaderOverlayPass | null {
      return pass;
    },

    get audio(): AudioAnalyser {
      return audioAnalyser;
    },
  };

  // Auto-start
  if (options.autoStart !== false) {
    api.start();
  }

  return api;
}
