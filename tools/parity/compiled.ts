/**
 * Parity fixtures that go through the app's own path: a G-code through the print session (header,
 * walls, sweep), a BoothDocument through the named edits, then compileScene. Node and the dev page
 * both build them from the same G-code text, and run.ts compares a digest of the two scene files
 * so a difference in the compile between Node and Chromium cannot hide inside a parity number.
 */
import { applyFilamentPreset, applyLook } from "../../src/edits";
import { defaultDocument, deg, DEFAULT_SLICE, type BoothDocument } from "../../src/document";
import type { LoadedPrint, PrintSource } from "../../src/print";
import { PrintSession } from "../../src/print/session";
import { compileScene, exportScene, framePart, type Scene, type SceneFile } from "../../src/scene";
import type { FixtureOptions } from "./fixtures";

export const COMPILED_FIXTURES = ["e", "f", "g"] as const;
export type CompiledName = (typeof COMPILED_FIXTURES)[number];

export function isCompiledName(name: string): name is CompiledName {
  return COMPILED_FIXTURES.some((f) => f === name);
}

/** The mesher's own path: header, parse, walls, sweep. The same code the print worker runs. */
async function openGcode(text: string): Promise<LoadedPrint> {
  const source: PrintSource = { kind: "gcode", file: new File([text], "part.gcode"), fileHash: `parity:${text.length}` };
  const job = { signal: new AbortController().signal, stage: () => {}, checkpoint: async () => {} };
  const { sliced, mesh } = await new PrintSession().open(source, DEFAULT_SLICE, job);
  return { source, sliced, mesh, liteMesh: async () => mesh };
}

/** e: the document as the app opens it. f: dark look, PLA Matte (part-only strips and scrims). g: gradient look
 *  (the floor card ring), turntable at 40 degrees, resting on a side face. */
function documentFor(name: CompiledName, print: LoadedPrint, o: Required<FixtureOptions>): BoothDocument {
  const doc = defaultDocument();
  if (name === "f") {
    applyLook("dark")(doc);
    applyFilamentPreset("pla-matte")(doc);
  }
  if (name === "g") {
    applyLook("gradient")(doc);
    doc.pose.turntableDeg = deg(40);
    doc.pose.restFace = "right";
  }
  doc.output.longEdgePx = Math.max(o.width, o.height);
  doc.output.samples = o.samples;
  // What Booth does when a part opens.
  Object.assign(doc.camera, framePart(print.mesh, doc.camera, doc.output.aspect));
  return doc;
}

export async function compiledFixture(name: CompiledName, gcode: string, o: FixtureOptions = {}): Promise<Scene> {
  const print = await openGcode(gcode);
  const doc = documentFor(name, print, { width: o.width ?? 640, height: o.height ?? 400, samples: o.samples ?? 256 });
  return compileScene(doc, print, 1);
}

/** SHA-256 over the JSON and every buffer in name order. */
export async function sceneDigest(file: SceneFile): Promise<string> {
  const parts: Uint8Array[] = [new TextEncoder().encode(file.json)];
  for (const name of [...file.buffers.keys()].sort()) {
    const data = file.buffers.get(name);
    if (data) parts.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", all));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const digestOf = (scene: Scene): Promise<string> => sceneDigest(exportScene(scene));
