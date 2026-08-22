/**
 * Cosine palette definitions for shader coloring.
 * Formula: color(t) = a + b * cos(2π * (c*t + d))
 */

import type { ShaderPalette } from '../types';

export const PALETTES: ShaderPalette[] = [
  {
    id: 'ember',
    label: 'Ember',
    a: [0.5, 0.2, 0.15],
    b: [0.6, 0.35, 0.2],
    c: [1, 1, 1],
    d: [0.0, 0.15, 0.25],
  },
  {
    id: 'ice',
    label: 'Ice',
    a: [0.2, 0.3, 0.45],
    b: [0.3, 0.4, 0.5],
    c: [1, 1, 1],
    d: [0.6, 0.55, 0.4],
  },
  {
    id: 'toxic',
    label: 'Toxic',
    a: [0.15, 0.3, 0.15],
    b: [0.4, 0.55, 0.3],
    c: [1, 1, 0.8],
    d: [0.1, 0.2, 0.05],
  },
  {
    id: 'vaporwave',
    label: 'Vaporwave',
    a: [0.55, 0.4, 0.55],
    b: [0.45, 0.3, 0.5],
    c: [1, 1, 1],
    d: [0.3, 0.55, 0.8],
  },
  {
    id: 'mono',
    label: 'Bone',
    a: [0.6, 0.6, 0.6],
    b: [0.4, 0.4, 0.4],
    c: [1, 1, 1],
    d: [0.0, 0.05, 0.1],
  },
  {
    id: 'stone',
    label: 'Stone',
    a: [0.34, 0.30, 0.26],
    b: [0.22, 0.20, 0.17],
    c: [1, 1, 1],
    d: [0.05, 0.10, 0.15],
  },
];

export function getPaletteById(id: string): ShaderPalette | undefined {
  return PALETTES.find((p) => p.id === id);
}
