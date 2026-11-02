/**
 * Protean Clouds — Original volumetric cloud flythrough.
 * Uses fBM noise with directional derivative lighting,
 * dynamic step sizing, and fog integration.
 * Audio: bass→density, mid→camera drift, treb→highlight color, beat→brightness pulse
 */

import type { ShaderPreset } from '../types';

export const PROTEAN_CLOUDS_PRESET: ShaderPreset = {
  id: 'protean',
  label: 'Protean Clouds',
  description: 'Volumetric cloud flythrough with fBM noise and directional lighting',
  palette: 'vaporwave',
  params: [
    { id: 'density', label: 'Density', slot: 'p0', min: 0.0, max: 1.0, default: 0.5, step: 0.05 },
    { id: 'speed', label: 'Speed', slot: 'p1', min: 0.0, max: 1.0, default: 0.4, step: 0.05 },
  ],
  body: /* wgsl */ `

// 3D noise using integer hash (no sin, no banding)
fn ihash(n: u32) -> u32 {
  var x = n;
  x = x ^ (x >> 16u);
  x = x * 0x45d9f3bu;
  x = x ^ (x >> 16u);
  return x;
}

fn noiseval(p: vec3f) -> f32 {
  let i = vec3<i32>(floor(p));
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  let ix = u32(i.x + 500);
  let iy = u32(i.y + 500);
  let iz = u32(i.z + 500);

  let a = f32(ihash(ix + iy * 73u + iz * 179u) & 0xFFFFu) / 65535.0;
  let b = f32(ihash(ix + 1u + iy * 73u + iz * 179u) & 0xFFFFu) / 65535.0;
  let c = f32(ihash(ix + (iy + 1u) * 73u + iz * 179u) & 0xFFFFu) / 65535.0;
  let d = f32(ihash(ix + 1u + (iy + 1u) * 73u + iz * 179u) & 0xFFFFu) / 65535.0;
  let e = f32(ihash(ix + iy * 73u + (iz + 1u) * 179u) & 0xFFFFu) / 65535.0;
  let f2 = f32(ihash(ix + 1u + iy * 73u + (iz + 1u) * 179u) & 0xFFFFu) / 65535.0;
  let g = f32(ihash(ix + (iy + 1u) * 73u + (iz + 1u) * 179u) & 0xFFFFu) / 65535.0;
  let h = f32(ihash(ix + 1u + (iy + 1u) * 73u + (iz + 1u) * 179u) & 0xFFFFu) / 65535.0;

  return mix(
    mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
    mix(mix(e, f2, u.x), mix(g, h, u.x), u.y),
    u.z
  ) * 2.0 - 1.0;
}

// fBM with variable octaves for LOD
fn cloudFbm(p: vec3f, octaves: i32) -> f32 {
  var q = p;
  var f = 0.0;
  var amp = 0.5;
  for (var i = 0; i < octaves; i++) {
    f += amp * noiseval(q);
    q = q * 2.02 + vec3f(0.1, 0.03, 0.02);
    amp *= 0.5;
  }
  return f;
}

// Cloud density at a point — returns 0 if outside cloud volume
fn cloudMap(p: vec3f, time: f32, oct: i32, densityBias: f32) -> f32 {
  // Cloud slab: y between -3 and 1
  let q = p - vec3f(0.0, 0.1, 1.0) * time;

  // Shape modulation (large-scale)
  let shape = 0.5 + 0.5 * noiseval(q * 0.3);

  // Detail noise
  let detail = cloudFbm(q, oct);

  // Mix shape and detail
  let f = mix(detail * 0.1 - 0.5, detail, shape * shape);

  // Final density: subtract height to create cloud layer
  return clamp(1.5 * f - 0.5 - p.y + densityBias, 0.0, 1.0);
}

fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let beat = u_beat();
  let bass = u_bass();
  let mid = u_mid();
  let treb = u_treb();
  let energy = u_energy();

  let spd = 0.5 + u_p1() * 2.0;
  let time = t * spd;
  let densityBias = u_p0() * 2.0 - 0.5; // -0.5 to 1.5

  // Sun direction
  let sundir = normalize(vec3f(-0.7, 0.0, -0.7));
  let sun = clamp(dot(sundir, normalize(vec3f(p, 1.5))), 0.0, 1.0);

  // Camera — orbiting above cloud layer, looking down
  let camAngle = time * 0.1 + mid * 0.5;
  let camDist = 4.0;
  let ro = vec3f(
    sin(camAngle) * camDist,
    0.8 + bass * 0.3,
    cos(camAngle) * camDist
  ) - vec3f(0.0, 0.1, 0.0);

  let ta = vec3f(0.0, -1.0, 0.0);

  // Camera matrix
  let cw = normalize(ta - ro);
  let cp = vec3f(sin(0.07 * cos(time * 0.25)), cos(0.07 * cos(time * 0.25)), 0.0);
  let cu = normalize(cross(cw, cp));
  let cv = normalize(cross(cu, cw));
  let rd = normalize(cu * p.x + cv * p.y + cw * 1.5);

  // Background sky
  var skyCol = vec3f(0.6, 0.71, 0.75) - rd.y * 0.2 * vec3f(1.0, 0.5, 1.0) + 0.075;
  skyCol += 0.2 * vec3f(1.0, 0.6, 0.1) * pow(sun, 8.0);

  // Palette influence on sky
  let palSky = palette(0.6 + treb * 0.1);
  skyCol = mix(skyCol, palSky, 0.15);

  // Bounding planes for the cloud slab
  let yb = -3.0;
  let yt = 1.0;
  let tb_dist = (yb - ro.y) / rd.y;
  let tt_dist = (yt - ro.y) / rd.y;

  // Determine ray segment through cloud volume
  var tmin = 0.0;
  var tmax = 60.0;
  if (ro.y > yt) {
    if (tt_dist < 0.0) { return skyCol; }
    tmin = tt_dist;
    tmax = tb_dist;
  } else {
    if (tt_dist > 0.0) { tmax = min(tmax, tt_dist); }
    if (tb_dist > 0.0) { tmax = min(tmax, tb_dist); }
  }

  // Raymarch volumetric clouds
  var sum = vec4f(0.0);
  var dist = tmin + 0.1;

  // Bass → density surge
  let densityMod = densityBias + bass * 0.3;

  for (var i = 0; i < 80; i++) {
    if (sum.a > 0.99 || dist > tmax) { break; }

    // Dynamic step size — larger steps further away
    let dt = max(0.06, 0.05 * dist);

    // LOD — fewer octaves at distance
    let oct = 5 - i32(log2(1.0 + dist * 0.5));

    let pos = ro + dist * rd;

    // Check bounds
    if (pos.y < yb || pos.y > yt) { break; }

    let den = cloudMap(pos, time, max(oct, 2), densityMod);

    if (den > 0.01) {
      // Directional derivative lighting — single extra sample along sun direction
      let denLight = cloudMap(pos + 0.3 * sundir, time, max(oct - 1, 2), densityMod);
      let dif = clamp((den - denLight) / 0.6, 0.0, 1.0);

      // Lighting
      let lin = vec3f(1.0, 0.6, 0.3) * dif + vec3f(0.91, 0.98, 1.05);

      // Cloud color — mix between bright cloud and dark cloud based on density
      let brightCloud = vec3f(1.0, 0.95, 0.8);
      let darkCloud = palette(0.3 + treb * 0.1) * vec3f(0.5, 0.6, 0.7);
      var col = vec4f(mix(brightCloud, darkCloud, den), den);
      col = vec4f(col.xyz * lin, col.w);

      // Fog with distance
      col = vec4f(mix(col.xyz, skyCol, 1.0 - exp(-0.003 * dist * dist)), col.w);

      // Composite
      col = vec4f(col.xyz * col.w * 0.4, col.w * 0.4);
      sum += col * (1.0 - sum.a);
    }

    dist += dt;
  }

  sum = clamp(sum, vec4f(0.0), vec4f(1.0));

  // Composite clouds over sky
  var col = skyCol * (1.0 - sum.w) + sum.xyz;

  // Sun glare
  col += vec3f(0.2, 0.08, 0.04) * pow(sun, 3.0);

  // Beat → brightness pulse
  col += palette(0.5) * beat * 0.06;

  // Energy → subtle color grade shift
  col = mix(col, col * palette(0.7), energy * 0.1);

  return clamp(col, vec3f(0.0), vec3f(1.0));
}
`,
};
