/**
 * Shader Epilogue — shared WGSL postamble for all shader overlay presets.
 *
 * Provides vertex + fragment entry points. The preset body must define:
 *   fn render(uv: vec2f) -> vec3f
 *
 * Epilogue calls render(), applies Reinhard tonemap + gamma correction,
 * and outputs vec4f(col, u_opacity()).
 */

export const SHADER_EPILOGUE = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
  // Fullscreen triangle (3 verts, no index buffer)
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  var out: VertexOutput;
  out.position = vec4f(pos[idx], 0.0, 1.0);
  out.uv = pos[idx] * 0.5 + 0.5;
  // Flip Y so (0,0) is top-left
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

// Triangular dither noise — breaks 8-bit color banding in smooth gradients
fn dither(uv: vec2f) -> vec3f {
  // Screen-space integer hash (no sin, no precision issues)
  let p = vec2<u32>(uv * u_resolution());
  let seed = p.x * 1973u + p.y * 9277u + u32(u_time() * 60.0) * 26699u;
  let r1 = f32(((seed ^ (seed >> 16u)) * 0x45d9f3bu) & 0xFFFFu) / 65535.0;
  let r2 = f32((((seed * 17u) ^ ((seed * 17u) >> 16u)) * 0x45d9f3bu) & 0xFFFFu) / 65535.0;
  // Triangular distribution from two uniform samples
  let tri = (r1 + r2 - 1.0) / 255.0;
  return vec3f(tri);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  // Compute aspect-corrected centered coords (-1..1 range, centered at 0,0)
  let res = u_resolution();
  let aspect = res.x / max(res.y, 1.0);
  let p = (input.uv * 2.0 - vec2f(1.0)) * vec2f(aspect, 1.0);

  let raw = render(input.uv, p);

  // Gamma correction only (no tonemap — 16-bit buffer handles full range)
  let col = pow(clamp(raw, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));

  // Dither to break any remaining display quantization
  let dithered = col + dither(input.uv);

  return vec4f(dithered, u_opacity());
}
`;
