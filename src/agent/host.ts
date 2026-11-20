/**
 * host.ts: AgentHost, the only thing Python calls.
 *
 * It interprets rna.ts against the live booth and owns no document state.
 * Every read is booth.doc or booth.scene at the moment of the read, and every
 * assignment is one booth.update, so parseDocument validates it and a refused
 * write leaves the document as it was. A user's edit in the tab is simply seen
 * by the script's next read.
 *
 * The FFI is `call(request, io)`: one JSON request from bpy.py, one JSON reply,
 * so no Pyodide proxy outlives a call and tests drive the host without Python.
 * A blocking operator (render, import, preview) answers with a promise, which
 * the worker channel waits on while the page stays live.
 *
 * Session state that is not a booth setting (scene.render.filepath and
 * bpy.context.object) lives here, so it survives a restarted interpreter.
 */
import type { Booth } from "../booth";
import { BOUNDS, DocumentError, m, type BoothDocument, type Bounds } from "../document";
import { addLight, addProp } from "../edits";
import type { RadianceFrame } from "../film";
import { PhotoCancelled, type Photo, type PhotoEngine, type PhotoProgress } from "../photo/photo";
import type { FilmSection } from "../scene";
import type { PhotoSession } from "../ui/photo-session";
import type { ImageMeta } from "./protocol";
import {
  COLLECTIONS, DEFAULT_RENDER_FILEPATH, HostError, OPS, OPS_MISSING, OWNERS, PART, RNA, SCENE,
  boolOf, enumError, fmt, handleKey, lightHandle, numberOf, parseHandle, propHandle, propRange, pyRepr, pyTypeName, referenceText,
  sameHandle, structKey, uniqueName, uniqueNames,
  type CollectionName, type Handle, type Json, type Member, type OpArgs, type OpDef, type OpHost, type OpResult,
  type Prop, type PyErrorType, type ReadContext, type RnaType, type RnaTypeName, type SessionState,
} from "./rna";

export { HostError };

// ---- ports -----------------------------------------------------------------------------------

export interface Thumbnail { readonly blob: Blob; readonly width: number; readonly height: number }

/** What the host drives. The app passes the real parts; tests pass a real Booth over a fake print port. */
export interface HostPorts {
  readonly booth: Pick<Booth, "doc" | "scene" | "print" | "partName" | "update" | "open" | "whenIdle" | "sceneWith" | "subscribe"
    | "addPropMesh" | "propMesh">;
  /** The photo card's session: render.render goes through it, so the card shows an agent's photo as it shows PHOTO. */
  readonly photos: Pick<PhotoSession, "take" | "state">;
  /** The raster engine over the live viewport, for render.opengl. Null where the tab has no viewport. */
  readonly raster: Pick<PhotoEngine, "render"> | null;
  /** Tone maps a frame to a PNG: film.develop in the app. */
  readonly develop: (frame: RadianceFrame, film: FilmSection) => Promise<Blob>;
  /** A PNG to a JPEG with the given long edge, for the agent to look at. */
  readonly thumbnail: (png: Blob, maxEdgePx: number) => Promise<Thumbnail>;
}

/** One running script's reach outside the tab. Built per job over the bridge link, or in memory by the dev page. */
export interface JobIo {
  /** Aborts when the job is cancelled. A photo in flight is cancelled with it. */
  readonly signal: AbortSignal;
  /** Output for the agent: what the host itself reports, beside the script's print(). */
  print(text: string): void;
  /** What the tab is doing now. Each call replaces the last. */
  progress(text: string, fraction: number | null): void;
  /** A file on the agent's machine. Rejects with the reason, such as a path outside the allowed folders. */
  read(path: string): Promise<File>;
  /**
   * Writes a file on the agent's machine and resolves to the absolute path
   * written. A `path` ending in .png is the file; any other path is a folder,
   * and the file is `name` inside it.
   */
  write(path: string, name: string, bytes: Blob): Promise<string>;
  /** A finished render or preview, with a JPEG thumbnail for the agent to see. */
  image(meta: ImageMeta, thumbnail: Blob): void;
}

export const THUMBNAIL_EDGE_PX = 768;
export const PREVIEW_EDGE_PX = 768;
export const PREVIEW_SAMPLES = 16;

