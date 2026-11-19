import { Booth, type BoothDeps } from "../src/booth";
import type { PhotoProgress, PhotoRun } from "../src/photo/photo";

/** A Booth on a Map-backed store, with no print pipeline behind it. */
export function boothWith(overrides: Partial<BoothDeps> = {}): { booth: Booth; store: Map<string, string> } {
  const store = new Map<string, string>();
  const booth = new Booth({
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
    print: {
      open: () => Promise.reject(new Error("no print in this test")),
      reslice: () => Promise.reject(new Error("no print in this test")),
      dispose: () => {},
    },
    takePhoto: () => { throw new Error("no photo in this test"); },
    schedule: () => () => {},
    ...overrides,
  });
  return { booth, store };
}

/** A run the test steers by hand. */
export class ScriptedRun implements PhotoRun {
  readonly docRev = 1;
  readonly result: Promise<never>;
  cancelled = 0;
  finished = 0;
  readonly #listeners = new Set<(p: PhotoProgress) => void>();

  constructor() {
    this.result = new Promise<never>(() => {});
  }

  onProgress(fn: (p: PhotoProgress) => void): () => void {
    this.#listeners.add(fn);
    return () => { this.#listeners.delete(fn); };
  }

  emit(p: PhotoProgress): void {
    for (const fn of [...this.#listeners]) fn(p);
  }

  get listening(): number { return this.#listeners.size; }
  cancel(): void { this.cancelled += 1; }
  finishNow(): void { this.finished += 1; }
}
