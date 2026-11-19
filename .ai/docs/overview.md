# Filament booth

A virtual photo booth for 3D-printed parts that runs entirely in the browser. Drop an STL, a G-code or a `.gcode.3mf`. The part is shown as printed beads in a live preview with studio controls. PHOTO renders a still with Blender's Cycles path tracer compiled to WebAssembly, with no server.

## Stack

```toon
language: TypeScript 7 (erasableSyntaxOnly)
framework: React 19 + three.js 0.187 (WebGPU and TSL with WebGL2 fallback)
bundler: Vite 8
runtime: browser with cross-origin isolation (wasm threads)
photo_engine: Cycles 5.2 CPU kernel in wasm32 (Emscripten pthreads)
slicer: Muon3D engine (OrcaSlicer in wasm and AGPL-3.0)
storage: localStorage key booth.document
tests: Vitest 5 + happy-dom + playwright-core drivers
lint: oxlint
package_manager: bun
```

## Quick Start

```bash
bun install
bun run dev          # http://localhost:5173 (must be localhost or HTTPS for wasm threads)
bun run test         # unit tests
bun run typecheck    # app types
bun run build        # tsc -b && vite build into dist/
```

## Project Structure

```toon
dirs[19]{path,purpose}:
  src,app source with flat top-level modules
  src/print,file to beads (G-code parser and slicer and mesher and worker)
  src/viewport,live preview on three.js
  src/photo,PHOTO desk and the Cycles and raster engines
  src/ui,React rail panels and stores
  src/agent,agent control (wire protocol and the bpy table and host and the Python worker and the bridge link)
  tests,Vitest unit tests and fixtures
  dev,standalone dev pages per module with fakes
  docs,design contract (docs/design.md)
  cycles,C API and build scripts for the Cycles wasm module
  tools/blender,Python scripts run in native Blender for ground truth
  tools/parity,browser Cycles against native Blender comparison
  tools/e2e,real app end to end in a hardware-GPU Chromium
  tools/ui,panel driver on dev/panels.html
  tools/agent,agent bridge and its drivers
  public/cycles,built Cycles module (committed)
  public/slicer,built slicer engine (committed and AGPL-3.0)
  public/lut,Blender AgX tables baked from its OCIO config
  public/pyodide,Pyodide runtime for the agent's Python (committed)
```

## Key Entry Points

- **App bootstrap**: `src/main.tsx` builds `Booth`, `Viewport`, `PhotoDesk` and `AgentControl` and mounts `src/App.tsx`
- **Settings schema**: `src/document.ts` (`BoothDocument`, `BOUNDS`, `parseDocument`, `defaultDocument`)
- **The single lowering**: `src/scene.ts` (`compileScene`)
- **Design contract**: `docs/design.md`. Read it before changing a module boundary.
- **Vite config**: `vite.config.ts` (COOP and COEP headers, ES workers)
