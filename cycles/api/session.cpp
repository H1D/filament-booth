/* SPDX-License-Identifier: Apache-2.0
 *
 * Session lifecycle, film, camera and render control. Settings that the booth scene does not
 * name are set to what Blender 5.2.3's sync writes for a factory scene rendered with `-b`, so
 * that native Blender and this module render the same image from the same scene.
 */

#include <chrono>
#include <cmath>
#include <cstring>

#include "booth.h"

#include "device/device.h"
#include "scene/background.h"
#include "scene/camera.h"
#include "scene/film.h"
#include "scene/integrator.h"
#include "scene/object.h"
#include "scene/pass.h"
#include "scene/stats.h"
#include "session/buffers.h"
#include "session/output_driver.h"
#include "util/log.h"
#include "util/path.h"
#include "util/set.h"
#include "util/task.h"

#ifdef __EMSCRIPTEN__
#  include <emscripten/heap.h>
#endif

namespace cb {

namespace {

Booth *g_booth = nullptr;
std::string g_error;
std::string g_log;
std::mutex g_log_mutex;
std::string g_text;

const char *const kPassNames[SNAP_COUNT] = {"combined", "denoising_albedo", "denoising_normal"};

void collect_log(const LogLevel level, const char * /*file_line*/, const char * /*func*/,
                 const char *msg)
{
  const std::lock_guard<std::mutex> lock(g_log_mutex);
  g_log += log_level_to_string(level);
  g_log += ": ";
  g_log += msg;
  g_log += "\n";
}

/* Copies passes out for JavaScript, bottom row first as Cycles stores them (readPasses flips
 * them). Cycles calls this on its session thread between batches of samples, so no path is traced
 * while it runs: progress copies the colour only, and the denoiser's guides are copied once, with
 * the final tile. Cycles writes the final tile also when a render is finished early. */
class SnapshotDriver : public OutputDriver {
 public:
  explicit SnapshotDriver(Booth *b) : b_(b) {}

  void write_render_tile(const Tile &tile) override
  {
    copy(tile, b_->aux_passes);
  }

  bool update_render_tile(const Tile &tile) override
  {
    copy(tile, false);
    return true;
  }

 private:
  void copy(const Tile &tile, const bool guides)
  {
    if (!(tile.size == tile.full_size)) {
      return;
    }
    const size_t n = size_t(tile.size.x) * size_t(tile.size.y);
    const std::lock_guard<std::mutex> lock(b_->snapshot.mutex);
    const double t0 = now_ms();
    for (int p = 0; p < (guides ? int(SNAP_COUNT) : SNAP_RGBA + 1); p++) {
      vector<float> &out = b_->snapshot.pixels[p];
      out.resize(n * 4);
      if (p == SNAP_RGBA) {
        if (!tile.get_pass_pixels(kPassNames[p], 4, out.data())) {
          out.clear();
        }
        continue;
      }
      raw_.resize(n * 3);
      if (!tile.get_pass_pixels(kPassNames[p], 3, raw_.data())) {
        out.clear();
        continue;
      }
      for (size_t i = 0; i < n; i++) {
        out[i * 4 + 0] = raw_[i * 3 + 0];
        out[i * 4 + 1] = raw_[i * 3 + 1];
        out[i * 4 + 2] = raw_[i * 3 + 2];
        out[i * 4 + 3] = 1.0f;
      }
    }
    b_->snapshot.pending = true;
    b_->snapshot.copy_ms += now_ms() - t0;
  }

