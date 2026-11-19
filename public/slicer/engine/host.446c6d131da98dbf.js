/*! @license AGPL-3.0-only
 * Muon3D Slicer Engine (based on OrcaSlicer): engine host.
 * Copyright (C) the OrcaSlicer authors; modifications Copyright (C) 2026 Muon 3D Technologies Limited.
 * Free software under the GNU Affero General Public License, version 3: see LICENSE and NOTICE next to
 * this file.
 * @source https://github.com/Muon-3D/muon3d-slicer-engine (commit 41c754ef12b18d4d24893898ef03d6b5b44a2919)
 */
import {
  define_ENGINE_BUILD_default
} from "./host-chunk.bd6a59f31a9394b2.js";

// packages/protocol/src/transport.ts
function workerTransport(endpoint) {
  return {
    send: (message, transfer = []) => endpoint.postMessage(message, [...transfer]),
    listen(onMessage, onClose) {
      const message = (event) => onMessage(event.data);
      const error = (event) => {
        onClose?.(new Error(event.message || (event.type === "messageerror" ? "a message could not be read" : "the worker failed")));
      };
      endpoint.addEventListener("message", message);
      endpoint.addEventListener("error", error);
      endpoint.addEventListener("messageerror", error);
      endpoint.start?.();
      return () => {
        endpoint.removeEventListener("message", message);
        endpoint.removeEventListener("error", error);
        endpoint.removeEventListener("messageerror", error);
      };
    },
    close: () => endpoint.terminate ? endpoint.terminate() : endpoint.close?.()
  };
}
function nodeWorkerTransport(endpoint) {
  return {
    send: (message, transfer = []) => endpoint.postMessage(message, transfer),
    listen(onMessage, onClose) {
      let closed = false;
      const close = (error2) => {
        if (!closed) {
          closed = true;
          onClose?.(error2);
        }
      };
      const message = (m) => onMessage(m);
      const error = (e) => close(e);
      const exit = (code) => close(code === 0 ? void 0 : new Error(`the worker exited with code ${code}`));
      endpoint.on("message", message);
      endpoint.on("error", error);
      endpoint.on("exit", exit);
      return () => {
        endpoint.off("message", message);
        endpoint.off("error", error);
        endpoint.off("exit", exit);
      };
    },
    close: () => void (endpoint.terminate ? endpoint.terminate() : endpoint.close?.())
  };
}

// packages/protocol/src/envelope.ts
var PROTOCOL = { major: 2, minor: 4 };
var ErrorCode = {
  /** The engine crashed (a wasm trap or abort). The host is 'fatal' afterwards. */
  Internal: 1,
  /** The engine ran out of memory. The host is 'fatal' afterwards. */
  OutOfMemory: 2,
  /** The request was cancelled before it finished. */
  Cancelled: 3,
  /** Unknown op, or an op or field this host does not support. */
  Unsupported: 4,
  /** The request is malformed: not an envelope, missing or wrong-typed params. `detail` says what. */
  BadRequest: 5,
  /** The op needs the engine, and it could not be loaded (the host is 'fatal'). */
  NotLoaded: 6,
  /** The client's protocol major is not the host's. `detail` lists the majors the host speaks, e.g. "2". */
  ProtocolMismatch: 7,
  /** A config was named by a hash the host does not hold (never sent, or evicted): send it again with the config. */
  NotCached: 8
};

// packages/protocol/src/helpers.ts
function transferablesOf(value) {
  const buffers = /* @__PURE__ */ new Set();
  const walk = (v, depth) => {
    if (v === null || typeof v !== "object" || depth > 64) return;
    if (ArrayBuffer.isView(v)) {
      if (v.buffer instanceof ArrayBuffer) buffers.add(v.buffer);
      return;
    }
    if (v instanceof ArrayBuffer) {
      buffers.add(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) if (item !== null && typeof item === "object") walk(item, depth + 1);
      return;
    }
    for (const key in v) {
      const item = v[key];
      if (item !== null && typeof item === "object") walk(item, depth + 1);
    }
  };
  walk(value, 0);
  return [...buffers];
}

// packages/protocol/src/ops.ts
var OPS_2_0 = [
  "hello",
  "load",
  "status",
  "cancel",
  "slice",
  "check",
  "config.definitions",
  "settings.catalogue",
  "settings.view",
  "settings.edit"
];
var PROFILE_OPS = ["profiles.normalize", "profiles.resolve", "profiles.validate"];
var OPS = [...OPS_2_0, ...PROFILE_OPS];
var ENGINE_OPS = ["load", "slice", "check", "config.definitions", ...PROFILE_OPS];
var Capability = {
  /** Toolpaths format 1 in slice results. */
  toolpathsV1: "toolpaths.v1",
  /** SliceParams.output.toolpathExtras and SliceResult.toolpathExtras. */
  toolpathExtras: "slice.toolpathExtras",
  /** Mesh.indices (indexed meshes) in slice and check. */
  indexedMeshes: "mesh.indexed",
  /** A running request can be cancelled and the engine stays loaded (without it: only queued requests). */
  cooperativeCancel: "cancel.cooperative",
  /** settings.view format 1. */
  settingsViewV1: "settings.view.v1",
  /** SliceParams.output.log, SliceResult.log and EngineError.log (2.1). */
  sliceLog: "slice.log",
  /** PlateObject.paint: support, seam, fuzzy skin and filament painting on a mesh's triangles (2.2). */
  paintV1: "paint.v1",
  /** EngineError.conflict, and a conflicting slice's toolpaths in its error (2.3). */
  sliceConflict: "slice.conflict",
  /**
   * Organic tree supports go around the plate's other objects instead of through them, and a slice warns ('support_dropped')
   * when some could find no way past one (2.3).
   */
  supportAvoidObjects: "support.avoidObjects"
};

