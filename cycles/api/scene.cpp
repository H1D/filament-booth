/* SPDX-License-Identifier: Apache-2.0
 *
 * Scene content: meshes with named attributes, the fixed booth materials, area lights, scrims,
 * the floor card ring and the world. Each material graph mirrors the node tree that
 * tools/blender/render_scene.py builds in native Blender.
 */

#include <cmath>
#include <cstring>

#include "booth.h"

#include "scene/background.h"
#include "scene/image.h"
#include "scene/image_loader.h"
#include "scene/light.h"
#include "scene/mesh.h"
#include "scene/object.h"
#include "scene/shader.h"
#include "scene/shader_graph.h"
#include "scene/shader_nodes.h"
#include "util/image_metadata.h"
#include "util/transform.h"

namespace cb {

namespace {

/* A part-local point is on the plate face when the interpolated mask is 1. Vertices on the bed
 * carry 1, so this keeps the plate look off the bead walls that touch the bed along one edge. */
constexpr float PLATE_MASK_THRESHOLD = 0.999f;
/* The plate grit noise runs this much finer than the Voronoi craters (25000 / 6000 in the
 * reference material). */
constexpr float GRIT_PER_GRAIN = 25000.0f / 6000.0f;
constexpr float GRIT_WEIGHT = 0.35f;
constexpr int RING_SEGMENTS = 256;
constexpr int ELLIPSE_SEGMENTS = 64;
/* Glossy rays must meet the ring before the floor it lies on. */
constexpr float RING_LIFT_M = 1e-5f;

Shader *add_shader(Scene *scene, const char *name, unique_ptr<ShaderGraph> graph)
{
  Shader *shader = scene->create_node<Shader>();
  shader->name = name;
  shader->set_graph(std::move(graph));
  shader->tag_update(scene);
  return shader;
}

int keep_shader(Shader *shader)
{
  booth().shaders.push_back(shader);
  return int(booth().shaders.size()) - 1;
}

MathNode *math(ShaderGraph *graph, NodeMathType type, float a = 0.0f, float b = 0.0f,
               float c = 0.0f)
{
  MathNode *node = graph->create_node<MathNode>();
  node->set_math_type(type);
  node->set_value1(a);
  node->set_value2(b);
  node->set_value3(c);
  return node;
}

AttributeNode *attribute(ShaderGraph *graph, const char *name)
{
  AttributeNode *node = graph->create_node<AttributeNode>();
  node->set_attribute(ustring(name));
  return node;
}

/* Blender's Noise Texture with its factory settings except scale and detail. */
NoiseTextureNode *noise(ShaderGraph *graph, float scale, float detail)
{
  NoiseTextureNode *node = graph->create_node<NoiseTextureNode>();
  node->set_dimensions(3);
  node->set_type(NODE_NOISE_FBM);
  node->set_use_normalize(true);
  node->set_scale(scale);
  node->set_detail(detail);
  node->set_roughness(0.5f);
  node->set_lacunarity(2.0f);
  node->set_distortion(0.0f);
  return node;
}

Transform frame_transform(const float3 x, const float3 y, const float3 z, const float3 p)
{
  return make_transform(x.x, y.x, z.x, p.x, x.y, y.y, z.y, p.y, x.z, y.z, z.z, p.z);
}

float3 load3(const float *v)
{
  return make_float3(v[0], v[1], v[2]);
}

Mesh *build_mesh(Scene *scene, Shader *shader, const vector<float3> &positions,
                 const vector<int> &triangles)
{
  Mesh *mesh = scene->create_node<Mesh>();
  array<Node *> used_shaders;
  used_shaders.push_back_slow(shader);
  mesh->set_used_shaders(used_shaders);
  const int nverts = int(positions.size());
  const int ntris = int(triangles.size() / 3);
  mesh->resize_mesh(nverts, ntris);
  packed_float3 *P = mesh->get_position_for_write();
  for (int i = 0; i < nverts; i++) {
    P[i] = positions[i];
  }
  std::memcpy(mesh->get_triangles().data(), triangles.data(), sizeof(int) * triangles.size());
  std::ranges::fill(mesh->get_smooth(), false);
  std::ranges::fill(mesh->get_shader(), 0);
  mesh->tag_triangles_modified();
  mesh->tag_shader_modified();
  mesh->tag_smooth_modified();
  return mesh;
}

/* A flat card in the XY plane of its object: a rectangle, or an ellipse as a fan. */
void card_geometry(float sx, float sy, bool ellipse, vector<float3> &positions,
                   vector<int> &triangles)
{
  if (!ellipse) {
    positions = {make_float3(-sx / 2, -sy / 2, 0),
                 make_float3(sx / 2, -sy / 2, 0),
                 make_float3(sx / 2, sy / 2, 0),
                 make_float3(-sx / 2, sy / 2, 0)};
    triangles = {0, 1, 2, 0, 2, 3};
    return;
  }
  positions.push_back(zero_float3());
  for (int i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const float a = M_2PI_F * float(i) / float(ELLIPSE_SEGMENTS);
    positions.push_back(make_float3(0.5f * sx * cosf(a), 0.5f * sy * sinf(a), 0.0f));
    triangles.insert(triangles.end(), {0, 1 + i, 1 + (i + 1) % ELLIPSE_SEGMENTS});
  }
}

/* The world image, held in memory: RGB float rows from JavaScript, top row first. */
class PixelsLoader : public ImageLoader {
 public:
  PixelsLoader(vector<float> &&rgb, int width, int height)
      : rgb_(std::move(rgb)), width_(width), height_(height)
  {
  }

