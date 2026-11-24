/**
 * webgpu-shader.ts: WGSL compute shaders (path tracer + resolve pass) matching
 * Blender Cycles 5.2.3 lighting, Principled BSDF (multi-scatter anisotropic GGX
 * + Fresnel-layered diffuse), procedural mottle/bump, thin-lens DoF, scrims,
 * analytic floor card ring, HDR world NEE, shadow catcher and OIDN guides.
 */
import { GGX_EAVG_OFFSET, GGX_SCHLICK_IOR_S_OFFSET } from "./webgpu-tables";

export const PATH_TRACE_WGSL = /* wgsl */ `
const PI: f32 = 3.14159265358979323846;
const INV_PI: f32 = 0.31830988618379067154;
const TWO_PI: f32 = 6.28318530717958647692;
const INV_2PI: f32 = 0.15915494309189533577;
const INF: f32 = 1e30;
const EMPTY_CHILD: u32 = 0xffffffffu;
const HIT_NONE: u32 = 0u;
const HIT_PART: u32 = 1u;
const HIT_STUDIO: u32 = 2u;
const HIT_SCRIM: u32 = 3u;
const HIT_FLOOR_RING: u32 = 4u;

const GGX_E_OFFSET: u32 = 0u;
const GGX_EAVG_OFFSET: u32 = ${GGX_EAVG_OFFSET}u;
const GGX_S_OFFSET: u32 = ${GGX_SCHLICK_IOR_S_OFFSET}u;

struct Params {
  dims: vec4<u32>,          // width, height, tileX, tileY
  tile: vec4<u32>,          // tileW, tileH, sampleIndex, totalSamples
  bounces: vec4<u32>,       // maxBounces, diffuseBounces, glossyBounces, transparent
  flags: vec4<u32>,         // hasPart, hasShadowCatcher, hasFloorRing, emitterCount
  studioOff: vec4<u32>,     // trisOff, posOff, normOff, matsOff (in vec4 units of studioBuf)
  auxOff: vec4<u32>,        // bhOff, emittersOff, bhRes, 0 (in f32 units of auxBuf)
  hdrInfo: vec4<u32>,       // hdrW, hdrH, 0, 0
  clampFilter: vec4<f32>,   // clampDirect, clampIndirect, filterWidthPx, totalEmitterWeightStudio
  camPos: vec4<f32>,        // pos.xyz, fovYRad
  camRight: vec4<f32>,      // right.xyz, apertureRadiusM
  camUp: vec4<f32>,         // up.xyz, focusDistanceM
  camFwd: vec4<f32>,        // fwd.xyz, clipStartM
  worldInfo: vec4<f32>,     // strength, rotationRad, worldPower, totalEmitterWeightPart
  partColorIor: vec4<f32>,  // baseColor.rgb, ior
  partRough: vec4<f32>,     // anisotropy, mottleScale, mottleAmp, roughMin
  partPlate: vec4<f32>,     // plateRough, plateTextured, grainPerM, bumpDistanceM
  floorRing0: vec4<f32>,    // centre.xyz, innerRadiusM
  floorRing1: vec4<f32>,    // outerRadiusM, keyRadiance, farRadiance, keyAzimuthRad
  partToWorld: mat4x4<f32>,
  worldToPart: mat4x4<f32>,
  partRealism: vec4<f32>,   // surfaceWear, dust, subsurface, 0
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> partPos: array<f32>;
@group(0) @binding(2) var<storage, read> partVerts: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> partTris: array<u32>;
@group(0) @binding(4) var<storage, read> partNodes: array<vec4<u32>>;
@group(0) @binding(5) var<storage, read> studioBuf: array<vec4<u32>>;
@group(0) @binding(6) var<storage, read> hdrBuf: array<f32>;
@group(0) @binding(7) var<storage, read> auxBuf: array<f32>;
@group(0) @binding(8) var<storage, read_write> accumBuf: array<vec4<f32>>;

// ---- RNG (PCG4D seeded cleanly per pixel/sample/dimension) ----------------------------------

fn pcg4d(v_in: vec4<u32>) -> vec4<u32> {
  var v = v_in * 1664525u + 1013904223u;
  v.x += v.y * v.w;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v.w += v.y * v.z;
  v ^= v >> vec4<u32>(16u);
  v.x += v.y * v.w;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v.w += v.y * v.z;
  return v;
}

struct Rng {
  state: vec4<u32>,
};

fn rng_init(px: u32, py: u32, sampleIdx: u32) -> Rng {
  var r: Rng;
  r.state = pcg4d(vec4<u32>(px + 1u, py + 1u, sampleIdx + 1u, 0x9e3779b9u));
  return r;
}

fn rng_next4(r: ptr<function, Rng>) -> vec4<f32> {
  (*r).state = pcg4d((*r).state + vec4<u32>(1u, 3u, 5u, 7u));
  return vec4<f32>((*r).state) * (1.0 / 4294967296.0);
}

fn cp_qmc2(px: u32, py: u32, sampleIdx: u32, dim: u32, step: vec2<f32>) -> vec2<f32> {
  let h = pcg4d(vec4<u32>(px + 1u, py + 1u, dim + 1u, 0x9e3779b9u));
  let shift = vec2<f32>(h.xy) * (1.0 / 4294967296.0);
  return fract(shift + f32(sampleIdx) * step);
}

fn cp_qmc1(px: u32, py: u32, sampleIdx: u32, dim: u32, step: f32) -> f32 {
  let h = pcg4d(vec4<u32>(px + 1u, py + 1u, dim + 1u, 0x7f4a7c15u));
  let shift = f32(h.x) * (1.0 / 4294967296.0);
  return fract(shift + f32(sampleIdx) * step);
}

// ---- Math & Helpers -------------------------------------------------------------------------

fn safe_normalize_len(v: vec3<f32>, out_len: ptr<function, f32>) -> vec3<f32> {
  let l2 = dot(v, v);
  if (l2 <= 0.0) {
    *out_len = 0.0;
    return vec3<f32>(0.0);
  }
  let l = sqrt(l2);
  *out_len = l;
  return v / l;
}

fn safe_normalize_fallback(v: vec3<f32>, fallback: vec3<f32>) -> vec3<f32> {
  let l2 = dot(v, v);
  if (l2 < 1e-24) {
    return fallback;
  }
  return v * inverseSqrt(l2);
}

fn luma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.212671, 0.71516, 0.072169));
}

fn avg3(c: vec3<f32>) -> f32 {
  return (c.x + c.y + c.z) * (1.0 / 3.0);
}

fn max3(c: vec3<f32>) -> f32 {
  return max(c.x, max(c.y, c.z));
}

fn offset_ray(p: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
  // Adapted Waechter & Binder offset tuned cleanly for mm/sub-mm prints above 20 um floor lift.
  let int_scale: f32 = 64.0;
  let float_scale: f32 = 1.0 / 262144.0;
  let origin: f32 = 1.0 / 32.0;
  let of_i = vec3<i32>(int_scale * n);
  let p_i = vec3<f32>(
    bitcast<f32>(bitcast<i32>(p.x) + select(of_i.x, -of_i.x, p.x < 0.0)),
    bitcast<f32>(bitcast<i32>(p.y) + select(of_i.y, -of_i.y, p.y < 0.0)),
    bitcast<f32>(bitcast<i32>(p.z) + select(of_i.z, -of_i.z, p.z < 0.0)),
  );
  return vec3<f32>(
    select(p_i.x, p.x + float_scale * n.x, abs(p.x) < origin),
    select(p_i.y, p.y + float_scale * n.y, abs(p.y) < origin),
    select(p_i.z, p.z + float_scale * n.z, abs(p.z) < origin),
  );
}

fn sample_uniform_disk(u: vec2<f32>) -> vec2<f32> {
  let a = 2.0 * u.x - 1.0;
  let b = 2.0 * u.y - 1.0;
  if (a == 0.0 && b == 0.0) { return vec2<f32>(0.0); }
  var r: f32;
  var phi: f32;
  if (a * a > b * b) {
    r = a;
    phi = (PI * 0.25) * (b / a);
  } else {
    r = b;
    phi = (PI * 0.5) - (PI * 0.25) * (a / b);
  }
  return vec2<f32>(r * cos(phi), r * sin(phi));
}

fn make_orthonormals(N: vec3<f32>, T: ptr<function, vec3<f32>>, B: ptr<function, vec3<f32>>) {
  if (N.z < -0.9999999) {
    *T = vec3<f32>(0.0, -1.0, 0.0);
    *B = vec3<f32>(-1.0, 0.0, 0.0);
    return;
  }
  let a = 1.0 / (1.0 + N.z);
  let b = -N.x * N.y * a;
  *T = vec3<f32>(1.0 - N.x * N.x * a, b, -N.x);
  *B = vec3<f32>(b, 1.0 - N.y * N.y * a, -N.y);
}

fn make_orthonormals_safe_tangent(
  N: vec3<f32>,
  T_in: vec3<f32>,
  X: ptr<function, vec3<f32>>,
  Y: ptr<function, vec3<f32>>,
) {
  let c = cross(N, T_in);
  let l2 = dot(c, c);
  if (l2 < 1e-12) {
    make_orthonormals(N, X, Y);
  } else {
    *Y = c * inverseSqrt(l2);
    *X = cross(*Y, N);
  }
}

fn mat3_mul_p2w(v: vec3<f32>) -> vec3<f32> {
  return (params.partToWorld * vec4<f32>(v, 0.0)).xyz;
}

fn mat3_mul_w2p(v: vec3<f32>) -> vec3<f32> {
  return (params.worldToPart * vec4<f32>(v, 0.0)).xyz;
}

fn normal_p2w(n_local: vec3<f32>) -> vec3<f32> {
  // Inverse transpose of partToWorld is transpose of worldToPart upper 3x3.
  let wt = transpose(params.worldToPart);
  return normalize((wt * vec4<f32>(n_local, 0.0)).xyz);
}

// ---- Cycles LUT lookups ---------------------------------------------------------------------

fn aux_lut_read_1d(x_in: f32, offset: u32, size: u32) -> f32 {
  let x = clamp(x_in, 0.0, 1.0) * f32(size - 1u);
  let i = min(u32(x), size - 1u);
  let ni = min(i + 1u, size - 1u);
  let t = x - f32(i);
  let d0 = auxBuf[offset + i];
  if (t == 0.0) { return d0; }
  return mix(d0, auxBuf[offset + ni], t);
}

fn aux_lut_read_2d(x_in: f32, y_in: f32, offset: u32, xs: u32, ys: u32) -> f32 {
  let y = clamp(y_in, 0.0, 1.0) * f32(ys - 1u);
  let i = min(u32(y), ys - 1u);
  let ni = min(i + 1u, ys - 1u);
  let t = y - f32(i);
  let d0 = aux_lut_read_1d(x_in, offset + xs * i, xs);
  if (t == 0.0) { return d0; }
  let d1 = aux_lut_read_1d(x_in, offset + xs * ni, xs);
  return mix(d0, d1, t);
}

fn aux_lut_read_3d(x_in: f32, y_in: f32, z_in: f32, offset: u32, xs: u32, ys: u32, zs: u32) -> f32 {
  let z = clamp(z_in, 0.0, 1.0) * f32(zs - 1u);
  let i = min(u32(z), zs - 1u);
  let ni = min(i + 1u, zs - 1u);
  let t = z - f32(i);
  let stride = xs * ys;
  let d0 = aux_lut_read_2d(x_in, y_in, offset + stride * i, xs, ys);
  if (t == 0.0) { return d0; }
  let d1 = aux_lut_read_2d(x_in, y_in, offset + stride * ni, xs, ys);
  return mix(d0, d1, t);
}

// ---- Cycles Noise & Voronoi (util/hash.h, svm/noise.h, svm/fractal_noise.h, svm/voronoi.h) -

fn rotl(x: u32, k: u32) -> u32 {
  return (x << k) | (x >> (32u - k));
}

fn hash_uint3(kx: u32, ky: u32, kz: u32) -> u32 {
  var a = 0xdeadbeefu + (3u << 2u) + 13u + kx;
  var b = 0xdeadbeefu + (3u << 2u) + 13u + ky;
  var c = 0xdeadbeefu + (3u << 2u) + 13u + kz;
  c ^= b; c -= rotl(b, 14u);
  a ^= c; a -= rotl(c, 11u);
  b ^= a; b -= rotl(a, 25u);
  c ^= b; c -= rotl(b, 16u);
  a ^= c; a -= rotl(c, 4u);
  b ^= a; b -= rotl(a, 14u);
  c ^= b; c -= rotl(b, 24u);
  return c;
}

fn fade(t: f32) -> f32 {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn grad3(hash: u32, x: f32, y: f32, z: f32) -> f32 {
  let h = hash & 15u;
  let u = select(y, x, h < 8u);
  let vt = select(z, x, h == 12u || h == 14u);
  let v = select(vt, y, h < 4u);
  let su = select(u, -u, (h & 1u) != 0u);
  let sv = select(v, -v, (h & 2u) != 0u);
  return su + sv;
}

fn perlin_3d(x: f32, y: f32, z: f32) -> f32 {
  let fx_fl = floor(x);
  let fy_fl = floor(y);
  let fz_fl = floor(z);
  let X = u32(i32(fx_fl));
  let Y = u32(i32(fy_fl));
  let Z = u32(i32(fz_fl));
  let fx = x - fx_fl;
  let fy = y - fy_fl;
  let fz = z - fz_fl;
  let u = fade(fx);
  let v = fade(fy);
  let w = fade(fz);

  let n000 = grad3(hash_uint3(X,      Y,      Z     ), fx,       fy,       fz);
  let n100 = grad3(hash_uint3(X + 1u, Y,      Z     ), fx - 1.0, fy,       fz);
  let n010 = grad3(hash_uint3(X,      Y + 1u, Z     ), fx,       fy - 1.0, fz);
  let n110 = grad3(hash_uint3(X + 1u, Y + 1u, Z     ), fx - 1.0, fy - 1.0, fz);
  let n001 = grad3(hash_uint3(X,      Y,      Z + 1u), fx,       fy,       fz - 1.0);
  let n101 = grad3(hash_uint3(X + 1u, Y,      Z + 1u), fx - 1.0, fy,       fz - 1.0);
  let n011 = grad3(hash_uint3(X,      Y + 1u, Z + 1u), fx,       fy - 1.0, fz - 1.0);
  let n111 = grad3(hash_uint3(X + 1u, Y + 1u, Z + 1u), fx - 1.0, fy - 1.0, fz - 1.0);

  let x00 = mix(n000, n100, u);
  let x10 = mix(n010, n110, u);
  let x01 = mix(n001, n101, u);
  let x11 = mix(n011, n111, u);
  return mix(mix(x00, x10, v), mix(x01, x11, v), w);
}

fn snoise_3d(p_in: vec3<f32>) -> f32 {
  let corr = vec3<f32>(
    select(0.0, 0.5, abs(p_in.x) >= 1000000.0),
    select(0.0, 0.5, abs(p_in.y) >= 1000000.0),
    select(0.0, 0.5, abs(p_in.z) >= 1000000.0),
  );
  // trunc-remainder matching C fmod(p, 100000.0)
  let p = (p_in - trunc(p_in / 100000.0) * 100000.0) + corr;
  return 0.9820 * perlin_3d(p.x, p.y, p.z);
}

fn noise_fbm_3d_int(p: vec3<f32>, detail_i: u32) -> f32 {
  var fscale = 1.0;
  var amp = 1.0;
  var maxamp = 0.0;
  var sum = 0.0;
  for (var i = 0u; i <= detail_i; i++) {
    sum += snoise_3d(fscale * p) * amp;
    maxamp += amp;
    amp *= 0.5;
    fscale *= 2.0;
  }
  return 0.5 * sum / maxamp + 0.5;
}

fn hash_int3_to_float3(k: vec3<i32>) -> vec3<f32> {
  // Cycles hash_pcg3d_i using unsigned arithmetic with exact 32-bit wrapping (equivalent mod 2^32).
  var v = vec3<u32>(k) * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> vec3<u32>(16u);
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  let masked = v & vec3<u32>(0x7fffffffu);
  return vec3<f32>(masked) * (1.0 / 2147483647.0);
}

fn voronoi_3d_f1_dist_col_r(coord: vec3<f32>) -> vec2<f32> {
  let cell_f = floor(coord);
  let local_p = coord - cell_f;
  let cell_i = vec3<i32>(cell_f);
  var min_d2 = INF;
  var best_off = vec3<i32>(0);
  for (var k = -1; k <= 1; k++) {
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let offset = vec3<i32>(i, j, k);
        let pt = vec3<f32>(offset) + hash_int3_to_float3(cell_i + offset);
        let d = pt - local_p;
        let d2 = dot(d, d);
        if (d2 < min_d2) {
          min_d2 = d2;
          best_off = offset;
        }
      }
    }
  }
  let col = hash_int3_to_float3(cell_i + best_off);
  return vec2<f32>(sqrt(min_d2), col.x);
}

fn voronoi_3d_f1(coord: vec3<f32>) -> f32 {
  return voronoi_3d_f1_dist_col_r(coord).x;
}

fn plate_height(p_local: vec3<f32>) -> f32 {
  let grain = params.partPlate.z;
  let grit_scale = grain * (25000.0 / 6000.0);
  return voronoi_3d_f1(p_local * grain) + 0.35 * noise_fbm_3d_int(p_local * grit_scale, 2u);
}

// ---- BVH Traversal --------------------------------------------------------------------------

struct TriHit {
  t: f32,
  u: f32,
  v: f32,
  prim: u32,
  kind: u32,
};

fn hit_aabb(bmin: vec3<f32>, bmax: vec3<f32>, o: vec3<f32>, inv_d: vec3<f32>, t_min: f32, t_max: f32) -> f32 {
  let t0 = (bmin - o) * inv_d;
  let t1 = (bmax - o) * inv_d;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), max(min(t0.z, t1.z), t_min));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), min(max(t0.z, t1.z), t_max));
  return select(INF, tmin, tmin <= tmax);
}

fn tri_intersect(
  v0: vec3<f32>,
  v1: vec3<f32>,
  v2: vec3<f32>,
  o: vec3<f32>,
  d: vec3<f32>,
  t_min: f32,
  t_max: f32,
  out_uvt: ptr<function, vec3<f32>>,
) -> bool {
  let e1 = v1 - v0;
  let e2 = v2 - v0;
  let p = cross(d, e2);
  let det = dot(e1, p);
  if (abs(det) < 1e-12) { return false; }
  let inv_det = 1.0 / det;
  let s = o - v0;
  let u = dot(s, p) * inv_det;
  if (u < 0.0 || u > 1.0) { return false; }
  let q = cross(s, e1);
  let v = dot(d, q) * inv_det;
  if (v < 0.0 || u + v > 1.0) { return false; }
  let t = dot(e2, q) * inv_det;
  if (t > t_min && t < t_max) {
    *out_uvt = vec3<f32>(u, v, t);
    return true;
  }
  return false;
}

fn load_part_pos(vi: u32) -> vec3<f32> {
  let o = vi * 3u;
  return vec3<f32>(partPos[o], partPos[o + 1u], partPos[o + 2u]);
}

fn load_studio_vec3(base_vec4: u32, idx: u32) -> vec3<f32> {
  return bitcast<vec3<f32>>(studioBuf[base_vec4 + idx].xyz);
}

fn intersect_part(o_world: vec3<f32>, d_world: vec3<f32>, t_min: f32, best: ptr<function, TriHit>) {
  if (params.flags.x == 0u) { return; }
  let o = (params.worldToPart * vec4<f32>(o_world, 1.0)).xyz;
  let d = (params.worldToPart * vec4<f32>(d_world, 0.0)).xyz;
  let inv_d = vec3<f32>(
    1.0 / select(d.x, select(-1e-12, 1e-12, d.x >= 0.0), abs(d.x) < 1e-12),
    1.0 / select(d.y, select(-1e-12, 1e-12, d.y >= 0.0), abs(d.y) < 1e-12),
    1.0 / select(d.z, select(-1e-12, 1e-12, d.z >= 0.0), abs(d.z) < 1e-12),
  );

  var stack: array<u32, 64>;
  var sp: i32 = 1;
  stack[0] = 0u;
  while (sp > 0) {
    sp -= 1;
    let node_idx = stack[sp];
    let nb = node_idx * 4u;
    let w0 = partNodes[nb + 0u];
    let w1 = partNodes[nb + 1u];
    let w2 = partNodes[nb + 2u];
    let w3 = partNodes[nb + 3u];

    let l_idx = w0.w;
    let l_cnt = w1.w;
    let r_idx = w2.w;
    let r_cnt = w3.w;

    var l_hit = INF;
    if (l_cnt > 0u || l_idx != EMPTY_CHILD) {
      l_hit = hit_aabb(bitcast<vec3<f32>>(w0.xyz), bitcast<vec3<f32>>(w1.xyz), o, inv_d, t_min, (*best).t);
    }
    var r_hit = INF;
    if (r_cnt > 0u || r_idx != EMPTY_CHILD) {
      r_hit = hit_aabb(bitcast<vec3<f32>>(w2.xyz), bitcast<vec3<f32>>(w3.xyz), o, inv_d, t_min, (*best).t);
    }

    if (l_hit < INF && l_cnt > 0u) {
      for (var i = l_idx; i < l_idx + l_cnt; i++) {
        let tb = i * 3u;
        var uvt: vec3<f32>;
        if (tri_intersect(load_part_pos(partTris[tb]), load_part_pos(partTris[tb + 1u]), load_part_pos(partTris[tb + 2u]), o, d, t_min, (*best).t, &uvt)) {
          (*best).t = uvt.z;
          (*best).u = uvt.x;
          (*best).v = uvt.y;
          (*best).prim = i;
          (*best).kind = HIT_PART;
        }
      }
    }
    if (r_hit < INF && r_cnt > 0u) {
      for (var i = r_idx; i < r_idx + r_cnt; i++) {
        let tb = i * 3u;
        var uvt: vec3<f32>;
        if (tri_intersect(load_part_pos(partTris[tb]), load_part_pos(partTris[tb + 1u]), load_part_pos(partTris[tb + 2u]), o, d, t_min, (*best).t, &uvt)) {
          (*best).t = uvt.z;
          (*best).u = uvt.x;
          (*best).v = uvt.y;
          (*best).prim = i;
          (*best).kind = HIT_PART;
        }
      }
    }

    let push_l = l_hit < (*best).t && l_cnt == 0u && l_idx != EMPTY_CHILD;
    let push_r = r_hit < (*best).t && r_cnt == 0u && r_idx != EMPTY_CHILD;
    if (push_l && push_r) {
      if (l_hit < r_hit) {
        stack[sp] = r_idx; sp += 1;
        stack[sp] = l_idx; sp += 1;
      } else {
        stack[sp] = l_idx; sp += 1;
        stack[sp] = r_idx; sp += 1;
      }
    } else if (push_l) {
      stack[sp] = l_idx; sp += 1;
    } else if (push_r) {
      stack[sp] = r_idx; sp += 1;
    }
  }
}

struct LocalHit {
  t: f32,
  u: f32,
  v: f32,
  prim: u32,
};

fn record_local_hit(
  uvt: vec3<f32>,
  prim: u32,
  rng: ptr<function, Rng>,
  num_hits: ptr<function, u32>,
  out_hits: ptr<function, array<LocalHit, 4>>,
) {
  let recorded = min(*num_hits, 4u);
  for (var hi = 0u; hi < recorded; hi++) {
    if ((*out_hits)[hi].t == uvt.z) { return; }
  }
  *num_hits += 1u;
  var slot = *num_hits - 1u;
  if (*num_hits > 4u) {
    let rv = pcg4d((*rng).state).x;
    (*rng).state.x = rv;
    slot = rv % *num_hits;
  }
  if (slot < 4u) {
    (*out_hits)[slot] = LocalHit(uvt.z, uvt.x, uvt.y, prim);
  }
}

fn intersect_part_local(
  o_world: vec3<f32>,
  d_world: vec3<f32>,
  t_max: f32,
  rng: ptr<function, Rng>,
  out_hits: ptr<function, array<LocalHit, 4>>,
) -> u32 {
  if (params.flags.x == 0u) { return 0u; }
  let o = (params.worldToPart * vec4<f32>(o_world, 1.0)).xyz;
  let d = (params.worldToPart * vec4<f32>(d_world, 0.0)).xyz;
  let inv_d = vec3<f32>(
    1.0 / select(d.x, select(-1e-12, 1e-12, d.x >= 0.0), abs(d.x) < 1e-12),
    1.0 / select(d.y, select(-1e-12, 1e-12, d.y >= 0.0), abs(d.y) < 1e-12),
    1.0 / select(d.z, select(-1e-12, 1e-12, d.z >= 0.0), abs(d.z) < 1e-12),
  );
  var num_hits = 0u;
  var stack: array<u32, 64>;
  var sp: i32 = 1;
  stack[0] = 0u;
  while (sp > 0) {
    sp -= 1;
    let nb = stack[sp] * 4u;
    let w0 = partNodes[nb + 0u];
    let w1 = partNodes[nb + 1u];
    let w2 = partNodes[nb + 2u];
    let w3 = partNodes[nb + 3u];
    let l_idx = w0.w;
    let l_cnt = w1.w;
    let r_idx = w2.w;
    let r_cnt = w3.w;

    var l_hit = INF;
    if (l_cnt > 0u || l_idx != EMPTY_CHILD) {
      l_hit = hit_aabb(bitcast<vec3<f32>>(w0.xyz), bitcast<vec3<f32>>(w1.xyz), o, inv_d, 0.0, t_max);
    }
    var r_hit = INF;
    if (r_cnt > 0u || r_idx != EMPTY_CHILD) {
      r_hit = hit_aabb(bitcast<vec3<f32>>(w2.xyz), bitcast<vec3<f32>>(w3.xyz), o, inv_d, 0.0, t_max);
    }

    if (l_hit < INF && l_cnt > 0u) {
      for (var i = l_idx; i < l_idx + l_cnt; i++) {
        let tb = i * 3u;
        var uvt: vec3<f32>;
        if (tri_intersect(load_part_pos(partTris[tb]), load_part_pos(partTris[tb + 1u]), load_part_pos(partTris[tb + 2u]), o, d, 0.0, t_max, &uvt)) {
          record_local_hit(uvt, i, rng, &num_hits, out_hits);
        }
      }
    }
    if (r_hit < INF && r_cnt > 0u) {
      for (var i = r_idx; i < r_idx + r_cnt; i++) {
        let tb = i * 3u;
        var uvt: vec3<f32>;
        if (tri_intersect(load_part_pos(partTris[tb]), load_part_pos(partTris[tb + 1u]), load_part_pos(partTris[tb + 2u]), o, d, 0.0, t_max, &uvt)) {
          record_local_hit(uvt, i, rng, &num_hits, out_hits);
        }
      }
    }

    if (l_hit < INF && l_cnt == 0u && l_idx != EMPTY_CHILD) { stack[sp] = l_idx; sp += 1; }
    if (r_hit < INF && r_cnt == 0u && r_idx != EMPTY_CHILD) { stack[sp] = r_idx; sp += 1; }
  }
  return num_hits;
}

fn intersect_studio_ex(o: vec3<f32>, d: vec3<f32>, t_min: f32, best: ptr<function, TriHit>, catchers_only: bool) {
  let inv_d = vec3<f32>(
    1.0 / select(d.x, select(-1e-12, 1e-12, d.x >= 0.0), abs(d.x) < 1e-12),
    1.0 / select(d.y, select(-1e-12, 1e-12, d.y >= 0.0), abs(d.y) < 1e-12),
    1.0 / select(d.z, select(-1e-12, 1e-12, d.z >= 0.0), abs(d.z) < 1e-12),
  );
  let tris_off = params.studioOff.x;
  let pos_off = params.studioOff.y;
  let mats_off = params.studioOff.w;

  var stack: array<u32, 64>;
  var sp: i32 = 1;
  stack[0] = 0u;
  while (sp > 0) {
    sp -= 1;
    let node_idx = stack[sp];
    let nb = node_idx * 4u;
    let w0 = studioBuf[nb + 0u];
    let w1 = studioBuf[nb + 1u];
    let w2 = studioBuf[nb + 2u];
    let w3 = studioBuf[nb + 3u];

    let l_idx = w0.w;
    let l_cnt = w1.w;
    let r_idx = w2.w;
    let r_cnt = w3.w;

    var l_hit = INF;
    if (l_cnt > 0u || l_idx != EMPTY_CHILD) {
      l_hit = hit_aabb(bitcast<vec3<f32>>(w0.xyz), bitcast<vec3<f32>>(w1.xyz), o, inv_d, t_min, (*best).t);
    }
    var r_hit = INF;
    if (r_cnt > 0u || r_idx != EMPTY_CHILD) {
      r_hit = hit_aabb(bitcast<vec3<f32>>(w2.xyz), bitcast<vec3<f32>>(w3.xyz), o, inv_d, t_min, (*best).t);
    }

    if (l_hit < INF && l_cnt > 0u) {
      for (var i = l_idx; i < l_idx + l_cnt; i++) {
        let tri = studioBuf[tris_off + i];
        if (catchers_only && bitcast<f32>(studioBuf[mats_off + tri.w * 2u + 1u].x) <= 0.5) { continue; }
        var uvt: vec3<f32>;
        if (tri_intersect(load_studio_vec3(pos_off, tri.x), load_studio_vec3(pos_off, tri.y), load_studio_vec3(pos_off, tri.z), o, d, t_min, (*best).t, &uvt)) {
          (*best).t = uvt.z;
          (*best).u = uvt.x;
          (*best).v = uvt.y;
          (*best).prim = i;
          (*best).kind = HIT_STUDIO;
        }
      }
    }
    if (r_hit < INF && r_cnt > 0u) {
      for (var i = r_idx; i < r_idx + r_cnt; i++) {
        let tri = studioBuf[tris_off + i];
        if (catchers_only && bitcast<f32>(studioBuf[mats_off + tri.w * 2u + 1u].x) <= 0.5) { continue; }
        var uvt: vec3<f32>;
        if (tri_intersect(load_studio_vec3(pos_off, tri.x), load_studio_vec3(pos_off, tri.y), load_studio_vec3(pos_off, tri.z), o, d, t_min, (*best).t, &uvt)) {
          (*best).t = uvt.z;
          (*best).u = uvt.x;
          (*best).v = uvt.y;
          (*best).prim = i;
          (*best).kind = HIT_STUDIO;
        }
      }
    }

    let push_l = l_hit < (*best).t && l_cnt == 0u && l_idx != EMPTY_CHILD;
    let push_r = r_hit < (*best).t && r_cnt == 0u && r_idx != EMPTY_CHILD;
    if (push_l && push_r) {
      if (l_hit < r_hit) {
        stack[sp] = r_idx; sp += 1;
        stack[sp] = l_idx; sp += 1;
      } else {
        stack[sp] = l_idx; sp += 1;
        stack[sp] = r_idx; sp += 1;
      }
    } else if (push_l) {
      stack[sp] = l_idx; sp += 1;
    } else if (push_r) {
      stack[sp] = r_idx; sp += 1;
    }
  }
}

fn intersect_studio(o: vec3<f32>, d: vec3<f32>, t_min: f32, best: ptr<function, TriHit>) {
  intersect_studio_ex(o, d, t_min, best, false);
}

fn occluded_part(o_world: vec3<f32>, d_world: vec3<f32>, t_min: f32, t_max: f32) -> bool {
  if (params.flags.x == 0u) { return false; }
  let o = (params.worldToPart * vec4<f32>(o_world, 1.0)).xyz;
  let d = (params.worldToPart * vec4<f32>(d_world, 0.0)).xyz;
  let inv_d = vec3<f32>(
    1.0 / select(d.x, select(-1e-12, 1e-12, d.x >= 0.0), abs(d.x) < 1e-12),
    1.0 / select(d.y, select(-1e-12, 1e-12, d.y >= 0.0), abs(d.y) < 1e-12),
    1.0 / select(d.z, select(-1e-12, 1e-12, d.z >= 0.0), abs(d.z) < 1e-12),
  );
  var stack: array<u32, 64>;
  var sp: i32 = 1;
  stack[0] = 0u;
  while (sp > 0) {
    sp -= 1;
    let nb = stack[sp] * 4u;
    let w0 = partNodes[nb + 0u];
    let w1 = partNodes[nb + 1u];
    let w2 = partNodes[nb + 2u];
    let w3 = partNodes[nb + 3u];
    let l_idx = w0.w;
    let l_cnt = w1.w;
    let r_idx = w2.w;
    let r_cnt = w3.w;
    var l_hit = INF;
    if (l_cnt > 0u || l_idx != EMPTY_CHILD) {
      l_hit = hit_aabb(bitcast<vec3<f32>>(w0.xyz), bitcast<vec3<f32>>(w1.xyz), o, inv_d, t_min, t_max);
    }
    var r_hit = INF;
    if (r_cnt > 0u || r_idx != EMPTY_CHILD) {
      r_hit = hit_aabb(bitcast<vec3<f32>>(w2.xyz), bitcast<vec3<f32>>(w3.xyz), o, inv_d, t_min, t_max);
    }
    if (l_hit < INF) {
      if (l_cnt > 0u) {
        for (var i = l_idx; i < l_idx + l_cnt; i++) {
          let tb = i * 3u;
          var uvt: vec3<f32>;
          if (tri_intersect(load_part_pos(partTris[tb]), load_part_pos(partTris[tb + 1u]), load_part_pos(partTris[tb + 2u]), o, d, t_min, t_max, &uvt)) { return true; }
        }
      } else { stack[sp] = l_idx; sp += 1; }
    }
    if (r_hit < INF) {
      if (r_cnt > 0u) {
        for (var i = r_idx; i < r_idx + r_cnt; i++) {
          let tb = i * 3u;
          var uvt: vec3<f32>;
          if (tri_intersect(load_part_pos(partTris[tb]), load_part_pos(partTris[tb + 1u]), load_part_pos(partTris[tb + 2u]), o, d, t_min, t_max, &uvt)) { return true; }
        }
      } else { stack[sp] = r_idx; sp += 1; }
    }
  }
  return false;
}

fn occluded_studio_ex(o: vec3<f32>, d: vec3<f32>, t_min: f32, t_max: f32, catchers_only: bool) -> bool {
  let inv_d = vec3<f32>(
    1.0 / select(d.x, select(-1e-12, 1e-12, d.x >= 0.0), abs(d.x) < 1e-12),
    1.0 / select(d.y, select(-1e-12, 1e-12, d.y >= 0.0), abs(d.y) < 1e-12),
    1.0 / select(d.z, select(-1e-12, 1e-12, d.z >= 0.0), abs(d.z) < 1e-12),
  );
  let tris_off = params.studioOff.x;
  let pos_off = params.studioOff.y;
  let mats_off = params.studioOff.w;
  var stack: array<u32, 64>;
  var sp: i32 = 1;
  stack[0] = 0u;
  while (sp > 0) {
    sp -= 1;
    let nb = stack[sp] * 4u;
    let w0 = studioBuf[nb + 0u];
    let w1 = studioBuf[nb + 1u];
    let w2 = studioBuf[nb + 2u];
    let w3 = studioBuf[nb + 3u];
    let l_idx = w0.w;
    let l_cnt = w1.w;
    let r_idx = w2.w;
    let r_cnt = w3.w;
    var l_hit = INF;
    if (l_cnt > 0u || l_idx != EMPTY_CHILD) {
      l_hit = hit_aabb(bitcast<vec3<f32>>(w0.xyz), bitcast<vec3<f32>>(w1.xyz), o, inv_d, t_min, t_max);
    }
    var r_hit = INF;
    if (r_cnt > 0u || r_idx != EMPTY_CHILD) {
      r_hit = hit_aabb(bitcast<vec3<f32>>(w2.xyz), bitcast<vec3<f32>>(w3.xyz), o, inv_d, t_min, t_max);
    }
    if (l_hit < INF) {
      if (l_cnt > 0u) {
        for (var i = l_idx; i < l_idx + l_cnt; i++) {
          let tri = studioBuf[tris_off + i];
          if (catchers_only && bitcast<f32>(studioBuf[mats_off + tri.w * 2u + 1u].x) <= 0.5) { continue; }
          var uvt: vec3<f32>;
          if (tri_intersect(load_studio_vec3(pos_off, tri.x), load_studio_vec3(pos_off, tri.y), load_studio_vec3(pos_off, tri.z), o, d, t_min, t_max, &uvt)) { return true; }
        }
      } else { stack[sp] = l_idx; sp += 1; }
    }
    if (r_hit < INF) {
      if (r_cnt > 0u) {
        for (var i = r_idx; i < r_idx + r_cnt; i++) {
          let tri = studioBuf[tris_off + i];
          if (catchers_only && bitcast<f32>(studioBuf[mats_off + tri.w * 2u + 1u].x) <= 0.5) { continue; }
          var uvt: vec3<f32>;
          if (tri_intersect(load_studio_vec3(pos_off, tri.x), load_studio_vec3(pos_off, tri.y), load_studio_vec3(pos_off, tri.z), o, d, t_min, t_max, &uvt)) { return true; }
        }
      } else { stack[sp] = r_idx; sp += 1; }
    }
  }
  return false;
}

fn occluded_studio(o: vec3<f32>, d: vec3<f32>, t_min: f32, t_max: f32) -> bool {
  return occluded_studio_ex(o, d, t_min, t_max, false);
}

// ---- Emitters & HDR -------------------------------------------------------------------------

struct Emitter {
  centre: vec3<f32>,
  flags: u32,       // bit 0: isScrim, bit 1: isEllipse, bit 2: partOnly
  xAxis: vec3<f32>,
  sizeX: f32,
  yAxis: vec3<f32>,
  sizeY: f32,
  normal: vec3<f32>,
  areaInv: f32,
  color: vec3<f32>,
  powerOrTop: f32,
  spreadOrBottom: f32,
  tanHalfSpread: f32,
  normSpread: f32,
  selectWeight: f32,
};

fn load_emitter(idx: u32) -> Emitter {
  let b = params.auxOff.y + idx * 24u;
  var e: Emitter;
  e.centre = vec3<f32>(auxBuf[b + 0u], auxBuf[b + 1u], auxBuf[b + 2u]);
  e.flags = bitcast<u32>(auxBuf[b + 3u]);
  e.xAxis = vec3<f32>(auxBuf[b + 4u], auxBuf[b + 5u], auxBuf[b + 6u]);
  e.sizeX = auxBuf[b + 7u];
  e.yAxis = vec3<f32>(auxBuf[b + 8u], auxBuf[b + 9u], auxBuf[b + 10u]);
  e.sizeY = auxBuf[b + 11u];
  e.normal = vec3<f32>(auxBuf[b + 12u], auxBuf[b + 13u], auxBuf[b + 14u]);
  e.areaInv = auxBuf[b + 15u];
  e.color = vec3<f32>(auxBuf[b + 16u], auxBuf[b + 17u], auxBuf[b + 18u]);
  e.powerOrTop = auxBuf[b + 19u];
  e.spreadOrBottom = auxBuf[b + 20u];
  e.tanHalfSpread = auxBuf[b + 21u];
  e.normSpread = auxBuf[b + 22u];
  e.selectWeight = auxBuf[b + 23u];
  return e;
}

fn emitter_allows(e: Emitter, on_part: bool) -> bool {
  return (e.flags & 4u) == 0u || on_part;
}

fn active_emitter_weight(on_part: bool) -> f32 {
  return select(params.clampFilter.w, params.worldInfo.w, on_part);
}

fn world_pick_prob(on_part: bool) -> f32 {
  let em_w = active_emitter_weight(on_part);
  let w_pow = select(0.0, params.worldInfo.z, params.worldInfo.x > 0.0);
  if (em_w <= 0.0 && w_pow <= 0.0) { return 0.0; }
  if (em_w <= 0.0) { return 1.0; }
  if (w_pow <= 0.0) { return 0.0; }
  return clamp(w_pow / (w_pow + em_w), 0.1, 0.85);
}

fn hit_emitter_card(e: Emitter, o: vec3<f32>, d: vec3<f32>, t_min: f32, t_max: f32, out_t: ptr<function, f32>, out_ly: ptr<function, f32>) -> bool {
  let denom = dot(d, e.normal);
  if (abs(denom) < 1e-8) { return false; }
  // Area lights emit forward along normal (so ray must hit front face: dot(-d, normal) > 0 => denom < 0).
  let is_scrim = (e.flags & 1u) != 0u;
  if (!is_scrim && denom >= 0.0) { return false; }
  let t = dot(e.centre - o, e.normal) / denom;
  if (t <= t_min || t >= t_max) { return false; }
  let rel = o + t * d - e.centre;
  let lx = dot(rel, e.xAxis);
  let ly = dot(rel, e.yAxis);
  let hx = 0.5 * e.sizeX;
  let hy = 0.5 * e.sizeY;
  if ((e.flags & 2u) != 0u) {
    let nx = lx / max(hx, 1e-8);
    let ny = ly / max(hy, 1e-8);
    if (nx * nx + ny * ny > 1.0) { return false; }
  } else {
    if (abs(lx) > hx || abs(ly) > hy) { return false; }
  }
  *out_t = t;
  *out_ly = ly;
  return true;
}

fn area_spread_attenuation(D_to_light: vec3<f32>, light_normal: vec3<f32>, tan_half: f32, norm_spread: f32) -> f32 {
  if (norm_spread <= 0.0) { return 1.0; }
  if (tan_half <= 0.0) {
    let c = dot(-D_to_light, light_normal);
    let len_c = length(cross(-D_to_light, light_normal));
    return select(0.0, PI, c > 0.0 && len_c / c <= 1e-5);
  }
  let cos_a = dot(-D_to_light, light_normal);
  if (cos_a <= 0.0) { return 0.0; }
  let tan_a = length(cross(-D_to_light, light_normal)) / cos_a;
  return max((tan_half - tan_a) * norm_spread, 0.0);
}

fn emitter_eval_radiance(e: Emitter, D_to_light: vec3<f32>, ly: f32) -> vec3<f32> {
  if ((e.flags & 1u) != 0u) {
    let frac = ly / max(e.sizeY, 1e-8) + 0.5;
    let rad = e.spreadOrBottom + (e.powerOrTop - e.spreadOrBottom) * clamp(frac, 0.0, 1.0);
    return e.color * max(rad, 0.0);
  }
  let base = e.color * (e.powerOrTop * INV_PI * e.areaInv);
  return base * area_spread_attenuation(D_to_light, e.normal, e.tanHalfSpread, e.normSpread);
}

fn emitter_solid_angle_pdf(e: Emitter, o: vec3<f32>, D_to_light: vec3<f32>, t: f32) -> f32 {
  let is_scrim = (e.flags & 1u) != 0u;
  let cos_l = select(dot(-D_to_light, e.normal), abs(dot(-D_to_light, e.normal)), is_scrim);
  if (cos_l <= 0.0) { return 0.0; }
  return (t * t) * e.areaInv / max(cos_l, 1e-6);
}

// Check if any scrim card is occluded along shadow ray
fn occluded_scrim(o: vec3<f32>, d: vec3<f32>, t_min: f32, t_max: f32, skip_idx: u32) -> bool {
  let n = params.flags.w;
  for (var i = 0u; i < n; i++) {
    if (i == skip_idx) { continue; }
    let e = load_emitter(i);
    if ((e.flags & 1u) == 0u) { continue; }
    var ht: f32;
    var ly: f32;
    if (hit_emitter_card(e, o, d, t_min, t_max, &ht, &ly)) { return true; }
  }
  return false;
}

fn hdr_eval(d_world: vec3<f32>) -> vec3<f32> {
  let strength = params.worldInfo.x;
  if (strength <= 0.0) { return vec3<f32>(0.0); }
  let rot = params.worldInfo.y;
  let c = cos(rot);
  let s = sin(rot);
  let d = vec3<f32>(c * d_world.x - s * d_world.y, s * d_world.x + c * d_world.y, d_world.z);
  let u = fract(0.5 - atan2(d.y, d.x) * INV_2PI);
  let v = clamp(acos(clamp(d.z, -1.0, 1.0)) * INV_PI, 0.0, 1.0);

  let w = params.hdrInfo.x;
  let h = params.hdrInfo.y;
  let fx = u * f32(w) - 0.5;
  let fy = v * f32(h) - 0.5;
  let x0_i = i32(floor(fx));
  let y0_i = clamp(i32(floor(fy)), 0, i32(h) - 1);
  let x1_i = x0_i + 1;
  let y1_i = clamp(y0_i + 1, 0, i32(h) - 1);
  let tx = fx - f32(x0_i);
  let ty = clamp(fy - f32(y0_i), 0.0, 1.0);
  let x0 = u32(((x0_i % i32(w)) + i32(w)) % i32(w));
  let x1 = u32(((x1_i % i32(w)) + i32(w)) % i32(w));
  let y0 = u32(y0_i);
  let y1 = u32(y1_i);

  let i00 = (y0 * w + x0) * 4u;
  let i10 = (y0 * w + x1) * 4u;
  let i01 = (y1 * w + x0) * 4u;
  let i11 = (y1 * w + x1) * 4u;
  let c00 = vec3<f32>(hdrBuf[i00], hdrBuf[i00 + 1u], hdrBuf[i00 + 2u]);
  let c10 = vec3<f32>(hdrBuf[i10], hdrBuf[i10 + 1u], hdrBuf[i10 + 2u]);
  let c01 = vec3<f32>(hdrBuf[i01], hdrBuf[i01 + 1u], hdrBuf[i01 + 2u]);
  let c11 = vec3<f32>(hdrBuf[i11], hdrBuf[i11 + 1u], hdrBuf[i11 + 2u]);
  let top = mix(c00, c10, tx);
  let bot = mix(c01, c11, tx);
  return mix(top, bot, ty) * strength;
}

fn hdr_pdf(d_world: vec3<f32>) -> f32 {
  if (params.worldInfo.x <= 0.0 || params.worldInfo.z <= 0.0) { return 0.0; }
  let rot = params.worldInfo.y;
  let c = cos(rot);
  let s = sin(rot);
  let d = vec3<f32>(c * d_world.x - s * d_world.y, s * d_world.x + c * d_world.y, d_world.z);
  let u = fract(0.5 - atan2(d.y, d.x) * INV_2PI);
  let theta = acos(clamp(d.z, -1.0, 1.0));
  let v = clamp(theta * INV_PI, 0.0, 1.0);
  let w = params.hdrInfo.x;
  let h = params.hdrInfo.y;
  let ix = min(u32(u * f32(w)), w - 1u);
  let iy = min(u32(v * f32(h)), h - 1u);
  let pdf_off = w * h * 4u + (h + 1u) + h * (w + 1u);
  let pdf_uv = hdrBuf[pdf_off + iy * w + ix];
  let sin_t = max(sin(theta), 1e-6);
  return pdf_uv / (2.0 * PI * PI * sin_t);
}

fn sample_cdf(offset: u32, count: u32, u: f32) -> u32 {
  var lo = 0u;
  var hi = count;
  while (lo + 1u < hi) {
    let mid = (lo + hi) >> 1u;
    if (hdrBuf[offset + mid] <= u) { lo = mid; } else { hi = mid; }
  }
  return min(lo, count - 1u);
}

fn hdr_sample(u_in: vec2<f32>, out_dir: ptr<function, vec3<f32>>, out_pdf: ptr<function, f32>) -> vec3<f32> {
  let w = params.hdrInfo.x;
  let h = params.hdrInfo.y;
  let marg_off = w * h * 4u;
  let cond_base = marg_off + h + 1u;
  let pdf_off = cond_base + h * (w + 1u);

  let iy = sample_cdf(marg_off, h, u_in.y);
  let m0 = hdrBuf[marg_off + iy];
  let m1 = hdrBuf[marg_off + iy + 1u];
  let dy = select(0.0, (u_in.y - m0) / (m1 - m0), m1 > m0);

  let row_off = cond_base + iy * (w + 1u);
  let ix = sample_cdf(row_off, w, u_in.x);
  let c0 = hdrBuf[row_off + ix];
  let c1 = hdrBuf[row_off + ix + 1u];
  let dx = select(0.0, (u_in.x - c0) / (c1 - c0), c1 > c0);

  let u = (f32(ix) + dx) / f32(w);
  let v = (f32(iy) + dy) / f32(h);
  let phi = PI - TWO_PI * u;
  let theta = PI * v;
  let sin_t = sin(theta);
  let d_local = vec3<f32>(sin_t * cos(phi), sin_t * sin(phi), cos(theta));

  let rot = params.worldInfo.y;
  let c = cos(rot);
  let s = sin(rot);
  let d_world = normalize(vec3<f32>(c * d_local.x + s * d_local.y, -s * d_local.x + c * d_local.y, d_local.z));
  *out_dir = d_world;

  let pdf_uv = hdrBuf[pdf_off + iy * w + ix];
  *out_pdf = pdf_uv / (2.0 * PI * PI * max(sin_t, 1e-6));

  return hdr_eval(d_world);
}

// ---- Principled BSDF (Dielectric GGX + Diffuse) --------------------------------------------

fn fresnel_dielectric(cos_i: f32, eta: f32) -> f32 {
  let c = clamp(abs(cos_i), 0.0, 1.0);
  let g = eta * eta - 1.0 + c * c;
  if (g <= 0.0) { return 1.0; }
  let gs = sqrt(g);
  let a = gs - c;
  let b = gs + c;
  let r = a / b;
  let t1 = (c * b - 1.0) / (c * a + 1.0);
  return 0.5 * r * r * (1.0 + t1 * t1);
}

fn ensure_valid_specular_reflection(Ng: vec3<f32>, I: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  if (dot(Ng - N, Ng - N) < 1e-12) { return N; }
  let R = 2.0 * dot(N, I) * N - I;
  let Iz = dot(I, Ng);
  if (Iz <= 0.0) { return Ng; }
  let thresh = min(0.9 * Iz, 0.01);
  if (dot(Ng, R) >= thresh) { return N; }
  let X = safe_normalize_fallback(N - dot(N, Ng) * Ng, N);
  let Ix = dot(I, X);
  let a = Ix * Ix + Iz * Iz;
  let b = 2.0 * (a + Iz * thresh);
  let c = (thresh + Iz) * (thresh + Iz);
  let disc = sqrt(max(b * b - 4.0 * a * c, 0.0));
  let Nz2 = select(0.25 * (b - disc) / a, 0.25 * (b + disc) / a, Ix < 0.0);
  let Nx = sqrt(max(1.0 - Nz2, 0.0));
  let Nz = sqrt(max(Nz2, 0.0));
  return normalize(Nx * X + Nz * Ng);
}

fn bsdf_lambda_ggx(sqr_alpha_tan_n: f32) -> f32 {
  return 0.5 * (sqrt(1.0 + sqr_alpha_tan_n) - 1.0);
}

fn ggx_d_aniso(ax: f32, ay: f32, H_in: vec3<f32>) -> f32 {
  let H = vec3<f32>(H_in.x / ax, H_in.y / ay, H_in.z);
  let l2 = dot(H, H);
  return INV_PI / (ax * ay * l2 * l2);
}

fn ggx_lambda_aniso(ax: f32, ay: f32, V: vec3<f32>) -> f32 {
  let sq = (ax * V.x) * (ax * V.x) + (ay * V.y) * (ay * V.y);
  return bsdf_lambda_ggx(sq / max(V.z * V.z, 1e-12));
}

fn microfacet_ggx_sample_vndf(wi: vec3<f32>, ax: f32, ay: f32, u: vec2<f32>) -> vec3<f32> {
  let wi_ = normalize(vec3<f32>(ax * wi.x, ay * wi.y, wi.z));
  let lensq = wi_.x * wi_.x + wi_.y * wi_.y;
  var T1: vec3<f32>;
  var T2: vec3<f32>;
  if (lensq > 1e-7) {
    T1 = vec3<f32>(-wi_.y, wi_.x, 0.0) * inverseSqrt(lensq);
    T2 = cross(wi_, T1);
  } else {
    T1 = vec3<f32>(1.0, 0.0, 0.0);
    T2 = vec3<f32>(0.0, 1.0, 0.0);
  }
  var t = sample_uniform_disk(u);
  t.y = mix(sqrt(max(1.0 - t.x * t.x, 0.0)), t.y, 0.5 * (1.0 + wi_.z));
  let t_z = sqrt(max(1.0 - dot(t, t), 0.0));
  let H_ = t.x * T1 + t.y * T2 + t_z * wi_;
  return normalize(vec3<f32>(ax * H_.x, ay * H_.y, max(0.0, H_.z)));
}

fn bump_shadowing_diffuse(Ns: vec3<f32>, N: vec3<f32>, wo: vec3<f32>, use_soft: bool) -> f32 {
  if (dot(Ns - N, Ns - N) < 1e-12) { return 1.0; }
  let cosNsI = dot(Ns, wo);
  let cosNsN = dot(Ns, N);
  let cosNI = dot(N, wo);
  if (cosNsI * cosNsN * cosNI < 0.0) { return 0.0; }
  if (!use_soft) { return 1.0; }
  let cos_i = abs(cosNsI);
  let cos_d = abs(cosNsN);
  if (cos_d >= 1.0 || cos_i >= 1.0) { return 1.0; }
  if (cos_i < 1e-6) { return 0.0; }
  let tan2_d = 1.0 / (cos_d * cos_d) - 1.0;
  let bump_a2 = clamp(0.125 * tan2_d, 0.0, 1.0);
  let lam = 0.5 * (sqrt(1.0 + bump_a2 * max(1.0 / (cos_i * cos_i) - 1.0, 0.0)) - 1.0);
  return 1.0 / (1.0 + lam);
}

struct BsdfSetup {
  N_diff: vec3<f32>,
  N_spec: vec3<f32>,
  Ns: vec3<f32>,
  X: vec3<f32>,
  Y: vec3<f32>,
  ax: f32,
  ay: f32,
  ior: f32,
  msScale: f32,
  diffWeight: vec3<f32>,
  sssWeight: vec3<f32>,
  specProb: f32,
  diffProb: f32,
  sssProb: f32,
  denoiseAlbedo: vec3<f32>,
  bumpCorrect: bool,
};

const BURLEY_TRUNCATE: f32 = 16.0;
const BURLEY_TRUNCATE_CDF: f32 = 0.9963790093708328;
// Matches Cycles bssrdf_setup_radius (bssrdf.h:71) for PR #17 scale 0.0028, radius (1.0, 0.70, 0.45).
const BURLEY_D: vec3<f32> = vec3<f32>(1.0, 0.70, 0.45) * (0.0028 * 0.25 * INV_PI);

fn bssrdf_burley_eval(d: f32, r: f32) -> f32 {
  if (r >= BURLEY_TRUNCATE * d) { return 0.0; }
  let exp_r_3_d = exp(-r / (3.0 * d));
  let exp_r_d = exp_r_3_d * exp_r_3_d * exp_r_3_d;
  return (exp_r_d + exp_r_3_d) / (4.0 * d);
}

fn bssrdf_burley_pdf(d: f32, r: f32) -> f32 {
  if (r <= 0.0) { return 0.0; }
  return bssrdf_burley_eval(d, r) * (1.0 / BURLEY_TRUNCATE_CDF);
}

fn bssrdf_burley_root_find(xi: f32) -> f32 {
  var r = select(15.0, exp(xi * xi * 2.4) - 1.0, xi <= 0.9);
  for (var i = 0u; i < 10u; i++) {
    let exp_r_3 = exp(-r / 3.0);
    let exp_r = exp_r_3 * exp_r_3 * exp_r_3;
    let f = 1.0 - 0.25 * exp_r - 0.75 * exp_r_3 - xi;
    let fp = 0.25 * exp_r + 0.25 * exp_r_3;
    if (abs(f) < 1e-6 || fp == 0.0) { break; }
    r = max(r - f / fp, 0.0);
  }
  return r;
}

fn subsurface_disk_eval_vec(d_vec: vec3<f32>, disk_r: f32, r: f32) -> vec3<f32> {
  let ev = vec3<f32>(
    bssrdf_burley_pdf(d_vec.x, r),
    bssrdf_burley_pdf(d_vec.y, r),
    bssrdf_burley_pdf(d_vec.z, r),
  );
  let pdf = (bssrdf_burley_pdf(d_vec.x, disk_r) + bssrdf_burley_pdf(d_vec.y, disk_r) + bssrdf_burley_pdf(d_vec.z, disk_r)) * (1.0 / 3.0);
  return select(vec3<f32>(0.0), ev / pdf, pdf > 0.0);
}

fn setup_principled_dielectric(
  base_color: vec3<f32>,
  rough_in: f32,
  aniso_in: f32,
  ior_in: f32,
  T_world: vec3<f32>,
  N_diff: vec3<f32>,
  Ng: vec3<f32>,
  Ns: vec3<f32>,
  wi: vec3<f32>,
  min_ray_pdf: f32,
  bump_correct: bool,
  sss_in: f32,
) -> BsdfSetup {
  var s: BsdfSetup;
  let r = clamp(rough_in, 0.0, 1.0);
  let aniso = clamp(aniso_in, 0.0, 1.0);
  var ax = r * r;
  var ay = ax;
  if (aniso > 0.0) {
    let aspect = sqrt(1.0 - aniso * 0.9);
    ax /= aspect;
    ay *= aspect;
  }
  ax = clamp(ax, 1e-4, 1.0);
  ay = clamp(ay, 1e-4, 1.0);

  let N_spec = ensure_valid_specular_reflection(Ng, wi, N_diff);
  var X: vec3<f32>;
  var Y: vec3<f32>;
  if (abs(ax - ay) < 1e-7) {
    make_orthonormals(N_spec, &X, &Y);
  } else {
    make_orthonormals_safe_tangent(N_spec, T_world, &X, &Y);
  }

  let cosNI = max(dot(N_spec, wi), 1e-6);
  let rough_lut = sqrt(sqrt(ax * ay));
  let E = max(aux_lut_read_2d(rough_lut, cosNI, GGX_E_OFFSET, 32u, 32u), 1e-4);
  let Eavg = aux_lut_read_1d(rough_lut, GGX_EAVG_OFFSET, 32u);
  let F0_ratio = (ior_in - 1.0) / (ior_in + 1.0);
  let F0 = F0_ratio * F0_ratio;
  let z_ior = sqrt(abs(F0_ratio));
  let schlick_s = aux_lut_read_3d(rough_lut, cosNI, z_ior, GGX_S_OFFSET, 16u, 16u, 16u);
  let spec_albedo = mix(F0, 1.0, schlick_s);

  let Fss = select(1.0 - (1.0 - ior_in), (ior_in - 1.0) / (4.08567 + 1.00071 * ior_in), ior_in >= 1.0);
  let Fms = (Fss * Eavg) / max(1.0 - Fss * (1.0 - Eavg), 1e-4);
  let missing = (1.0 - E) / E;
  let ms_scale = 1.0 + Fms * missing;
  let darkening = E * ms_scale;

  let cl_base = clamp(base_color, vec3<f32>(0.0), vec3<f32>(1.0));
  let layer_w = clamp(1.0 - darkening * spec_albedo, 0.0, 1.0);
  let sss_f = clamp(sss_in, 0.0, 1.0);
  let diff_weight = cl_base * (1.0 - sss_f) * layer_w;
  let sss_weight = cl_base * sss_f * layer_w;

  let w_spec = darkening * spec_albedo;
  let w_diff = avg3(diff_weight);
  let w_sss = avg3(sss_weight) * 3.0;
  let sum_w = w_spec + w_diff + w_sss;

  let diff_w_alb = smoothstep(0.0, 0.15, sqrt(ax * ay));
  s.denoiseAlbedo = cl_base * layer_w + vec3<f32>(w_spec * diff_w_alb);

  // Cycles filter_glossy = 1.0 blurs GGX alphas after setup & layering (surface_shader.h:199).
  var eval_ax = ax;
  var eval_ay = ay;
  if (min_ray_pdf < 1.0) {
    let blur = sqrt(1.0 - min_ray_pdf) * 0.5;
    eval_ax = max(eval_ax, blur);
    eval_ay = max(eval_ay, blur);
  }
  eval_ax = clamp(eval_ax, 1e-4, 1.0);
  eval_ay = clamp(eval_ay, 1e-4, 1.0);

  s.N_diff = N_diff;
  s.N_spec = N_spec;
  s.Ns = Ns;
  s.X = X;
  s.Y = Y;
  s.ax = eval_ax;
  s.ay = eval_ay;
  s.ior = ior_in;
  s.msScale = ms_scale;
  s.diffWeight = diff_weight;
  s.sssWeight = sss_weight;
  s.specProb = select(0.5, w_spec / sum_w, sum_w > 1e-8);
  s.diffProb = select(0.5, w_diff / sum_w, sum_w > 1e-8);
  s.sssProb = select(0.0, w_sss / sum_w, sum_w > 1e-8);
  s.bumpCorrect = bump_correct;
  return s;
}

fn eval_bsdf_parts(
  b: BsdfSetup,
  wi: vec3<f32>,
  wo: vec3<f32>,
  out_f_spec: ptr<function, vec3<f32>>,
  out_spec_pdf: ptr<function, f32>,
  out_f_diff: ptr<function, vec3<f32>>,
  out_diff_pdf: ptr<function, f32>,
) {
  var f_spec = vec3<f32>(0.0);
  var spec_pdf = 0.0;
  var f_diff = vec3<f32>(0.0);
  var diff_pdf = 0.0;

  let cosNI = dot(b.N_spec, wi);
  let cosNO_spec = dot(b.N_spec, wo);
  if (cosNI > 0.0 && cosNO_spec > 0.0) {
    let H = safe_normalize_fallback(wi + wo, b.N_spec);
    let cosHI = dot(H, wi);
    let F = fresnel_dielectric(cosHI, b.ior);
    let local_H = vec3<f32>(dot(b.X, H), dot(b.Y, H), dot(b.N_spec, H));
    let local_I = vec3<f32>(dot(b.X, wi), dot(b.Y, wi), cosNI);
    let local_O = vec3<f32>(dot(b.X, wo), dot(b.Y, wo), cosNO_spec);
    let D = ggx_d_aniso(b.ax, b.ay, local_H);
    let lamI = ggx_lambda_aniso(b.ax, b.ay, local_I);
    let lamO = ggx_lambda_aniso(b.ax, b.ay, local_O);
    let ggx_common = (D * 0.25) / cosNI;
    spec_pdf = ggx_common / (1.0 + lamI);
    let bs = bump_shadowing_diffuse(b.Ns, b.N_spec, wo, false);
    f_spec = vec3<f32>(F * b.msScale * ggx_common / (1.0 + lamO + lamI)) * bs;
  }

  let cosNO_diff = dot(b.N_diff, wo);
  if (cosNO_diff > 0.0) {
    let df = cosNO_diff * INV_PI;
    diff_pdf = df;
    let bs = bump_shadowing_diffuse(b.Ns, b.N_diff, wo, b.bumpCorrect);
    f_diff = b.diffWeight * (df * bs);
  }

  *out_f_spec = f_spec;
  *out_spec_pdf = spec_pdf;
  *out_f_diff = f_diff;
  *out_diff_pdf = diff_pdf;
}

fn eval_bsdf(b: BsdfSetup, wi: vec3<f32>, wo: vec3<f32>, out_pdf: ptr<function, f32>) -> vec3<f32> {
  var f_spec: vec3<f32>;
  var spec_pdf: f32;
  var f_diff: vec3<f32>;
  var diff_pdf: f32;
  eval_bsdf_parts(b, wi, wo, &f_spec, &spec_pdf, &f_diff, &diff_pdf);
  *out_pdf = b.specProb * spec_pdf + b.diffProb * diff_pdf;
  return f_spec + f_diff;
}

// Sample specular (lobe=1), diffuse (lobe=0), or Burley SSS (lobe=2) while preserving exact MIS PDF.
fn sample_bsdf(
  b: BsdfSetup,
  Ng: vec3<f32>,
  wi: vec3<f32>,
  u_in: vec4<f32>,
  out_wo: ptr<function, vec3<f32>>,
  out_weight: ptr<function, vec3<f32>>,
  out_pdf: ptr<function, f32>,
  out_lobe: ptr<function, u32>,
) -> bool {
  if (b.sssProb > 0.0 && u_in.x >= b.specProb + b.diffProb) {
    *out_weight = b.sssWeight / b.sssProb;
    *out_pdf = 0.0;
    *out_lobe = 2u;
    return max3(*out_weight) > 0.0;
  }

  let choose_spec = u_in.x < b.specProb;
  var wo: vec3<f32>;

  if (choose_spec) {
    let cosNI = dot(b.N_spec, wi);
    if (cosNI <= 0.0) { return false; }
    let local_I = vec3<f32>(dot(b.X, wi), dot(b.Y, wi), cosNI);
    let local_H = microfacet_ggx_sample_vndf(local_I, b.ax, b.ay, u_in.yz);
    let H = local_H.x * b.X + local_H.y * b.Y + local_H.z * b.N_spec;
    let cosHI = dot(H, wi);
    wo = 2.0 * cosHI * H - wi;
    if (dot(Ng, wo) <= 0.0 || dot(b.N_spec, wo) <= 0.0) { return false; }
    *out_lobe = 1u;
  } else {
    let d_xy = sample_uniform_disk(u_in.yz);
    let costheta = sqrt(max(1.0 - dot(d_xy, d_xy), 0.0));
    var T: vec3<f32>;
    var B: vec3<f32>;
    make_orthonormals(b.N_diff, &T, &B);
    wo = normalize(d_xy.x * T + d_xy.y * B + costheta * b.N_diff);
    if (dot(Ng, wo) <= 0.0) { return false; }
    *out_lobe = 0u;
  }

  var f_spec: vec3<f32>;
  var spec_pdf: f32;
  var f_diff: vec3<f32>;
  var diff_pdf: f32;
  eval_bsdf_parts(b, wi, wo, &f_spec, &spec_pdf, &f_diff, &diff_pdf);

  let mix_pdf = b.specProb * spec_pdf + b.diffProb * diff_pdf;
  if (mix_pdf <= 1e-12) { return false; }

  *out_weight = (f_spec + f_diff) / mix_pdf;
  *out_wo = wo;
  *out_pdf = mix_pdf;
  return true;
}

// ---- Floor Card Ring ------------------------------------------------------------------------

fn intersect_floor_ring(o: vec3<f32>, d: vec3<f32>, t_min: f32, t_max: f32, out_t: ptr<function, f32>) -> vec3<f32> {
  if (params.flags.z == 0u || abs(d.z) < 1e-8) { return vec3<f32>(-1.0); }
  let z_ring = params.floorRing0.z + 1e-5;
  let t = (z_ring - o.z) / d.z;
  if (t <= t_min || t >= t_max) { return vec3<f32>(-1.0); }
  let hit = o + t * d;
  let dx = hit.x - params.floorRing0.x;
  let dy = hit.y - params.floorRing0.y;
  let dist = length(vec2<f32>(dx, dy));
  let outer = params.floorRing1.x;
  if (dist > outer) { return vec3<f32>(-1.0); }
  let inner = params.floorRing0.w;
  let az = atan2(dx, -dy);
  let h = 0.5 * cos(az - params.floorRing1.w) + 0.5;
  let rad = params.floorRing1.z + (params.floorRing1.y - params.floorRing1.z) * (h * h);
  let s_t = clamp((dist - inner) / max(outer - inner, 1e-8), 0.0, 1.0);
  let smooth_v = s_t * s_t * (3.0 - 2.0 * s_t);
  let fade = 1.0 - smooth_v;
  *out_t = t;
  return vec3<f32>(max(rad * fade, 0.0));
}

// ---- Main Path Tracer -----------------------------------------------------------------------

fn sample_bh_offset(u: f32) -> f32 {
  let off = params.auxOff.x;
  let res = params.auxOff.z;
  return aux_lut_read_1d(u, off, res);
}

fn camera_ray_unjittered(px: f32, py: f32) -> vec3<f32> {
  let w = f32(params.dims.x);
  let h = f32(params.dims.y);
  let half_h = tan(0.5 * params.camPos.w);
  let half_w = (w / h) * half_h;
  let ndc_x = (px / w) * 2.0 - 1.0;
  let ndc_y = 1.0 - (py / h) * 2.0;
  return normalize(
    params.camFwd.xyz + params.camRight.xyz * (ndc_x * half_w) + params.camUp.xyz * (ndc_y * half_h),
  );
}

fn surface_differentials(
  use_cam: bool,
  jx: f32,
  jy: f32,
  hit_t: f32,
  half_h: f32,
  h_f: f32,
  p_world: vec3<f32>,
  Ng: vec3<f32>,
  out_dx: ptr<function, vec3<f32>>,
  out_dy: ptr<function, vec3<f32>>,
) {
  if (use_cam) {
    let dir_dx = camera_ray_unjittered(jx + 1.0, jy);
    let dir_dy = camera_ray_unjittered(jx, jy + 1.0);
    let denom_x = dot(dir_dx, Ng);
    let denom_y = dot(dir_dy, Ng);
    let t_dx = select(hit_t, dot(p_world - params.camPos.xyz, Ng) / denom_x, abs(denom_x) > 1e-6);
    let t_dy = select(hit_t, dot(p_world - params.camPos.xyz, Ng) / denom_y, abs(denom_y) > 1e-6);
    *out_dx = (params.camPos.xyz + dir_dx * t_dx) - p_world;
    *out_dy = (params.camPos.xyz + dir_dy * t_dy) - p_world;
  } else {
    let px_scale = (hit_t * 2.0 * half_h) / h_f;
    var tx: vec3<f32>;
    var ty: vec3<f32>;
    make_orthonormals(Ng, &tx, &ty);
    *out_dx = tx * px_scale;
    *out_dy = ty * px_scale;
  }
}

fn apply_plate_bump(
  p_local: vec3<f32>,
  n_obj_in: vec3<f32>,
  dPdx_w: vec3<f32>,
  dPdy_w: vec3<f32>,
) -> vec3<f32> {
  let dPdx_o = mat3_mul_w2p(dPdx_w);
  let dPdy_o = mat3_mul_w2p(dPdy_w);
  let fw: f32 = 0.1;
  let Rx = cross(dPdy_o, n_obj_in);
  let Ry = cross(n_obj_in, dPdx_o);
  let det = dot(dPdx_o, Rx);
  let absdet = abs(det);
  if (absdet <= 1e-24) {
    return normal_p2w(n_obj_in);
  }
  let hc = plate_height(p_local);
  let hx = plate_height(p_local + dPdx_o * fw);
  let hy = plate_height(p_local + dPdy_o * fw);
  let surfgrad = (hx - hc) * Rx + (hy - hc) * Ry;
  let sgn = select(-1.0, 1.0, det >= 0.0);
  let bumped_o = safe_normalize_fallback(fw * absdet * n_obj_in - params.partPlate.w * sgn * surfgrad, n_obj_in);
  return normal_p2w(bumped_o);
}

fn apply_backdrop_texture(
  p_world: vec3<f32>,
  use_cam: bool,
  jx: f32,
  jy: f32,
  hit_t: f32,
  half_h: f32,
  h_f: f32,
  Ng: vec3<f32>,
  N_in: vec3<f32>,
  base_col: ptr<function, vec3<f32>>,
  rough: ptr<function, f32>,
  tex: f32,
) -> vec3<f32> {
  // Matches cb_shader_backdrop / render_scene.add_backdrop (object == world for studio mesh).
  let cloud = noise_fbm_3d_int(p_world * 3.2, 3u);
  let tooth = noise_fbm_3d_int(p_world * 34.0, 4u);
  let fine = noise_fbm_3d_int(p_world * 180.0, 4u);

  let ca = 0.58 * tex;
  let ta = 0.36 * tex;
  let fa = 0.44 * tex;
  let albedo_fac = clamp((1.0 - 0.5 * ca + cloud * ca) + (tooth - 0.5) * ta + (fine - 0.5) * fa, 0.5, 1.5);
  *base_col = (*base_col) * albedo_fac;

  let cr = 0.70 * tex;
  let tr = 0.55 * tex;
  *rough = clamp(((*rough) - 0.5 * cr + cloud * cr) + (tooth - 0.5) * tr, 0.05, 1.0);

  var dPdx: vec3<f32>;
  var dPdy: vec3<f32>;
  surface_differentials(use_cam, jx, jy, hit_t, half_h, h_f, p_world, Ng, &dPdx, &dPdy);
  let fw: f32 = 0.1;
  let Rx = cross(dPdy, N_in);
  let Ry = cross(N_in, dPdx);
  let det = dot(dPdx, Rx);
  let absdet = abs(det);
  if (absdet <= 1e-24) {
    return N_in;
  }
  let hx = noise_fbm_3d_int((p_world + dPdx * fw) * 34.0, 4u);
  let hy = noise_fbm_3d_int((p_world + dPdy * fw) * 34.0, 4u);
  let surfgrad = (hx - tooth) * Rx + (hy - tooth) * Ry;
  let sgn = select(-1.0, 1.0, det >= 0.0);
  let bumped = safe_normalize_fallback(fw * absdet * N_in - 0.0008 * sgn * surfgrad, N_in);
  let strength = clamp(0.35 * tex, 0.0, 1.0);
  return safe_normalize_fallback(strength * bumped + (1.0 - strength) * N_in, N_in);
}

fn setup_unit_diffuse_bsdf(N_exit: vec3<f32>, bump_correct: bool) -> BsdfSetup {
  var X_exit: vec3<f32>;
  var Y_exit: vec3<f32>;
  make_orthonormals(N_exit, &X_exit, &Y_exit);
  var s: BsdfSetup;
  s.N_diff = N_exit;
  s.N_spec = N_exit;
  s.Ns = N_exit;
  s.X = X_exit;
  s.Y = Y_exit;
  s.ax = 1.0;
  s.ay = 1.0;
  s.ior = 1.5;
  s.msScale = 1.0;
  s.diffWeight = vec3<f32>(1.0);
  s.sssWeight = vec3<f32>(0.0);
  s.specProb = 0.0;
  s.diffProb = 1.0;
  s.sssProb = 0.0;
  s.denoiseAlbedo = vec3<f32>(1.0);
  s.bumpCorrect = bump_correct;
  return s;
}

fn trace_burley_exit(
  p_entry: vec3<f32>,
  Ng_entry: vec3<f32>,
  entry_backfacing: bool,
  entry_hit_t: f32,
  half_h: f32,
  h_f: f32,
  rng: ptr<function, Rng>,
  out_p: ptr<function, vec3<f32>>,
  out_Ng: ptr<function, vec3<f32>>,
  out_N: ptr<function, vec3<f32>>,
  out_bump_correct: ptr<function, bool>,
  out_weight: ptr<function, vec3<f32>>,
) -> bool {
  // Exact match to Cycles kernel/integrator/subsurface_disk.h + subsurface.h.
  let r_disk = rng_next4(rng);
  var disk_N = Ng_entry;
  var disk_T: vec3<f32>;
  var disk_B: vec3<f32>;
  make_orthonormals(disk_N, &disk_T, &disk_B);

  var pick_pdf_N = 0.5;
  var pick_pdf_T = 0.25;
  var pick_pdf_B = 0.25;
  var u_phi: f32;
  if (r_disk.y < 0.5) {
    u_phi = r_disk.y * 2.0;
  } else if (r_disk.y < 0.75) {
    let tmp = disk_N;
    disk_N = disk_T;
    disk_T = tmp;
    pick_pdf_N = 0.25;
    pick_pdf_T = 0.5;
    pick_pdf_B = 0.25;
    u_phi = (r_disk.y - 0.5) * 4.0;
  } else {
    let tmp = disk_N;
    disk_N = disk_B;
    disk_B = tmp;
    pick_pdf_N = 0.25;
    pick_pdf_T = 0.25;
    pick_pdf_B = 0.5;
    u_phi = (r_disk.y - 0.75) * 4.0;
  }

  let xi3 = r_disk.x * 3.0;
  var d_ch: f32;
  var xi_r: f32;
  if (xi3 < 1.0) {
    d_ch = BURLEY_D.x;
    xi_r = xi3;
  } else if (xi3 < 2.0) {
    d_ch = BURLEY_D.y;
    xi_r = xi3 - 1.0;
  } else {
    d_ch = BURLEY_D.z;
    xi_r = min(xi3 - 2.0, 1.0);
  }
  let disk_r = bssrdf_burley_root_find(xi_r * BURLEY_TRUNCATE_CDF) * d_ch;
  let Rm = BURLEY_TRUNCATE * d_ch;
  let disk_h = sqrt(max(Rm * Rm - disk_r * disk_r, 0.0));
  if (disk_h <= 0.0) { return false; }

  let phi = TWO_PI * u_phi;
  let disk_P = disk_T * (disk_r * cos(phi)) + disk_B * (disk_r * sin(phi));
  let probe_o = p_entry + disk_N * disk_h + disk_P;
  let probe_d = -disk_N;
  let probe_tmax = 2.0 * disk_h;

  var local_hits: array<LocalHit, 4>;
  let num_hits = intersect_part_local(probe_o, probe_d, probe_tmax, rng, &local_hits);
  let num_eval = min(num_hits, 4u);
  if (num_eval == 0u) { return false; }

  var weights: array<vec3<f32>, 4>;
  var hit_Ps: array<vec3<f32>, 4>;
  var hit_Ngs: array<vec3<f32>, 4>;
  var sum_weights = 0.0;
  for (var hi = 0u; hi < num_eval; hi++) {
    let lh = local_hits[hi];
    let tb = lh.prim * 3u;
    let v0 = load_part_pos(partTris[tb]);
    let v1 = load_part_pos(partTris[tb + 1u]);
    let v2 = load_part_pos(partTris[tb + 2u]);
    let w0 = 1.0 - lh.u - lh.v;
    let p_loc = w0 * v0 + lh.u * v1 + lh.v * v2;
    let hit_P = (params.partToWorld * vec4<f32>(p_loc, 1.0)).xyz;
    let Ng_raw = normal_p2w(safe_normalize_fallback(cross(v1 - v0, v2 - v0), vec3<f32>(0.0, 0.0, 1.0)));
    let hit_Ng = select(Ng_raw, -Ng_raw, entry_backfacing);

    let pdf_N = pick_pdf_N * abs(dot(disk_N, hit_Ng));
    let pdf_T = pick_pdf_T * abs(dot(disk_T, hit_Ng));
    let pdf_B = pick_pdf_B * abs(dot(disk_B, hit_Ng));
    let denom = pdf_N * pdf_N + pdf_T * pdf_T + pdf_B * pdf_B;
    var w = select(0.0, pdf_N / denom, denom > 0.0);
    if (num_hits > 4u) {
      w *= f32(num_hits) * 0.25;
    }
    let wt = subsurface_disk_eval_vec(BURLEY_D, disk_r, length(hit_P - p_entry)) * w;
    hit_Ps[hi] = hit_P;
    hit_Ngs[hi] = hit_Ng;
    weights[hi] = wt;
    sum_weights += avg3(abs(wt));
  }
  if (sum_weights <= 0.0) { return false; }

  let resample_t = r_disk.z * sum_weights;
  var partial = 0.0;
  var picked = num_eval - 1u;
  for (var hi = 0u; hi < num_eval; hi++) {
    let sw = avg3(abs(weights[hi]));
    if (sw > 0.0) { picked = hi; }
    partial += sw;
    if (resample_t < partial) {
      picked = hi;
      break;
    }
  }
  let sw_picked = avg3(abs(weights[picked]));
  if (sw_picked <= 0.0) { return false; }
  *out_weight = weights[picked] * (sum_weights / sw_picked);

  let h_sel = local_hits[picked];
  let tb = h_sel.prim * 3u;
  let i0 = partTris[tb];
  let i1 = partTris[tb + 1u];
  let i2 = partTris[tb + 2u];
  let v0 = load_part_pos(i0);
  let v1 = load_part_pos(i1);
  let v2 = load_part_pos(i2);
  let w0 = 1.0 - h_sel.u - h_sel.v;
  let p_loc = w0 * v0 + h_sel.u * v1 + h_sel.v * v2;
  let Ng_loc = safe_normalize_fallback(cross(v1 - v0, v2 - v0), vec3<f32>(0.0, 0.0, 1.0));
  let a0 = partVerts[i0];
  let a1 = partVerts[i1];
  let a2 = partVerts[i2];
  let n0p0 = unpack2x16snorm(a0.x); let n0p1 = unpack2x16snorm(a0.y);
  let n1p0 = unpack2x16snorm(a1.x); let n1p1 = unpack2x16snorm(a1.y);
  let n2p0 = unpack2x16snorm(a2.x); let n2p1 = unpack2x16snorm(a2.y);
  let N_loc_raw = w0 * vec3<f32>(n0p0.x, n0p0.y, n0p1.x) + h_sel.u * vec3<f32>(n1p0.x, n1p0.y, n1p1.x) + h_sel.v * vec3<f32>(n2p0.x, n2p0.y, n2p1.x);
  let N_obj = safe_normalize_fallback(N_loc_raw, Ng_loc);
  let n_obj_in = select(N_obj, -N_obj, entry_backfacing);
  var Ns_exit = normal_p2w(n_obj_in);
  let plate_mask = w0 * n0p1.y + h_sel.u * n1p1.y + h_sel.v * n2p1.y;
  var exit_bump = false;
  if (plate_mask > 0.999 && params.partPlate.y > 0.5) {
    exit_bump = true;
    var dPdx_w: vec3<f32>;
    var dPdy_w: vec3<f32>;
    surface_differentials(false, 0.0, 0.0, entry_hit_t, half_h, h_f, hit_Ps[picked], hit_Ngs[picked], &dPdx_w, &dPdy_w);
    Ns_exit = apply_plate_bump(p_loc, n_obj_in, dPdx_w, dPdy_w);
  }
  *out_p = hit_Ps[picked];
  *out_Ng = hit_Ngs[picked];
  *out_N = Ns_exit;
  *out_bump_correct = exit_bump;
  return true;
}

fn clamp_contrib(c: vec3<f32>, bounce: u32) -> vec3<f32> {
  let lim = select(params.clampFilter.y, params.clampFilter.x, bounce == 0u);
  if (lim <= 0.0) { return c; }
  let s = abs(c.x) + abs(c.y) + abs(c.z);
  if (s > lim) { return c * (lim / s); }
  return c;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.tile.x || gid.y >= params.tile.y) { return; }
  let px = params.dims.z + gid.x;
  let py = params.dims.w + gid.y;
  let width = params.dims.x;
  let height = params.dims.y;
  if (px >= width || py >= height) { return; }

  let pix = py * width + px;
  let sample_idx = params.tile.z;
  var rng = rng_init(px, py, sample_idx);
  let r_pix = cp_qmc2(px, py, sample_idx, 0u, vec2<f32>(0.7548776662, 0.5698402910));
  let r_lens = cp_qmc2(px, py, sample_idx, 1u, vec2<f32>(0.4142135624, 0.7320508076));

  let w_f = f32(width);
  let h_f = f32(height);
  let half_h = tan(0.5 * params.camPos.w);
  let half_w = (w_f / h_f) * half_h;
  let jx = f32(px) + sample_bh_offset(r_pix.x);
  let jy = f32(py) + sample_bh_offset(r_pix.y);
  let ndc_x = (jx / w_f) * 2.0 - 1.0;
  let ndc_y = 1.0 - (jy / h_f) * 2.0;

  let dir_cam = vec3<f32>(ndc_x * half_w, ndc_y * half_h, 1.0);
  let aperture = params.camRight.w;
  var ro = params.camPos.xyz;
  var rd: vec3<f32>;
  var d_cam_z = 1.0;
  if (aperture > 0.0) {
    let focus_dist = params.camUp.w;
    let p_focus = dir_cam * focus_dist;
    let lens = sample_uniform_disk(r_lens) * aperture;
    let p_cam = vec3<f32>(lens.x, lens.y, 0.0);
    let d_cam = normalize(p_focus - p_cam);
    d_cam_z = max(d_cam.z, 1e-4);
    ro += params.camRight.xyz * lens.x + params.camUp.xyz * lens.y;
    rd = normalize(params.camRight.xyz * d_cam.x + params.camUp.xyz * d_cam.y + params.camFwd.xyz * d_cam.z);
  } else {
    let d_cam = normalize(dir_cam);
    d_cam_z = max(d_cam.z, 1e-4);
    rd = normalize(params.camRight.xyz * d_cam.x + params.camUp.xyz * d_cam.y + params.camFwd.xyz * d_cam.z);
  }

  var t_min = params.camFwd.w / d_cam_z;
  var throughput = vec3<f32>(1.0);
  var accum = vec3<f32>(0.0);
  var alpha = 1.0;
  var sc_unoccl = vec3<f32>(0.0);
  var is_shadow_catcher_path = false;
  var sc_active = false;
  var sc_ro = vec3<f32>(0.0);
  var sc_rd = vec3<f32>(0.0);
  var sc_thr = vec3<f32>(0.0);
  var sc_pdf = 0.0;
  var sc_min_pdf = 1e30;
  var sc_diff_b = 0u;
  var sc_gloss_b = 0u;
  var sc_was_glossy = false;
  var sc_terminate = false;
  var sc_rng: Rng;

  var alb_guide = vec3<f32>(0.0);
  var nrm_guide = vec3<f32>(0.0);
  var wrote_guides = false;

  var diff_b = 0u;
  var gloss_b = 0u;
  var prev_on_part = false;
  var prev_was_glossy = false;
  var prev_bsdf_pdf = 0.0;
  var min_ray_pdf = 1e30;
  var terminate_on_surface = false;
  var had_diffuse_ancestor = false;
  var sss_exit_active = false;
  var exit_p = vec3<f32>(0.0);
  var exit_Ng = vec3<f32>(0.0);
  var exit_N = vec3<f32>(0.0);
  var exit_bump_correct = false;

  let max_b = params.bounces.x;
  var bounce = 0u;
  while (bounce <= max_b) {
    let is_sss_exit_now = sss_exit_active;
    var p_world: vec3<f32>;
    var wi: vec3<f32>;
    var Ng: vec3<f32>;
    var Ns: vec3<f32>;
    var N: vec3<f32>;
    var on_part = false;
    var bump_correct = false;
    var is_catcher = false;
    var entry_backfacing = false;
    var entry_hit_t = 0.0;
    var bsdf: BsdfSetup;

    if (is_sss_exit_now) {
      sss_exit_active = false;
      p_world = exit_p;
      Ng = exit_Ng;
      Ns = exit_N;
      N = exit_N;
      wi = exit_Ng;
      on_part = true;
      bump_correct = exit_bump_correct;
      bsdf = setup_unit_diffuse_bsdf(exit_N, exit_bump_correct);
    } else {
      var hit: TriHit;
      hit.t = INF;
      hit.kind = HIT_NONE;
      intersect_part(ro, rd, t_min, &hit);
    intersect_studio(ro, rd, t_min, &hit);

    // Analytic scrims and floor ring visible on indirect bounces (bounce > 0).
    // All scrims and glossy floor-ring geometry physically occlude even non-part rays in Cycles.
    var hit_scrim_idx = EMPTY_CHILD;
    var hit_scrim_ly = 0.0;
    var hit_ring_rad = vec3<f32>(0.0);
    if (bounce > 0u) {
      let n_em = params.flags.w;
      for (var ei = 0u; ei < n_em; ei++) {
        let em = load_emitter(ei);
        if ((em.flags & 1u) == 0u) { continue; }
        var st: f32;
        var ly: f32;
        if (hit_emitter_card(em, ro, rd, t_min, hit.t, &st, &ly)) {
          hit.t = st;
          hit.kind = HIT_SCRIM;
          hit_scrim_idx = ei;
          hit_scrim_ly = ly;
        }
      }
      if (prev_was_glossy) {
        var ring_t = INF;
        let ring_rad = intersect_floor_ring(ro, rd, t_min, hit.t, &ring_t);
        if (ring_rad.x >= 0.0) {
          hit.t = ring_t;
          hit.kind = HIT_FLOOR_RING;
          hit_ring_rad = ring_rad;
        }
      }
      // Analytic area lights (not occluders in Cycles, only hit if closer than geometry/scrims/ring).
      var area_hit_t = hit.t;
      var area_hit_rad = vec3<f32>(0.0);
      var area_hit_pdf = 0.0;
      var area_hit = false;
      let prev_em_w = active_emitter_weight(prev_on_part);
      let prev_em_prob = 1.0 - world_pick_prob(prev_on_part);
      for (var ei = 0u; ei < n_em; ei++) {
        let em = load_emitter(ei);
        if ((em.flags & 1u) != 0u || !emitter_allows(em, prev_on_part)) { continue; }
        var at: f32;
        var ly: f32;
        if (hit_emitter_card(em, ro, rd, t_min, area_hit_t, &at, &ly)) {
          let rad = emitter_eval_radiance(em, rd, ly);
          if (max3(rad) > 0.0) {
            area_hit = true;
            area_hit_t = at;
            area_hit_rad = rad;
            area_hit_pdf = emitter_solid_angle_pdf(em, ro, rd, at) * (em.selectWeight / max(prev_em_w, 1e-8)) * prev_em_prob;
          }
        }
      }
      if (area_hit) {
        let mis_w = (prev_bsdf_pdf * prev_bsdf_pdf) / max(prev_bsdf_pdf * prev_bsdf_pdf + area_hit_pdf * area_hit_pdf, 1e-16);
        let contrib = clamp_contrib(throughput * area_hit_rad * mis_w, bounce - 1u);
        accum += contrib;
        break;
      }
    }

    if (hit.kind == HIT_NONE) {
      let bg = hdr_eval(rd);
      if (bounce == 0u) {
        if (params.bounces.w != 0u) {
          alpha = 0.0;
        } else {
          accum += bg;
        }
        if (!wrote_guides) {
          alb_guide = clamp(bg, vec3<f32>(0.0), vec3<f32>(1.0));
          nrm_guide = vec3<f32>(0.0, 0.0, 1.0);
        }
      } else {
        let w_prob = world_pick_prob(prev_on_part);
        let p_world = hdr_pdf(rd) * w_prob;
        let mis_w = select(1.0, (prev_bsdf_pdf * prev_bsdf_pdf) / max(prev_bsdf_pdf * prev_bsdf_pdf + p_world * p_world, 1e-16), p_world > 0.0);
        let contrib = clamp_contrib(throughput * bg * mis_w, bounce - 1u);
        accum += contrib;
      }
      break;
    }

    if (hit.kind == HIT_SCRIM) {
      let em = load_emitter(hit_scrim_idx);
      if (emitter_allows(em, prev_on_part)) {
        let rad = emitter_eval_radiance(em, rd, hit_scrim_ly);
        let em_w = active_emitter_weight(prev_on_part);
        let em_prob = 1.0 - world_pick_prob(prev_on_part);
        let p_em = emitter_solid_angle_pdf(em, ro, rd, hit.t) * (em.selectWeight / max(em_w, 1e-8)) * em_prob;
        let mis_w = (prev_bsdf_pdf * prev_bsdf_pdf) / max(prev_bsdf_pdf * prev_bsdf_pdf + p_em * p_em, 1e-16);
        let contrib = clamp_contrib(throughput * rad * mis_w, bounce - 1u);
        accum += contrib;
      }
      break;
    }

    if (hit.kind == HIT_FLOOR_RING) {
      if (prev_on_part) {
        accum += clamp_contrib(throughput * hit_ring_rad, bounce - 1u);
      }
      break;
    }

    if (terminate_on_surface) { break; }

      // ---- Surface intersection ----
      t_min = 0.0;
      p_world = ro + rd * hit.t;
      wi = -rd;
      entry_hit_t = hit.t;
      var T_world = vec3<f32>(0.0);
      var base_color: vec3<f32>;
      var rough_val: f32;
      var aniso_val: f32 = 0.0;
      var ior_val: f32 = 1.5;

      if (hit.kind == HIT_PART) {
        on_part = true;
        let tb = hit.prim * 3u;
        let i0 = partTris[tb];
        let i1 = partTris[tb + 1u];
        let i2 = partTris[tb + 2u];
        let v0 = load_part_pos(i0);
        let v1 = load_part_pos(i1);
        let v2 = load_part_pos(i2);
        let w0 = 1.0 - hit.u - hit.v;
        let p_local = w0 * v0 + hit.u * v1 + hit.v * v2;

        var Ng_local = normalize(cross(v1 - v0, v2 - v0));
        let Ng_w_raw = normal_p2w(Ng_local);
        entry_backfacing = dot(rd, Ng_w_raw) > 0.0;
        Ng = select(Ng_w_raw, -Ng_w_raw, entry_backfacing);

        let a0 = partVerts[i0];
        let a1 = partVerts[i1];
        let a2 = partVerts[i2];

        let n0p0 = unpack2x16snorm(a0.x); let n0p1 = unpack2x16snorm(a0.y);
        let n1p0 = unpack2x16snorm(a1.x); let n1p1 = unpack2x16snorm(a1.y);
        let n2p0 = unpack2x16snorm(a2.x); let n2p1 = unpack2x16snorm(a2.y);

        let N_local_raw = w0 * vec3<f32>(n0p0.x, n0p0.y, n0p1.x) + hit.u * vec3<f32>(n1p0.x, n1p0.y, n1p1.x) + hit.v * vec3<f32>(n2p0.x, n2p0.y, n2p1.x);
        var Ns_w = normal_p2w(safe_normalize_fallback(N_local_raw, Ng_local));
        if (entry_backfacing) { Ns_w = -Ns_w; }
        Ns = Ns_w;
        N = Ns_w;

        let t0p0 = unpack2x16snorm(a0.z); let t0w = unpack2x16snorm(a0.w).x;
        let t1p0 = unpack2x16snorm(a1.z); let t1w = unpack2x16snorm(a1.w).x;
        let t2p0 = unpack2x16snorm(a2.z); let t2w = unpack2x16snorm(a2.w).x;
        let pt_raw = w0 * vec3<f32>(t0p0.x, t0p0.y, t0w) + hit.u * vec3<f32>(t1p0.x, t1p0.y, t1w) + hit.v * vec3<f32>(t2p0.x, t2p0.y, t2w);
        // Matches cb_shader_bead: cross(geometry.Normal (world), path_tangent (raw attribute))
        T_world = cross(N, pt_raw);

        let r0_h = unpack2x16float(a0.w).y;
        let r1_h = unpack2x16float(a1.w).y;
        let r2_h = unpack2x16float(a2.w).y;
        var bead_r = w0 * r0_h + hit.u * r1_h + hit.v * r2_h;
        let mottle_amp = params.partRough.z;
        if (mottle_amp > 0.0) {
          let m_noise = noise_fbm_3d_int(p_local * params.partRough.y, 3u);
          bead_r += (m_noise - 0.5) * mottle_amp;
        }
        bead_r = clamp(bead_r, params.partRough.w, 1.0);

        let plate_mask = w0 * n0p1.y + hit.u * n1p1.y + hit.v * n2p1.y;
        let is_plate = plate_mask > 0.999;

        base_color = params.partColorIor.xyz;
        ior_val = params.partColorIor.w;
        rough_val = select(bead_r, params.partPlate.x, is_plate);
        let wear = params.partRealism.x;
        if (wear > 0.0) {
          let smudge_amp = 1.05 * wear;
          let scuff_amp = 0.65 * wear;
          let smudge = (noise_fbm_3d_int(p_local * 32.0, 2u) - 0.5) * smudge_amp;
          let scuff = (noise_fbm_3d_int(p_local * 180.0, 3u) - 0.5) * scuff_amp;
          rough_val = clamp(rough_val + smudge + scuff, params.partRough.w, 1.0);
        }
        aniso_val = select(params.partRough.x, 0.0, is_plate);

        let dust = params.partRealism.y;
        if (dust > 0.0) {
          let vor = voronoi_3d_f1_dist_col_r(p_local * 300.0);
          let shape = clamp(1.0 / 0.35 - vor.x / (0.35 * 0.088), 0.0, 1.0);
          let keep_lo = 0.94 - 0.16 * dust;
          let keep = clamp((vor.y - keep_lo) / (1.0 - keep_lo), 0.0, 1.0);
          let up = clamp((Ns.z - 0.15) / 0.65, 0.0, 1.0);
          let settle = 0.10 + 0.90 * up * up;
          let mask = clamp(shape * keep * settle * (0.45 + 0.45 * dust), 0.0, 1.0);
          base_color = mix(base_color, vec3<f32>(0.48, 0.46, 0.42), clamp(mask * 0.85, 0.0, 1.0));
          rough_val = rough_val + mask * (0.92 - rough_val);
          aniso_val *= (1.0 - mask);
        }

        if (is_plate && params.partPlate.y > 0.5) {
          bump_correct = true;
          var dPdx_w: vec3<f32>;
          var dPdy_w: vec3<f32>;
          surface_differentials(bounce == 0u, jx, jy, hit.t, half_h, h_f, p_world, Ng, &dPdx_w, &dPdy_w);
          let N_obj = safe_normalize_fallback(N_local_raw, Ng_local);
          let n_obj_in = select(N_obj, -N_obj, entry_backfacing);
          N = apply_plate_bump(p_local, n_obj_in, dPdx_w, dPdy_w);
        }
      } else {
        // HIT_STUDIO
        let tri = studioBuf[params.studioOff.x + hit.prim];
        let pos_off = params.studioOff.y;
        let norm_off = params.studioOff.z;
        let mats_off = params.studioOff.w;
        let p0 = load_studio_vec3(pos_off, tri.x);
        let p1 = load_studio_vec3(pos_off, tri.y);
        let p2 = load_studio_vec3(pos_off, tri.z);
        let n0 = load_studio_vec3(norm_off, tri.x);
        let n1 = load_studio_vec3(norm_off, tri.y);
        let n2 = load_studio_vec3(norm_off, tri.z);
        let w0 = 1.0 - hit.u - hit.v;

        let Ng_raw = normalize(cross(p1 - p0, p2 - p0));
        let backfacing = dot(rd, Ng_raw) > 0.0;
        Ng = select(Ng_raw, -Ng_raw, backfacing);
        let N_raw = safe_normalize_fallback(w0 * n0 + hit.u * n1 + hit.v * n2, Ng_raw);
        N = select(N_raw, -N_raw, backfacing);
        Ns = N;

        let m0 = bitcast<vec4<f32>>(studioBuf[mats_off + tri.w * 2u + 0u]);
        let m1 = bitcast<vec4<f32>>(studioBuf[mats_off + tri.w * 2u + 1u]);
        base_color = m0.xyz;
        rough_val = m0.w;
        is_catcher = m1.x > 0.5;
        if (m1.y > 0.0) {
          N = apply_backdrop_texture(p_world, bounce == 0u, jx, jy, hit.t, half_h, h_f, Ng, N, &base_color, &rough_val, m1.y);
          bump_correct = true;
        }
      }

      if (bounce == 0u && is_catcher) {
        is_shadow_catcher_path = true;
      }

      bsdf = setup_principled_dielectric(
        base_color, rough_val, aniso_val, ior_val, T_world, N, Ng, Ns, wi, min_ray_pdf, bump_correct,
        select(0.0, params.partRealism.z, on_part && !had_diffuse_ancestor),
      );

      if (!wrote_guides) {
        wrote_guides = true;
        alb_guide = bsdf.denoiseAlbedo;
        // Camera-space normal matching Cycles denoising_passes.h:153.
        nrm_guide = vec3<f32>(dot(N, params.camRight.xyz), dot(N, params.camUp.xyz), dot(N, params.camFwd.xyz));
      }
    }

    // ---- Next Event Estimation (NEE + MIS) ----
    let em_w = active_emitter_weight(on_part);
    let w_prob = world_pick_prob(on_part);
    let has_ems = em_w > 0.0;
    let has_hdr = w_prob > 0.0;
    if (has_ems || has_hdr) {
      var rn: vec4<f32>;
      if (bounce == 0u && !is_sss_exit_now) {
        let qx = cp_qmc1(px, py, sample_idx, 2u, 0.6180339887);
        let qyz = cp_qmc2(px, py, sample_idx, 3u, vec2<f32>(0.2360679775, 0.6457513111));
        rn = vec4<f32>(qx, qyz.x, qyz.y, 0.0);
      } else {
        rn = rng_next4(&rng);
      }
      let do_world = has_hdr && (!has_ems || rn.x < w_prob);
      let pick_prob = select(1.0 - w_prob, w_prob, do_world);
      let s_orig = offset_ray(p_world, Ng);

      if (do_world) {
        var wd: vec3<f32>;
        var wpdf: f32;
        let Le = hdr_sample(rn.yz, &wd, &wpdf);
        let total_pdf = wpdf * pick_prob;
        if (total_pdf > 0.0 && max3(Le) > 0.0 && dot(Ng, wd) > 0.0) {
          var bpdf: f32;
          let f = eval_bsdf(bsdf, wi, wd, &bpdf);
          if (max3(f) > 0.0) {
            let mis_w = (total_pdf * total_pdf) / max(total_pdf * total_pdf + bpdf * bpdf, 1e-16);
            let term = clamp_contrib((throughput * f * Le * mis_w) / total_pdf, bounce);
            let hit_part = occluded_part(s_orig, wd, 0.0, INF);
            let hit_other = hit_part || occluded_studio(s_orig, wd, 0.0, INF) || occluded_scrim(s_orig, wd, 0.0, INF, EMPTY_CHILD);
            if (!hit_other) { accum += term; }
            if (bounce == 0u && is_shadow_catcher_path) {
              let hit_c = occluded_studio_ex(s_orig, wd, 0.0, INF, true);
              if (!hit_c) { sc_unoccl += term; }
            }
          }
        }
      } else {
        let n_em = params.flags.w;
        let u_em = select(rn.x, (rn.x - w_prob) / max(1.0 - w_prob, 1e-6), has_hdr);
        var target_w = u_em * em_w;
        var picked_idx = EMPTY_CHILD;
        for (var ei = 0u; ei < n_em; ei++) {
          let em_cand = load_emitter(ei);
          if (!emitter_allows(em_cand, on_part)) { continue; }
          picked_idx = ei;
          if (target_w <= em_cand.selectWeight) { break; }
          target_w -= em_cand.selectWeight;
        }
        if (picked_idx != EMPTY_CHILD) {
          let em = load_emitter(picked_idx);
          let sel_pdf = (em.selectWeight / max(em_w, 1e-8)) * pick_prob;
          var lx: f32;
          var ly: f32;
          if ((em.flags & 2u) != 0u) {
            let disk = sample_uniform_disk(rn.yz);
            lx = disk.x * 0.5 * em.sizeX;
            ly = disk.y * 0.5 * em.sizeY;
          } else {
            lx = (rn.y - 0.5) * em.sizeX;
            ly = (rn.z - 0.5) * em.sizeY;
          }
          let light_p = em.centre + em.xAxis * lx + em.yAxis * ly;
          var dist: f32;
          let ld = safe_normalize_len(light_p - s_orig, &dist);
          if (dist > 1e-6 && dot(Ng, ld) > 0.0) {
            let Le = emitter_eval_radiance(em, ld, ly);
            let l_pdf = emitter_solid_angle_pdf(em, s_orig, ld, dist) * sel_pdf;
            if (l_pdf > 0.0 && max3(Le) > 0.0) {
              var bpdf: f32;
              let f = eval_bsdf(bsdf, wi, ld, &bpdf);
              if (max3(f) > 0.0) {
                let mis_w = (l_pdf * l_pdf) / max(l_pdf * l_pdf + bpdf * bpdf, 1e-16);
                let term = clamp_contrib((throughput * f * Le * mis_w) / l_pdf, bounce);
                let max_shadow = dist * (1.0 - 1e-4);
                let skip_sc = select(EMPTY_CHILD, picked_idx, (em.flags & 1u) != 0u);
                let hit_other = occluded_part(s_orig, ld, 0.0, max_shadow)
                  || occluded_studio(s_orig, ld, 0.0, max_shadow)
                  || occluded_scrim(s_orig, ld, 0.0, max_shadow, skip_sc);
                if (!hit_other) { accum += term; }
                if (bounce == 0u && is_shadow_catcher_path && (em.flags & 1u) == 0u) {
                  let hit_c = occluded_studio_ex(s_orig, ld, 0.0, max_shadow, true);
                  if (!hit_c) { sc_unoccl += term; }
                }
              }
            }
          }
        }
      }
    }

    if (bounce >= max_b) { break; }

    var wo: vec3<f32>;
    var b_weight: vec3<f32>;
    var b_pdf: f32;
    var lobe: u32 = 0u;
    var r_bsdf: vec4<f32>;
    if (bounce == 0u && !is_sss_exit_now) {
      let bx = cp_qmc1(px, py, sample_idx, 4u, 0.3027756377);
      let byz = cp_qmc2(px, py, sample_idx, 5u, vec2<f32>(0.3166247904, 0.6055512755));
      r_bsdf = vec4<f32>(bx, byz.x, byz.y, 0.0);
    } else {
      r_bsdf = rng_next4(&rng);
    }
    if (!sample_bsdf(bsdf, Ng, wi, r_bsdf, &wo, &b_weight, &b_pdf, &lobe)) { break; }

    if (lobe == 2u) {
      throughput *= b_weight;
      if (max3(throughput) <= 0.0) { break; }
      var exit_weight = vec3<f32>(0.0);
      if (!trace_burley_exit(
        p_world, Ng, entry_backfacing, entry_hit_t, half_h, h_f, &rng,
        &exit_p, &exit_Ng, &exit_N, &exit_bump_correct, &exit_weight,
      )) {
        break;
      }
      throughput *= exit_weight;
      if (max3(throughput) <= 0.0) { break; }
      sss_exit_active = true;
      continue;
    }

    let is_glossy = lobe == 1u;
    if (!is_glossy) {
      had_diffuse_ancestor = true;
    }
    if (is_glossy) {
      gloss_b += 1u;
    } else {
      diff_b += 1u;
    }
    terminate_on_surface = (bounce + 1u >= max_b)
      || (is_glossy && gloss_b >= params.bounces.z)
      || (!is_glossy && diff_b >= params.bounces.y);

    throughput *= b_weight;
    if (max3(throughput) <= 0.0) { break; }

    // Russian roulette after bounce 2
    if (bounce >= 2u) {
      let q = clamp(max3(throughput), 0.05, 0.95);
      if (rng_next4(&rng).w > q) { break; }
      throughput /= q;
    }

    ro = offset_ray(p_world, Ng);
    rd = wo;
    prev_on_part = on_part;
    prev_was_glossy = is_glossy;
    prev_bsdf_pdf = b_pdf;
    min_ray_pdf = min(min_ray_pdf, b_pdf);
    if (bounce == 0u && is_shadow_catcher_path) {
      sc_active = true;
      sc_ro = ro;
      sc_rd = rd;
      sc_thr = throughput;
      sc_pdf = prev_bsdf_pdf;
      sc_min_pdf = min_ray_pdf;
      sc_diff_b = diff_b;
      sc_gloss_b = gloss_b;
      sc_was_glossy = is_glossy;
      sc_terminate = terminate_on_surface;
      sc_rng = rng;
    }
    bounce += 1u;
  }

  let sc_occl = accum;
  if (sc_active) {
    var s_ro = sc_ro;
    var s_rd = sc_rd;
    var s_thr = sc_thr;
    var s_prev_pdf = sc_pdf;
    var s_min_pdf = sc_min_pdf;
    var s_diff_b = sc_diff_b;
    var s_gloss_b = sc_gloss_b;
    var s_prev_was_glossy = sc_was_glossy;
    var s_terminate = sc_terminate;
    var s_rng = sc_rng;
    for (var b_sc = 1u; b_sc <= max_b; b_sc++) {
      var hit_sc: TriHit;
      hit_sc.t = INF;
      hit_sc.kind = HIT_NONE;
      intersect_studio_ex(s_ro, s_rd, 0.0, &hit_sc, true);

      let n_em = params.flags.w;
      if (s_prev_was_glossy) {
        var ring_t = INF;
        let ring_rad = intersect_floor_ring(s_ro, s_rd, 0.0, hit_sc.t, &ring_t);
        if (ring_rad.x >= 0.0) {
          hit_sc.t = ring_t;
          hit_sc.kind = HIT_FLOOR_RING;
        }
      }
      var area_hit_t = hit_sc.t;
      var area_hit_rad = vec3<f32>(0.0);
      var area_hit_pdf = 0.0;
      var area_hit = false;
      let sc_em_w = active_emitter_weight(false);
      let sc_w_prob = world_pick_prob(false);
      let sc_em_prob = 1.0 - sc_w_prob;
      for (var ei = 0u; ei < n_em; ei++) {
        let em = load_emitter(ei);
        if ((em.flags & 1u) != 0u || !emitter_allows(em, false)) { continue; }
        var at: f32;
        var ly: f32;
        if (hit_emitter_card(em, s_ro, s_rd, 0.0, area_hit_t, &at, &ly)) {
          let rad = emitter_eval_radiance(em, s_rd, ly);
          if (max3(rad) > 0.0) {
            area_hit = true;
            area_hit_t = at;
            area_hit_rad = rad;
            area_hit_pdf = emitter_solid_angle_pdf(em, s_ro, s_rd, at) * (em.selectWeight / max(sc_em_w, 1e-8)) * sc_em_prob;
          }
        }
      }
      if (area_hit) {
        let mis_w = (s_prev_pdf * s_prev_pdf) / max(s_prev_pdf * s_prev_pdf + area_hit_pdf * area_hit_pdf, 1e-16);
        sc_unoccl += clamp_contrib(s_thr * area_hit_rad * mis_w, b_sc - 1u);
        break;
      }
      if (hit_sc.kind == HIT_NONE) {
        let bg = hdr_eval(s_rd);
        let p_world = hdr_pdf(s_rd) * sc_w_prob;
        let mis_w = select(1.0, (s_prev_pdf * s_prev_pdf) / max(s_prev_pdf * s_prev_pdf + p_world * p_world, 1e-16), p_world > 0.0);
        sc_unoccl += clamp_contrib(s_thr * bg * mis_w, b_sc - 1u);
        break;
      }
      if (hit_sc.kind == HIT_FLOOR_RING) {
        break;
      }
      if (s_terminate) { break; }

      let p_sc = s_ro + s_rd * hit_sc.t;
      let wi_sc = -s_rd;
      let tri = studioBuf[params.studioOff.x + hit_sc.prim];
      let pos_off = params.studioOff.y;
      let norm_off = params.studioOff.z;
      let mats_off = params.studioOff.w;
      let p0 = load_studio_vec3(pos_off, tri.x);
      let p1 = load_studio_vec3(pos_off, tri.y);
      let p2 = load_studio_vec3(pos_off, tri.z);
      let n0 = load_studio_vec3(norm_off, tri.x);
      let n1 = load_studio_vec3(norm_off, tri.y);
      let n2 = load_studio_vec3(norm_off, tri.z);
      let w0 = 1.0 - hit_sc.u - hit_sc.v;
      let Ng_raw = normalize(cross(p1 - p0, p2 - p0));
      let backfacing = dot(s_rd, Ng_raw) > 0.0;
      let Ng_sc = select(Ng_raw, -Ng_raw, backfacing);
      let N_raw = safe_normalize_fallback(w0 * n0 + hit_sc.u * n1 + hit_sc.v * n2, Ng_raw);
      var N_sc = select(N_raw, -N_raw, backfacing);
      let m0 = bitcast<vec4<f32>>(studioBuf[mats_off + tri.w * 2u + 0u]);
      let m1 = bitcast<vec4<f32>>(studioBuf[mats_off + tri.w * 2u + 1u]);
      var sc_col = m0.xyz;
      var sc_rough = m0.w;
      var sc_bump = false;
      if (m1.y > 0.0) {
        N_sc = apply_backdrop_texture(p_sc, false, 0.0, 0.0, hit_sc.t, half_h, h_f, Ng_sc, N_sc, &sc_col, &sc_rough, m1.y);
        sc_bump = true;
      }
      let bsdf_sc = setup_principled_dielectric(sc_col, sc_rough, 0.0, 1.5, vec3<f32>(0.0), N_sc, Ng_sc, N_sc, wi_sc, s_min_pdf, sc_bump, 0.0);

      let has_ems = sc_em_w > 0.0;
      let has_hdr = sc_w_prob > 0.0;
      if (has_ems || has_hdr) {
        let rn = rng_next4(&s_rng);
        let do_world = has_hdr && (!has_ems || rn.x < sc_w_prob);
        let pick_prob = select(1.0 - sc_w_prob, sc_w_prob, do_world);
        let s_orig = offset_ray(p_sc, Ng_sc);
        if (do_world) {
          var wd: vec3<f32>;
          var wpdf: f32;
          let Le = hdr_sample(rn.yz, &wd, &wpdf);
          let total_pdf = wpdf * pick_prob;
          if (total_pdf > 0.0 && max3(Le) > 0.0 && dot(Ng_sc, wd) > 0.0) {
            var bpdf: f32;
            let f = eval_bsdf(bsdf_sc, wi_sc, wd, &bpdf);
            if (max3(f) > 0.0) {
              let mis_w = (total_pdf * total_pdf) / max(total_pdf * total_pdf + bpdf * bpdf, 1e-16);
              let hit_c = occluded_studio_ex(s_orig, wd, 0.0, INF, true);
              if (!hit_c) { sc_unoccl += clamp_contrib((s_thr * f * Le * mis_w) / total_pdf, b_sc); }
            }
          }
        } else {
          let u_em = select(rn.x, (rn.x - sc_w_prob) / max(1.0 - sc_w_prob, 1e-6), has_hdr);
          var target_w = u_em * sc_em_w;
          var picked_idx = EMPTY_CHILD;
          for (var ei = 0u; ei < n_em; ei++) {
            let em_cand = load_emitter(ei);
            if (!emitter_allows(em_cand, false)) { continue; }
            picked_idx = ei;
            if (target_w <= em_cand.selectWeight) { break; }
            target_w -= em_cand.selectWeight;
          }
          if (picked_idx != EMPTY_CHILD) {
            let em = load_emitter(picked_idx);
            if ((em.flags & 1u) == 0u) {
              let sel_pdf = (em.selectWeight / max(sc_em_w, 1e-8)) * pick_prob;
              var lx: f32;
              var ly: f32;
              if ((em.flags & 2u) != 0u) {
                let disk = sample_uniform_disk(rn.yz);
                lx = disk.x * 0.5 * em.sizeX;
                ly = disk.y * 0.5 * em.sizeY;
              } else {
                lx = (rn.y - 0.5) * em.sizeX;
                ly = (rn.z - 0.5) * em.sizeY;
              }
              let light_p = em.centre + em.xAxis * lx + em.yAxis * ly;
              var dist: f32;
              let ld = safe_normalize_len(light_p - s_orig, &dist);
              if (dist > 1e-6 && dot(Ng_sc, ld) > 0.0) {
                let Le = emitter_eval_radiance(em, ld, ly);
                let l_pdf = emitter_solid_angle_pdf(em, s_orig, ld, dist) * sel_pdf;
                if (l_pdf > 0.0 && max3(Le) > 0.0) {
                  var bpdf: f32;
                  let f = eval_bsdf(bsdf_sc, wi_sc, ld, &bpdf);
                  if (max3(f) > 0.0) {
                    let mis_w = (l_pdf * l_pdf) / max(l_pdf * l_pdf + bpdf * bpdf, 1e-16);
                    let max_shadow = dist * (1.0 - 1e-4);
                    let hit_c = occluded_studio_ex(s_orig, ld, 0.0, max_shadow, true);
                    if (!hit_c) { sc_unoccl += clamp_contrib((s_thr * f * Le * mis_w) / l_pdf, b_sc); }
                  }
                }
              }
            }
          }
        }
      }

      if (b_sc >= max_b) { break; }
      var wo_sc: vec3<f32>;
      var bw_sc: vec3<f32>;
      var bp_sc: f32;
      var lobe_sc: u32 = 0u;
      let r_sc = rng_next4(&s_rng);
      if (!sample_bsdf(bsdf_sc, Ng_sc, wi_sc, r_sc, &wo_sc, &bw_sc, &bp_sc, &lobe_sc)) { break; }
      let gl_sc = lobe_sc == 1u;
      if (gl_sc) {
        s_gloss_b += 1u;
      } else {
        s_diff_b += 1u;
      }
      s_terminate = (b_sc + 1u >= max_b)
        || (gl_sc && s_gloss_b >= params.bounces.z)
        || (!gl_sc && s_diff_b >= params.bounces.y);
      s_thr *= bw_sc;
      if (max3(s_thr) <= 0.0) { break; }
      if (b_sc >= 2u) {
        let q = clamp(max3(s_thr), 0.05, 0.95);
        if (rng_next4(&s_rng).w > q) { break; }
        s_thr /= q;
      }
      s_ro = offset_ray(p_sc, Ng_sc);
      s_rd = wo_sc;
      s_prev_pdf = bp_sc;
      s_min_pdf = min(s_min_pdf, bp_sc);
      s_prev_was_glossy = gl_sc;
    }
  }

  let base_out = pix * 3u;
  if (params.flags.y != 0u && is_shadow_catcher_path) {
    let sc_base = width * height * 3u + pix * 2u;
    accumBuf[sc_base + 0u] += vec4<f32>(sc_occl, 1.0);
    accumBuf[sc_base + 1u] += vec4<f32>(sc_unoccl, 1.0);
  } else {
    accumBuf[base_out + 0u] += vec4<f32>(accum, alpha);
  }
  accumBuf[base_out + 1u] += vec4<f32>(alb_guide, 1.0);
  accumBuf[base_out + 2u] += vec4<f32>(nrm_guide, 1.0);
}
`;

