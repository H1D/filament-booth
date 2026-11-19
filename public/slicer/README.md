# Slicer engine assets

`engine/` is the Muon3D Slicer Engine 0.6.0-m1.1 (OrcaSlicer 2.5.0-dev compiled to WebAssembly), copied unmodified
from the release package `muon3d-slicer-engine-0.6.0-m1.1.tgz` (sha256 `6f666027b59c4d53c067890839abefbcbc06789a5536d4fcde6003a215e69c08`).

- Licence: AGPL-3.0-only. See `engine/LICENSE`, `engine/NOTICE` and `engine/THIRD-PARTY-NOTICES.md`.
- Corresponding source: see `engine/SOURCE.md` (https://github.com/Muon-3D/muon3d-slicer-engine at commit
  `41c754ef12b18d4d24893898ef03d6b5b44a2919`, tag `v0.6.0-m1.1`).
- The `mt64` variant and the pre-compressed `.br` and `.gz` copies are left out. `manifest.json` still lists `mt64`,
  but the host only picks it when a client names it, and this app never does.
- The booth serves these files from its own origin. Nothing is fetched from a CDN at run time.

`../../vendor/muon-protocol` is the engine's client protocol package (Apache-2.0), used as a local dependency.
`../../src/print/a1mini-0.4.json` is the Bambu A1 mini 0.4 machine, process and filament preset set, flattened with
that package's `flattenPreset`.