  Booth *b_;
  vector<float> raw_;
};

/* The final tile arrives with a Progress sample that counts no new samples, hence the max. */
void publish_snapshot(Booth &b, const int sample)
{
  const std::lock_guard<std::mutex> lock(b.snapshot.mutex);
  b.snapshot.max_sample = std::max(b.snapshot.max_sample, sample);
  if (b.snapshot.pending) {
    b.snapshot.samples = b.snapshot.max_sample;
    b.snapshot.version++;
    b.snapshot.pending = false;
  }
}

void add_pass(Scene *scene, const char *name, PassType type)
{
  Pass *pass = scene->create_node<Pass>();
  pass->set_name(ustring(name));
  pass->set_type(type);
  pass->set_mode(PassMode::NOISY);
}

}  // namespace

Booth &booth()
{
  return *g_booth;
}

bool has_booth()
{
  return g_booth != nullptr;
}

void set_error(const std::string &message)
{
  g_error = message;
}

double now_ms()
{
  return std::chrono::duration<double, std::milli>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

}  // namespace cb

using namespace cb;

/* threads 0 means one per hardware thread. Returns 0, or -1 with cb_error set. */
CB_EXPORT int cb_session_create(int width, int height, int threads)
{
  if (g_booth) {
    set_error("a session already exists");
    return -1;
  }
  static bool initialised = false;
  if (!initialised) {
    log_init(collect_log);
    path_init();
    initialised = true;
  }

  vector<DeviceInfo> devices = Device::available_devices(DEVICE_MASK_CPU);
  if (devices.empty()) {
    set_error("no CPU device");
    return -1;
  }

  Booth *b = new Booth();
  b->width = width;
  b->height = height;

  SessionParams &sp = b->session_params;
  sp.device = devices.front();
  sp.background = true;
  /* Not headless: the render scheduler only hands out in-progress tiles when it is not. */
  sp.headless = false;
  sp.threads = threads;
  sp.use_auto_tile = false;
  sp.tile_size = 2048;
  sp.use_resolution_divider = false;
  sp.pixel_size = 1;

  SceneParams scene_params;
  scene_params.shadingsystem = SHADINGSYSTEM_SVM;
  scene_params.bvh_type = BVH_TYPE_STATIC;
  scene_params.bvh_layout = BVH_LAYOUT_BVH2;
  scene_params.use_bvh_spatial_split = false;
  scene_params.use_bvh_unaligned_nodes = true;
  scene_params.num_bvh_time_steps = 0;
  scene_params.texture_limit = 0;
  scene_params.use_texture_cache = false;
  scene_params.background = true;

  try {
    b->session = make_unique<Session>(sp, scene_params);
  }
  catch (const std::bad_alloc &) {
    delete b;
    set_error("out of memory creating the session");
    return -1;
  }
  b->session->set_output_driver(make_unique<SnapshotDriver>(b));
  b->scene = b->session->scene.get();
  b->scene->enable_update_stats();

  Scene *scene = b->scene;
  Integrator *integrator = scene->integrator;
  integrator->set_min_bounce(0);
  integrator->set_max_volume_bounce(0);
  integrator->set_transparent_min_bounce(0);
  integrator->set_transparent_max_bounce(8);
  integrator->set_caustics_reflective(true);
  integrator->set_caustics_refractive(true);
  integrator->set_filter_glossy(1.0f);
  integrator->set_use_pixel_jitter(false);
  integrator->set_seed(0);
  integrator->set_motion_blur(false);
  integrator->set_use_light_tree(true);
  integrator->set_light_sampling_threshold(0.01f);
  /* Blender's "Automatic" pattern resolves to pure blue noise for a background render. */
  integrator->set_sampling_pattern(SAMPLING_PATTERN_BLUE_NOISE_PURE);
  integrator->set_scrambling_distance(1.0f);
  integrator->set_adaptive_min_samples(0);
  integrator->set_ao_bounces(0);
  integrator->set_ao_factor(0.0f);
  integrator->set_ao_additive_factor(0.0f);
  integrator->set_ao_distance(10.0f);
  integrator->set_use_guiding(false);
  integrator->set_use_denoise(false);

  Film *film = scene->film;
  film->set_exposure(1.0f);
  film->set_filter_type(FILTER_BLACKMAN_HARRIS);
  film->set_pass_alpha_threshold(0.5f);
  film->set_use_approximate_shadow_catcher(true);
  film->set_denoising_pass_follow_reflections(true);
  film->set_denoising_pass_use_albedo_roughness_weighting(true);

  Camera *cam = scene->camera;
  cam->set_full_width(width);
  cam->set_full_height(height);

  g_booth = b;
  return 0;
}

/* Every FilmSection field Cycles reads. adaptive_threshold 0 turns adaptive sampling off. */
CB_EXPORT void cb_film(int samples,
                       float adaptive_threshold,
                       int max_bounces,
                       int diffuse_bounces,
                       int glossy_bounces,
                       int transmission_bounces,
                       float clamp_direct,
                       float clamp_indirect,
                       float filter_width_px,
                       int transparent,
                       int aux_passes)
{
  Booth &b = booth();
  b.session_params.samples = samples;
  Integrator *integrator = b.scene->integrator;
  /* Cycles itself only ever raises it on a session's later renders, and the blue noise sequence
   * follows it: fewer samples than the last render would sample another pattern. */
  integrator->set_aa_samples(samples);
  integrator->set_max_bounce(max_bounces);
  integrator->set_max_diffuse_bounce(diffuse_bounces);
  integrator->set_max_glossy_bounce(glossy_bounces);
  integrator->set_max_transmission_bounce(transmission_bounces);
  integrator->set_sample_clamp_direct(clamp_direct);
  integrator->set_sample_clamp_indirect(clamp_indirect);
  integrator->set_use_adaptive_sampling(adaptive_threshold > 0.0f);
  integrator->set_adaptive_threshold(adaptive_threshold);
  b.scene->film->set_filter_width(filter_width_px);
  Background *background = b.scene->background;
  background->set_transparent(transparent != 0);
  background->set_transparent_glass(false);
  background->set_transparent_roughness_threshold(0.0f);
  background->set_use_shader(true);
  background->set_visibility(PATH_RAY_VISIBILITY_ALL);
  background->tag_update(b.scene);
  b.aux_passes = aux_passes != 0;
}

/* A perspective camera at `position` looking at `target`. fov_y is the vertical field of view;
 * the viewplane follows Blender's AUTO sensor fit. aperture_radius 0 turns depth of field off. */
CB_EXPORT void cb_camera(float px,
                         float py,
                         float pz,
                         float tx,
                         float ty,
                         float tz,
                         float ux,
                         float uy,
                         float uz,
                         float fov_y,
                         float aperture_radius,
                         float focus_distance,
                         float clip_start)
{
  Booth &b = booth();
  Camera *cam = b.scene->camera;
  const float3 pos = make_float3(px, py, pz);
  const float3 fwd = normalize(make_float3(tx, ty, tz) - pos);
  const float3 right = normalize(cross(fwd, make_float3(ux, uy, uz)));
  const float3 up = cross(right, fwd);
  /* Cycles camera space looks down +Z with +Y up. */
  cam->set_matrix(make_transform(right.x, up.x, fwd.x, pos.x,
                                 right.y, up.y, fwd.y, pos.y,
                                 right.z, up.z, fwd.z, pos.z));

  const float w = float(b.width);
  const float h = float(b.height);
  const bool horizontal_fit = w > h;
  const float aspect = horizontal_fit ? w / h : h / w;
  if (horizontal_fit) {
    cam->set_viewplane_left(-aspect);
    cam->set_viewplane_right(aspect);
    cam->set_viewplane_bottom(-1.0f);
    cam->set_viewplane_top(1.0f);
    cam->set_fov(fov_y);
  }
  else {
    cam->set_viewplane_left(-1.0f);
    cam->set_viewplane_right(1.0f);
    cam->set_viewplane_bottom(-aspect);
    cam->set_viewplane_top(aspect);
    cam->set_fov(2.0f * atanf(tanf(0.5f * fov_y) / aspect));
  }
  cam->set_camera_type(CAMERA_PERSPECTIVE);
  cam->set_nearclip(clip_start);
  cam->set_farclip(1000.0f);
  cam->set_aperturesize(aperture_radius);
  cam->set_focaldistance(aperture_radius > 0.0f ? focus_distance : 0.0f);
  cam->set_aperture_ratio(1.0f);
  cam->set_blades(0);
  cam->need_flags_update = true;
  cam->need_device_update = true;
}

/* After a finished render: readies the same scene for another, at width x height, keeping every
 * object, mesh and shader, and so the BVH. cb_film and cb_camera may then change the frame. A
 * change to anything else needs a new session. Returns 0, or -1 with cb_error set. */
CB_EXPORT int cb_session_again(int width, int height)
{
  Booth &b = booth();
  if (b.state.load() != RENDER_DONE) {
    set_error("cb_session_again needs a finished render");
    return -1;
  }
  if (b.waiter.joinable()) {
    b.waiter.join();
  }
  Scene *scene = b.scene;
  scene->delete_nodes(set<Pass *>(scene->passes.begin(), scene->passes.end()));
  /* Clears the "finish" cancel too, which would otherwise end the next render at once. */
  b.session->progress.reset();
  b.width = width;
  b.height = height;
  scene->camera->set_full_width(width);
  scene->camera->set_full_height(height);
  {
    const std::lock_guard<std::mutex> lock(b.snapshot.mutex);
    for (vector<float> &pixels : b.snapshot.pixels) {
      pixels.clear();
    }
    b.snapshot.samples = 0;
    b.snapshot.max_sample = 0;
    b.snapshot.pending = false;
    b.snapshot.copy_ms = 0.0;
  }
  b.discard = false;
  b.t_start = 0.0;
  b.t_first_sample = 0.0;
  b.t_end = 0.0;
  b.state = RENDER_IDLE;
  return 0;
}

CB_EXPORT int cb_render_start()
{
  Booth &b = booth();
  if (b.state.load() != RENDER_IDLE) {
    set_error("a render already ran in this session: cb_session_again first");
    return -1;
  }
  Scene *scene = b.scene;
  add_pass(scene, kPassNames[SNAP_RGBA], PASS_COMBINED);
  if (b.aux_passes) {
    add_pass(scene, kPassNames[SNAP_ALBEDO], PASS_DENOISING_ALBEDO);
    add_pass(scene, kPassNames[SNAP_NORMAL], PASS_DENOISING_NORMAL);
  }

  BufferParams buffer_params;
  buffer_params.width = b.width;
  buffer_params.height = b.height;
  buffer_params.full_width = b.width;
  buffer_params.full_height = b.height;

  Booth *bp = &b;
  /* Cycles reports a batch's samples to Progress right after handing out its tile, so a
   * snapshot is published here, with the sample count that belongs to it. */
  b.session->progress.set_update_callback([bp] {
    const int sample = bp->session->progress.get_current_sample();
    if (bp->t_first_sample.load() == 0.0 && sample > 0) {
      bp->t_first_sample = now_ms();
    }
    publish_snapshot(*bp, sample);
  });

  b.t_start = now_ms();
  b.state = RENDER_RUNNING;
  b.session->reset(b.session_params, buffer_params);
  b.session->start();
  /* Session::wait() blocks, so a thread of our own turns "the session thread went idle" into a
   * state JavaScript can poll. */
  b.waiter = std::thread([bp] {
    bp->session->wait();
    bp->t_end = now_ms();
    publish_snapshot(*bp, 0);
    Progress &progress = bp->session->progress;
    if (progress.get_error()) {
      set_error(progress.get_error_message());
      bp->state = RENDER_FAILED;
    }
    else if (bp->discard.load()) {
      bp->state = RENDER_CANCELLED;
    }
    else {
      bp->state = RENDER_DONE;
    }
  });
  return 0;
}

/* RenderState. Cheap, meant for a timer. */
CB_EXPORT int cb_render_state()
{
  return has_booth() ? booth().state.load() : RENDER_IDLE;
}

/* Samples finished so far (the highest per-pixel count with adaptive sampling). */
CB_EXPORT int cb_render_sample()
{
  return has_booth() ? booth().session->progress.get_current_sample() : 0;
}

/* Stop at the end of the work in flight and deliver the frame rendered so far. Returns at once;
 * the render ends in RENDER_DONE with the final passes in the snapshot. */
CB_EXPORT void cb_finish()
{
  if (has_booth() && booth().state.load() == RENDER_RUNNING) {
    booth().session->progress.set_cancel("finish");
  }
}

/* Stop now and discard the frame. Interrupts sampling between samples of a pixel and scene
 * building between steps, and blocks until the session thread is idle. */
CB_EXPORT void cb_cancel()
{
  if (has_booth() && booth().state.load() == RENDER_RUNNING) {
    booth().discard = true;
    booth().session->cancel(true);
  }
}

/* Increments every time the snapshot changes. */
CB_EXPORT int cb_passes_version()
{
  if (!has_booth()) {
    return 0;
  }
  const std::lock_guard<std::mutex> lock(booth().snapshot.mutex);
  return booth().snapshot.version;
}

/* Holds the snapshot still until cb_passes_unlock. Returns its sample count. */
CB_EXPORT int cb_passes_lock()
{
  booth().snapshot.mutex.lock();
  return booth().snapshot.samples;
}

/* SnapshotPass, RGBA float, width * height * 4, bottom row first. Null until the pass exists:
 * the albedo and normal guides exist only once the render has ended. */
CB_EXPORT const float *cb_pass(int which)
{
  const vector<float> &pixels = booth().snapshot.pixels[which];
  return pixels.empty() ? nullptr : pixels.data();
}

CB_EXPORT void cb_passes_unlock()
{
  booth().snapshot.mutex.unlock();
}

/* Milliseconds. 0: start to first sample (scene sync and BVH), 1: first sample to end,
 * 2: BVH build (object and scene level, from the scene update stats), 3: copying passes out for
 * JavaScript, all snapshots together (the session thread traces no path meanwhile). */
CB_EXPORT double cb_time_ms(int which)
{
  Booth &b = booth();
  switch (which) {
    case 0:
      return b.t_first_sample.load() > 0.0 ? b.t_first_sample.load() - b.t_start.load() : 0.0;
    case 1:
      return b.t_first_sample.load() > 0.0 && b.t_end.load() > 0.0 ?
                 b.t_end.load() - b.t_first_sample.load() :
                 0.0;
    case 2: {
      if (b.state.load() == RENDER_RUNNING || !b.scene->update_stats) {
        return 0.0;
      }
      double ms = 0.0;
      for (const NamedTimeEntry &e : b.scene->update_stats->geometry.times.entries) {
        if (e.name == "device_update (build object BVHs)" ||
            e.name == "device_update (build scene BVH)")
        {
          ms += e.time * 1000.0;
        }
      }
      return ms;
    }
    case 3: {
      const std::lock_guard<std::mutex> lock(b.snapshot.mutex);
      return b.snapshot.copy_ms;
    }
  }
  return 0.0;
}

/* The wasm heap size in bytes. It only grows, so after a render it is the high-water mark. */
CB_EXPORT double cb_heap_bytes()
{
#ifdef __EMSCRIPTEN__
  return double(emscripten_get_heap_size());
#else
  return 0.0;
#endif
}

/* Cycles' own count of the bytes it allocated at its peak. */
CB_EXPORT double cb_cycles_peak_bytes()
{
  return has_booth() ? double(booth().session->stats.mem_peak) : 0.0;
}

CB_EXPORT int cb_threads()
{
  return TaskScheduler::max_concurrency();
}

CB_EXPORT const char *cb_error()
{
  g_text = g_error;
  return g_text.c_str();
}

/* 4 warning, 6 important info, 7 info, 8 debug. */
CB_EXPORT void cb_set_log_level(int level)
{
  log_level_set(LogLevel(level));
}

/* Returns and clears the collected Cycles log. */
CB_EXPORT const char *cb_take_log()
{
  const std::lock_guard<std::mutex> lock(g_log_mutex);
  g_text.swap(g_log);
  g_log.clear();
  return g_text.c_str();
}

CB_EXPORT void cb_session_free()
{
  if (!g_booth) {
    return;
  }
  Booth *b = g_booth;
  if (b->state.load() == RENDER_RUNNING) {
    b->discard = true;
    b->session->cancel(true);
  }
  if (b->waiter.joinable()) {
    b->waiter.join();
  }
  b->session.reset();
  delete b;
  g_booth = nullptr;
}
