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
  let bass = u_bass();
  let mid = u_mid();
  let treb = u_treb();
  let energy = u_energy();

  let coverage = 0.3 + u_p1() * 0.4;
  let hue = u_p0();

  // Mid → scroll speed (mids make clouds rush faster)
  let scrollSpeed = 0.3 + mid * 0.2;
  let scroll = vec2f(t * scrollSpeed, t * scrollSpeed * 0.5);

  // Multi-layer clouds at different altitudes
  var density = 0.0;
  var colorT = 0.0;
  for (var layer = 0; layer < 3; layer = layer + 1) {
    let fl = f32(layer);
    let scale = 1.0 + fl * 0.6;
    let layerP = p * scale + scroll * (1.0 + fl * 0.4);
    // Bass → density surge (bass hits make clouds thicken)
    let d = cloudDensity(layerP, t + fl * 10.0, coverage - bass * 0.15);
    let depth = 1.0 - fl * 0.25;
    density = density + d * depth;
    colorT = colorT + d * fl * 0.3;
  }

  density = clamp(density, 0.0, 1.0);

  // Background gradient — energy shifts sky color
  let sky = mix(vec3f(0.02, 0.01, 0.05), vec3f(0.1 + energy * 0.05, 0.05, 0.15), uv.y);

  // Treb → color shimmer (treble shifts cloud hue rapidly)
  let trebShimmer = treb * sin(t * 3.0 + p.x * 5.0) * 0.1;
  let cloudCol = palette(hue + colorT + energy * 0.1 + uv.x * 0.2 + trebShimmer);

  // Beat → rim glow pulse
  let glow = palette(hue + 0.5 + beat * 0.3) * beat * 0.5 * density;

  // Bass → deep underlighting
  let underlight = palette(hue + 0.3) * bass * 0.2 * density * smoothstep(0.0, 0.5, density);

  // Composite
  let col = mix(sky, cloudCol, density) + glow + underlight;

  return col;
}
`,
};
