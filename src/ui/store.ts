/**
 * store.ts: the small observable that holds UI state which is not part of
 * the document: the focus tool, the viewport's status text, and a notice
 * for a rejected edit. It has the shape useSyncExternalStore wants, so a
 * component reads it without a copy.
 */
import type { PrintState } from "../print";

export class Store<T> {
  #value: T;
  readonly #listeners = new Set<() => void>();

  constructor(initial: T) {
    this.#value = initial;
  }

  readonly get = (): T => this.#value;

  readonly subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => { this.#listeners.delete(fn); };
  };

  set(next: T): void {
    if (Object.is(next, this.#value)) return;
    this.#value = next;
    for (const fn of [...this.#listeners]) fn();
  }
}

export interface UiState {
  /** The next click on the part picks the focus point. */
  readonly focusTool: boolean;
  /** Frame rate, quality level and refining, as the viewport reports it. */
  readonly viewportStatus: string;
  /** The last edit the document refused, or a failure outside the document. Cleared by the next edit that lands. */
  readonly notice: string | null;
  /** The error state the user dismissed, compared by identity so the next error shows again. */
  readonly dismissedPrint: PrintState | null;
  /** A pairing link was opened, so the Agent section starts open and in view. */
  readonly showAgent: boolean;
}

export class Ui {
  readonly state = new Store<UiState>({ focusTool: false, viewportStatus: "", notice: null, dismissedPrint: null, showAgent: false });

  #patch(patch: Partial<UiState>): void {
    this.state.set({ ...this.state.get(), ...patch });
  }

  setFocusTool(active: boolean): void { this.#patch({ focusTool: active }); }
  setViewportStatus(text: string): void { this.#patch({ viewportStatus: text }); }
  setNotice(text: string | null): void { this.#patch({ notice: text }); }
  dismissPrintError(print: PrintState): void { this.#patch({ dismissedPrint: print }); }
  revealAgent(): void { this.#patch({ showAgent: true }); }
}