// packages/protocol/src/paint.ts
var PAINT_KINDS = ["supports", "seam", "fuzzySkin", "filaments"];
var PAINT_MAX_STATE = { supports: 2, seam: 2, fuzzySkin: 1, filaments: 32 };
var KIND_WORDS = {
  supports: "support paint",
  seam: "seam paint",
  fuzzySkin: "fuzzy skin paint",
  filaments: "filament paint"
};
function digit(c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
}
function paintCodeMaxState(code, start = 0, end = code.length) {
  let pos = end;
  let open = 1;
  let max = 0;
  const next = () => pos > start ? digit(code.charCodeAt(--pos)) : -1;
  while (open > 0) {
    const head = next();
    if (head < 0) return -1;
    open--;
    const split = head & 3;
    const x = head >> 2;
    if (split === 0) {
      let state = x;
      if (x === 3) {
        const e = next();
        if (e < 0) return -1;
        if (e < 15) state = e + 3;
        else {
          const f = next();
          if (f < 0) return -1;
          state = f + 18;
        }
      }
      if (state > max) max = state;
    } else {
      if (x > 2) return -1;
      open += split + 1;
    }
  }
  return pos === start ? max : -1;
}
function checkFacetPaint(paint, triangleCount, maxState = 32) {
  const value = paint;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { message: "must be { triangles, codes, ends }" };
  const { triangles, codes, ends } = value;
  if (!(triangles instanceof Uint32Array)) return { message: '"triangles" must be a Uint32Array' };
  if (typeof codes !== "string") return { message: '"codes" must be text' };
  if (!(ends instanceof Uint32Array)) return { message: '"ends" must be a Uint32Array' };
  if (ends.length !== triangles.length) return { message: `lists ${triangles.length} triangles and ${ends.length} code ends` };
  let previous = -1;
  let from = 0;
  for (let i = 0; i < triangles.length; i++) {
    const triangle = triangles[i];
    if (triangle <= previous) return { message: `lists triangle ${triangle} after triangle ${previous} (they must be strictly ascending)`, triangle };
    if (triangle >= triangleCount) return { message: `of triangle ${triangle} is past the mesh, which has ${triangleCount} triangles`, triangle };
    const to = ends[i];
    if (to <= from || to > codes.length) return { message: `of triangle ${triangle} has no code (its end is ${to}, after ${from}; the codes are ${codes.length} long)`, triangle };
    const state = paintCodeMaxState(codes, from, to);
    if (state < 0) return { message: `of triangle ${triangle} is not a valid code`, triangle };
    if (state > maxState) return { message: `of triangle ${triangle} has state ${state}; this kind's states go up to ${maxState}`, triangle };
    previous = triangle;
    from = to;
  }
  if (from !== codes.length) return { message: `has text after its last code (${codes.length - from} characters)` };
  return null;
}
function checkObjectPaint(paint, triangleCount, name) {
  const value = paint;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: PAINT_KINDS[0], message: `${name}: its paint must be { supports?, seam?, fuzzySkin?, filaments? }.` };
  }
  for (const kind of PAINT_KINDS) {
    const facets = paint[kind];
    if (facets === void 0) continue;
    const problem = checkFacetPaint(facets, triangleCount, PAINT_MAX_STATE[kind]);
    if (problem) return { kind, message: `${name}: the ${KIND_WORDS[kind]} ${problem.message}.`, ...problem.triangle !== void 0 ? { triangle: problem.triangle } : {} };
  }
  return null;
}
function hasPaintKinds(paint) {
  return paint !== void 0 && paint !== null && PAINT_KINDS.some((kind) => paint[kind] !== void 0);
}

