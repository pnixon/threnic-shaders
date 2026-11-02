/**
 * Rain/Snow — falling particle effect with wind and depth layers.
 * p0 = Direction (0=rain streaks, 1=snow flakes)
 * p1 = Density
 * Palette drives particle color. Audio drives wind + intensity.
 */

import type { ShaderPreset } from '../types';

export const RAIN_PRESET: ShaderPreset = {
  id: 'rain',
  label: 'Rain / Snow',
  description: 'Falling particles — rain streaks or snow flakes with wind',
  palette: 'ice',
  params: [
    { id: 'style', label: 'Rain↔Snow', slot: 'p0', min: 0.0, max: 1.0, default: 0.0, step: 0.05 },
    { id: 'density', label: 'Density', slot: 'p1', min: 0.0, max: 1.0, default: 0.5, step: 0.05 },
  ],
  body: /* wgsl */ `

// Hash for per-particle randomness
fn ph(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn render(uv: vec2f, p: vec2f) -> vec3f {
  let t = u_time();
  let beat = u_beat();
  let bass = u_bass();
  let mid = u_mid();
  let energy = u_energy();

  let style = u_p0();          // 0 = rain, 1 = snow
  let density = 6.0 + u_p1() * 20.0;  // grid cells

  // Wind from audio — bass drives direction, mid drives turbulence
  let windBase = sin(t * 0.3) * 0.5 + bass * 1.5 - 0.3;
  let windTurb = sin(t * 1.7 + p.y * 3.0) * mid * 0.3;
  let wind = windBase + windTurb;

  // Fall speed — rain is fast, snow is slow (reduced from original)
  let fallSpeed = mix(1.2, 0.3, style) + beat * 0.2;

  var totalBright = 0.0;
  var totalColor = vec3f(0.0);

  // Multiple depth layers for parallax
  for (var layer = 0; layer < 6; layer++) {
    let fl = f32(layer);
    let layerDepth = 0.5 + fl * 0.15; // closer layers are brighter/larger

    // Layer-specific speed and wind offset
    let layerSpeed = fallSpeed * (0.7 + fl * 0.12);
    let layerWind = wind * (0.5 + fl * 0.2);
    let layerDensity = density * (0.8 + fl * 0.15);

    // Scrolling UV for this layer — negative Y = fall downward (UV Y=0 is top)
    let scroll = vec2f(
      layerWind * t * 0.3 + fl * 1.7,
      -t * layerSpeed + fl * 3.14
    );

    let cellUv = (uv + scroll) * layerDensity;
    let cellId = floor(cellUv);
    let cellFrac = fract(cellUv) - 0.5;

    // Per-particle random properties
    let rng = ph(cellId + fl * 100.0);
    let rng2 = ph(cellId * 1.7 + vec2f(fl * 37.0, 0.0));

    // Particle position offset within cell
    let particleX = (rng - 0.5) * 0.7;
    let particleY = (rng2 - 0.5) * 0.7;
    let particlePos = vec2f(particleX, particleY);

    let dp = cellFrac - particlePos;

    // Shape: rain = elongated streak, snow = round dot
    let streakFactor = mix(4.0, 1.0, style); // Y stretch for rain
    let stretched = vec2f(dp.x, dp.y * streakFactor);
    let dist = length(stretched);

    // Size varies per particle and per layer
    let baseSize = mix(0.06, 0.12, style); // snow larger than rain drops
    let size = baseSize * (0.6 + rng * 0.8) * layerDepth;

    // Particle brightness — sharp for rain, soft for snow
    let sharpness = mix(0.005, 0.03, style);
    let bright = smoothstep(size, size - sharpness, dist);

    // Depth fade — further layers dimmer
    let depthFade = 1.0 - fl * 0.12;

    // Per-particle color from palette
    let particleHue = palette(rng * 0.3 + fl * 0.1 + 0.3);

    totalBright += bright * depthFade;
    totalColor += particleHue * bright * depthFade;
  }

  // Clamp brightness
  totalBright = min(totalBright, 1.0);

  // Mix: snow is white-dominant, rain is palette-colored
  let whiteAmount = mix(0.3, 0.8, style);
  let finalColor = mix(totalColor, vec3f(totalBright), whiteAmount);

  // Add subtle glow on beat
  let beatGlow = palette(0.5) * beat * energy * 0.15;

  return finalColor + beatGlow;
}
`,
};