/** What Python gets back from a read: a plain or wrapped value, a struct, or a collection. */
export type PyValue =
  | { readonly v: Json; readonly wrap: "Vector" | "Euler" | "Color" | "array" | "float" | null }
  | { readonly struct: string; readonly type: RnaTypeName }
  | { readonly coll: CollectionName; readonly owner: string };

/** The FFI request bpy.py sends, parsed. */
type Request =
  | { readonly fn: "boot" }
  | { readonly fn: "get"; readonly handle: Handle; readonly type: RnaTypeName; readonly attr: string }
  | { readonly fn: "set"; readonly handle: Handle; readonly type: RnaTypeName; readonly attr: string; readonly value: Json }
  | { readonly fn: "members"; readonly collection: CollectionName; readonly owner: Handle }
  | { readonly fn: "remove"; readonly collection: CollectionName; readonly handle: Handle }
  | { readonly fn: "create"; readonly collection: CollectionName }
  | { readonly fn: "op"; readonly name: string; readonly args: OpArgs }
  | { readonly fn: "repr"; readonly handle: Handle; readonly type: RnaTypeName }
  | { readonly fn: "reference"; readonly only: string | null };

export class AgentHost {
  readonly #ports: HostPorts;
  #session: SessionState = { renderFilepath: DEFAULT_RENDER_FILEPATH, active: null };

  constructor(ports: HostPorts) {
    this.#ports = ports;
  }

  get session(): SessionState { return this.#session; }

  /**
   * One request from bpy.py, `["get", "light:key", "AreaLight", "energy"]`,
   * answered with `{"ok": value}` or `{"error": {"type", "message"}}`. Never
   * throws. `io` is the running script's, or null while the shim boots.
   */
  call(request: string, io: JobIo | null): string | Promise<string> {
    let result: Json | Promise<Json>;
    try {
      result = this.#dispatch(parseRequest(request), io);
    } catch (e) {
      return failure(e);
    }
    return result instanceof Promise ? result.then(success, failure) : success(result);
  }

  #dispatch(req: Request, io: JobIo | null): Json | Promise<Json> {
    switch (req.fn) {
      case "boot": return bootTable();
      case "get": return this.#get(req.handle, req.type, req.attr);
      case "set": return { warning: this.#set(req.handle, req.type, req.attr, req.value) };
      case "members": return this.#members(req.collection, req.owner).map((mb) => ({ name: mb.name, struct: handleKey(mb.handle), type: mb.type }));
      case "remove": this.#remove(req.collection, req.handle); return null;
      case "create": throw new HostError("RuntimeError", `bpy.data.${req.collection}.new is not in the booth: ${COLLECTIONS[req.collection].newHint}`);
      case "op": return this.#op(req.name, req.args, io);
      case "repr": return this.#path(RNA[req.type], req.handle);
      case "reference": return referenceText(req.only);
    }
  }

  // ---- reading ------------------------------------------------------------------------------

  #ctx(handle: Handle): ReadContext {
    const { booth } = this.#ports;
    return { doc: booth.doc, scene: booth.scene, handle, session: this.#session, partName: booth.partName, propMesh: (id) => booth.propMesh(id) };
  }

  /** The owner node of `t` for `handle` in `doc`, or Blender's ReferenceError when its object is gone. */
  #node(t: RnaType, handle: Handle, doc: BoothDocument): Record<string, unknown> {
    const node = OWNERS[t.owner].node(doc, handle);
    if (node === null) throw new HostError("ReferenceError", `StructRNA of type ${t.pyClass} has been removed`);
    return node as unknown as Record<string, unknown>;
  }