// host/src/bridge.ts
var EngineJobError = class extends Error {
  error;
  constructor(error) {
    super(error.message);
    this.name = "EngineJobError";
    this.error = error;
  }
};
var EngineStartError = class extends Error {
  detail;
  constructor(message, detail) {
    super(message);
    this.name = "EngineStartError";
    this.detail = detail;
  }
};
var now = () => performance.now();
var messageOf = (err) => err instanceof Error ? err.message : String(err);
var fileName = (url) => new URL(url).pathname.split("/").pop() || url;
function withoutAssertionsHint(message) {
  return message.replace(/\.?\s*Build with -sASSERTIONS for more info\.?/g, "").trim();
}
async function loadEngine(baseUrl, variant, options = {}) {
  const started = now();
  const moduleUrl = new URL(`engine-${variant}.mjs`, baseUrl).href;
  let imported;
  try {
    imported = await import(
      /* @vite-ignore */
      moduleUrl
    );
  } catch (err) {
    throw new EngineStartError(`${fileName(moduleUrl)} could not be loaded.`, messageOf(err));
  }
  const factory = imported.default ?? imported.createOrcaEngine;
  if (typeof factory !== "function") throw new EngineStartError(`${fileName(moduleUrl)} is not the slicing engine (it exports no engine factory).`);
  const locateFile = (path) => new URL(path, baseUrl).href;
  if (new URL(baseUrl).protocol === "file:" || typeof fetch !== "function") {
    const engine2 = await factory({ locateFile });
    return { engine: engine2, initMs: now() - started, memory: null };
  }
  let memory = null;
  let failed;
  const failure = new Promise((_resolve, reject) => {
    failed = reject;
  });
  const instantiateWasm = (imports, receive) => {
    instantiateEngineWasm(locateFile(`engine-${variant}.wasm`), imports, options).then(({ instance, module }) => {
      memory = findMemory(imports, instance.exports);
      receive(instance, module);
    }).catch(failed);
    return {};
  };
  const engine = await Promise.race([factory({ locateFile, instantiateWasm }), failure]);
  return { engine, initMs: now() - started, memory };
}
function findMemory(imports, exports) {
  const values = [...Object.values(exports), ...Object.values(imports).flatMap((module) => Object.values(module))];
  return values.find((value) => value instanceof WebAssembly.Memory) ?? null;
}
var COMPILE_FAILED = "The engine files on the server are incomplete or come from different builds. Reload the page; if that does not help, the engine has to be published again.";
async function instantiateEngineWasm(url, imports, options) {
  const file = fileName(url);
  let response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch (err) {
    throw new EngineStartError(`${file} could not be downloaded.`, messageOf(err));
  }
  if (!response.ok) throw new EngineStartError(`${file} could not be downloaded (HTTP ${response.status}).`);
  const encoded = (response.headers.get("content-encoding") ?? "identity") !== "identity";
  const contentLength = Number(response.headers.get("content-length"));
  const total = options.wasmBytes && options.wasmBytes > 0 ? options.wasmBytes : !encoded && contentLength > 0 ? contentLength : 0;
  const report = downloadReporter(options.onDownload, total);
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (type === "text/html") throw new EngineStartError(`${file} is missing on the server (it sent a web page instead).`);
  try {
    if (type === "application/wasm" && response.body && typeof WebAssembly.instantiateStreaming === "function") {
      const counting = report ? countBytes(response.clone(), report) : null;
      try {
        return await WebAssembly.instantiateStreaming(response, imports);
      } catch (err) {
        counting?.stop();
        throw err;
      }
    }
    return await WebAssembly.instantiate(await readBytes(response, report), imports);
  } catch (err) {
    if (err instanceof EngineStartError) throw err;
    const mismatch = err instanceof WebAssembly.CompileError || err instanceof WebAssembly.LinkError || /Import #\d/.test(messageOf(err));
    if (mismatch) throw new EngineStartError(COMPILE_FAILED, messageOf(err));
    if (err instanceof TypeError) throw new EngineStartError(`${file} could not be downloaded.`, messageOf(err));
    throw err;
  }
}
function downloadReporter(onDownload, total) {
  if (!onDownload) return null;
  let last = -Infinity;
  return (loaded, done) => {
    const t = now();
    if (!done && t - last < 100) return;
    last = t;
    try {
      onDownload(loaded, total, done);
    } catch (err) {
      console.error("Engine download callback failed:", err);
    }
  };
}
function countBytes(response, report) {
  const reader = response.body?.getReader();
  let loaded = 0;
  void (async () => {
    if (!reader) return;
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        report(loaded, false);
      }
      report(loaded, true);
    } catch {
    }
  })();
  return {
    stop: () => {
      reader?.cancel().catch(() => void 0);
    }
  };
}
async function readBytes(response, report) {
  if (!report || !response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    report(loaded, false);
  }
  report(loaded, true);
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function guarded(callback) {
  return (...args) => {
    try {
      callback?.(...args);
    } catch (err) {
      console.error("Engine progress callback failed:", err);
    }
  };
}
var presetJson = (config2) => JSON.stringify(config2);
function meshInputs(objects2) {
  return objects2.map(({ name, positions, config: config2, paint }) => {
    const input = { name, positions };
    if (config2 && Object.keys(config2).length > 0) input.config = config2;
    if (hasPaintKinds(paint)) input.paint = paint;
    return input;
  });
}
function protocolToolpaths(paths) {
  return {
    format: 1,
    layerCount: paths.layerCount,
    layerZ: paths.layerZ,
    extrusions: paths.extrusions,
    travels: paths.travels,
    roles: paths.roles.map((name, i) => ({ name, lengthMm: paths.roleLength[i] ?? 0 })),
    lineWidth: paths.lineWidth,
    bounds: paths.bounds
  };
}
function protocolError(error, extras = true) {
  const { toolpaths, toolpathExtras, ...rest } = error;
  const out = rest;
  if (toolpaths) {
    out.toolpaths = protocolToolpaths(toolpaths);
    if (extras && toolpathExtras) out.toolpathExtras = toolpathExtras;
  }
  return out;
}
function runSlice(engine, job, onProgress, onWarning) {
  const started = now();
  const result = engine.slice(
    presetJson(job.machine),
    presetJson(job.process),
    job.filaments.map(presetJson),
    meshInputs(job.objects),
    job.toolpaths ?? true,
    guarded(onProgress),
    guarded(onWarning),
    job.log ?? 0
  );
  if ("error" in result) {
    const error = protocolError(result.error, job.toolpathExtras !== false);
    throw new EngineJobError(result.log !== void 0 ? { ...error, log: result.log } : error);
  }
  return {
    ...result,
    // The engine builds them with the toolpaths whether asked or not; they are dropped here so
    // they are not posted to the page.
    toolpathExtras: job.toolpathExtras === false ? null : result.toolpathExtras,
    // The engine times its own stages; the total also covers the conversions on this side.
    timings: { ...result.timings, total: now() - started }
  };
}
function runCheck(engine, job) {
  const result = engine.check(presetJson(job.machine), presetJson(job.process), job.filaments.map(presetJson), meshInputs(job.objects));
  if ("error" in result) throw new EngineJobError(protocolError(result.error));
  return result;
}
var OUT_OF_MEMORY = /\bOOM\b|out of memory|cannot enlarge memory|allocation failed|could not allocate memory|maximum memory size exceeded/i;
function engineHeap(engine, memory) {
  try {
    if (typeof engine?.heapSize === "function") return engine.heapSize();
  } catch {
  }
  return memory ? { bytes: memory.buffer.byteLength } : null;
}
function engineFailure(err, heap) {
  const detail = withoutAssertionsHint(messageOf(err));
  const heapFull = !!heap?.maxBytes && heap.bytes >= 0.9 * heap.maxBytes;
  if (OUT_OF_MEMORY.test(detail) || heapFull) return { code: 2, message: `The slicing engine ran out of memory (${detail}).` };
  return { code: 1, message: `The slicing engine crashed: ${detail}` };
}
function startFailure(err) {
  if (err instanceof EngineStartError) return { code: 1, message: err.message, ...err.detail ? { detail: withoutAssertionsHint(err.detail) } : {} };
  const detail = withoutAssertionsHint(messageOf(err));
  if (OUT_OF_MEMORY.test(detail)) {
    return { code: 2, message: "This browser does not have enough memory free for it. Close other tabs and try again.", detail };
  }
  if (err instanceof WebAssembly.CompileError || err instanceof WebAssembly.LinkError || /\b(CompileError|LinkError)\b/.test(detail)) {
    return { code: 1, message: COMPILE_FAILED, detail };
  }
  return { code: 1, message: detail || "The engine stopped while starting." };
}
function memory64Supported() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 4, 1, 7, 1, 1]));
  } catch {
    return false;
  }
}

