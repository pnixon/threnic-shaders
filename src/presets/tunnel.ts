/**
 * Stony Cave Tunnel — Based on "Abstract Corridor" (Shadertoy).
 * Triangle noise perturbation, curvature shading, random tunnel splits.
 */

import type { ShaderPreset } from '../types';

export const TUNNEL_PRESET: ShaderPreset = {
  id: 'tunnel',
  label: 'Stony Cave Tunnel',
  description: 'Abstract corridor with random path splits and curvature shading',
  palette: 'stone',
  params: [
    { id: 'speed', label: 'Speed', slot: 'p0', min: 0.0, max: 1.0, default: 0.4, step: 0.05 },
    { id: 'brightness', label: 'Brightness', slot: 'p1', min: 0.0, max: 1.0, default: 0.5, step: 0.05 },
  ],
  body: /* wgsl */ `

const FH: f32 = 1.5;

fn rot2(a: f32) -> mat2x2f {
  let c = cos(a); let s = sin(a);
  return mat2x2f(c, s, -s, c);
}

// Triangle function — sharp edges, no smooth gradients
fn tri(x: vec3f) -> vec3f { return abs(x - floor(x) - 0.5); }

// Surface perturbation — multi-octave triangle noise matching original fbm3 roughness
// Safe for SDF because triangle noise has bounded output and sharp edges
fn surfFunc(p: vec3f) -> f32 {
  // Matches the original rough = 0.2–0.8 range from the first raymarched version
  // Frequencies: 0.5, 1.0, 2.0 (same as the fbm3 at p*2.0, p*4.0 we had before)
  let o1 = dot(tri(p * 0.5 + tri(p * 0.25).yzx), vec3f(0.666));   // large boulders
  let o2 = dot(tri(p * 1.0 + tri(p * 0.5).zxy), vec3f(0.333));    // medium chunks
  let o3 = dot(tri(p * 2.0 + tri(p * 1.0).yxz), vec3f(0.166));    // fine crag
  return o1 * 0.5 + o2 * 0.35 + o3 * 0.15;
}

// The main tunnel path — smooth weaving
fn tunnelPath(z: f32) -> vec2f {
  let x = sin(z / 24.0) * cos(z / 12.0) * 8.0;
  return vec2f(x, 0.0);
}

// Distance to a single tunnel bore — circular cross-section with varying radius
fn tunnelBore(p: vec3f, pathXY: vec2f) -> f32 {
  let tun = p.xy - pathXY;
  let dist = length(tun);
  // Radius varies along Z for organic cave feel
  let baseRadius = 1.2;
  let radiusVar = sin(p.z * 0.3) * 0.15 + sin(p.z * 0.7 + 2.0) * 0.1 + sin(p.z * 0.13) * 0.2;
  let radius = baseRadius + radiusVar;
  return radius - dist;
}

// Distance function — single tunnel with roughness
fn tmap(p: vec3f) -> f32 {
  let sf = surfFunc(p - vec3f(0.0, cos(p.z / 3.0) * 0.15, 0.0));
  let mainDist = tunnelBore(p, tunnelPath(p.z));
  let n = mainDist + (0.5 - sf);
  return min(n, p.y + FH);
}

// Surface normal
fn getNormal(p: vec3f) -> vec3f {
  let e = 0.001;
  return normalize(vec3f(
    tmap(p + vec3f(e, 0.0, 0.0)) - tmap(p - vec3f(e, 0.0, 0.0)),
    tmap(p + vec3f(0.0, e, 0.0)) - tmap(p - vec3f(0.0, e, 0.0)),
    tmap(p + vec3f(0.0, 0.0, e)) - tmap(p - vec3f(0.0, 0.0, e))
  ));
}

// Ambient occlusion
fn calcAO(p: vec3f, n: vec3f) -> f32 {
  var r = 0.0; var w = 1.0;
  for (var i = 1; i < 6; i++) {
    let d = f32(i) / 5.0;
    r += w * (d - tmap(p + n * d));
    w *= 0.5;
  }
  return 1.0 - clamp(r, 0.0, 1.0);
}

// Curvature (Nimitz)
fn curve(p: vec3f, w: f32) -> f32 {
  let e = vec2f(-1.0, 1.0) * w;
  let t1 = tmap(p + e.yxx); let t2 = tmap(p + e.xxy);
  let t3 = tmap(p + e.xyx); let t4 = tmap(p + e.yyy);
  return 0.125 / (w * w) * (t1 + t2 + t3 + t4 - 4.0 * tmap(p));
}

// Procedural tri-planar rock texture — rough stone/dirt with distance-based color rules
fn procTex(p: vec3f, n: vec3f, dist_from_center: f32) -> vec3f {
  let nn = max((abs(n) - 0.2) * 7.0, vec3f(0.001));
  let blend = nn / (nn.x + nn.y + nn.z);

  // === Multi-scale visual roughness (4 octaves, texture only) ===

  // Large rock faces
  let o1a = tri(vec3f(p.yz * 0.8, p.x * 0.6)) * blend.x;
  let o1b = tri(vec3f(p.zx * 0.8, p.y * 0.6)) * blend.y;
  let o1c = tri(vec3f(p.xy * 0.8, p.z * 0.6)) * blend.z;
  let large = dot(o1a + o1b + o1c, vec3f(0.33));

  // Medium chunky detail
  let o2a = tri(vec3f(p.yz * 2.5, p.x * 2.0)) * blend.x;
  let o2b = tri(vec3f(p.zx * 2.5, p.y * 2.0)) * blend.y;
  let o2c = tri(vec3f(p.xy * 2.5, p.z * 2.0)) * blend.z;
  let medium = dot(o2a + o2b + o2c, vec3f(0.33));

  // Fine gritty grain
  let o3a = tri(vec3f(p.yz * 6.0, p.x * 5.0)) * blend.x;
  let o3b = tri(vec3f(p.zx * 6.0, p.y * 5.0)) * blend.y;
  let o3c = tri(vec3f(p.xy * 6.0, p.z * 5.0)) * blend.z;
  let fine = dot(o3a + o3b + o3c, vec3f(0.33));

  // Very fine mineral specks
  let o4a = tri(vec3f(p.yz * 12.0, p.x * 10.0)) * blend.x;
  let o4b = tri(vec3f(p.zx * 12.0, p.y * 10.0)) * blend.y;
  let o4c = tri(vec3f(p.xy * 12.0, p.z * 10.0)) * blend.z;
  let specks = dot(o4a + o4b + o4c, vec3f(0.33));

  // Micro roughness — individual grain texture
  let o5a = tri(vec3f(p.yz * 24.0, p.x * 20.0)) * blend.x;
  let o5b = tri(vec3f(p.zx * 24.0, p.y * 20.0)) * blend.y;
  let o5c = tri(vec3f(p.xy * 24.0, p.z * 20.0)) * blend.z;
  let micro = dot(o5a + o5b + o5c, vec3f(0.33));

  // === Distance-based color rule ===
  // Surfaces at similar distances from tunnel center get similar base color
  // This creates natural "strata" rings like real geological layers
  let distBand = fract(dist_from_center * 3.0 + large * 0.3);

  // === Stone/dirt color palette ===
  // Multiple earth tones blended by distance band + noise
  let sandstone = vec3f(0.76, 0.62, 0.45);  // warm sandy
  let limestone = vec3f(0.72, 0.70, 0.65);  // cool grey
  let ironOxide = vec3f(0.55, 0.35, 0.25);  // rusty red-brown
  let darkEarth = vec3f(0.30, 0.25, 0.20);  // deep dirt
  let paleite   = vec3f(0.82, 0.78, 0.70);  // light stone

  // Select base color from distance band
  var baseCol = sandstone;
  if (distBand < 0.2) { baseCol = mix(darkEarth, ironOxide, distBand * 5.0); }
  else if (distBand < 0.4) { baseCol = mix(ironOxide, sandstone, (distBand - 0.2) * 5.0); }
  else if (distBand < 0.6) { baseCol = mix(sandstone, limestone, (distBand - 0.4) * 5.0); }
  else if (distBand < 0.8) { baseCol = mix(limestone, paleite, (distBand - 0.6) * 5.0); }
  else { baseCol = mix(paleite, darkEarth, (distBand - 0.8) * 5.0); }

  // Add palette influence for variety (subtle)
  let paletteHint = palette(large * 0.3 + 0.1) * 0.15;
  baseCol = baseCol + paletteHint;

  // === Brightness from texture detail (configurable via p1) ===
  let baseBright = 0.3 + u_p1() * 0.7; // p1 controls overall brightness
  let brightness = baseBright + medium * 0.2 + fine * 0.15 + specks * 0.1 + micro * 0.05;

  return baseCol * brightness;
}

fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let beat = u_beat();
  let bass = u_bass();
  let mid = u_mid();
  let treb = u_treb();
  let energy = u_energy();
  let react = u_react();

  // Bass → speed bursts (tunnel rushes forward on bass hits)
  let spd = 2.0 + u_p0() * 8.0 + beat * 2.0 + bass * 1.5;

  // Camera setup — follows the tunnel path
  let camZ = t * spd;
  let camXY = tunnelPath(camZ);

  // Mid → camera shake (subtle vertical/horizontal wobble on mids)
  let shakeX = sin(t * 7.3) * mid * 0.08;
  let shakeY = cos(t * 5.7) * mid * 0.06;
  let ro = vec3f(camXY.x + shakeX, camXY.y + shakeY, camZ);

  var lookAt = vec3f(0.0, 0.0, camZ + 0.5);
  let lookXY = tunnelPath(lookAt.z);
  lookAt = vec3f(lookXY.x, lookXY.y + 0.1, lookAt.z);

  // Light positions
  var lightPos = ro + vec3f(0.0, 0.125, -0.125);
  var lightPos2 = vec3f(0.0, 0.0, camZ + 6.0);
  let lp2XY = tunnelPath(lightPos2.z);
  lightPos2 = vec3f(lp2XY.x, lp2XY.y, lightPos2.z);

  // Camera matrix
  let fov = 3.14159 / 3.0;
  let forward = normalize(lookAt - ro);
  let right = normalize(vec3f(forward.z, 0.0, -forward.x));
  let up = cross(forward, right);
  var rd = normalize(forward + fov * p.x * right + fov * p.y * up);

  // Swivel camera on turns
  let swivel = tunnelPath(lookAt.z).x / 32.0;
  let rdxy = rot2(swivel) * rd.xy;
  rd = vec3f(rdxy.x, rdxy.y, rd.z);

  // Camera roll — irregular full rotation around the forward axis
  // Multiple overlapping frequencies create unpredictable rolling motion
  let roll = camZ * 0.08              // slow base rotation (full 360 every ~78 units)
           + sin(camZ * 0.05) * 1.2   // large irregular wobble
           + sin(camZ * 0.13) * 0.6   // medium wobble
           + sin(camZ * 0.31) * 0.3;  // fast jitter
  let rollXY = rot2(roll) * rd.xy;
  rd = vec3f(rollXY.x, rollXY.y, rd.z);

  // Raymarch
  var dist = 0.0;
  var dt = 0.0;
  for (var i = 0; i < 96; i++) {
    dt = tmap(ro + rd * dist);
    if (dt < 0.005 || dist > 150.0) { break; }
    dist += dt * 0.75;
  }

  var col = vec3f(0.0);

  if (dt < 0.005) {
    let sp = ro + rd * dist;
    let sn = getNormal(sp);
    let ao = calcAO(sp, sn);

    // Dual lights
    let ld1 = lightPos - sp;
    let ld2 = lightPos2 - sp;
    let dist1 = max(length(ld1), 0.001);
    let dist2 = max(length(ld2), 0.001);
    let ldn1 = ld1 / dist1;
    let ldn2 = ld2 / dist2;
    let atten = min(1.0 / dist1 + 1.0 / dist2, 1.0);

    let diff = max(dot(sn, ldn1), 0.0);
    let diff2 = max(dot(sn, ldn2), 0.0);

    // Treb → specular sparkle (high frequencies make wet rock glint)
    let specPow = 8.0 + treb * 24.0;
    let spec = pow(max(dot(reflect(-ldn1, sn), -rd), 0.0), specPow) * (1.0 + treb * 2.0);
    let spec2 = pow(max(dot(reflect(-ldn2, sn), -rd), 0.0), specPow) * (1.0 + treb * 2.0);

    let crv = clamp(curve(sp, 0.125) * 0.5 + 0.5, 0.0, 1.0);
    let fre = pow(clamp(dot(sn, rd) + 1.0, 0.0, 1.0), 1.0);

    let texCol = procTex(sp, sn, length(sp.xy - tunnelPath(sp.z)));
    let shading = crv * 0.5 + 0.5;

    // Mid → light intensity (mids pump the diffuse brightness)
    let midBoost = 1.0 + mid * 0.5;
    col = texCol * ((diff + diff2) * 0.8 * midBoost + 0.1) +
          (spec + spec2) * texCol * 1.5 +
          fre * crv * texCol.zyx * (0.5 + energy * 0.5);

    col *= atten * shading * ao;

    // Beat → warm torch glow, Bass → color shift toward palette deep end
    let torchHue = 0.05 + bass * 0.15;
    col += palette(torchHue) * beat * atten * 0.6;

    // Treb → subtle sparkle particles in the air
    let sparkle = treb * step(0.97, fract(sin(dot(sp.xz, vec2f(127.1, 311.7))) * 43758.5));
    col += palette(0.7) * sparkle * 0.3;
  }

  return clamp(col, vec3f(0.0), vec3f(1.0));
}
`,
};