  bool load_metadata(ImageMetaData &metadata,
                     const ImageLoaderParams & /*params*/,
                     Progress & /*progress*/) override
  {
    metadata.width = width_;
    metadata.height = height_;
    metadata.channels = 4;
    metadata.type = IMAGE_DATA_TYPE_FLOAT4;
    metadata.is_compressible_as_srgb = false;
    return true;
  }

  bool load_pixels(const ImageMetaData &metadata, void *pixels) override
  {
    /* Cycles images start at the bottom row. */
    float *out = static_cast<float *>(pixels);
    for (int y = 0; y < height_; y++) {
      const float *src = rgb_.data() + size_t(height_ - 1 - y) * width_ * 3;
      float *dst = out + size_t(y) * width_ * 4;
      for (int x = 0; x < width_; x++) {
        dst[x * 4 + 0] = src[x * 3 + 0];
        dst[x * 4 + 1] = src[x * 3 + 1];
        dst[x * 4 + 2] = src[x * 3 + 2];
        dst[x * 4 + 3] = 1.0f;
      }
    }
    metadata.conform_pixels(pixels);
    return true;
  }

  string name() const override
  {
    return "booth_world";
  }

  bool equals(const ImageLoader &other) const override
  {
    return this == &other;
  }

 private:
  vector<float> rgb_;
  int width_;
  int height_;
};

void set_world(unique_ptr<ShaderGraph> graph)
{
  Scene *scene = booth().scene;
  Shader *bg = scene->default_background;
  bg->set_graph(std::move(graph));
  bg->tag_update(scene);

  /* As Blender: one background light that is sampled, casts shadows and is a shadow catcher. */
  BackgroundLight *light = scene->create_node<BackgroundLight>();
  array<Node *> used_shaders;
  used_shaders.push_back_slow(bg);
  light->set_used_shaders(used_shaders);
  light->set_map_resolution(0);
  light->set_use_mis(true);
  light->set_max_bounces(1024);
  light->set_use_caustics(false);
  light->set_cast_shadow(true);
  Object *object = scene->create_node<Object>();
  object->set_geometry(light);
  object->set_is_shadow_catcher(true);
  light->tag_update(scene);
}

}  // namespace

void set_part_only(Object *emitter, bool part_only)
{
  if (part_only) {
    emitter->set_light_set_membership(uint64_t(1) << PART_LIGHT_SET);
  }
}

}  // namespace cb

using namespace cb;

/* positions and normals: float[nverts * 3]; indices: uint32[ntris * 3]. normals may be null for
 * flat shading. Returns a mesh handle, or -1 with cb_error set. */