// packages/protocol/src/definitions.ts
var CONFIG_DEFINITIONS_FORMAT = 1;

// host/src/configDefinitions.ts
function readConfigDefinitions(engine) {
  if (typeof engine.configDefinitions !== "function") {
    throw new Error("This engine build has no configDefinitions(): rebuild the engine (engine/scripts/build.sh).");
  }
  const parsed = JSON.parse(engine.configDefinitions());
  if (parsed.error) throw new Error(parsed.error);
  if (parsed.format !== CONFIG_DEFINITIONS_FORMAT || typeof parsed.options !== "object" || parsed.options === null) {
    throw new Error(`The engine's option definitions have format ${String(parsed.format)}; this code reads format ${CONFIG_DEFINITIONS_FORMAT}.`);
  }
  return parsed;
}

// host/src/canary.ts
var HOST_CANARY = "muon3d-slicer-engine-host/844fdc97-4424-430e-9280-f7b49fa01568";

// host/src/info.ts
var DEV = {
  version: "0.0.0-dev",
  commit: "dev",
  source: "https://github.com/Muon-3D/muon3d-slicer-engine",
  orca: { version: "unknown", commit: "unknown", repository: "https://github.com/Muon-3D/OrcaSlicer" },
  maxHeapBytes: 4 * 1024 ** 3,
  maxHeapBytes64: 16 * 1024 ** 3
};
var BUILD = typeof define_ENGINE_BUILD_default !== "undefined" ? define_ENGINE_BUILD_default : DEV;
var ENGINE_NAME = "Muon3D Slicer Engine (based on OrcaSlicer)";
var LICENSE = "AGPL-3.0-only";
function engineInfo(base2, build = BUILD) {
  let notice;
  try {
    notice = new URL("NOTICE", base2).href;
  } catch {
    notice = "NOTICE";
  }
  return {
    name: ENGINE_NAME,
    version: build.version,
    orca: { ...build.orca },
    license: LICENSE,
    source: build.source,
    notice,
    canary: HOST_CANARY,
    commit: build.commit
  };
}

