/**
 * ShaderOverlayPass — Renders WGSL shader presets as a fullscreen-triangle
 * overlay with alpha blending, drawn on top of existing scene content.
 *
 * Architecture:
 * - Assembles WGSL from: SHADER_PRELUDE + preset.body + SHADER_EPILOGUE
 * - Pipeline uses alpha blend (src-alpha / one-minus-src-alpha)
 * - Render pass uses loadOp:'load' to composite over existing content
 * - 128-byte uniform buffer with audio-reactive params + cosine palette
 * - Built-in beat detector with framerate-independent attack/decay
 */

import type { ShaderOverlayConfig, ShaderPalette, ShaderPreset } from '../types';
import { SHADER_PRELUDE } from '../wgsl/prelude';
import { SHADER_EPILOGUE } from '../wgsl/epilogue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Audio data passed per-frame by the renderer. */
interface AudioInput {
  bass: number;
  mid: number;
  high: number;
  energy: number;
}

// ---------------------------------------------------------------------------
// ShaderOverlayPass
// ---------------------------------------------------------------------------

export class ShaderOverlayPass {
  private device: GPUDevice;
  private format: GPUTextureFormat;

  // GPU resources
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer;
  private bindGroupLayout: GPUBindGroupLayout;
  private bindGroup: GPUBindGroup | null = null;

  // Current state
  private _currentPreset: ShaderPreset | null = null;
  private _currentPalette: ShaderPalette | null = null;
  private _time = 0;

  // Beat detector state
  private _bassAvg = 0;
  private _beatValue = 0;
  private _beatCooldown = 0;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;

