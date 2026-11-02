/**
 * Volumetric Clouds + Terrain — complete landscape scene.
 * Raymarched fBM terrain with soft shadows,
 * volumetric cloud layer above, Henyey-Greenstein scattering.
 * Techniques: IQ-style terrain marching, noise derivatives for normals,
 * Beer's law cloud extinction, soft shadow penumbra.
 */

import type { ShaderPreset } from '../types';

export const VOLUMETRIC_CLOUDS_PRESET: ShaderPreset = {
  id: 'volumetric',
  label: 'Volumetric Clouds',
  description: 'Landscape with raymarched terrain, soft shadows, and volumetric clouds',
  palette: 'ice',
  params: [
    { id: 'coverage', label: 'Coverage', slot: 'p0', min: 0.0, max: 1.0, default: 0.5, step: 0.05 },
    { id: 'speed', label: 'Speed', slot: 'p1', min: 0.0, max: 1.0, default: 0.3, step: 0.05 },
  ],
  body: /* wgsl */ `

// --- Noise ---
fn ihash(n: u32) -> u32 {
  var x = n;
  x = x ^ (x >> 16u); x = x * 0x45d9f3bu;
  x = x ^ (x >> 16u);
  return x;
}

fn vnoise(p: vec3f) -> f32 {
  let i = vec3<i32>(floor(p));
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let ix = u32(i.x+500); let iy = u32(i.y+500); let iz = u32(i.z+500);
  let a = f32(ihash(ix + iy*73u + iz*179u) & 0xFFFFu)/65535.0;
  let b = f32(ihash(ix+1u + iy*73u + iz*179u) & 0xFFFFu)/65535.0;
  let c = f32(ihash(ix + (iy+1u)*73u + iz*179u) & 0xFFFFu)/65535.0;
  let d = f32(ihash(ix+1u + (iy+1u)*73u + iz*179u) & 0xFFFFu)/65535.0;
  let e = f32(ihash(ix + iy*73u + (iz+1u)*179u) & 0xFFFFu)/65535.0;
  let f2 = f32(ihash(ix+1u + iy*73u + (iz+1u)*179u) & 0xFFFFu)/65535.0;
  let g = f32(ihash(ix + (iy+1u)*73u + (iz+1u)*179u) & 0xFFFFu)/65535.0;
  let h = f32(ihash(ix+1u + (iy+1u)*73u + (iz+1u)*179u) & 0xFFFFu)/65535.0;
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,f2,u.x),mix(g,h,u.x),u.y), u.z);
}

fn noise2d(p: vec2f) -> f32 {
  return vnoise(vec3f(p.x, p.y, 0.0));
}

// --- Terrain ---
fn terrainHeight(p: vec2f) -> f32 {
  var h = 0.0;
  var amp = 1.0;
  var freq = 0.15;
  var pos = p;

  // Large-scale rolling hills
  for (var i = 0; i < 3; i++) {
    h += amp * noise2d(pos * freq);
    amp *= 0.5;
    freq *= 2.0;
    pos += vec2f(3.7, 1.3);
  }

  // Sharp cliff ridges using abs() turbulence (creates sharp creases)
  var cliffAmp = 0.3;
  var cliffFreq = 0.4;
  var cliffPos = p + vec2f(17.0, 31.0);
  for (var i = 0; i < 3; i++) {
    // abs() creates V-shaped creases = cliff faces
    h += cliffAmp * (1.0 - 2.0 * abs(noise2d(cliffPos * cliffFreq) - 0.5));
    cliffAmp *= 0.4;
    cliffFreq *= 2.3;
    cliffPos += vec2f(5.3, 2.7);
  }

  return h * 3.5 - 1.0;
}

// Tree density at a terrain point — determines where forests grow
fn treeDensity(p: vec2f, h: f32, steepness: f32) -> f32 {
  // Trees grow below treeline, on moderate slopes, in noise-driven patches
  let treeline = 2.5;
  let heightFade = smoothstep(treeline, treeline - 1.5, h);

  // No trees on steep cliff faces
  let slopeFade = smoothstep(0.7, 0.4, steepness);

  // Patchy forest distribution
  let forestNoise = noise2d(p * 0.8) * 0.6 + noise2d(p * 2.5) * 0.3;
  let patches = smoothstep(0.25, 0.5, forestNoise);

  return heightFade * slopeFade * patches;
}

fn terrainMap(p: vec3f) -> f32 {
  return p.y - terrainHeight(p.xz);
}

// Terrain normal via central differences
fn terrainNormal(p: vec3f) -> vec3f {
  let e = 0.01;
  let h = terrainHeight(p.xz);
  let hx = terrainHeight(p.xz + vec2f(e, 0.0));
  let hz = terrainHeight(p.xz + vec2f(0.0, e));
  return normalize(vec3f(h - hx, e, h - hz));
}

// Raymarch terrain
fn marchTerrain(ro: vec3f, rd: vec3f) -> f32 {
  var t = 0.1;
  for (var i = 0; i < 80; i++) {
    let pos = ro + rd * t;
    let d = terrainMap(pos);
    if (d < 0.01 * t) { return t; }
    if (t > 80.0) { break; }
    t += d * 0.5;
  }
  return -1.0;
}

// --- Soft Shadows ---
fn softShadow(ro: vec3f, rd: vec3f, mint: f32, maxt: f32, k: f32) -> f32 {
  var res = 1.0;
  var t = mint;
  for (var i = 0; i < 24; i++) {
    let h = terrainMap(ro + rd * t);
    res = min(res, k * h / t);
    if (res < 0.001 || t > maxt) { break; }
    t += clamp(h, 0.02, 0.5);
  }
  return clamp(res, 0.0, 1.0);
}

// --- Clouds ---
fn cloudDensity(p: vec3f, time: f32, coverage: f32) -> f32 {
  let wind = vec3f(time * 0.3, 0.0, time * 0.15);
  let pos = p + wind;
  var n = 0.0;
  var amp = 0.5;
  var sp = pos * 0.2;
  for (var i = 0; i < 4; i++) {
    n += vnoise(sp) * amp;
    sp = sp * 2.1 + vec3f(0.1, 0.05, 0.07);
    amp *= 0.5;
  }
  // Height gradient within cloud slab
  let cloudBot = 6.0;
  let cloudTop = 12.0;
  let hf = (p.y - cloudBot) / (cloudTop - cloudBot);
  let hGrad = smoothstep(0.0, 0.15, hf) * smoothstep(1.0, 0.8, hf);
  return max((n * hGrad - (1.0 - coverage)) * 2.5, 0.0);
}

fn hgPhase(cosA: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosA, 1.5));
}

fn marchClouds(ro: vec3f, rd: vec3f, sunDir: vec3f, time: f32, coverage: f32, maxDist: f32) -> vec4f {
  let cloudBot = 6.0;
  let cloudTop = 12.0;

  // Ray intersection with cloud slab
  let tBot = (cloudBot - ro.y) / rd.y;
  let tTop = (cloudTop - ro.y) / rd.y;
  var tEntry = max(min(tBot, tTop), 0.0);
  var tExit = min(max(tBot, tTop), maxDist);
  if (tEntry >= tExit) { return vec4f(0.0); }

  let steps = 32;
  let dt = (tExit - tEntry) / f32(steps);
  var transmittance = 1.0;
  var light = vec3f(0.0);
  let cosAngle = dot(rd, sunDir);
  let phase = hgPhase(cosAngle, 0.4) + hgPhase(cosAngle, -0.15) * 0.3;

  let sunCol = vec3f(1.0, 0.9, 0.75);
  let ambCol = vec3f(0.4, 0.5, 0.65);

  for (var i = 0; i < steps; i++) {
    if (transmittance < 0.02) { break; }
    let t = tEntry + (f32(i) + 0.5) * dt;
    let pos = ro + rd * t;
    let den = cloudDensity(pos, time, coverage);
    if (den > 0.001) {
      // Light march toward sun
      var sunDen = 0.0;
      let lSteps = 4;
      let ldt = 1.0;
      for (var j = 1; j <= lSteps; j++) {
        sunDen += max(cloudDensity(pos + sunDir * f32(j) * ldt, time, coverage), 0.0);
      }
      let lightT = exp(-sunDen * ldt * 0.8);

      // Accumulate
      let extinct = exp(-den * dt * 0.9);
      let lum = sunCol * lightT * phase + ambCol * 0.2;
      light += lum * transmittance * (1.0 - extinct) * den;
      transmittance *= extinct;
    }
  }
  return vec4f(light, 1.0 - transmittance);
}

// --- Main ---
fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let beat = u_beat();
  let bass = u_bass();
  let mid = u_mid();
  let treb = u_treb();
  let energy = u_energy();

  let spd = 0.3 + u_p1() * 1.0;
  let time = t * spd;
  let coverage = 0.35 + u_p0() * 0.4 + bass * 0.08;

  let sunDir = normalize(vec3f(0.6, 0.35, -0.5));
  let sunCol = vec3f(1.0, 0.85, 0.6);

  // Camera — flies forward, smooth altitude tracking
  let camZ = time * 2.0;
  let camX = sin(time * 0.05) * 2.0;

  // Smooth terrain height by sampling ahead and behind (moving average)
  // This creates the spring-like behavior: camera altitude is based on
  // a wide area average, so sudden terrain changes affect it gradually
  let sampleSpread = 8.0; // how far ahead/behind to sample
  var avgH = 0.0;
  for (var si = 0; si < 7; si++) {
    let offset = (f32(si) - 3.0) * sampleSpread / 7.0;
    avgH += terrainHeight(vec2f(camX, camZ + offset));
  }
  avgH = avgH / 7.0;

  // Ideal clearance above the smoothed ground level
  let idealClearance = 3.0;
  let camY = avgH + idealClearance + sin(time * 0.1) * 0.3;

  let ro = vec3f(camX, camY, camZ);
  let ta = vec3f(sin(time * 0.05) * 2.0, camY - 0.8, camZ + 10.0);

  let cw = normalize(ta - ro);
  let cu = normalize(cross(cw, vec3f(0.0, 1.0, 0.0)));
  let cv = normalize(cross(cu, cw));
  let rd = normalize(cu * p.x + cv * (-p.y) + cw * 1.8);

  // Sky gradient
  let skyTop = vec3f(0.25, 0.45, 0.75);
  let skyHorizon = vec3f(0.65, 0.75, 0.85);
  var col = mix(skyHorizon, skyTop, max(rd.y, 0.0));

  // Sun glow in sky
  let sunDot = max(dot(rd, sunDir), 0.0);
  col += sunCol * pow(sunDot, 32.0) * 0.4;
  col += sunCol * pow(sunDot, 4.0) * 0.15;

  // --- Terrain ---
  let tTerrain = marchTerrain(ro, rd);
  var terrainDist = 100.0;

  if (tTerrain > 0.0) {
    terrainDist = tTerrain;
    let hitPos = ro + rd * tTerrain;
    let nor = terrainNormal(hitPos);

    // Terrain coloring with cliffs and trees
    let h = hitPos.y;
    let steepness = 1.0 - nor.y; // 0=flat, 1=vertical

    // Base: green grass at low elevation, brown dirt higher
    var terrainCol = mix(vec3f(0.2, 0.35, 0.12), vec3f(0.35, 0.3, 0.2), smoothstep(0.5, 2.0, h));

    // Cliff faces — exposed rock on steep slopes
    let cliffCol = mix(vec3f(0.35, 0.32, 0.28), vec3f(0.5, 0.48, 0.44), noise2d(hitPos.xz * 3.0));
    terrainCol = mix(terrainCol, cliffCol, smoothstep(0.4, 0.7, steepness));

    // Snow on high peaks (only on flattish surfaces)
    terrainCol = mix(terrainCol, vec3f(0.85, 0.88, 0.9), smoothstep(3.0, 4.0, h) * (1.0 - steepness));

    // Trees — dark green forest patches below treeline on moderate slopes
    let trees = treeDensity(hitPos.xz, h, steepness);
    let treeCol = mix(vec3f(0.06, 0.15, 0.04), vec3f(0.1, 0.22, 0.06), noise2d(hitPos.xz * 5.0));
    terrainCol = mix(terrainCol, treeCol, trees);

    // Lighting (trees add fake canopy bump to diffuse)
    let treeBump = trees * (noise2d(hitPos.xz * 12.0) * 0.2 - 0.1);
    let diff = max(dot(nor, sunDir) + treeBump, 0.0);
    let shadow = softShadow(hitPos + nor * 0.05, sunDir, 0.1, 20.0, 8.0);
    let ambient = 0.2 + 0.1 * nor.y;

    terrainCol *= (diff * shadow * sunCol * 0.8 + ambient * vec3f(0.5, 0.6, 0.8));

    // Distance fog
    let fogAmount = 1.0 - exp(-tTerrain * 0.015);
    terrainCol = mix(terrainCol, col, fogAmount);

    col = terrainCol;
  }

  // --- Clouds ---
  let clouds = marchClouds(ro, rd, sunDir, time, coverage, terrainDist);
  col = mix(col, clouds.xyz, clouds.w);

  // --- Post ---
  col += palette(0.5) * beat * 0.03;
  col = mix(col, col * palette(0.6), energy * 0.05);

  return clamp(col, vec3f(0.0), vec3f(1.0));
}
`,
};