// host/src/ops.ts
var BadRequest = class extends Error {
  detail;
  /** The objects the request is wrong about, by name. */
  objects;
  constructor(message, detail, objects2) {
    super(message);
    if (detail !== void 0) this.detail = detail;
    if (objects2 !== void 0) this.objects = objects2;
  }
};
var isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function config(value, what) {
  if (!isObject(value)) throw new BadRequest(`${what} must be a preset: a map of setting keys to text or lists of text.`);
  return value;
}
function configSet(value) {
  if (!isObject(value)) throw new BadRequest('"configs" must be { machine, process, filaments }.');
  const filaments = value.filaments;
  if (!Array.isArray(filaments) || filaments.length === 0) throw new BadRequest('"configs.filaments" must list at least one filament preset.');
  return {
    machine: config(value.machine, '"configs.machine"'),
    process: config(value.process, '"configs.process"'),
    filaments: filaments.map((f, i) => config(f, `"configs.filaments[${i}]"`))
  };
}
function soup(mesh, what) {
  if (!isObject(mesh) || !(mesh.positions instanceof Float32Array)) throw new BadRequest(`${what}.mesh.positions must be a Float32Array.`);
  const { positions, indices } = mesh;
  if (indices === void 0) {
    if (positions.length % 9 !== 0) throw new BadRequest(`${what}.mesh.positions must hold 9 floats per triangle (it has ${positions.length}).`);
    return positions;
  }
  if (!(indices instanceof Uint32Array)) throw new BadRequest(`${what}.mesh.indices must be a Uint32Array.`);
  if (indices.length % 3 !== 0) throw new BadRequest(`${what}.mesh.indices must hold 3 indices per triangle.`);
  if (positions.length % 3 !== 0) throw new BadRequest(`${what}.mesh.positions must hold 3 floats per vertex.`);
  const vertices = positions.length / 3;
  const out = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (v >= vertices) throw new BadRequest(`${what}.mesh.indices refers to vertex ${v}; the mesh has ${vertices}.`);
    out[i * 3] = positions[v * 3];
    out[i * 3 + 1] = positions[v * 3 + 1];
    out[i * 3 + 2] = positions[v * 3 + 2];
  }
  return out;
}
function objects(value, forSlice) {
  if (!Array.isArray(value)) throw new BadRequest('"objects" must be a list of plate objects.');
  return value.map((o, i) => {
    const what = `"objects[${i}]"`;
    if (!isObject(o) || typeof o.name !== "string" || o.name === "") throw new BadRequest(`${what} needs a "name".`);
    const out = { name: o.name, positions: soup(o.mesh, what) };
    if (forSlice && o.config !== void 0) {
      if (!isObject(o.config) || Object.values(o.config).some((v) => typeof v !== "string")) throw new BadRequest(`${what}.config must map setting keys to text.`);
      if (Object.keys(o.config).length > 0) out.config = o.config;
    }
    if (forSlice && o.paint !== void 0) {
      const problem = checkObjectPaint(o.paint, out.positions.length / 9, o.name);
      if (problem) throw new BadRequest(problem.message, `${what}.paint.${problem.kind}`, [o.name]);
      if (hasPaintKinds(o.paint)) {
        const paint = {};
        for (const kind of PAINT_KINDS) {
          const facets = o.paint[kind];
          if (facets) paint[kind] = { triangles: facets.triangles, codes: facets.codes, ends: facets.ends };
        }
        out.paint = paint;
      }
    }
    return out;
  });
}
function sliceJob(params) {
  if (!isObject(params)) throw new BadRequest("slice needs { configs, objects }.");
  const { machine, process: process2, filaments } = configSet(params.configs);
  const output = isObject(params.output) ? params.output : {};
  const log = output.log === void 0 ? 0 : LOG_LEVELS.indexOf(output.log) + 1;
  if (log === 0 && output.log !== void 0) throw new BadRequest(`"output.log" must be one of ${LOG_LEVELS.join(", ")}.`);
  return {
    machine,
    process: process2,
    filaments,
    objects: objects(params.objects, true),
    toolpaths: output.toolpaths !== false,
    toolpathExtras: output.toolpathExtras !== false,
    ...log > 0 ? { log } : {}
  };
}
var LOG_LEVELS = ["error", "warning", "info", "debug", "trace"];
function checkJob(params) {
  if (!isObject(params)) throw new BadRequest("check needs { configs, objects }.");
  const { machine, process: process2, filaments } = configSet(params.configs);
  return { machine, process: process2, filaments, objects: objects(params.objects, false) };
}
function sliceResult(output, heapBytes) {
  const paths = output.toolpaths;
  const result = {
    gcode: output.gcode,
    stats: output.stats,
    toolpaths: paths && protocolToolpaths(paths),
    toolpathExtras: output.toolpathExtras,
    warnings: output.warnings,
    timings: output.timings
  };
  if (output.log !== void 0) result.log = output.log;
  if (heapBytes !== void 0) result.heapBytes = heapBytes;
  return result;
}
function checkResult(output, heapBytes) {
  const result = {
    objects: output.objects.map((o) => ({
      name: o.name,
      inside: o.inside,
      exclusionHits: o.exclusionHits.map((h) => ({ extruder: h.extruder, region: h.regionIndex, triangles: h.triangles }))
    }))
  };
  if (heapBytes !== void 0) result.heapBytes = heapBytes;
  return result;
}

