/**
 * Shader Presets Registry
 * Exports palettes, presets, and lookup helpers for the shader overlay system.
 */

import type { ShaderPreset } from '../types';
import { TUNNEL_PRESET } from './tunnel';
import { STAR_WARP_PRESET } from './starWarp';
import { CLOUD_FLIGHT_PRESET } from './cloudFlight';
import { VOLUMETRIC_CLOUDS_PRESET } from './volumetricClouds';
import { STORM_CLOUDS_PRESET } from './stormClouds';

// ─── Presets ────────────────────────────────────────────────

export const PRESETS: ShaderPreset[] = [
  TUNNEL_PRESET,
  STAR_WARP_PRESET,
  CLOUD_FLIGHT_PRESET,
  VOLUMETRIC_CLOUDS_PRESET,
  STORM_CLOUDS_PRESET,
];

// ─── Helpers ────────────────────────────────────────────────

export function getPresetById(id: string): ShaderPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

// ─── Re-exports ─────────────────────────────────────────────

export { PALETTES, getPaletteById } from './palettes';
export { TUNNEL_PRESET } from './tunnel';
export { STAR_WARP_PRESET } from './starWarp';
export { CLOUD_FLIGHT_PRESET } from './cloudFlight';
export { VOLUMETRIC_CLOUDS_PRESET } from './volumetricClouds';
export { STORM_CLOUDS_PRESET } from './stormClouds';