  #prop(t: RnaType, typeName: RnaTypeName, handle: Handle, attr: string): Exclude<Prop, { kind: "missing" }> {
    const prop = Object.hasOwn(t.props, attr) ? t.props[attr] : undefined;
    if (prop === undefined) {
      const has = Object.entries(t.props).filter(([, p]) => p.kind !== "missing").map(([a]) => a);
      throw new HostError("AttributeError",
        `'${t.pyClass}' object has no attribute '${attr}'. The booth's ${typeName} has: ${has.join(", ")}. See bpy.booth.reference('${typeName}').`);
    }
    if (prop.kind === "missing") throw new HostError("AttributeError", `${this.#path(t, handle)}.${attr} is not in the booth: ${prop.hint}`);
    return prop;
  }

  #get(handle: Handle, typeName: RnaTypeName, attr: string): PyValue {
    const t = RNA[typeName];
    const prop = this.#prop(t, typeName, handle, attr);
    const node = this.#node(t, handle, this.#ports.booth.doc);
    switch (prop.kind) {
      case "num": {
        const bounds: Bounds = BOUNDS[prop.bounds];
        return { v: (node[prop.key] as number) * prop.scale, wrap: bounds.int === true ? null : "float" };
      }
      case "bool": return { v: prop.invert !== (node[prop.key] as boolean), wrap: null };
      case "choice": return { v: Object.keys(prop.map).find((k) => prop.map[k] === node[prop.key]) ?? null, wrap: null };
      case "text": return { v: this.#members(prop.unique).find((mb) => sameHandle(mb.handle, handle))?.name ?? (node[prop.key] as string), wrap: null };
      case "codec": {
        const v = prop.codec.get(node, this.#ctx(handle));
        const wrap = prop.codec.wrap;
        if (wrap !== null && typeof wrap === "object") return typeof v === "string" ? { struct: v, type: wrap.struct } : { v: null, wrap: null };
        return { v, wrap };
      }
      case "fixed": return { v: prop.value, wrap: null };
      case "pointer": return { struct: handleKey(prop.handle ?? handle), type: prop.type };
      case "collection": return { coll: prop.collection, owner: handleKey(handle) };
      case "session": {
        if (prop.key === "renderFilepath") return { v: this.#session.renderFilepath, wrap: null };
        const active = this.#session.active;
        const member = active === null ? undefined : this.#members("objects").find((mb) => sameHandle(mb.handle, active));
        return member === undefined ? { v: null, wrap: null } : { struct: handleKey(member.handle), type: member.type };
      }
    }
  }

  #members(collection: CollectionName, owner: Handle = SCENE): readonly Member[] {
    const { booth } = this.#ports;
    return uniqueNames(COLLECTIONS[collection].members({ doc: booth.doc, partName: booth.partName, owner }));
  }

  /** How Blender spells a struct: bpy.data.lights['Key']. */
  #path(t: RnaType, handle: Handle): string {
    if (!t.path.includes("{name}")) return t.path;
    const name = handle.t === "light" || handle.t === "prop"
      ? (this.#members("objects").find((mb) => sameHandle(mb.handle, handle))?.name ?? handle.id)
      : handle.t === "part" ? (this.#ports.booth.partName ?? "part")
      : handle.t === "image" ? (OWNERS.image.node(this.#ports.booth.doc as BoothDocument, handle)?.file ?? handle.id)
      : handle.t;
    return t.path.replace("{name}", pyRepr(name));
  }

  // ---- writing ------------------------------------------------------------------------------

  /** One assignment, one booth.update. Returns a warning for the script's output, or null. */
  #set(handle: Handle, typeName: RnaTypeName, attr: string, value: Json): string | null {
    const t = RNA[typeName];
    const prop = this.#prop(t, typeName, handle, attr);
    const where = `${this.#path(t, handle)}.${attr}`;
    this.#node(t, handle, this.#ports.booth.doc);
    switch (prop.kind) {
      case "fixed":
        if (sameJson(value, prop.value)) return null;
        throw new HostError("ValueError", `${where} is always ${pyRepr(prop.value)} in the booth${prop.why === "" ? "" : `: ${prop.why}`}`);
      case "pointer":
        if (structKey(value) === handleKey(prop.handle ?? handle)) return null;
        throw new HostError("AttributeError", `${where} is read-only in the booth`);
      case "collection":
        throw new HostError("AttributeError", `${where} is read-only`);
      case "session":
        if (prop.key === "active") throw new HostError("AttributeError", `${where} is read-only: the object an operator adds or imports becomes bpy.context.object`);
        if (typeof value !== "string") throw new HostError("TypeError", `${where}: expected a str, not ${pyTypeName(value)}`);
        this.#session = { ...this.#session, renderFilepath: value };
        return null;
      case "codec":
        if (prop.codec.set === undefined) throw new HostError("AttributeError", `${where} is read-only: ${prop.codec.readOnly}`);
    }
    const ctx = this.#ctx(handle);
    return this.#edit(where, prop, value, (draft) => this.#apply(prop, this.#node(t, handle, draft), value, ctx));
  }

  /** Writes one prop into a node of a draft. Runs inside booth.update. */
  #apply(prop: Prop, node: Record<string, unknown>, value: Json, ctx: ReadContext): string | undefined {
    switch (prop.kind) {
      case "num":
        node[prop.key] = numberOf(value) / prop.scale;
        return undefined;
      case "bool":
        node[prop.key] = prop.invert !== boolOf(value);
        return undefined;
      case "choice": {
        const mapped = typeof value === "string" && Object.hasOwn(prop.map, value) ? prop.map[value] : undefined;
        if (mapped === undefined) throw enumError(value, Object.keys(prop.map));
        node[prop.key] = mapped;
        return undefined;
      }
      case "text": {
        if (typeof value !== "string") throw new HostError("TypeError", `expected a str, not ${pyTypeName(value)}`);
        const taken = new Set(this.#members(prop.unique).filter((mb) => !sameHandle(mb.handle, ctx.handle)).map((mb) => mb.name));
        node[prop.key] = uniqueName(value, taken);
        return undefined;
      }
      case "codec":
        if (prop.codec.set === undefined) throw new HostError("AttributeError", `read-only: ${prop.codec.readOnly}`);
        return prop.codec.set(node, value, ctx);
      default:
        throw new HostError("AttributeError", "read-only");
    }
  }

  /**
   * Runs one booth.update and words its failures for Python: a DocumentError
   * names the bpy attribute and the document field, other errors get `where`.
   */
  #edit(where: string, prop: Prop | null, value: Json, mutate: (draft: BoothDocument) => string | undefined): string | null {
    let warning: string | undefined;
    try {
      this.#ports.booth.update((draft) => { warning = mutate(draft); });
    } catch (e) {
      if (e instanceof DocumentError) {
        const problem = e.message.slice(e.path.length + 2);
        const scaled = prop?.kind === "num" && prop.scale !== 1 && typeof value === "number";
        throw new HostError("ValueError", scaled
          ? `${where}: ${fmt(value)} is out of range, ${propRange(prop.bounds, prop.scale)} ${prop.unit} (document field ${e.path})`
          : `${where}: ${problem} (document field ${e.path})`);
      }
      if (e instanceof HostError && (e.pyType === "TypeError" || e.pyType === "ValueError") && !e.message.startsWith(where)) {
        throw new HostError(e.pyType, `${where}: ${e.message}`);
      }
      throw e;
    }
    return warning ?? null;
  }

  #remove(collection: CollectionName, handle: Handle): void {
    const def = COLLECTIONS[collection];
    const member = this.#members(collection).find((mb) => sameHandle(mb.handle, handle));
    if (member === undefined) throw new HostError("ReferenceError", "StructRNA of type Object has been removed");
    const edit = def.remove?.(member) ?? `bpy.data.${collection} cannot change`;
    if (typeof edit === "string") throw new HostError("RuntimeError", `bpy.data.${collection}.remove: ${edit}`);
    this.#edit(`bpy.data.${collection}.remove`, null, null, (draft) => { edit(draft); return undefined; });
    if (this.#session.active !== null && sameHandle(this.#session.active, handle)) this.#session = { ...this.#session, active: null };
  }

  // ---- operators ----------------------------------------------------------------------------

  #op(name: string, kwargs: OpArgs, io: JobIo | null): Json | Promise<Json> {
    const def: OpDef | undefined = Object.hasOwn(OPS, name) ? OPS[name as keyof typeof OPS] : undefined;
    if (def === undefined) {
      const hint = Object.hasOwn(OPS_MISSING, name) ? OPS_MISSING[name] : undefined;
      throw new HostError("AttributeError", hint !== undefined
        ? `bpy.ops.${name} is not in the booth: ${hint}`
        : `Calling operator "bpy.ops.${name}" error, could not be found. The booth's operators: ${Object.keys(OPS).map((o) => `bpy.ops.${o}`).join(", ")}`);
    }
    const result = def.run(opArgs(name, def, kwargs), this.#opHost(name, io));
    return result instanceof Promise ? result.then((r) => [r]) : [result];
  }

  #opHost(name: string, io: JobIo | null): OpHost {
    const where = `bpy.ops.${name}`;
    const running = (): JobIo => {
      if (io === null) throw new HostError("RuntimeError", `${where} needs a running script`);
      return io;
    };
    return {
      edit: (edit) => { this.#edit(where, null, null, (draft) => { edit(draft); return undefined; }); },
      addLight: (kind, name, location, size) => { this.#addLight(where, kind, name, location, size); },
      open: (path, accept) => this.#open(running(), where, path, accept),
      addProp: (shape, fields) => { this.#addProp(where, shape, fields); },
      readPropMesh: (path) => this.#readPropMesh(running(), where, path),
      photo: (writeStill) => this.#photo(running(), writeStill),
      preview: (writeStill) => this.#preview(running(), writeStill),
    };
  }

  /** The light, its name and its place land in one booth.update, through the same props as obj.location and obj.booth.width. */
  #addLight(where: string, kind: "area" | "scrim", name: string, location: Json, size: Json): void {
    const taken = new Set(this.#members("objects").map((mb) => mb.name));
    const unique = uniqueName(name, taken);
    const ctx = this.#ctx(SCENE);
    let id = "";
    this.#edit(where, null, null, (draft) => {
      addLight(kind)(draft);
      const light = draft.studio.lights[draft.studio.lights.length - 1];
      id = light.id;
      light.name = unique;
      const node = light as unknown as Record<string, unknown>;
      if (location !== null) this.#apply(RNA.LightObject.props.location, node, location, ctx);
      if (Array.isArray(size)) {
        light.width = m(numberOf(size[0]));
        light.height = m(numberOf(size[1]));
      }
      return undefined;
    });
    this.#session = { ...this.#session, active: lightHandle(id) };
  }

  /** The prop and its unique name land in one booth.update, and it becomes bpy.context.object. */
  #addProp(where: string, shape: Parameters<OpHost["addProp"]>[0], fields: Parameters<OpHost["addProp"]>[1]): void {
    const taken = new Set(this.#members("objects").map((mb) => mb.name));
    let id = "";
    this.#edit(where, null, null, (draft) => {
      addProp(shape, fields)(draft);
      const prop = draft.props[draft.props.length - 1];
      id = prop.id;
      prop.name = uniqueName(prop.name, taken);
      return undefined;
    });
    this.#session = { ...this.#session, active: propHandle(id) };
  }

  async #readPropMesh(io: JobIo, where: string, path: string): Promise<{ mesh: string; name: string; reconnected: boolean }> {
    const { booth } = this.#ports;
    const name = path.split(/[\\/]/).pop() ?? path;
    if (!/\.stl$/i.test(name)) throw new HostError("RuntimeError", `${where} reads .stl files, not ${name}`);
    io.progress(`reading ${name}`, null);
    let file: File;
    try {
      file = await untilAborted(io.read(path), io.signal);
    } catch (e) {
      if (io.signal.aborted) throw e;
      throw new HostError("RuntimeError", `${where}: cannot read ${path}: ${errorText(e)}`);
    }
    const bytes = await untilAborted(file.arrayBuffer(), io.signal);
    // Meshes saved props name but this session has not loaded: a reload left them hidden.
    const missing = new Set(booth.doc.props.flatMap((p) => (p.mesh !== null && booth.propMesh(p.mesh) === null ? [p.mesh] : [])));
    let mesh: string;
    try {
      mesh = booth.addPropMesh(name, bytes);
    } catch (e) {
      throw new HostError("RuntimeError", `${where}: ${name}: ${errorText(e)}`);
    }
    const back = missing.has(mesh) ? booth.doc.props.find((p) => p.mesh === mesh) : undefined;
    if (back !== undefined) {
      this.#session = { ...this.#session, active: propHandle(back.id) };
      io.print(`${where}: ${name} brought back the saved props that name it; nothing was added.\n`);
    }
    return { mesh, name, reconnected: back !== undefined };
  }

  async #open(io: JobIo, where: string, path: string, accept: "stl" | "gcode"): Promise<void> {
    const { booth } = this.#ports;
    const name = path.split(/[\\/]/).pop() ?? path;
    const fits = accept === "stl" ? /\.stl$/i.test(name) : /\.(gcode|3mf)$/i.test(name);
    if (!fits) {
      throw new HostError("RuntimeError", accept === "stl"
        ? `${where} reads .stl files, not ${name}: open G-code with bpy.ops.booth.gcode_import(filepath=...)`
        : `${where} reads .gcode and .gcode.3mf files, not ${name}: open an STL with bpy.ops.wm.stl_import(filepath=...)`);
    }
    io.progress(`reading ${name}`, null);
    let file: File;
    try {
      file = await untilAborted(io.read(path), io.signal);
    } catch (e) {
      if (io.signal.aborted) throw e;
      throw new HostError("RuntimeError", `${where}: cannot read ${path}: ${errorText(e)}`);
    }
    const stop = booth.subscribe(() => {
      const p = booth.print;
      if (p.status === "loading") io.progress(`opening ${file.name} · ${p.stage}`, null);
    });
    try {
      await untilAborted(booth.open(file), io.signal);
      const state = await untilAborted(booth.whenIdle(), io.signal);
      if (state.status === "error") throw new HostError("RuntimeError", `${where}: ${state.message}`);
    } finally {
      stop();
    }
    this.#session = { ...this.#session, active: PART };
  }

  async #photo(io: JobIo, writeStill: boolean): Promise<OpResult> {
    const { booth, photos, thumbnail } = this.#ports;
    await untilAborted(booth.whenIdle(), io.signal);
    if (booth.partName === null) {
      throw new HostError("RuntimeError", "render.render: no part is open. Import one first: bpy.ops.wm.stl_import(filepath=...) or bpy.ops.booth.gcode_import(filepath=...)");
    }
    const limitS = booth.scene.film.timeLimitS;
    const run = photos.take();
    if (run === null) {
      const now = photos.state.get().run;
      throw new HostError("RuntimeError", now.phase === "running"
        ? "render.render: a photo is already running in the booth tab. Wait for it, or cancel it in the photo card"
        : `render.render: ${now.phase === "failed" ? now.message : "the photo did not start"}`);
    }
    const stopProgress = run.onProgress((p) => {
      const text = progressText(p, limitS);
      if (text !== null) io.progress(text, p.state === "rendering" ? p.fraction : null);
    });
    const cancel = () => { run.cancel(); };
    io.signal.addEventListener("abort", cancel, { once: true });
    let photo: Photo;
    try {
      photo = await run.result;
    } catch (e) {
      if (io.signal.aborted) throw cancelled();
      if (e instanceof PhotoCancelled) {
        io.print("render.render: the photo was cancelled in the booth tab.\n");
        return "CANCELLED";
      }
      throw new HostError("RuntimeError", `render.render: ${errorText(e)}`);
    } finally {
      stopProgress();
      io.signal.removeEventListener("abort", cancel);
    }
    const stopped = stoppedLine(photo);
    if (stopped !== null) io.print(`${stopped}\n`);
    const path = writeStill ? await this.#write(io, "render.render", photo.fileName, photo.png) : null;
    const thumb = await thumbnail(photo.png, THUMBNAIL_EDGE_PX);
    io.image({ label: "render", path, width: photo.width, height: photo.height, note: photoNote(photo) }, thumb.blob);
    return "FINISHED";
  }

  async #preview(io: JobIo, writeStill: boolean): Promise<void> {
    const { booth, photos, raster, develop, thumbnail } = this.#ports;
    if (raster === null) throw new HostError("RuntimeError", "render.opengl: the preview is not available in this tab");
    await untilAborted(booth.whenIdle(), io.signal);
    if (photos.state.get().run.phase === "running") {
      throw new HostError("RuntimeError", "render.opengl: a photo is running in the booth tab and the preview shares its renderer. Wait for the photo first");
    }
    const scene = booth.sceneWith((draft) => {
      draft.output.longEdgePx = PREVIEW_EDGE_PX;
      draft.output.samples = PREVIEW_SAMPLES;
      draft.output.timeLimitS = 0;
    });
    io.progress("rendering the preview", null);
    const frame = await untilAborted(raster.render(scene, () => {}, io.signal), io.signal);
    const png = await develop(frame, scene.film);
    const path = writeStill ? await this.#write(io, "render.opengl", `${booth.partName ?? "booth"}_preview.png`, png) : null;
    const thumb = await thumbnail(png, THUMBNAIL_EDGE_PX);
    io.image({ label: "preview", path, width: frame.width, height: frame.height, note: "raster preview, not a Cycles photo" }, thumb.blob);
  }

  async #write(io: JobIo, where: string, name: string, png: Blob): Promise<string> {
    const target = this.#session.renderFilepath;
    try {
      return await untilAborted(io.write(target, name, png), io.signal);
    } catch (e) {
      if (io.signal.aborted) throw e;
      throw new HostError("RuntimeError", `${where}: cannot write ${target}: ${errorText(e)}`);
    }
  }
}

