# Dependencies

## Runtime

```toon
runtime[4]{name,version,purpose}:
  three,0.187.0,preview renderer on WebGPU with TSL (pinned exactly)
  react,^19.3.1,rail panels
  react-dom,^19.3.1,DOM renderer
  @muon3d/slicer-engine-protocol,file:vendor/muon-protocol,typed protocol to the slicer engine worker
```

## Dev

```toon
dev[16]{name,version,purpose}:
  typescript,~7.0.2,type check with erasableSyntaxOnly
  vite,^8.3.6,dev server and build
  @vitejs/plugin-react,^6.1.2,React transform
  vitest,^5.1.1,unit tests
  happy-dom,^21.0.4,DOM for panel tests
  playwright-core,^1.65.1,browser drivers (uses system Chromium)
  oxlint,^1.90.0,lint
  @types/three,0.187,three.js types
  @types/react,^19.3.0,React types
  @types/react-dom,^19.3.0,React DOM types
  @types/node,^24.19.2,Node types for tools
  @modelcontextprotocol/sdk,1.32.2,MCP server in the agent bridge and the client in tools/agent/e2e.ts
  zod,4.6.7,tool input schemas that the MCP SDK reads
  ws,8.23.0,WebSocket server in the agent bridge
  @types/ws,8.18.2,types for ws
  pyodide,314.0.8,source of the Pyodide files copied to public/pyodide
```

## Committed binaries

```toon
binaries[6]{path,size,source,licence}:
  public/cycles,13 MB,built by cycles/build.sh from Cycles 5.2,Apache-2.0 and others
  public/slicer/engine,23 MB,Muon3D release (OrcaSlicer),AGPL-3.0-only
  public/lut,4.5 MB,baked by tools/blender/bake_agx.py from Blender 5.2.3,Blender OCIO config
  public/hdr,1.6 MB,Poly Haven Studio Small 09,CC0
  public/pyodide,13 MB,copied from the pyodide package by tools/agent/vendor-pyodide.ts,MPL-2.0
  vendor/muon-protocol,small,Muon3D protocol package with prebuilt dist,Apache-2.0
```

## Internal Module Dependencies

```toon
modules[10]{module,depends_on}:
  src/document.ts,"src/units.ts, src/presets.ts, src/print/orca.ts"
  src/print.ts,"src/document.ts, src/print/"
  src/scene.ts,"src/document.ts, src/print.ts"
  src/film.ts,"src/document.ts, src/scene.ts"
  src/booth.ts,"src/scene.ts, src/print.ts, src/presets.ts, src/photo/photo.ts"
  src/photo/photo.ts,"src/scene.ts, src/film.ts"
  src/photo/cycles.ts,"src/photo/photo.ts, src/photo/cycles-upload.ts, src/photo/cycles-worker.ts, src/film.ts"
  src/photo/raster.ts,"src/photo/photo.ts, src/viewport/viewport.ts"
  src/viewport/viewport.ts,"src/scene.ts, src/print.ts, src/film.ts"
  src/ui/wire.ts,"src/booth.ts, src/edits.ts, src/viewport/viewport.ts, src/photo/"
```

## External tools (not in package.json)

```toon
tools[4]{name,used_by,note}:
  Blender 5.2.3,tools/blender and tools/parity and tools/e2e,ground truth via $BLENDER
  gamescope,tools/e2e/session.ts,headless compositor so Chromium gets a hardware GPU
  chromium,tools/e2e and tools/ui and tools/parity,/usr/bin/chromium
  emsdk,cycles/build.sh,only to rebuild the Cycles module
```
