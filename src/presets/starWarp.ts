/**
 * Star Warp — speed warp stars with beat-reactive acceleration.
 * Palette: ice (cool blues/whites)
 */

import type { ShaderPreset } from '../types';

export const STAR_WARP_PRESET: ShaderPreset = {
  id: 'warp',
  label: 'Star Warp',
  description: 'Hyperspeed star field with warp streaks and beat-reactive acceleration',
  palette: 'ice',
  params: [
    { id: 'starHue', label: 'Star hue', slot: 'p0', min: 0.0, max: 1.0, default: 0.5, step: 0.05 },
    { id: 'density', label: 'Density', slot: 'p1', min: 0.0, max: 1.0, default: 0.6, step: 0.05 },
  ],
  body: /* wgsl */ `
fn starLayer(coord: vec2f, scale: f32, t: f32) -> f32 {
  let uv = coord * scale;
  let id = floor(uv);
  let gv = fract(uv) - 0.5;

  let rnd = hash11(dot(id, vec2f(127.1, 311.7)));
  let offset = vec2f(rnd - 0.5, fract(rnd * 43.0) - 0.5) * 0.7;
  let d = length(gv - offset);

  // Star twinkle
  let twinkle = sin(t * (rnd * 3.0 + 1.0) + rnd * 6.28) * 0.5 + 0.5;
  let star = smoothstep(0.04 + twinkle * 0.02, 0.0, d);

  return star;
}

fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let react = u_react();
  let beat = u_beat();

  // Beat-reactive warp acceleration
  let warpSpeed = 1.0 + beat * react * 2.0;
  let flowT = t * warpSpeed;

  let density = 8.0 + u_p1() * 25.0;
  let r = length(p);

  // Radial stretch on beat
  var sp = p * (1.0 + r * 0.3 * (1.0 + beat * react * 0.5));

  // Accumulate star layers at different depths
  var stars = 0.0;
  var colorMix = 0.0;
  for (var i = 0; i < 5; i = i + 1) {
    let fi = f32(i);
    let layerScale = density * (1.0 + fi * 0.7);
    let layerT = flowT * (1.0 + fi * 0.3);
    let scroll = vec2f(0.0, layerT * 0.4);
    let s = starLayer(sp + scroll, layerScale, layerT);
    let depth = 1.0 - fi * 0.15;
    stars = stars + s * depth;
    colorMix = colorMix + s * fi * 0.2;
  }

  // Warp streak effect
  let streak = smoothstep(0.4, 0.0, abs(p.x * 0.6)) *
               smoothstep(1.8, 0.0, r) *
               beat * react * 0.6;

  // Palette coloring with hue param
  let col = palette(u_p0() + colorMix * 0.3 + r * 0.2);

  // Combine stars + streaks
  let base = col * stars + palette(u_p0() + 0.2) * streak;

  return base;
}
`,
};
