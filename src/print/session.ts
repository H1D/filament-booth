/**
 * Worker-side state of one print: the opened file, and the centreline built
 * from it. Opening a file, re-slicing it and asking for the lite mesh all
 * start from what is cached here, so nothing is parsed or sliced twice.
 */
import { DEFAULT_SLICE } from "../document";
import type { SliceSettings } from "../document";
import type { BeadMesh, Centreline, PrintSource, SlicedPrint } from "../print";
import { fromBin, thin } from "./centreline";
import { parse } from "./gcode";
import { readHeader } from "./header";
import { sliceStl } from "./slicer";
import { sweep } from "./sweep";
import { gcodeFrom3mf, isZip } from "./threemf";
import { tablesOf, wallsToCentreline } from "./toolpath";

export type Stage = "reading" | "slicing" | "parsing" | "walls" | "sweeping";

/** What the session needs of the job that runs it. */
export interface Job {
  signal: AbortSignal;
  stage(stage: Stage): void;
  /** Lets queued messages in, so a superseding request can abort this job, then throws if it did. */
  checkpoint(): Promise<void>;
}

interface Built {
  key: string;
  sliced: SlicedPrint;
  centreline: Centreline;
}

export interface Opened {
  sliced: SlicedPrint;
  mesh: BeadMesh;
}

/** The slice a source and settings ask for. G-code and .bin carry their own, so settings only matter to an STL. */
function keyOf(src: PrintSource, settings: SliceSettings): string {
  switch (src.kind) {
    case "stl": return `stl ${src.fileHash} ${JSON.stringify(settings)}`;
    case "gcode": return `gcode ${src.fileHash}`;
    case "bin": return `bin ${src.url}`;
  }
}

export class PrintSession {
  private src: PrintSource | null = null;
  private bytes: Promise<ArrayBuffer> | null = null;
  private built: Built | null = null;

  open(src: PrintSource, settings: SliceSettings, job: Job): Promise<Opened> {
    this.src = src;
    this.bytes = src.kind === "bin" ? null : src.file.arrayBuffer();
    this.bytes?.catch(() => undefined); // the job that awaits it reports the failure
    return this.mesh(src, settings, job);
  }

  reslice(settings: SliceSettings, job: Job): Promise<Opened> {
    const src = this.src;
    if (!src || src.kind !== "stl") return Promise.reject(new Error("only an opened STL can be re-sliced"));
    return this.mesh(src, settings, job);
  }

  /** The lite mesh sweeps the cached centreline: no parse, no slice. */
  async lite(job: Job): Promise<BeadMesh> {
    const built = this.built;
    if (!built) throw new Error("no print is loaded");
    job.stage("sweeping");
    await job.checkpoint();
    return sweep(thin(built.centreline), true);
  }

  private async mesh(src: PrintSource, settings: SliceSettings, job: Job): Promise<Opened> {
    const key = keyOf(src, settings);
    let built = this.built?.key === key ? this.built : null;
    if (!built) {
      built = await this.build(src, settings, key, job);
      this.built = built;
    }
    job.stage("sweeping");
    await job.checkpoint();
    return { sliced: built.sliced, mesh: sweep(built.centreline) };
  }

  private async build(src: PrintSource, settings: SliceSettings, key: string, job: Job): Promise<Built> {
    job.stage("reading");
    if (src.kind === "bin") {
      const res = await fetch(src.url, { signal: job.signal });
      if (!res.ok) throw new Error(`${src.url}: HTTP ${res.status}`);
      const bin = fromBin(await res.arrayBuffer());
      const sliced: SlicedPrint = {
        settings: DEFAULT_SLICE, settingsSource: "file", layerHeightMm: bin.centreline.h,
        layerTimeS: bin.layerTime, layerFan: bin.layerFan, filamentName: null, bedFromFile: null,
        note: "prebuilt centreline: its slicing settings are not recorded",
      };
      return { key, sliced, centreline: bin.centreline };
    }
    const bytes = await this.bytes;
    if (!bytes) throw new Error("the file could not be read");
    await job.checkpoint();

    let text: string, note: string | null = null, sliced: Omit<SlicedPrint, "layerTimeS" | "layerFan">;
    if (src.kind === "stl") {
      job.stage("slicing");
      text = await sliceStl(bytes, settings, job.signal);
      sliced = { settings, settingsSource: "booth", layerHeightMm: settings.layerHeight, filamentName: null, bedFromFile: null, note };
    } else {
      ({ text, note } = isZip(bytes) ? await gcodeFrom3mf(bytes) : { text: new TextDecoder().decode(bytes), note: null });
      const header = readHeader(text);
      if (header.unmodelled.length) note = [note, `file also sets ${header.unmodelled.join(", ")}`].filter(Boolean).join("; ");
      sliced = {
        settings: header.settings, settingsSource: "file", layerHeightMm: header.settings.layerHeight,
        filamentName: header.filamentName, bedFromFile: header.bed, note,
      };
    }
    job.stage("parsing");
    await job.checkpoint();
    const tp = parse(text, sliced.layerHeightMm);
    job.stage("walls");
    await job.checkpoint();
    const centreline = wallsToCentreline(tp, sliced.layerHeightMm);
    return { key, sliced: { ...sliced, ...tablesOf(tp) }, centreline };
  }
}
