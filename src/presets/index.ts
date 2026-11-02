/**
 * Shader Presets Registry
 * Exports palettes, presets, and lookup helpers for the shader overlay system.
 */

import type { ShaderPreset } from '../types';
import { TUNNEL_PRESET } from './tunnel';
import { RAIN_PRESET } from './rain';
import { CLOUD_FLIGHT_PRESET } from './cloudFlight';
import { VOLUMETRIC_CLOUDS_PRESET } from './volumetricClouds';
import { STORM_CLOUDS_PRESET } from './stormClouds';
import { PROTEAN_CLOUDS_PRESET } from './proteanClouds';

// ─── Presets ────────────────────────────────────────────────

export const PRESETS: ShaderPreset[] = [
  TUNNEL_PRESET,
  RAIN_PRESET,
  CLOUD_FLIGHT_PRESET,
  VOLUMETRIC_CLOUDS_PRESET,
  STORM_CLOUDS_PRESET,
  PROTEAN_CLOUDS_PRESET,
];

// ─── Helpers ────────────────────────────────────────────────

export function getPresetById(id: string): ShaderPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

// ─── Re-exports ─────────────────────────────────────────────

export { PALETTES, getPaletteById } from './palettes';
export { TUNNEL_PRESET } from './tunnel';
export { RAIN_PRESET } from './rain';
export { CLOUD_FLIGHT_PRESET } from './cloudFlight';
export { VOLUMETRIC_CLOUDS_PRESET } from './volumetricClouds';
export { STORM_CLOUDS_PRESET } from './stormClouds';
export { PROTEAN_CLOUDS_PRESET } from './proteanClouds';