CB_EXPORT int cb_mesh(int nverts, int ntris, const float *positions, const uint32_t *indices,
                      const float *normals)
{
  try {
    Scene *scene = booth().scene;
    Mesh *mesh = scene->create_node<Mesh>();
    mesh->resize_mesh(nverts, ntris);
    packed_float3 *P = mesh->get_position_for_write();
    for (int i = 0; i < nverts; i++) {
      P[i] = make_float3(positions[i * 3 + 0], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    std::memcpy(mesh->get_triangles().data(), indices, sizeof(int) * size_t(ntris) * 3);
    std::ranges::fill(mesh->get_smooth(), normals != nullptr);
    std::ranges::fill(mesh->get_shader(), 0);
    if (normals) {
      Attribute *attr = mesh->attributes.add(ATTR_STD_VERTEX_NORMAL);
      packed_normal *N = attr->data_for_write<packed_normal>();
      for (int i = 0; i < nverts; i++) {
        N[i] = packed_normal(
            make_float3(normals[i * 3 + 0], normals[i * 3 + 1], normals[i * 3 + 2]));
      }
    }
    mesh->tag_triangles_modified();
    mesh->tag_shader_modified();
    mesh->tag_smooth_modified();
    booth().meshes.push_back(mesh);
    return int(booth().meshes.size()) - 1;
  }
  catch (const std::bad_alloc &) {
    set_error("out of memory in cb_mesh");
    return -1;
  }
}

/* A named per-vertex attribute: components 1 (float) or 3 (vector). Returns 0, or -1. */
CB_EXPORT int cb_mesh_attribute(int mesh, const char *name, int components, const float *data)
{
  try {
    Geometry *geom = booth().meshes[mesh];
    const size_t n = static_cast<Mesh *>(geom)->num_verts();
    if (components == 1) {
      Attribute *attr = geom->attributes.add(ustring(name), TypeFloat, ATTR_ELEMENT_VERTEX);
      std::memcpy(attr->data_for_write<float>(), data, sizeof(float) * n);
    }
    else {
      Attribute *attr = geom->attributes.add(ustring(name), TypeVector, ATTR_ELEMENT_VERTEX);
      packed_float3 *out = attr->data_for_write<packed_float3>();
      for (size_t i = 0; i < n; i++) {
        out[i] = make_float3(data[i * 3 + 0], data[i * 3 + 1], data[i * 3 + 2]);
      }
    }
    return 0;
  }
  catch (const std::bad_alloc &) {
    set_error("out of memory in cb_mesh_attribute");
    return -1;
  }
}

/* An instance of a mesh with one shader. tfm: 16 floats, column-major, object to world.
 * flags: ObjectFlags. */
CB_EXPORT int cb_object(int mesh, int shader, const float *tfm, int flags)
{
  Booth &b = booth();
  Geometry *geom = b.meshes[mesh];
  array<Node *> used_shaders;
  used_shaders.push_back_slow(b.shaders[shader]);
  geom->set_used_shaders(used_shaders);
  Object *object = b.scene->create_node<Object>();
  object->set_geometry(geom);
  object->set_tfm(make_transform(tfm[0], tfm[4], tfm[8], tfm[12],
                                 tfm[1], tfm[5], tfm[9], tfm[13],
                                 tfm[2], tfm[6], tfm[10], tfm[14]));
  if (flags & OBJECT_PART) {
    object->set_receiver_light_set(PART_LIGHT_SET);
  }
  object->set_is_shadow_catcher((flags & OBJECT_SHADOW_CATCHER) != 0);
  return 0;
}

/* The bead material. Per-vertex attributes it reads: "rough" (roughness before mottle),
 * "plate" (1 on vertices of the plate face) and "path_tangent" (print path direction).
 *
 *   roughness = mix(clamp(rough + (noise(P * mottle_scale) - 0.5) * mottle_amp, 0.05, 1),
 *                   plate_rough, plate)
 *   anisotropy = anisotropy * (1 - plate), tangent = cross(N, path_tangent)
 *   textured plate: bump of Voronoi(P * grain).distance + 0.35 * noise(P * grain * 25 / 6)
 * P is the part-local position. Returns a shader handle. */
CB_EXPORT int cb_shader_bead(float r, float g, float b, float ior, float anisotropy,
                             float mottle_scale, float mottle_amp, float rough_min,
                             float plate_rough, int plate_textured, float grain_per_m,
                             float bump_distance_m)
{
  unique_ptr<ShaderGraph> graph = make_unique<ShaderGraph>();
  ShaderGraph *gr = graph.get();

  TextureCoordinateNode *texco = gr->create_node<TextureCoordinateNode>();
  AttributeNode *rough = attribute(gr, "rough");
  AttributeNode *plate_attr = attribute(gr, "plate");
  AttributeNode *path = attribute(gr, "path_tangent");
  GeometryNode *geometry = gr->create_node<GeometryNode>();

  NoiseTextureNode *mottle_noise = noise(gr, mottle_scale, 3.0f);
  gr->connect(texco->output("Object"), mottle_noise->input("Vector"));
  MathNode *mottle = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, mottle_amp, -0.5f * mottle_amp);
  gr->connect(mottle_noise->output("Fac"), mottle->input("Value1"));
  MathNode *bead = math(gr, NODE_MATH_ADD);
  gr->connect(rough->output("Fac"), bead->input("Value1"));
  gr->connect(mottle->output("Value"), bead->input("Value2"));
  ClampNode *clamped = gr->create_node<ClampNode>();
  clamped->set_clamp_type(NODE_CLAMP_MINMAX);
  clamped->set_min(rough_min);
  clamped->set_max(1.0f);
  gr->connect(bead->output("Value"), clamped->input("Value"));

  MathNode *plate = math(gr, NODE_MATH_GREATER_THAN, 0.0f, PLATE_MASK_THRESHOLD);
  gr->connect(plate_attr->output("Fac"), plate->input("Value1"));
  MathNode *to_plate = math(gr, NODE_MATH_SUBTRACT, plate_rough);
  gr->connect(clamped->output("Result"), to_plate->input("Value2"));
  MathNode *roughness = math(gr, NODE_MATH_MULTIPLY_ADD);
  gr->connect(plate->output("Value"), roughness->input("Value1"));
  gr->connect(to_plate->output("Value"), roughness->input("Value2"));
  gr->connect(clamped->output("Result"), roughness->input("Value3"));
  MathNode *aniso = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, -anisotropy, anisotropy);
  gr->connect(plate->output("Value"), aniso->input("Value1"));

  VectorMathNode *tangent = gr->create_node<VectorMathNode>();
  tangent->set_math_type(NODE_VECTOR_MATH_CROSS_PRODUCT);
  gr->connect(geometry->output("Normal"), tangent->input("Vector1"));
  gr->connect(path->output("Vector"), tangent->input("Vector2"));

  PrincipledBsdfNode *bsdf = gr->create_node<PrincipledBsdfNode>();
  bsdf->set_base_color(make_float3(r, g, b));
  bsdf->set_ior(ior);
  gr->connect(roughness->output("Value"), bsdf->input("Roughness"));
  gr->connect(aniso->output("Value"), bsdf->input("Anisotropic"));
  gr->connect(tangent->output("Vector"), bsdf->input("Tangent"));

  if (plate_textured) {
    VoronoiTextureNode *craters = gr->create_node<VoronoiTextureNode>();
    craters->set_dimensions(3);
    craters->set_metric(NODE_VORONOI_EUCLIDEAN);
    craters->set_feature(NODE_VORONOI_F1);
    craters->set_scale(grain_per_m);
    craters->set_randomness(1.0f);
    gr->connect(texco->output("Object"), craters->input("Vector"));
    NoiseTextureNode *grit = noise(gr, grain_per_m * GRIT_PER_GRAIN, 2.0f);
    gr->connect(texco->output("Object"), grit->input("Vector"));
    MathNode *height = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, GRIT_WEIGHT);
    gr->connect(grit->output("Fac"), height->input("Value1"));
    gr->connect(craters->output("Distance"), height->input("Value3"));
    BumpNode *bump = gr->create_node<BumpNode>();
    bump->set_distance(bump_distance_m);
    bump->set_filter_width(0.1f);
    gr->connect(plate->output("Value"), bump->input("Strength"));
    gr->connect(height->output("Value"), bump->input("Height"));
    gr->connect(bump->output("Normal"), bsdf->input("Normal"));
  }

  gr->connect(bsdf->output("BSDF"), gr->output()->input("Surface"));
  return keep_shader(add_shader(booth().scene, "booth_bead", std::move(graph)));
}