// host/src/profiles.ts
var TYPES = ["machine", "process", "filament"];
var isObject2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var isPresetType = (v) => typeof v === "string" && TYPES.includes(v);
function folder(value, what) {
  if (!isObject2(value)) throw new BadRequest(`${what} must be a profile folder: { id, index, files }.`);
  if (typeof value.id !== "string" || value.id === "" || /[\\/:]|^\.\.?$/.test(value.id)) {
    throw new BadRequest(`${what}.id must be the vendor's folder name, e.g. "Muon3D".`);
  }
  if (!isObject2(value.index)) throw new BadRequest(`${what}.index must be the vendor's index file (${value.id}.json) as an object.`);
  if (!isObject2(value.files)) throw new BadRequest(`${what}.files must map each sub_path of the index to its file's content.`);
  for (const [path, file] of Object.entries(value.files)) {
    if (!isObject2(file)) throw new BadRequest(`${what}.files["${path}"] must be the file's JSON object.`);
    if (path === "" || path.startsWith("/") || /\\|:|(^|\/)\.\.?(\/|$)|\/\//.test(path)) {
      throw new BadRequest(`${what}.files has an unusable path "${path}" (relative, '/'-separated, no "..").`);
    }
  }
  return value;
}
function profilesRequest(op, params) {
  if (!isObject2(params)) throw new BadRequest(`${op} needs an object of params.`);
  if (op === "profiles.normalize") {
    const p2 = params;
    if (!Array.isArray(p2.presets)) throw new BadRequest("profiles.normalize needs { presets: [{ type, config }] }.");
    p2.presets.forEach((item, i) => {
      if (!isObject2(item) || !isPresetType(item.type) || !isObject2(item.config)) {
        throw new BadRequest(`"presets[${i}]" must be { type: machine | process | filament, config: <the preset file> }.`);
      }
    });
    return JSON.stringify({ presets: p2.presets.map(({ type, config: config2 }) => ({ type, config: config2 })) });
  }
  if (op === "profiles.resolve") {
    const p2 = params;
    const vendor = folder(p2.vendor, '"vendor"');
    const library = p2.library === void 0 || p2.library === null ? null : folder(p2.library, '"library"');
    if (p2.presets !== void 0) {
      if (!Array.isArray(p2.presets) || p2.presets.some((x) => !isObject2(x) || !isPresetType(x.type) || typeof x.name !== "string")) {
        throw new BadRequest('"presets" must list { type: machine | process | filament, name }.');
      }
    }
    const compatibility = p2.compatibility;
    if (compatibility !== void 0 && typeof compatibility !== "boolean" && !(Array.isArray(compatibility) && compatibility.every((n) => typeof n === "string"))) {
      throw new BadRequest('"compatibility" must be true or list printer names.');
    }
    return JSON.stringify({
      vendor,
      library,
      ...p2.presets ? { presets: p2.presets.map(({ type, name }) => ({ type, name })) } : {},
      ...compatibility !== void 0 ? { compatibility } : {}
    });
  }
  const p = params;
  if (!Array.isArray(p.vendors) || p.vendors.length === 0) {
    throw new BadRequest("profiles.validate needs { vendors: [profile folders] }: every vendor to load, the filament library among them.");
  }
  const vendors = p.vendors.map((v, i) => folder(v, `"vendors[${i}]"`));
  if (p.vendor !== void 0 && (typeof p.vendor !== "string" || !vendors.some((v) => v.id === p.vendor))) {
    throw new BadRequest('"vendor" must name one of "vendors" (the vendor to validate; absent: all).');
  }
  if (p.checkFilamentSubtypes !== void 0 && typeof p.checkFilamentSubtypes !== "boolean") {
    throw new BadRequest('"checkFilamentSubtypes" must be true or false.');
  }
  return JSON.stringify({ vendors, ...p.vendor !== void 0 ? { vendor: p.vendor } : {}, ...p.checkFilamentSubtypes !== void 0 ? { checkFilamentSubtypes: p.checkFilamentSubtypes } : {} });
}
var BRIDGE = {
  "profiles.normalize": "profilesNormalize",
  "profiles.resolve": "profilesResolve",
  "profiles.validate": "profilesValidate"
};
function runProfiles(engine, op, request) {
  const fn = engine[BRIDGE[op]];
  if (typeof fn !== "function") throw new EngineJobError({ code: 4, message: `This engine build has no ${op}: it predates protocol 2.1.` });
  const out = fn.call(engine, request);
  if (typeof out !== "string") throw new EngineJobError(out.error);
  const result = JSON.parse(out);
  if (op === "profiles.resolve") {
    for (const preset of result.presets) {
      const config2 = preset.config;
      config2.type = preset.type;
      if (preset.filamentId) config2.filament_id = preset.filamentId;
    }
    for (const type of TYPES) {
      const defaults = result.defaults[type];
      delete defaults.name;
      delete defaults.from;
      delete defaults.version;
    }
  }
  return result;
}

