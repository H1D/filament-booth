/**
 * The agent's Python against the booth with stand-ins: the real worker, the
 * real AgentHost and a real Booth over dev/fakes.ts. Files live in memory
 * under /agent, so no bridge is needed. Open it with `bun run dev` at
 * /dev/agent.html. tools/agent/drive.ts drives this page.
 */
import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AgentHost, jpegThumbnail } from "../src/agent/host";
import type { ImageMeta, ScriptOutcome } from "../src/agent/protocol";
import { PythonRuntime } from "../src/agent/python";
import { Booth } from "../src/booth";
import type { BoothDocument } from "../src/document";
import { develop, type RadianceFrame } from "../src/film";
import type { PhotoEngine } from "../src/photo/photo";
import { PhotoSession } from "../src/ui/photo-session";
import { Store } from "../src/ui/store";
import { FakePrint, fakeTakePhoto } from "./fakes";

interface ScriptRun {
  readonly outcome: ScriptOutcome;
  readonly output: string;
  readonly ms: number;
}

declare global {
  interface Window {
    /** What tools/agent/drive.ts reads and calls. */
    agentPage: {
      readonly isolated: boolean;
      ready(): Promise<string>;
      run(code: string): Promise<ScriptRun>;
      stop(): void;
      ticks(): number;
      files(): string[];
      images(): ImageMeta[];
      shots(): number;
      doc(): BoothDocument;
    };
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** The agent's folder, in memory. A relative path or `//` starts at /agent, as the bridge resolves against its working directory. */
const files = new Map<string, Blob>();
const absolute = (path: string) => (path.startsWith("/") && !path.startsWith("//") ? path : `/agent/${path.replace(/^(\/\/|\.\/)/, "")}`);

function binaryStl(): Blob {
  const bytes = new Uint8Array(84 + 50);
  new DataView(bytes.buffer).setUint32(80, 1, true);
  return new Blob([bytes]);
}
files.set("/agent/parts/bracket.stl", binaryStl());

/** A raster preview stand-in: a gradient the size of the film it is given. */
const fakeRaster: Pick<PhotoEngine, "render"> = {
  render: async (scene, _onPass, signal): Promise<RadianceFrame> => {
    await sleep(200);
    if (signal.aborted) throw new Error("the preview was cancelled");
    const { width, height, samples } = scene.film;
    const rgba = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        rgba.set([(0.6 * x) / width, 0.25, (0.6 * y) / height, 1], i);
      }
    }
    return { width, height, samples, rgba };
  },
};

const memory = new Map<string, string>();
const booth = new Booth({
  storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); } },
  print: new FakePrint(),
  takePhoto: fakeTakePhoto,
});
const photos = new PhotoSession(() => booth.takePhoto());
const host = new AgentHost({ booth, photos, raster: fakeRaster, develop, thumbnail: jpegThumbnail });
const runtime = new PythonRuntime(host, () => new Worker(new URL("../src/agent/py-worker.ts", import.meta.url), { type: "module" }));

interface PageState {
  readonly python: string;
  readonly running: boolean;
  readonly output: string;
  readonly progress: string;
  readonly outcome: ScriptOutcome | null;
  readonly images: readonly { readonly meta: ImageMeta; readonly url: string }[];
  readonly files: readonly string[];
}

const page = new Store<PageState>({ python: "loading Python", running: false, output: "", progress: "", outcome: null, images: [], files: [...files.keys()] });
const patch = (next: Partial<PageState>) => { page.set({ ...page.get(), ...next }); };

const ready = runtime.start().then(
  () => { patch({ python: "Python ready" }); return "ready"; },
  (e: unknown) => { const text = `Python failed: ${e instanceof Error ? e.message : String(e)}`; patch({ python: text }); return text; },
);

/** The page's own clock, to show the page stays live while a script blocks or loops. */
let ticks = 0;
setInterval(() => { ticks += 1; }, 50);

async function run(code: string): Promise<ScriptRun> {
  const started = performance.now();
  let output = "";
  patch({ running: true, output: "", progress: "", outcome: null });
  const outcome = await runtime.run(code, {
    print: (text) => { output += text; patch({ output }); },
    progress: (text) => { patch({ progress: text }); },
    read: async (path) => {
      const blob = files.get(absolute(path));
      if (blob === undefined) throw new Error(`no such file: ${absolute(path)}`);
      return new File([blob], absolute(path).split("/").pop() ?? path);
    },
    write: async (path, name, bytes) => {
      const target = /\.png$/i.test(path) ? absolute(path) : `${absolute(path).replace(/\/?$/, "/")}${name}`;
      files.set(target, bytes);
      patch({ files: [...files.keys()] });
      return target;
    },
    image: (meta, thumbnail) => { patch({ images: [...page.get().images, { meta, url: URL.createObjectURL(thumbnail) }] }); },
  });
  patch({ running: false, outcome, progress: "" });
  return { outcome, output, ms: performance.now() - started };
}

window.agentPage = {
  isolated: crossOriginIsolated,
  ready: () => ready,
  run,
  stop: () => { runtime.cancel("user"); },
  ticks: () => ticks,
  files: () => [...files.keys()],
  images: () => page.get().images.map((i) => i.meta),
  shots: () => photos.state.get().shots.length,
  doc: () => booth.doc as BoothDocument,
};

const EXAMPLE = `import bpy, math

bpy.ops.wm.stl_import(filepath="parts/bracket.stl")
part = bpy.context.object
print(part.name, tuple(round(d, 4) for d in part.dimensions))
bpy.ops.object.light_add(type='AREA', location=(0.6, -0.6, 0.5))
key = bpy.context.object
key.name = "Key"
key.data.energy = 30
bpy.ops.render.opengl()
`;

function outcomeText(outcome: ScriptOutcome | null): string {
  if (outcome === null) return "";
  if (outcome.kind === "done") return "done";
  if (outcome.kind === "cancelled") return `cancelled by the ${outcome.by}`;
  return `failed\n${outcome.traceback}`;
}

export function AgentPage() {
  const s = useSyncExternalStore(page.subscribe, page.get);
  return (
    <main>
      <section>
        <label htmlFor="script">Script</label>
        <textarea id="script" defaultValue={EXAMPLE} spellCheck={false} />
        <div className="bar">
          <button type="button" disabled={s.running} onClick={() => {
            const code = (document.getElementById("script") as HTMLTextAreaElement).value;
            void run(code);
          }}>Run</button>
          <button type="button" disabled={!s.running} onClick={() => { runtime.cancel("user"); }}>Stop</button>
          <span className="status" data-testid="python">{s.python}</span>
          <span className="status" data-testid="progress">{s.progress}</span>
        </div>
      </section>
      <section>
        <label htmlFor="output">Output</label>
        <pre id="output" data-testid="output">{s.output}</pre>
        <pre data-testid="outcome">{outcomeText(s.outcome)}</pre>
        <div className="images">
          {s.images.map((i) => (
            <figure key={i.url}>
              <img src={i.url} alt={`${i.meta.label} ${i.meta.width} by ${i.meta.height}`} />
              <figcaption>{i.meta.label}: {i.meta.note}{i.meta.path === null ? "" : `, ${i.meta.path}`}</figcaption>
            </figure>
          ))}
        </div>
        <p className="status">Files: {s.files.join(", ")}</p>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("agent.html has no #root");
createRoot(root).render(<StrictMode><AgentPage /></StrictMode>);