/* A Principled BSDF at factory settings except base colour and roughness. */
CB_EXPORT int cb_shader_principled(float r, float g, float b, float roughness)
{
  unique_ptr<ShaderGraph> graph = make_unique<ShaderGraph>();
  PrincipledBsdfNode *bsdf = graph->create_node<PrincipledBsdfNode>();
  bsdf->set_base_color(make_float3(r, g, b));
  bsdf->set_roughness(roughness);
  graph->connect(bsdf->output("BSDF"), graph->output()->input("Surface"));
  return keep_shader(add_shader(booth().scene, "booth_principled", std::move(graph)));
}

/* frame: centre, x axis, y axis, normal (12 floats); x cross y = normal, which faces the
 * subject. An area light emitting along `normal`, invisible to the camera like a Blender light.
 * power_w is Blender's light power; spread in radians. */
CB_EXPORT int cb_area_light(const float *frame, float size_x, float size_y, int ellipse,
                            float power_w, float r, float g, float b, float spread,
                            int part_only)
{
  Scene *scene = booth().scene;
  AreaLight *light = scene->create_node<AreaLight>();

  unique_ptr<ShaderGraph> graph = make_unique<ShaderGraph>();
  EmissionNode *emission = graph->create_node<EmissionNode>();
  emission->set_color(one_float3());
  emission->set_strength(1.0f);
  graph->connect(emission->output("Emission"), graph->output()->input("Surface"));
  array<Node *> used_shaders;
  used_shaders.push_back_slow(add_shader(scene, "booth_light", std::move(graph)));
  light->set_used_shaders(used_shaders);

  light->set_sizeu(size_x);
  light->set_sizev(size_y);
  light->set_ellipse(ellipse != 0);
  light->set_spread(spread);
  light->set_strength(make_float3(r, g, b) * power_w);
  light->set_normalize(true);
  light->set_cast_shadow(true);
  light->set_use_mis(true);
  light->set_use_caustics(false);
  light->set_max_bounces(1024);
  light->set_is_portal(false);

  /* A Blender light emits along its local -Z, with local Y the frame's y axis. */
  const float3 y = load3(frame + 3 * 2);
  const float3 z = -load3(frame + 3 * 3);
  Object *object = scene->create_node<Object>();
  object->set_geometry(light);
  object->set_tfm(frame_transform(cross(y, z), y, z, load3(frame)));
  object->set_visibility(PATH_RAY_VISIBILITY_ALL & ~PATH_RAY_VISIBILITY_CAMERA);
  object->set_is_shadow_catcher(true);
  set_part_only(object, part_only != 0);
  light->tag_update(scene);
  return 0;
}

