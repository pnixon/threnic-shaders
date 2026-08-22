/**
 * threnic-shaders — Core types for the shader overlay rendering engine.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Cosine palette definition (4 vec3s for the formula a + b*cos(2π(c*t+d))). */
export interface ShaderPalette {
  /** Unique palette identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Base offset */
  a: [number, number, number];
  /** Amplitude */
  b: [number, number, number];
  /** Frequency */
  c: [number, number, number];
  /** Phase */
  d: [number, number, number];
}

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

/** A tunable shader parameter exposed to the UI. */
export interface ShaderPresetParam {
  /** Unique param identifier */
  id: string;
  /** Display label */
  label: string;
  /** Which uniform slot this maps to ('p0' or 'p1') */
  slot: 'p0' | 'p1';
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Default value */
  default: number;
  /** Step increment */
  step: number;
}

/** A shader preset definition. */
export interface ShaderPreset {
  /** Unique preset identifier */
  id: string;
  /** Human-readable display name */
  label: string;
  /** Description shown in UI */
  description: string;
  /** Default palette id to use */
  palette: string;
  /** Tunable parameters exposed to UI */
  params: ShaderPresetParam[];
  /** WGSL fragment body (inserted between prelude and epilogue) */
  body: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Blend mode for the shader overlay */
export type ShaderBlendMode = 'replace' | 'alpha' | 'additive';

/** Persisted configuration for the shader overlay. */
export interface ShaderOverlayConfig {
  /** Whether the shader overlay is enabled */
  enabled: boolean;
  /** Active preset id */
  presetId: string;
  /** Active palette id */
  paletteId: string;
  /** Global opacity (0–1) */
  opacity: number;
  /** Blend mode */
  blendMode: ShaderBlendMode;
  /** Beat sensitivity multiplier */
  sensitivity: number;
  /** Audio attack time in seconds (how fast the audio follower rises) */
  attack: number;
  /** Audio decay time in seconds (how fast the audio follower falls) */
  decay: number;
  /** Shader-specific parameter 0 */
  p0: number;
  /** Shader-specific parameter 1 */
  p1: number;
}

// ---------------------------------------------------------------------------
// Frame Input
// ---------------------------------------------------------------------------

/** Per-frame data passed to the shader overlay pass. */
export interface ShaderFrameInput {
  /** Current playback time in seconds */
  time: number;
  /** Frame delta time in seconds */
  dt: number;
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Audio bass band (0–1) */
  bass: number;
  /** Audio mid band (0–1) */
  mid: number;
  /** Audio treble/high band (0–1) */
  high: number;
  /** Overall audio energy (0–1) */
  energy: number;
}

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------

/** Default shader overlay configuration. */
export const DEFAULT_CONFIG: ShaderOverlayConfig = {
  enabled: true,
  presetId: 'tunnel',
  paletteId: 'stone',
  opacity: 1,
  blendMode: 'alpha',
  sensitivity: 0.7,
  attack: 0.02,
  decay: 0.05,
  p0: 0,
  p1: 0.45,
};