// ---- the FFI boundary --------------------------------------------------------------------------

const success = (ok: Json): string => JSON.stringify({ ok });

function failure(e: unknown): string {
  if (e instanceof HostError) return JSON.stringify({ error: { type: e.pyType, message: e.message } });
  // A bug in the booth, not in the script. The script still gets an exception it can read.
  console.error("agent host", e);
  const type: PyErrorType = "RuntimeError";
  return JSON.stringify({ error: { type, message: `internal error in the booth: ${errorText(e)}` } });
}

const isType = (v: unknown): v is RnaTypeName => typeof v === "string" && Object.hasOwn(RNA, v);
const isCollection = (v: unknown): v is CollectionName => typeof v === "string" && Object.hasOwn(COLLECTIONS, v);

function parseRequest(text: string): Request {
  const bad = (why: string) => new HostError("RuntimeError", `bpy sent a request the booth cannot read (${why}): ${text.slice(0, 200)}`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw bad("not JSON");
  }
  if (!Array.isArray(raw) || typeof raw[0] !== "string") throw bad("expected [fn, ...args]");
  const [fn, a, b, c, d] = raw as [string, unknown, unknown, unknown, unknown];
  const handle = (v: unknown): Handle => {
    const h = typeof v === "string" ? parseHandle(v) : null;
    if (h === null) throw bad(`no handle ${JSON.stringify(v)}`);
    return h;
  };
  const type = (v: unknown): RnaTypeName => { if (!isType(v)) throw bad(`no type ${JSON.stringify(v)}`); return v; };
  const collection = (v: unknown): CollectionName => { if (!isCollection(v)) throw bad(`no collection ${JSON.stringify(v)}`); return v; };
  const attr = (v: unknown): string => { if (typeof v !== "string") throw bad("attribute"); return v; };
  switch (fn) {
    case "boot": return { fn };
    case "get": return { fn, handle: handle(a), type: type(b), attr: attr(c) };
    case "set": return { fn, handle: handle(a), type: type(b), attr: attr(c), value: (d ?? null) as Json };
    case "members": return { fn, collection: collection(a), owner: b === undefined || b === null ? SCENE : handle(b) };
    case "remove": return { fn, collection: collection(a), handle: handle(b) };
    case "create": return { fn, collection: collection(a) };
    case "op": {
      if (typeof a !== "string" || typeof b !== "object" || b === null || Array.isArray(b)) throw bad("op");
      return { fn, name: a, args: b as OpArgs };
    }
    case "repr": return { fn, handle: handle(a), type: type(b) };
    case "reference": return { fn, only: typeof a === "string" ? a : null };
    default: throw bad(`no function ${fn}`);
  }
}

