import type { Config, PresetScope } from './data.ts';
export declare const PROFILE_SET_FORMAT = 1;
/** The preset types, in the order OrcaSlicer loads them. */
export declare const PRESET_TYPES: readonly PresetScope[];
/** A file of the set: its path relative to the index file, its size as stored, its sha256 (hex). */
export interface ProfileFileRef {
    path: string;
    bytes: number;
    sha256: string;
}
/**
 * `profiles/<set>/index.<hash>.json`: every vendor and printer, and where the rest is. The only file a printer
 * picker needs. Paths in it and in the bundles are relative to the index file's URL.
 */
export interface ProfileIndex {
    format: 1;
    /** The set's name: the engine release that published it, e.g. "0.3.0". A published set never changes. */
    set: string;
    /** The engine the presets were normalised and flattened with; a client uses them with that engine only. */
    engine: {
        version: string;
        orca: {
            version: string;
            commit: string;
        };
        /** sha256 (hex) of `config.definitions`'s result as JSON text (JSON.stringify, no spaces). */
        optionsHash: string;
    };
    /** Where the set's source is (SOURCE.json, next to the index, says the same in full). */
    source: {
        repository: string;
        commit: string;
    };
    /** The vendor every vendor's filaments may inherit from: "OrcaFilamentLibrary". */
    library: string;
    /** Each type's default preset, without name, from, type and version: where every inheritance chain starts. */
    defaults: Record<PresetScope, Config>;
    /** By id. */
    vendors: ProfileIndexVendor[];
    /** Every vendor's bundle in one file (`{ format: 1, vendors: VendorBundle[] }`, gzip), for offline use. */
    all: ProfileFileRef;
}
export interface ProfileIndexVendor {
    /** The folder name every preset reference uses: "BBL". */
    id: string;
    /** The name people read: "Bambulab". */
    name: string;
    /** The vendor's profile version (OrcaSlicer's), e.g. "02.03.00.11". */
    version: string;
    description?: string;
    /** `vendors/<id>.<hash>.json.gz`: the VendorBundle, gzip. */
    bundle: ProfileFileRef;
    /** Selectable printers, by model, then nozzle, then name. */
    printers: Array<{
        name: string;
        model: string;
        variant: string;
        nozzle: string[];
    }>;
    /** Printer models: `cover` is the model's picture (an asset path), when the vendor has one. */
    models: Array<{
        name: string;
        family?: string;
        nozzle: string[];
        cover?: string;
    }>;
}
/** `vendors/<id>.<hash>.json.gz`: one vendor's presets, normalised, with inheritance kept. */
export interface VendorBundle {
    format: 1;
    vendor: {
        id: string;
        name: string;
        version: string;
        description?: string;
    };
    /** Printer model files (machine_model), by model name, as the vendor ships them: bed_model, bed_texture, default_materials, ... */
    models: Record<string, Record<string, string>>;
    /**
     * Preset files by type and name, in the order OrcaSlicer loads them (a parent before its children), each as
     * `profiles.normalize` writes it: metadata as given (`inherits`, `instantiation`, ...), settings in Orca's text.
     * Selectable presets have `instantiation: "true"`.
     */
    presets: Record<PresetScope, Record<string, Config>>;
    /**
     * For selectable presets whose flattened form OrcaSlicer adjusts after merging the chain (vectors sized to the
     * nozzles and variants, unset slots filled): the settings as Orca ends up with them. See flattenPreset.
     */
    adjust: Partial<Record<PresetScope, Record<string, Config>>>;
    /** Older preset names that still resolve: old name -> current name, per type. */
    renamed: Record<PresetScope, Record<string, string>>;
    /** Files the models name (bed model, bed texture, hotend model, `<model>_cover.png`) -> asset path. */
    assets: Record<string, string>;
    /** What normalising changed, summed over the vendor's files: legacy key -> its new name, and counts. */
    report: {
        renamed: Record<string, string>;
        dropped: Record<string, number>;
        misplaced: Record<string, number>;
        substituted: number;
    };
}
/**
 * `goldens.json.gz` of the release asset (not served): what OrcaSlicer's own loader makes of every selectable
 * preset, for testing another implementation of flattenPreset and of Orca's compatibility rules.
 */
export interface ProfileGoldens {
    format: 1;
    set: string;
    /** vendor -> type -> preset name -> sha256 (hex) of canonicalConfigJson(the flattened preset). */
    presets: Record<string, Record<PresetScope, Record<string, string>>>;
    /**
     * vendor -> printer -> the processes and filaments (the vendor's and the library's) Orca finds compatible: the
     * sha256 (hex) of the names sorted (JavaScript's default sort) and joined by "\n", and how many.
     */
    compatibility: Record<string, Record<string, {
        processes: string;
        filaments: string;
        counts: [number, number];
    }>>;
    /** vendor -> filament -> the vendor's processes it suits, for filaments limited by compatible_prints(_condition). */
    printRestricted: Record<string, Record<string, string[]>>;
}
/** Keys of a preset file that are not settings: they describe the file (ConfigBase::load_from_json keeps them apart). */
export declare const PRESET_METADATA_KEYS: readonly string[];
/** The keys a flattened preset carries that are stamps rather than settings: left out of canonicalConfigJson. */
export declare const PRESET_STAMP_KEYS: readonly string[];
/**
 * A flattened preset's settings as JSON text: every key but the stamps (name, from, type, version,
 * instantiation), sorted (JavaScript's default sort), values as they are. The goldens hash its UTF-8 bytes.
 */
export declare function canonicalConfigJson(config: Config): string;
/** Where flattenPreset finds presets: the vendor's bundle, and the library's (for filaments). */
export interface PresetSources {
    vendor: VendorBundle;
    /** OrcaFilamentLibrary's bundle; may be the vendor itself. */
    library: VendorBundle | null;
    /** ProfileIndex.defaults. */
    defaults: Record<PresetScope, Config>;
}
export declare class PresetNotFoundError extends Error {
    readonly type: PresetScope;
    readonly preset: string;
    constructor(type: PresetScope, preset: string, message: string);
}
/** The current name of a preset in a bundle, found by its name or an older one; null when the bundle has neither. */
export declare function currentPresetName(bundle: VendorBundle, type: PresetScope, name: string): string | null;
/**
 * A selectable preset flattened the way OrcaSlicer loads it, from a profile set: the type's defaults, then each
 * file of the inheritance chain from the root to the preset (its settings only), then the bundle's `adjust` for the
 * preset; stamped `name`, `from: "system"` and `type`, and a filament with its `filament_id` (its own, else the
 * nearest parent's, as Orca inherits it). The result is what `slice` and `settings.*` take. The preset
 * is looked up in the vendor, then (filaments) in the library, by its name or an older one; parents as Orca looks
 * them up: in the preset's own vendor, then, for filaments, in the library (and once there, in the library).
 */
export declare function flattenPreset(type: PresetScope, name: string, sources: PresetSources): Config;