export const RESOLVE_WGSL = /* wgsl */ `
struct ResolveParams {
  dims: vec4<u32>, // width, height, sampleCount, hasShadowCatcher
};

@group(0) @binding(0) var<uniform> params: ResolveParams;
@group(0) @binding(1) var<storage, read> accumBuf: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> outRgba: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outAlbedo: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> outNormal: array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let width = params.dims.x;
  let height = params.dims.y;
  if (gid.x >= width || gid.y >= height) { return; }
  let pix = gid.y * width + gid.x;
  let inv_s = 1.0 / f32(max(params.dims.z, 1u));
  let base_in = pix * 3u;
  let fg = accumBuf[base_in + 0u] * inv_s;

  if (params.dims.w != 0u) {
    let sc_base = width * height * 3u + pix * 2u;
    let sc0 = accumBuf[sc_base + 0u];
    let sc1 = accumBuf[sc_base + 1u];
    var shadow_a = 0.0;
    if (sc0.w > 0.0) {
      let ratio = vec3<f32>(
        select(1.0, sc0.x / sc1.x, sc1.x > 1e-6),
        select(1.0, sc0.y / sc1.y, sc1.y > 1e-6),
        select(1.0, sc0.z / sc1.z, sc1.z > 1e-6),
      );
      let shadow = clamp((ratio.x + ratio.y + ratio.z) * (1.0 / 3.0), 0.0, 1.0);
      shadow_a = (sc0.w * inv_s) * (1.0 - shadow);
    }
    outRgba[pix] = vec4<f32>(fg.rgb, clamp(fg.a + shadow_a, 0.0, 1.0));
  } else {
    outRgba[pix] = fg;
  }

  let alb = accumBuf[base_in + 1u].xyz * inv_s;
  let nrm = accumBuf[base_in + 2u].xyz * inv_s;
  let n_len2 = dot(nrm, nrm);
  let nrm_unit = select(vec3<f32>(0.0, 0.0, 1.0), nrm * inverseSqrt(n_len2), n_len2 > 1e-12);
  outAlbedo[pix] = vec4<f32>(alb, 1.0);
  outNormal[pix] = vec4<f32>(nrm_unit, 1.0);
}
`;