/** Sent once when the shim boots: one Python class per type, and where bpy.data and bpy.context start. */
function bootTable(): Json {
  return {
    types: Object.fromEntries(Object.entries(RNA).map(([name, t]) => [name, {
      pyClass: t.pyClass, doc: t.doc, attrs: Object.entries(t.props).filter(([, p]) => p.kind !== "missing").map(([a]) => a),
    }])),
    data: { struct: handleKey(SCENE), type: "BlendData" },
    context: { struct: handleKey(SCENE), type: "Context" },
    version: [5, 2, 3],
  };
}

/** Checks an operator's keyword arguments against its params and fills the defaults. */
function opArgs(name: string, def: OpDef, kwargs: OpArgs): OpArgs {
  const where = `bpy.ops.${name}`;
  for (const k of Object.keys(kwargs)) {
    if (!Object.hasOwn(def.params, k)) {
      throw new HostError("TypeError", `${where}: keyword "${k}" unrecognized. It takes ${Object.keys(def.params).join(", ")}`);
    }
  }
  const out: Record<string, Json> = {};
  for (const [k, param] of Object.entries(def.params)) {
    const given = Object.hasOwn(kwargs, k) ? kwargs[k] : undefined;
    try {
      switch (param.kind) {
        case "enum": {
          const v = given ?? param.default;
          if (v === null) throw new HostError("TypeError", `${k} is required, one of (${param.items.map((i) => pyRepr(i)).join(", ")})`);
          if (typeof v !== "string" || !param.items.includes(v)) throw enumError(v, param.items);
          out[k] = v;
          break;
        }
        case "bool":
          out[k] = given === undefined ? param.default : boolOf(given);
          break;
        case "vector":
          if (given === undefined || given === null) out[k] = null;
          else if (!Array.isArray(given) || given.length !== param.size || !given.every((x) => typeof x === "number")) {
            throw new HostError("TypeError", `${k} expected a sequence of ${param.size} floats, not ${pyTypeName(given)}`);
          } else out[k] = given;
          break;
        case "number": {
          const v = given === undefined ? param.default : numberOf(given);
          if (param.int && !Number.isInteger(v)) throw new HostError("TypeError", `${k} expected an int, not ${pyTypeName(v)}`);
          if (param.positive && v <= 0) throw new HostError("ValueError", `${k} must be more than 0, got ${fmt(v)}`);
          out[k] = v;
          break;
        }
        case "path":
          if (typeof given !== "string" || given === "") throw new HostError("TypeError", `${k} is required: a path on the agent's machine`);
          out[k] = given;
          break;
        case "fixed":
          if (given !== undefined && !sameJson(given, param.default)) {
            throw new HostError("ValueError", `${k} can only be ${pyRepr(param.default)} in the booth: ${param.why}`);
          }
          out[k] = param.default;
          break;
      }
    } catch (e) {
      if (e instanceof HostError) throw new HostError(e.pyType, `${where}: ${e.message}`);
      throw e;
    }
  }
  return out;
}

