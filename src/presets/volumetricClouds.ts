/**
 * Volumetric Clouds — raymarched volumetric clouds with 3D noise sampling,
 * bass-reactive cloud pulsing, treble lightning flashes, and atmospheric scattering.
 * Palette: mono/Bone
 */

import type { ShaderPreset } from '../types';

export const VOLUMETRIC_CLOUDS_PRESET: ShaderPreset = {
  id: 'volumetric',
  label: 'Volumetric Clouds',
  description: 'Raymarched volumetric clouds with atmospheric scattering and lightning',
  palette: 'mono',
  params: [
    { id: 'density', label: 'Density', slot: 'p0', min: 0.0, max: 1.0, default: 0.6, step: 0.05 },
    { id: 'lightAngle', label: 'Light angle', slot: 'p1', min: 0.0, max: 1.0, default: 0.3, step: 0.05 },
  ],
  body: /* wgsl */ `
fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let react = u_react();

  // Raymarching setup
  let ro = vec3f(0.0, 1.0 + u_bass() * 0.3 * react, -3.0 + t * 0.3);
  let rd = normalize(vec3f(p.x, p.y * 0.8 + 0.2, 1.5));
  let lightDir = normalize(vec3f(cos(u_p1() * 6.28), 0.6, sin(u_p1() * 6.28)));

  var density = 0.0;
  var light = 0.0;
  var depth = 0.0;

  // March through cloud volume
  for (var i = 0; i < 40; i = i + 1) {
    let pos = ro + rd * depth;
    let n = fbm(pos.xz * 0.3 + vec2f(t * 0.05, 0.0)) * (1.0 + u_bass() * 0.4 * react);
    let cloudH = pos.y - (2.0 + n * 3.0);
    let d = max(0.0, -cloudH * u_p0());

    if (d > 0.01) {
      density = density + d * 0.08;
      // Simple light sampling
      let lightSample = fbm((pos.xz + lightDir.xz * 0.5) * 0.3);
      light = light + max(0.0, 1.0 - lightSample) * d * 0.04;
    }

    depth = depth + max(0.3, depth * 0.04);
    if (density > 1.0 || depth > 30.0) { break; }
  }

  density = min(density, 1.0);

  // Coloring
  let skyCol = palette(0.7 + p.y * 0.1);
  let cloudCol = palette(0.1 + light * 0.3) * (0.5 + light * 1.5);

  // Lightning flash on treble
  let flash = u_treb() * react * smoothstep(0.5, 1.0, u_treb()) * 3.0;
  let col = mix(skyCol, cloudCol + vec3f(flash), density);

  // Beat pulse glow at horizon
  let horizonGlow = palette(0.4) * u_beat() * 0.3 * smoothstep(0.3, 0.0, abs(p.y));

  return col + horizonGlow;
}
`,
};