    // 128-byte uniform buffer (32 × f32)
    this.uniformBuffer = device.createBuffer({
      label: 'shader-overlay-uniforms',
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Bind group layout: single uniform buffer
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'shader-overlay-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // Create bind group (stable — uniform buffer doesn't change)
    this.bindGroup = device.createBindGroup({
      label: 'shader-overlay-bg',
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Preset / Palette loading
  // ─────────────────────────────────────────────────────────────

  /**
   * Compile and load a shader preset.
   * Returns true on success, false on shader compilation error.
   */
  async loadPreset(preset: ShaderPreset): Promise<boolean> {
    // Skip re-compile if same preset already loaded
    if (this._currentPreset?.id === preset.id && this.pipeline) return true;

    // Assemble full WGSL source: prelude + preset body + epilogue
    const source = SHADER_PRELUDE + '\n' + preset.body + '\n' + SHADER_EPILOGUE;

    const shaderModule = this.device.createShaderModule({
      label: `shader-overlay-${preset.id}`,
      code: source,
    });

    // Check for compilation errors
    const info = await shaderModule.getCompilationInfo();
    for (const msg of info.messages) {
      if (msg.type === 'error') {
        console.error(
          `[ShaderOverlayPass] Shader compilation error in "${preset.id}": ${msg.message} (line ${msg.lineNum})`,
        );
        return false;
      }
    }

    const pipelineLayout = this.device.createPipelineLayout({
      label: `shader-overlay-${preset.id}-pl`,
      bindGroupLayouts: [this.bindGroupLayout],
    });

    try {
      this.pipeline = await this.device.createRenderPipelineAsync({
        label: `shader-overlay-${preset.id}-pipeline`,
        layout: pipelineLayout,
        vertex: {
          module: shaderModule,
          entryPoint: 'vs_main',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [
            {
              format: this.format,
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
                alpha: {
                  srcFactor: 'one',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list' },
      });
    } catch (err) {
      console.error(
        `[ShaderOverlayPass] Pipeline creation failed for "${preset.id}":`,
        err,
      );
      return false;
    }

    this._currentPreset = preset;

    // Reset beat detector on preset change
    this._bassAvg = 0;
    this._beatValue = 0;
    this._beatCooldown = 0;
    this._time = 0;

    return true;
  }

  /**
   * Set the active cosine palette.
   */
  setPalette(palette: ShaderPalette): void {
    this._currentPalette = palette;
  }

  /**
   * Get the currently loaded preset (or null).
   */
  get currentPreset(): ShaderPreset | null {
    return this._currentPreset;
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  /**
   * Render the shader overlay onto the target view.
   * The target must already contain the scene content (loadOp: 'load').
   */
  render(
    targetView: GPUTextureView,
    encoder: GPUCommandEncoder,
    config: ShaderOverlayConfig,
    dt: number,
    audio: AudioInput,
    resolution: [number, number],
  ): void {
    if (!this.pipeline || !this.bindGroup || !this._currentPalette) return;

    // Accumulate time
    this._time += dt;

    const palette = this._currentPalette;
    const sensitivity = config.sensitivity;
    const bass = audio.bass;

    // ── Beat detector (framerate-independent attack/decay) ─────
    // factor = 1 - exp(-dt / smoothingTime)
    const attack = config.attack;
    const decay = config.decay;
    const bassSmoothing = bass > this._bassAvg ? attack : decay;
    const bassFactor = 1 - Math.exp(-dt / Math.max(0.001, bassSmoothing));
    this._bassAvg += (bass - this._bassAvg) * bassFactor;

    // Cooldown decay
    this._beatCooldown -= dt;

    // Beat threshold
    const thresh = this._bassAvg * (1 + sensitivity);
    if (bass > thresh && bass > 0.05 && this._beatCooldown <= 0) {
      this._beatValue = 1;
      this._beatCooldown = 0.12;
    }

    // Beat flash decay — maps user decay to perceptual fade duration
    if (dt > 0) {
      const beatDecayTime = Math.max(0.05, decay * 7);
      this._beatValue *= Math.pow(0.001, dt / beatDecayTime);
    }

    // ── Blend mode numeric ──────────────────────────────────────
    let blendModeNum = 0;
    if (config.blendMode === 'additive') blendModeNum = 1;

    // ── Pack uniform buffer (128 bytes = 32 × f32) ─────────────
    const a = new Float32Array(32);

    // vec4 a: time, energy, beat, reactivity
    a[0] = this._time;
    a[1] = audio.energy;
    a[2] = this._beatValue;
    a[3] = sensitivity;

    // vec4 b: bass, mid, treb, sensitivity
    a[4] = audio.bass;
    a[5] = audio.mid;
    a[6] = audio.high;
    a[7] = sensitivity;

    // vec4 c: resX, resY, p0, p1
    a[8] = resolution[0];
    a[9] = resolution[1];
    a[10] = config.p0;
    a[11] = config.p1;

    // vec4 d: opacity, blendMode, pad, pad
    a[12] = config.opacity;
    a[13] = blendModeNum;
    a[14] = 0;
    a[15] = 0;

    // vec4 pa: palette.a
    a[16] = palette.a[0];
    a[17] = palette.a[1];
    a[18] = palette.a[2];
    a[19] = 0;

    // vec4 pb: palette.b
    a[20] = palette.b[0];
    a[21] = palette.b[1];
    a[22] = palette.b[2];
    a[23] = 0;

    // vec4 pc: palette.c
    a[24] = palette.c[0];
    a[25] = palette.c[1];
    a[26] = palette.c[2];
    a[27] = 0;

    // vec4 pd: palette.d
    a[28] = palette.d[0];
    a[29] = palette.d[1];
    a[30] = palette.d[2];
    a[31] = 0;

    this.device.queue.writeBuffer(this.uniformBuffer, 0, a);

    // ── Render pass ─────────────────────────────────────────────
    const renderPass = encoder.beginRenderPass({
      label: 'shader-overlay-pass',
      colorAttachments: [
        {
          view: targetView,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(3); // Fullscreen triangle
    renderPass.end();
  }

  // ─────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────

  /**
   * Release all GPU resources.
   */
  destroy(): void {
    this.uniformBuffer.destroy();
    this.pipeline = null;
    this.bindGroup = null;
    this._currentPreset = null;
    this._currentPalette = null;
  }
}
