/**
 * host.tsx: how components reach Booth. Every read is a useSyncExternalStore
 * on Booth or on a UI store, so a component never holds its own copy of a
 * document value. Every write goes through `useEdit`, which keeps a refused
 * edit from escaping as an exception.
 */
import { createContext, use, useCallback, useSyncExternalStore, type ReactNode } from "react";
import type { Booth } from "../booth";
import { DocumentError, type BoothDocument } from "../document";
import type { Edit } from "../edits";
import type { PrintState } from "../print";
import type { Scene } from "../scene";
import type { PhotoSession, SessionState } from "./photo-session";
import type { Store, Ui, UiState } from "./store";

export interface Host {
  readonly booth: Booth;
  readonly ui: Ui;
  readonly photos: PhotoSession;
}

const HostContext = createContext<Host | null>(null);

export function HostProvider({ host, children }: { host: Host; children: ReactNode }) {
  return <HostContext value={host}>{children}</HostContext>;
}

export function useHost(): Host {
  const host = use(HostContext);
  if (host === null) throw new Error("useHost needs a HostProvider above it");
  return host;
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useDoc(): Readonly<BoothDocument> {
  const { booth } = useHost();
  return useSyncExternalStore(booth.subscribe, () => booth.doc);
}

export function usePrint(): PrintState {
  const { booth } = useHost();
  return useSyncExternalStore(booth.subscribe, () => booth.print);
}

export function useScene(): Scene {
  const { booth } = useHost();
  return useSyncExternalStore(booth.subscribe, () => booth.scene);
}

export function useLookModified(): boolean {
  const { booth } = useHost();
  return useSyncExternalStore(booth.subscribe, () => booth.lookModified);
}

export function useFilamentModified(): boolean {
  const { booth } = useHost();
  return useSyncExternalStore(booth.subscribe, () => booth.filamentModified);
}

export function useUi(): UiState {
  return useStore(useHost().ui.state);
}

export function usePhotoSession(): SessionState {
  return useStore(useHost().photos.state);
}

export function describeError(e: unknown): string {
  if (e instanceof DocumentError) return `${e.path}: ${e.message.replace(`${e.path}: `, "")}`;
  return e instanceof Error ? e.message : String(e);
}

/** Applies an edit. A refusal lands in the status line and the document stays as it was. */
export function useEdit(): (edit: Edit) => void {
  const { booth, ui } = useHost();
  return useCallback((edit: Edit) => {
    try {
      booth.update(edit);
      if (ui.state.get().notice !== null) ui.setNotice(null);
    } catch (e) {
      ui.setNotice(describeError(e));
    }
  }, [booth, ui]);
}

/** Runs an action that can throw on user input (an import, a photo) and reports the failure the same way. */
export function useAttempt(): (action: () => void) => void {
  const { ui } = useHost();
  return useCallback((action: () => void) => {
    try {
      action();
      if (ui.state.get().notice !== null) ui.setNotice(null);
    } catch (e) {
      ui.setNotice(describeError(e));
    }
  }, [ui]);
}