function sameJson(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x: Json, i: number) => sameJson(x, b[i] as Json));
  return false;
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const cancelled = (): HostError => new HostError("RuntimeError", "the script was cancelled");

/** Settles with `p`, or rejects as soon as the job is cancelled. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise<T>((resolve, reject) => {
    const abort = () => { reject(cancelled()); };
    signal.addEventListener("abort", abort, { once: true });
    p.then(
      (v) => { signal.removeEventListener("abort", abort); resolve(v); },
      (e: unknown) => { signal.removeEventListener("abort", abort); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

// ---- words for the agent -------------------------------------------------------------------------

function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60 === 0 ? "" : `${s % 60}s`}`;
  return `${Math.floor(s / 3600)}h${Math.round((s % 3600) / 60)}m`;
}

/** "rendering 42% · about 2m30s left · time limit 10m", or null for a final state. */
export function progressText(p: PhotoProgress, limitS: number): string | null {
  switch (p.state) {
    case "preparing": return `preparing the photo: ${p.message}`;
    case "rendering": return [
      `rendering ${Math.round(p.fraction * 100)}%`,
      p.etaS === null ? null : `about ${duration(p.etaS)} left`,
      limitS > 0 ? `time limit ${duration(limitS)}` : null,
    ].filter((part) => part !== null).join(" · ");
    case "developing": return "developing the photo";
    default: return null;
  }
}