/* A card that glows with radiance going linearly from `bottom` at its -y edge to `top` at its
 * +y edge, times the colour. Invisible to the camera. frame as cb_area_light. */
CB_EXPORT int cb_scrim(const float *frame, float size_x, float size_y, int ellipse, float r,
                       float g, float b, float top, float bottom, int part_only)
{
  Scene *scene = booth().scene;
  unique_ptr<ShaderGraph> graph = make_unique<ShaderGraph>();
  ShaderGraph *gr = graph.get();
  AttributeNode *radiance = attribute(gr, "radiance");
  EmissionNode *emission = gr->create_node<EmissionNode>();
  emission->set_color(make_float3(r, g, b));
  gr->connect(radiance->output("Fac"), emission->input("Strength"));
  gr->connect(emission->output("Emission"), gr->output()->input("Surface"));
  Shader *shader = add_shader(scene, "booth_scrim", std::move(graph));

  vector<float3> positions;
  vector<int> triangles;
  card_geometry(size_x, size_y, ellipse != 0, positions, triangles);
  Mesh *mesh = build_mesh(scene, shader, positions, triangles);
  /* Radiance is affine in y, so per-vertex values interpolate to the exact gradient. */
  Attribute *attr = mesh->attributes.add(ustring("radiance"), TypeFloat, ATTR_ELEMENT_VERTEX);
  float *rad = attr->data_for_write<float>();
  for (size_t i = 0; i < positions.size(); i++) {
    rad[i] = bottom + (top - bottom) * (positions[i].y / size_y + 0.5f);
  }

  Object *object = scene->create_node<Object>();
  object->set_geometry(mesh);
  object->set_tfm(frame_transform(
      load3(frame + 3), load3(frame + 3 * 2), load3(frame + 3 * 3), load3(frame)));
  object->set_visibility(PATH_RAY_VISIBILITY_ALL & ~PATH_RAY_VISIBILITY_CAMERA);
  set_part_only(object, part_only != 0);
  return 0;
}