// host/src/core.ts
var Lane = class {
  queue = [];
  busy = false;
  running = null;
  push(job) {
    this.queue.push(job);
    if (!this.busy) void this.drain();
  }
  /** Takes a queued (not yet running) request out of the lane. */
  remove(id) {
    const i = this.queue.findIndex((j) => j.id === id);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    return true;
  }
  async drain() {
    this.busy = true;
    for (let job = this.queue.shift(); job; job = this.queue.shift()) {
      this.running = job.id;
      try {
        await job.run();
      } catch (err) {
        console.error("Engine host:", err);
      }
      this.running = null;
    }
    this.busy = false;
  }
};
var PROFILE_OPS2 = /* @__PURE__ */ new Set(["profiles.normalize", "profiles.resolve", "profiles.validate"]);
var ENGINE_OPS2 = /* @__PURE__ */ new Set(["load", "slice", "check", "config.definitions", ...PROFILE_OPS2]);
var SETTINGS_OPS = /* @__PURE__ */ new Set(["settings.catalogue", "settings.view", "settings.edit"]);
var CAPABILITIES = [
  ...OPS,
  Capability.toolpathsV1,
  Capability.toolpathExtras,
  Capability.indexedMeshes,
  Capability.settingsViewV1,
  Capability.sliceLog,
  Capability.paintV1,
  Capability.sliceConflict,
  Capability.supportAvoidObjects
];
var messageOf2 = (err) => err instanceof Error ? err.message : String(err);
function limitThreads(threads) {
  try {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: Math.max(1, Math.floor(threads)), configurable: true });
  } catch {
  }
}
async function defaultReadManifest(base2) {
  try {
    const url = new URL("manifest.json", base2);
    if (url.protocol === "file:") {
      const fs = await import("node:fs/promises");
      return JSON.parse(await fs.readFile(url, "utf8"));
    }
    const response = await fetch(url, { credentials: "same-origin" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
function createHost(options) {
  const env = {
    kind: options.environment?.kind ?? "other",
    threads: options.environment?.threads ?? typeof SharedArrayBuffer === "function",
    memory64: options.environment?.memory64 ?? memory64Supported(),
    hardwareConcurrency: options.environment?.hardwareConcurrency ?? (globalThis.navigator?.hardwareConcurrency || 1)
  };
  const build = options.build ?? BUILD;
  const load = options.loadEngine ?? loadEngine;
  const lanes = { engine: new Lane(), settings: new Lane() };
  let state = { state: "idle" };
  let engine = null;
  let memory = null;
  let loaded = null;
  let loading = null;
  let dead = null;
  let manifest = null;
  let settings = null;
  const send = (message, transfer = []) => {
    try {
      options.send(message, transfer);
    } catch (err) {
      console.error("Engine host: a message could not be sent:", err);
    }
  };
  const result = (id, value, transfer = []) => send({ v: 2, id, kind: "result", result: value }, transfer);
  const error = (id, e) => send({ v: 2, id, kind: "error", error: e }, transferablesOf(e));
  const setState = (next) => {
    state = next;
    send({ v: 2, id: 0, kind: "state", state: next });
  };
  const heap = () => engineHeap(engine, memory);
  const readManifest = () => manifest ??= (options.readManifest ?? defaultReadManifest)(options.base);
  async function builtVariants() {
    const m = await readManifest();
    const built = m?.variants ? Object.keys(m.variants) : ["st", "mt"];
    return ["st", "mt", "mt64"].filter((v) => built.includes(v) && canRun(v));
  }
  const canRun = (v) => v === "st" || env.threads && (v === "mt" || env.memory64);
  const maxHeapBytesOf = (v) => v === "mt64" ? build.maxHeapBytes64 ?? 16 * 1024 ** 3 : build.maxHeapBytes;
  async function hello(params) {
    const p = params;
    const major = p?.protocol?.major;
    if (major !== PROTOCOL.major) {
      throw Object.assign(new Error(`This engine host speaks protocol ${PROTOCOL.major}; the client asked for ${String(major)}.`), {
        code: ErrorCode.ProtocolMismatch,
        detail: String(PROTOCOL.major)
      });
    }
    const variants = await builtVariants();
    return {
      protocol: { major: PROTOCOL.major, minor: PROTOCOL.minor },
      engine: engineInfo(options.base, build),
      capabilities: CAPABILITIES,
      variants,
      limits: {
        maxThreads: env.hardwareConcurrency,
        maxHeapBytes: build.maxHeapBytes,
        maxHeapBytesByVariant: Object.fromEntries(variants.map((v) => [v, maxHeapBytesOf(v)]))
      },
      formats: { definitions: 1, catalogue: 2, toolpaths: 1, settingsView: 1 }
    };
  }
  function status() {
    if (state.state !== "ready") return state;
    const h = heap();
    return h ? { ...state, heapBytes: h.bytes, ...h.maxBytes ? { maxHeapBytes: h.maxBytes } : {} } : state;
  }
  async function ensureEngine(params = {}) {
    if (dead) throw dead;
    const requested = params.variant ?? "auto";
    if (requested !== "auto" && requested !== "st" && requested !== "mt" && requested !== "mt64") throw new BadRequest(`"variant" must be st, mt, mt64 or auto.`);
    if (loaded) {
      if (requested !== "auto" && requested !== loaded.variant) {
        throw new BadRequest(`The engine is already loaded as ${loaded.variant}: start a new host for ${requested}.`);
      }
      return loaded;
    }
    if (loading) return loading;
    loading = (async () => {
      const variants = await builtVariants();
      if ((requested === "mt" || requested === "mt64") && !env.threads) throw new BadRequest(`'${requested}' needs SharedArrayBuffer (a cross-origin isolated page).`);
      if (requested === "mt64" && !env.memory64) throw new BadRequest("'mt64' needs WebAssembly Memory64 (Chrome 133, Firefox 134 or newer; not Safari).");
      if (requested === "mt64" && !variants.includes("mt64")) throw new BadRequest("'mt64' is not part of this build.");
      const variant = requested === "auto" ? variants.includes("mt") ? "mt" : "st" : requested;
      const base2 = params.base ?? options.base;
      const wasmBytes = (await readManifest())?.variants?.[variant]?.wasmBytes;
      setState({ state: "loading", variant, loadedBytes: 0, totalBytes: wasmBytes ?? 0 });
      if (variant !== "st" && params.threads) limitThreads(params.threads);
      try {
        const l = await load(base2, variant, {
          ...wasmBytes ? { wasmBytes } : {},
          onDownload: (loadedBytes, totalBytes, done) => setState({ state: "loading", variant, loadedBytes, totalBytes, ...done ? { done } : {} })
        });
        engine = l.engine;
        memory = l.memory;
        loaded = { variant, initMs: l.initMs };
        const h = heap();
        setState({ state: "ready", variant, initMs: l.initMs, ...h ? { heapBytes: h.bytes, ...h.maxBytes ? { maxHeapBytes: h.maxBytes } : {} } : {} });
        return loaded;
      } catch (err) {
        const failure = startFailure(err);
        dead = { code: ErrorCode.NotLoaded, message: `The slicing engine could not start: ${failure.message}`, ...failure.detail ? { detail: failure.detail } : {} };
        setState({ state: "fatal", ...failure });
        throw dead;
      }
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }
  function engineJob(run) {
    try {
      return run(engine);
    } catch (err) {
      if (err instanceof EngineJobError || err instanceof BadRequest) throw err;
      dead = engineFailure(err, heap());
      setState({ state: "fatal", code: dead.code, message: dead.message, ...dead.detail ? { detail: dead.detail } : {} });
      throw dead;
    }
  }
  async function engineOp(id, op, params) {
    if (op === "load") {
      result(id, await ensureEngine(params ?? {}));
      return;
    }
    if (PROFILE_OPS2.has(op)) {
      const request = profilesRequest(op, params);
      await ensureEngine();
      result(id, engineJob((e) => runProfiles(e, op, request)));
      return;
    }
    const job = op === "slice" ? sliceJob(params) : op === "check" ? checkJob(params) : null;
    await ensureEngine();
    if (op === "config.definitions") {
      result(id, engineJob((e) => readConfigDefinitions(e)));
    } else if (op === "slice") {
      let percent = 0;
      const output = engineJob(
        (e) => runSlice(
          e,
          job,
          (p, message) => {
            percent = Math.max(percent, p);
            send({ v: 2, id, kind: "progress", progress: { percent, message } });
          },
          (warning) => send({ v: 2, id, kind: "warning", warning })
        )
      );
      const value = sliceResult(output, heap()?.bytes);
      result(id, value, transferablesOf(value));
    } else {
      const output = engineJob((e) => runCheck(e, job));
      const value = checkResult(output, heap()?.bytes);
      result(id, value, transferablesOf(value));
    }
  }
  async function settingsOp(id, op, params) {
    settings ??= (options.loadSettings ?? (() => import("./host-service.1a427e617f5f4dbf.js")))().then((m) => ({
      service: new m.SettingsService({ build: `${build.version}|${build.commit}` }),
      Failure: m.SettingsRequestError
    }));
    let s;
    try {
      s = await settings;
    } catch (err) {
      settings = null;
      error(id, { code: ErrorCode.Internal, message: "The settings service could not be loaded.", detail: messageOf2(err) });
      return;
    }
    try {
      const value = op === "settings.catalogue" ? s.service.catalogueDocument() : op === "settings.view" ? s.service.view(params) : s.service.edit(params);
      result(id, value);
    } catch (err) {
      if (err instanceof s.Failure) error(id, { code: err.code, message: err.message, ...err.detail ? { detail: err.detail } : {} });
      else error(id, { code: ErrorCode.Internal, message: `The settings service failed: ${messageOf2(err)}` });
    }
  }
  function failed(id, err) {
    if (err instanceof EngineJobError) error(id, err.error);
    else if (err instanceof BadRequest) {
      error(id, { code: ErrorCode.BadRequest, message: err.message, ...err.detail ? { detail: err.detail } : {}, ...err.objects ? { objects: err.objects } : {} });
    } else if (err && typeof err === "object" && "code" in err && typeof err.code === "number" && "message" in err) {
      const e = err;
      error(id, { code: e.code, message: e.message, ...e.detail ? { detail: e.detail } : {}, ...e.objects ? { objects: e.objects } : {} });
    } else error(id, { code: ErrorCode.Internal, message: messageOf2(err) });
  }
  function receive(message) {
    if (!message || typeof message !== "object") return;
    const m = message;
    const id = m.id;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      console.warn("Engine host: a message without a request id was ignored.");
      return;
    }
    if (m.v !== 2) {
      error(id, { code: ErrorCode.ProtocolMismatch, message: `This engine host speaks protocol ${PROTOCOL.major}.`, detail: String(PROTOCOL.major) });
      return;
    }
    const op = m.op;
    const params = m.params ?? {};
    if (typeof op !== "string" || !OPS.includes(op)) {
      error(id, { code: ErrorCode.Unsupported, message: `This engine host has no op "${String(op)}".` });
      return;
    }
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      error(id, { code: ErrorCode.BadRequest, message: `"params" of ${op} must be an object.` });
      return;
    }
    switch (op) {
      case "hello":
        hello(params).then((r) => result(id, r), (err) => failed(id, err));
        return;
      case "status":
        result(id, status());
        return;
      case "cancel": {
        const target = params.target;
        if (typeof target !== "number") {
          error(id, { code: ErrorCode.BadRequest, message: "cancel needs { target: <request id> }." });
          return;
        }
        const accepted = lanes.engine.remove(target) || lanes.settings.remove(target);
        if (accepted) error(target, { code: ErrorCode.Cancelled, message: "Cancelled." });
        result(id, { accepted });
        return;
      }
    }
    if (ENGINE_OPS2.has(op)) {
      lanes.engine.push({ id, run: () => engineOp(id, op, params).catch((err) => failed(id, err)) });
    } else if (SETTINGS_OPS.has(op)) {
      lanes.settings.push({ id, run: () => settingsOp(id, op, params) });
    }
  }
  return { receive, state: status };
}
function serve(transport, options) {
  const host = createHost({ ...options, send: (message, transfer) => transport.send(message, transfer) });
  transport.listen((message) => host.receive(message));
  return host;
}

// host/src/worker.ts
var base = new URL("./", import.meta.url).href;
var inWorker = typeof globalThis.WorkerGlobalScope !== "undefined";
var inNode = typeof process === "object" && typeof process.versions?.node === "string";
if (inWorker) {
  serve(workerTransport(globalThis), {
    base,
    environment: {
      kind: "browser",
      threads: globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === "function",
      hardwareConcurrency: navigator.hardwareConcurrency || 1
    }
  });
} else if (inNode) {
  const { isMainThread, parentPort, workerData } = await import("node:worker_threads");
  if (!isMainThread && parentPort) {
    const os = await import("node:os");
    serve(nodeWorkerTransport(parentPort), {
      // workerData.engineBase: the engine files are elsewhere (the tests run these sources against dist/).
      base: typeof workerData?.engineBase === "string" ? workerData.engineBase : base,
      environment: { kind: "node", threads: typeof SharedArrayBuffer === "function", hardwareConcurrency: os.availableParallelism() }
    });
  }
}
