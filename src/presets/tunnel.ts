/**
 * Stony Cave Tunnel — procedural tunnel with faceted blocks, pseudo-lighting,
 * crevice darkening, depth fog, and torch glow on beat.
 * Palette: stone (warm greys/browns)
 */

import type { ShaderPreset } from '../types';

export const TUNNEL_PRESET: ShaderPreset = {
  id: 'tunnel',
  label: 'Stony Cave Tunnel',
  description: 'A forward-traveling procedural tunnel with blocky rock walls',
  palette: 'stone',
  params: [
    { id: 'rockTint', label: 'Rock tint', slot: 'p0', min: 0.0, max: 1.0, default: 0.0, step: 0.05 },
    { id: 'facetCount', label: 'Facet count', slot: 'p1', min: 0.0, max: 1.0, default: 0.45, step: 0.05 },
  ],
  body: /* wgsl */ `
fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let react = u_react();
  let beat = u_beat();

  // Polar coords for tunnel
  let angle = atan2(p.y, p.x);
  let radius = length(p);
  let invR = 1.0 / (radius + 0.001);

  // Tunnel UV with travel speed
  let speed = 0.5 + beat * 0.3 * react;
  let tu = angle / 3.14159265 * 0.5 + 0.5;
  let tv = invR * 0.5 + t * speed;

  // Faceted block quantization
  let blocks = 4.0 + u_p1() * 16.0;
  let blockUv = floor(vec2f(tu * blocks * 2.0, tv * blocks)) / blocks;

  // Noise pattern on blocks
  let n = hash11(dot(blockUv, vec2f(127.1, 311.7)));
  let n2 = fbm(blockUv * 3.0 + vec2f(t * 0.1, 0.0));

  // Depth fog — deeper = darker
  let depth = clamp(invR * 0.3, 0.0, 1.0);

  // Crevice darkening — gaps between blocks
  let fracUv = fract(vec2f(tu * blocks * 2.0, tv * blocks));
  let crevice = smoothstep(0.0, 0.08, min(fracUv.x, fracUv.y)) *
                smoothstep(0.0, 0.08, min(1.0 - fracUv.x, 1.0 - fracUv.y));

  // Palette color driven by block noise + tint param
  let col = palette(n * 0.5 + depth * 0.3 + u_p0() * 0.4);

  // Pseudo-lighting: edge darkening + block variation
  let edge = smoothstep(0.0, 0.25, radius);
  let shade = depth * (0.5 + n2 * 0.5) * edge * crevice;

  // Torch glow on beat — warm pulse from center
  let torchRadius = smoothstep(0.6, 0.0, radius);
  let torch = palette(0.05) * torchRadius * beat * react * 1.5;

  // Depth fog blend to black
  let fog = smoothstep(0.8, 0.0, depth);

  return col * shade * fog + torch;
}
`,
};