/* An emissive disc on the floor that only the part's glossy reflections see. Visibility alone is
 * not enough: the floor's own specular lobe would reflect a card lying on it, so the disc is also
 * linked to the part like a part-only light. Its radiance, at a floor point (x, y) at distance r
 * from (cx, cy), is
 *   (far + (key - far) * ((1 + cos(azimuth - key_azimuth)) / 2)^2) * (1 - smoothstep(inner, outer, r))
 * where azimuth = atan2(x - cx, -(y - cy)), the camera orbit's convention (0 toward -Y).
 * FloorCardRing in src/scene.ts is the contract; tools/blender/render_scene.py builds the same. */
CB_EXPORT int cb_floor_ring(float cx, float cy, float cz, float inner, float outer, float key,
                            float far, float key_azimuth)
{
  Scene *scene = booth().scene;
  unique_ptr<ShaderGraph> graph = make_unique<ShaderGraph>();
  ShaderGraph *gr = graph.get();
  GeometryNode *geometry = gr->create_node<GeometryNode>();
  SeparateXYZNode *xyz = gr->create_node<SeparateXYZNode>();
  gr->connect(geometry->output("Position"), xyz->input("Vector"));
  MathNode *dx = math(gr, NODE_MATH_SUBTRACT, 0.0f, cx);
  gr->connect(xyz->output("X"), dx->input("Value1"));
  MathNode *dy = math(gr, NODE_MATH_SUBTRACT, cy);
  gr->connect(xyz->output("Y"), dy->input("Value2"));
  MathNode *azimuth = math(gr, NODE_MATH_ARCTAN2);
  gr->connect(dx->output("Value"), azimuth->input("Value1"));
  gr->connect(dy->output("Value"), azimuth->input("Value2"));
  MathNode *off_key = math(gr, NODE_MATH_SUBTRACT, 0.0f, key_azimuth);
  gr->connect(azimuth->output("Value"), off_key->input("Value1"));
  MathNode *cosine = math(gr, NODE_MATH_COSINE);
  gr->connect(off_key->output("Value"), cosine->input("Value1"));
  MathNode *half = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, 0.5f, 0.5f);
  gr->connect(cosine->output("Value"), half->input("Value1"));
  MathNode *weight = math(gr, NODE_MATH_MULTIPLY);
  gr->connect(half->output("Value"), weight->input("Value1"));
  gr->connect(half->output("Value"), weight->input("Value2"));
  MathNode *radiance = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, key - far, far);
  gr->connect(weight->output("Value"), radiance->input("Value1"));
  /* 1 - smoothstep(inner, outer, r), with r = sqrt(dx^2 + dy^2). */
  MathNode *dx2 = math(gr, NODE_MATH_MULTIPLY);
  gr->connect(dx->output("Value"), dx2->input("Value1"));
  gr->connect(dx->output("Value"), dx2->input("Value2"));
  MathNode *dist2 = math(gr, NODE_MATH_MULTIPLY_ADD);
  gr->connect(dy->output("Value"), dist2->input("Value1"));
  gr->connect(dy->output("Value"), dist2->input("Value2"));
  gr->connect(dx2->output("Value"), dist2->input("Value3"));
  MathNode *dist = math(gr, NODE_MATH_SQRT);
  gr->connect(dist2->output("Value"), dist->input("Value1"));
  const float span = outer - inner;
  MathNode *t = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, 1.0f / span, -inner / span);
  t->set_use_clamp(true);
  gr->connect(dist->output("Value"), t->input("Value1"));
  MathNode *ease = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, -2.0f, 3.0f);
  gr->connect(t->output("Value"), ease->input("Value1"));
  MathNode *t2 = math(gr, NODE_MATH_MULTIPLY);
  gr->connect(t->output("Value"), t2->input("Value1"));
  gr->connect(t->output("Value"), t2->input("Value2"));
  MathNode *smooth = math(gr, NODE_MATH_MULTIPLY);
  gr->connect(t2->output("Value"), smooth->input("Value1"));
  gr->connect(ease->output("Value"), smooth->input("Value2"));
  MathNode *fade = math(gr, NODE_MATH_MULTIPLY_ADD, 0.0f, -1.0f, 1.0f);
  gr->connect(smooth->output("Value"), fade->input("Value1"));
  MathNode *faded = math(gr, NODE_MATH_MULTIPLY);
  gr->connect(radiance->output("Value"), faded->input("Value1"));
  gr->connect(fade->output("Value"), faded->input("Value2"));
  EmissionNode *emission = gr->create_node<EmissionNode>();
  emission->set_color(one_float3());
  gr->connect(faded->output("Value"), emission->input("Strength"));
  gr->connect(emission->output("Emission"), gr->output()->input("Surface"));
  Shader *shader = add_shader(scene, "booth_floor_ring", std::move(graph));

  /* A fan out to `outer`, where the fade has reached zero. The shader decides the radiance at each
   * point, so the mesh only has to cover the disc. */
  vector<float3> positions;
  vector<int> triangles;
  const float z = cz + RING_LIFT_M;
  positions.push_back(make_float3(cx, cy, z));
  for (int i = 0; i < RING_SEGMENTS; i++) {
    const float a = M_2PI_F * float(i) / float(RING_SEGMENTS);
    positions.push_back(make_float3(cx + outer * cosf(a), cy + outer * sinf(a), z));
    triangles.insert(triangles.end(), {0, 1 + i, 1 + (i + 1) % RING_SEGMENTS});
  }
  Mesh *mesh = build_mesh(scene, shader, positions, triangles);
  Object *object = scene->create_node<Object>();
  object->set_geometry(mesh);
  object->set_visibility(PATH_RAY_VISIBILITY_GLOSSY);
  set_part_only(object, true);
  return 0;
}

