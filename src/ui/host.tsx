import type { ReactNode } from "react";
import { HostContext, type Host } from "./hooks";

export function HostProvider({ host, children }: { host: Host; children: ReactNode }) {
  return <HostContext value={host}>{children}</HostContext>;
}