/** One line saying why sampling stopped early, or null when it ran to its samples. */
export function stoppedLine(photo: Photo): string | null {
  const at = `at ${photo.samples} of ${photo.targetSamples} samples`;
  switch (photo.stoppedBy.kind) {
    case "time-limit": return `Render stopped by the ${photo.stoppedBy.limitS} s time limit ${at} (scene.cycles.time_limit).`;
    case "user": return `Render finished early from the booth tab ${at}.`;
    case "samples": return null;
  }
}

export function photoNote(photo: Photo): string {
  const why = photo.stoppedBy.kind === "time-limit" ? `, stopped by the ${photo.stoppedBy.limitS} s time limit`
    : photo.stoppedBy.kind === "user" ? ", finished early in the tab" : "";
  return `${photo.samples}/${photo.targetSamples} samples${why}, ${photo.engine === "cycles" ? "Cycles" : "raster fallback, not Cycles"}`;
}

/** The thumbnail port in a browser: a JPEG with the given long edge. */
export async function jpegThumbnail(png: Blob, maxEdgePx: number): Promise<Thumbnail> {
  const bitmap = await createImageBitmap(png);
  const k = Math.min(1, maxEdgePx / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  const canvas = new OffscreenCanvas(width, height);
  // On the CPU, like the canvas that encodes the photo: an accelerated canvas gave a black JPEG in a hardware-GPU Chromium.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("no 2D canvas for the thumbnail");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { blob: await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 }), width, height };
}