/* An equirectangular world: rgb is float[width * height * 3], top row first. As Blender's
 * Texture Coordinate (Generated) -> Mapping (Point, rotation about Z) -> Environment Texture ->
 * Background. Returns 0, or -1. */
CB_EXPORT int cb_world_image(const float *rgb, int width, int height, float strength,
                             float rotation_z)
{
  try {
    Scene *scene = booth().scene;
    vector<float> pixels(rgb, rgb + size_t(width) * height * 3);
    unique_ptr<ShaderGraph> graph = make_unique<ShaderGraph>();
    ShaderGraph *gr = graph.get();
    TextureCoordinateNode *texco = gr->create_node<TextureCoordinateNode>();
    MappingNode *mapping = gr->create_node<MappingNode>();
    mapping->set_mapping_type(NODE_MAPPING_TYPE_POINT);
    mapping->set_rotation(make_float3(0.0f, 0.0f, rotation_z));
    EnvironmentTextureNode *env = gr->create_node<EnvironmentTextureNode>();
    env->set_projection(NODE_ENVIRONMENT_EQUIRECTANGULAR);
    env->set_interpolation(INTERPOLATION_LINEAR);
    env->handle = scene->image_manager->add_image(
        make_unique<PixelsLoader>(std::move(pixels), width, height), env->image_params());
    BackgroundNode *background = gr->create_node<BackgroundNode>();
    background->set_strength(strength);
    gr->connect(texco->output("Generated"), mapping->input("Vector"));
    gr->connect(mapping->output("Vector"), env->input("Vector"));
    gr->connect(env->output("Color"), background->input("Color"));
    gr->connect(background->output("Background"), gr->output()->input("Surface"));
    set_world(std::move(graph));
    return 0;
  }
  catch (const std::bad_alloc &) {
    set_error("out of memory in cb_world_image");
    return -1;
  }
}

CB_EXPORT void cb_world_color(float r, float g, float b, float strength)
{
  unique_ptr<ShaderGraph> graph = make_unique<ShaderGraph>();
  BackgroundNode *background = graph->create_node<BackgroundNode>();
  background->set_color(make_float3(r, g, b));
  background->set_strength(strength);
  graph->connect(background->output("Background"), graph->output()->input("Surface"));
  set_world(std::move(graph));
}
