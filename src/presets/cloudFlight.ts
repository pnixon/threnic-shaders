/**
 * Cloud Flight — FBM-based warped cloud flow with energy-reactive density.
 * Palette: vaporwave (pink/cyan/purple)
 */

import type { ShaderPreset } from '../types';

export const CLOUD_FLIGHT_PRESET: ShaderPreset = {
  id: 'clouds',
  label: 'Cloud Flight',
  description: 'Smooth flythrough of layered FBM clouds with reactive glow',
  palette: 'vaporwave',
  params: [
    { id: 'hueShift', label: 'Hue shift', slot: 'p0', min: 0.0, max: 1.0, default: 0.0, step: 0.05 },
    { id: 'scale', label: 'Scale', slot: 'p1', min: 0.0, max: 1.0, default: 0.5, step: 0.05 },
  ],
  body: /* wgsl */ `
fn cloudDensity(coord: vec2f, t: f32, coverage: f32) -> f32 {
  let n = fbm(coord * 2.0 + vec2f(t * 0.1, t * 0.05));
  return smoothstep(coverage, coverage + 0.3, n);
}

fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let react = u_react();
  let beat = u_beat();
  let energy = u_bass() + u_mid() * 0.5;

  let coverage = 0.3 + u_p1() * 0.4;
  let hue = u_p0();

  // Camera fly direction
  let scroll = vec2f(t * 0.3, t * 0.15);

  // Multi-layer clouds at different altitudes
  var density = 0.0;
  var colorT = 0.0;
  for (var layer = 0; layer < 3; layer = layer + 1) {
    let fl = f32(layer);
    let scale = 1.0 + fl * 0.6;
    let layerP = p * scale + scroll * (1.0 + fl * 0.4);
    let d = cloudDensity(layerP, t + fl * 10.0, coverage - energy * 0.1 * react);
    let depth = 1.0 - fl * 0.25;
    density = density + d * depth;
    colorT = colorT + d * fl * 0.3;
  }

  density = clamp(density, 0.0, 1.0);

  // Background gradient
  let sky = mix(vec3f(0.02, 0.01, 0.05), vec3f(0.1, 0.05, 0.15), uv.y);

  // Cloud color from palette with hue shift
  let cloudCol = palette(hue + colorT + energy * react * 0.15 + uv.x * 0.2);

  // Rim glow from beat
  let glow = palette(hue + 0.5 + beat * 0.3) * beat * react * 0.4 * density;

  // Composite
  let col = mix(sky, cloudCol, density) + glow;

  return col;
}
`,
};
