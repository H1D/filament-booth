/**
 * What a Bambu / Orca G-code says about itself in its `; key = value` header
 * block. This is the boundary where a file's text becomes typed settings.
 */
import { DEFAULT_SLICE, mm } from "../document";
import type { BedType } from "../document";
import { H0 } from "./calibration";
import { bedFromOrca, settingsFromOrca } from "./orca";
import type { FileSettings } from "./orca";

export interface GcodeHeader extends FileSettings {
  layerHeightMm: number;
  filamentName: string | null;
  bed: BedType | null;
}

/** The header block sits in the first couple of megabytes. */
const HEADER_CHARS = 2e6;

export function readHeader(text: string): GcodeHeader {
  const head = text.slice(0, HEADER_CHARS);
  const get = (key: string): string | undefined => head.match(new RegExp(`^; ${key} = (.*)$`, "m"))?.[1].replace(/"/g, "");
  const lh = Number(get("layer_height")), first = Number(get("initial_layer_print_height"));
  if (get("spiral_mode") === "1") throw new Error("spiral vase G-code is not supported");
  if (lh && first && Math.abs(lh - first) > 1e-6) throw new Error(`only even layers are modelled (this slice: ${lh} mm, first ${first} mm)`);
  const file = settingsFromOrca(get, DEFAULT_SLICE);
  const layerHeightMm = lh || H0;
  return {
    settings: { ...file.settings, layerHeight: mm(layerHeightMm) },
    unmodelled: file.unmodelled,
    layerHeightMm,
    filamentName: get("filament_settings_id") || null,
    bed: bedFromOrca(get("curr_bed_type")),
  };
}
