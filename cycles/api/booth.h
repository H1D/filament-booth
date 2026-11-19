/* SPDX-License-Identifier: Apache-2.0
 *
 * The photo booth's C API over the Cycles scene API, for one Web Worker. One session at a time.
 * Coordinates are Blender's: right handed, Z up, metres. Colours are linear Rec.709.
 *
 * Call order: cb_session_create, then any of the scene calls (cb_film, cb_camera, cb_mesh,
 * cb_object, cb_shader_*, cb_area_light, cb_scrim, cb_floor_ring, cb_world_*), then
 * cb_render_start. Poll cb_render_state and cb_passes_version, read passes between
 * cb_passes_lock and cb_passes_unlock. End with cb_session_free, after which a new session may
 * be created in the same module.
 */
#pragma once

#include <atomic>
#include <mutex>
#include <string>
#include <thread>

#include "scene/scene.h"
#include "session/session.h"
#include "util/vector.h"

#ifdef __EMSCRIPTEN__
#  include <emscripten.h>
#  define CB_EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#  define CB_EXPORT extern "C"
#endif

namespace cb {

using namespace ccl;

enum SnapshotPass { SNAP_RGBA = 0, SNAP_ALBEDO = 1, SNAP_NORMAL = 2, SNAP_COUNT = 3 };

enum RenderState {
  RENDER_IDLE = 0,
  RENDER_RUNNING = 1,
  RENDER_DONE = 2,
  RENDER_CANCELLED = 3,
  RENDER_FAILED = 4,
};

/* cb_object flags. */
enum ObjectFlags {
  /* Receives the lights and scrims marked part-only (Blender light linking). */
  OBJECT_PART = 1,
  OBJECT_SHADOW_CATCHER = 2,
};

/* Light set that part-only emitters reach. Everything else stays in the default set 0. */
constexpr uint PART_LIGHT_SET = 1;

/* The newest copy of the passes, written by the session thread, read by JavaScript. */
struct Snapshot {
  std::mutex mutex;
  vector<float> pixels[SNAP_COUNT]; /* RGBA float, top row first. */
  int samples = 0;
  int version = 0;
  bool pending = false;
  int max_sample = 0;
};

struct Booth {
  unique_ptr<Session> session;
  Scene *scene = nullptr;
  int width = 0;
  int height = 0;
  SessionParams session_params;
  vector<Geometry *> meshes;
  vector<Shader *> shaders;
  bool aux_passes = true;

  Snapshot snapshot;
  std::atomic<int> state{RENDER_IDLE};
  std::atomic<bool> discard{false};
  std::thread waiter;

  std::atomic<double> t_start{0.0};
  std::atomic<double> t_first_sample{0.0};
  std::atomic<double> t_end{0.0};
};

/* The live session. Only called after cb_session_create succeeded. */
Booth &booth();
bool has_booth();
void set_error(const std::string &message);
double now_ms();

/* Light linking: emitters marked part-only reach only objects flagged OBJECT_PART. */
void set_part_only(Object *emitter, bool part_only);

}  // namespace cb
