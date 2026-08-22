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

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let raw = render(input.uv);

  // Reinhard tonemap
  let mapped = raw / (raw + vec3f(1.0));

  // Gamma correction (linear -> sRGB)
  let gamma = pow(mapped, vec3f(1.0 / 2.2));

  return vec4f(gamma, u_opacity());
}
`;
