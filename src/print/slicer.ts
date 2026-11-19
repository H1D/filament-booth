/**
 * The Muon3D slicer engine (OrcaSlicer in WebAssembly, AGPL-3.0) behind one
 * function. Every call starts a fresh engine host worker and ends it, because
 * an engine that slices several large parts runs out of memory. The engine
 * files are served from this origin, from public/slicer/engine.
 */
import { EngineConnection, workerTransport } from "@muon3d/slicer-engine-protocol";
import type { Config } from "@muon3d/slicer-engine-protocol";
import type { SliceSettings } from "../document";
import presets from "./a1mini-0.4.json";
import { orcaOverrides } from "./orca";
import { placeOnBed, triangleSoup } from "./stl";

const ENGINE_FOLDER = `${import.meta.env.BASE_URL}slicer/engine/`;

/** Boundary: the build manifest is JSON from the network. */
function hostFileOf(manifest: unknown): string {
  if (typeof manifest === "object" && manifest !== null && "host" in manifest) {
    const host = manifest.host;
    if (typeof host === "object" && host !== null && "file" in host && typeof host.file === "string") return host.file;
  }
  throw new Error("the slicer engine manifest names no host file");
}

/** Centre of the printable area, e.g. ["0x0", "180x0", "180x180", "0x180"]. */
function bedCentre(machine: Config): [number, number] {
  const area = machine.printable_area;
  if (!Array.isArray(area)) throw new Error("the slicer machine preset has no printable_area");
  const pts = area.map((p) => p.split("x").map(Number));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * G-code text for `stl` sliced with `settings`. Aborting `signal` ends the
 * engine worker at once and rejects the call.
 */
export async function sliceStl(stl: ArrayBuffer, settings: SliceSettings, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const base = new URL(ENGINE_FOLDER, globalThis.location.href);
  const manifestRes = await fetch(new URL("manifest.json", base), { signal });
  if (!manifestRes.ok) throw new Error(`slicer engine manifest: HTTP ${manifestRes.status}`);
  const host = hostFileOf(await manifestRes.json());
  const worker = new Worker(new URL(host, base), { type: "module", name: "muon3d-slicer-engine" });
  const conn = new EngineConnection(workerTransport(worker));
  const stop = (): void => { conn.close(); worker.terminate(); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    await conn.open({ name: "filament-booth", version: "0.0.0" }, { required: ["slice"] });
    await conn.request("load", { variant: "auto" });
    const [cx, cy] = bedCentre(presets.machine);
    const positions = placeOnBed(triangleSoup(stl), cx, cy);
    const res = await conn.request("slice", {
      configs: { machine: presets.machine, process: { ...presets.process, ...orcaOverrides(settings) }, filaments: presets.filaments },
      objects: [{ name: "part.stl", mesh: { positions } }],
      output: { toolpaths: false, toolpathExtras: false },
    }, { transfer: "auto", signal });
    return new TextDecoder().decode(res.gcode);
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
  }
}
