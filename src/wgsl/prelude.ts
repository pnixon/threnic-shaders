/**
 * Shader Prelude — shared WGSL preamble for all shader overlay presets.
 *
 * Uniform struct U: 8 × vec4f = 128 bytes
 *   a: (time, energy, beat, reactivity)
 *   b: (bass, mid, treb, sensitivity)
 *   c: (resX, resY, p0, p1)
 *   d: (opacity, blendMode, pad, pad)
 *   pa, pb, pc, pd: cosine palette coefficients (rgb + pad)
 */

export const SHADER_PRELUDE = /* wgsl */ `
struct U {
  a: vec4f,  // time, energy, beat, reactivity
  b: vec4f,  // bass, mid, treb, sensitivity
  c: vec4f,  // resX, resY, p0, p1
  d: vec4f,  // opacity, blendMode, pad, pad
  pa: vec4f, // palette a (rgb, pad)
  pb: vec4f, // palette b (rgb, pad)
  pc: vec4f, // palette c (rgb, pad)
  pd: vec4f, // palette d (rgb, pad)
};

@group(0) @binding(0) var<uniform> u: U;

// ─── Accessors ──────────────────────────────────────────────

fn u_time() -> f32       { return u.a.x; }
fn u_energy() -> f32     { return u.a.y; }
fn u_beat() -> f32       { return u.a.z; }
fn u_react() -> f32      { return u.a.w; }
fn u_bass() -> f32       { return u.b.x; }
fn u_mid() -> f32        { return u.b.y; }
fn u_treb() -> f32       { return u.b.z; }
fn u_sensitivity() -> f32{ return u.b.w; }
fn u_resolution() -> vec2f { return u.c.xy; }
fn u_p0() -> f32         { return u.c.z; }
fn u_p1() -> f32         { return u.c.w; }
fn u_opacity() -> f32    { return u.d.x; }
fn u_blendMode() -> f32  { return u.d.y; }

// ─── Cosine Palette ─────────────────────────────────────────

fn palette(t: f32) -> vec3f {
  let a = u.pa.xyz;
  let b = u.pb.xyz;
  let c = u.pc.xyz;
  let d = u.pd.xyz;
  return a + b * cos(6.28318530718 * (c * t + d));
}

// ─── Hash / Noise / FBM Helpers ─────────────────────────────

fn hash11(p: f32) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 *= p3 + 33.33;
  p3 *= p3 + p3;
  return fract(p3);
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2f) -> vec2f {
  let n = vec3f(dot(p, vec2f(127.1, 311.7)),
                dot(p, vec2f(269.5, 183.3)),
                dot(p, vec2f(419.2, 371.9)));
  return fract(sin(n.xy) * 43758.5453);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u2 = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u2.x), mix(c, d, u2.x), u2.y);
}

fn fbm(p_in: vec2f) -> f32 {
  var p = p_in;
  var value = 0.0;
  var amplitude = 0.5;
  for (var i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
`;
