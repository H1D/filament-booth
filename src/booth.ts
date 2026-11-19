/**
 * booth.ts: Booth owns the document and the print slot. It is the only
 * write path for either.
 *
 * After any change it compiles a new Scene and hands it to subscribers.
 * React panels and the viewport are subscribers. Persistence is one too.
 */
import type { BoothDocument, FilamentPresetId, LookId, Vec3 } from "./document";
import type { PhotoRun } from "./photo/photo";
import type { PrintState } from "./print";
import type { Scene } from "./scene";

export interface BoothDeps {
  /** Where the document is saved. Tests pass a Map-backed stub. */
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  readonly printWorker: () => Worker;
  /** Starts a photo for a scene. main.tsx wires PhotoDesk in here. */
  readonly takePhoto: (scene: Scene, partName: string) => PhotoRun;
}

export class Booth {
  constructor(deps: BoothDeps) {
    throw new Error("not implemented");
    // TODO: parseDocument(storage) or defaultDocument() when missing or invalid.
    //       The print slot starts empty after a reload: a File cannot be saved.
  }

  get doc(): Readonly<BoothDocument> { throw new Error("not implemented"); }
  get print(): PrintState { throw new Error("not implemented"); }
  get scene(): Scene { throw new Error("not implemented"); }

  /** Fires after any document or print change, with the scene already recompiled. */
  subscribe(fn: () => void): () => void { throw new Error("not implemented"); }

  /** Derived, never stored: the studio differs from the look it was copied from. */
  get lookModified(): boolean { throw new Error("not implemented"); }
  get filamentModified(): boolean { throw new Error("not implemented"); }

  /**
   * The one write path for settings. The mutator edits a draft. Booth
   * validates ranges, keeps untouched sections identical by reference,
   * bumps its revision, recompiles and notifies. A change under
   * `draft.slicing` re-slices an STL after 300 ms.
   */
  update(mutate: (draft: BoothDocument) => void): void {
    throw new Error("not implemented");
  }

  /** Copies the look's studio into the document and records it as lookBase. */
  applyLook(id: LookId): void { throw new Error("not implemented"); }
  applyFilamentPreset(id: FilamentPresetId): void { throw new Error("not implemented"); }
  /** A focal length change that keeps the framing (scene.refocal). */
  setFocal(focalMm: number): void { throw new Error("not implemented"); }
  /** Click to focus: a part-local point from the viewport. */
  focusAt(partPoint: Vec3): void { throw new Error("not implemented"); }

  /**
   * Opens a dropped .stl, .gcode or .gcode.3mf. A second call supersedes the
   * first, and a late result from the old file is dropped. A fresh part is
   * framed once and its focus point is cleared.
   */
  open(file: File): Promise<void> { throw new Error("not implemented"); }
  openSample(url: string): Promise<void> { throw new Error("not implemented"); }

  /** Freezes the current scene into a photo run. */
  takePhoto(): PhotoRun { throw new Error("not implemented"); }

  exportJson(): string { throw new Error("not implemented"); }
  /** Validates at the boundary, then replaces the document. */
  importJson(json: string): void { throw new Error("not implemented"); }
}
