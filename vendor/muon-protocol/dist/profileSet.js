export const PROFILE_SET_FORMAT = 1;
/** The preset types, in the order OrcaSlicer loads them. */
export const PRESET_TYPES = ['machine', 'process', 'filament'];
/** Keys of a preset file that are not settings: they describe the file (ConfigBase::load_from_json keeps them apart). */
export const PRESET_METADATA_KEYS = [
    'version', 'name', 'url', 'type', 'setting_id', 'filament_id', 'from', 'description', 'instantiation', 'inherits',
    'renamed_from', 'is_custom_defined',
];
/** The keys a flattened preset carries that are stamps rather than settings: left out of canonicalConfigJson. */
export const PRESET_STAMP_KEYS = ['name', 'from', 'type', 'version', 'instantiation'];
const METADATA = new Set(PRESET_METADATA_KEYS.map((k) => k.toLowerCase()));
const STAMPS = new Set(PRESET_STAMP_KEYS);
/**
 * A flattened preset's settings as JSON text: every key but the stamps (name, from, type, version,
 * instantiation), sorted (JavaScript's default sort), values as they are. The goldens hash its UTF-8 bytes.
 */
export function canonicalConfigJson(config) {
    const out = {};
    for (const key of Object.keys(config).sort())
        if (!STAMPS.has(key))
            out[key] = config[key];
    return JSON.stringify(out);
}
export class PresetNotFoundError extends Error {
    type;
    preset;
    constructor(type, preset, message) {
        super(message);
        this.name = 'PresetNotFoundError';
        this.type = type;
        this.preset = preset;
    }
}
/** The current name of a preset in a bundle, found by its name or an older one; null when the bundle has neither. */
export function currentPresetName(bundle, type, name) {
    if (bundle.presets[type][name])
        return name;
    const renamed = bundle.renamed[type]?.[name];
    return renamed && bundle.presets[type][renamed] ? renamed : null;
}
/**
 * A selectable preset flattened the way OrcaSlicer loads it, from a profile set: the type's defaults, then each
 * file of the inheritance chain from the root to the preset (its settings only), then the bundle's `adjust` for the
 * preset; stamped `name`, `from: "system"` and `type`, and a filament with its `filament_id` (its own, else the
 * nearest parent's, as Orca inherits it). The result is what `slice` and `settings.*` take. The preset
 * is looked up in the vendor, then (filaments) in the library, by its name or an older one; parents as Orca looks
 * them up: in the preset's own vendor, then, for filaments, in the library (and once there, in the library).
 */
export function flattenPreset(type, name, sources) {
    const { vendor, library, defaults } = sources;
    let owner = vendor;
    let current = currentPresetName(vendor, type, name);
    if (current === null && type === 'filament' && library && library !== vendor) {
        owner = library;
        current = currentPresetName(library, type, name);
    }
    if (current === null)
        throw new PresetNotFoundError(type, name, `No ${type} preset "${name}" in ${vendor.vendor.id}.`);
    const chain = [];
    let bundle = owner;
    let at = current;
    const seen = new Set();
    for (;;) {
        let file = bundle.presets[type][at];
        if (!file && type === 'filament' && library && bundle !== library && library.presets.filament[at]) {
            bundle = library;
            file = library.presets.filament[at];
        }
        if (!file)
            throw new PresetNotFoundError(type, name, `The ${type} preset "${current}" inherits "${at}", which is missing.`);
        const key = `${bundle.vendor.id}\0${at}`;
        if (seen.has(key))
            throw new PresetNotFoundError(type, name, `The ${type} preset "${current}" inherits from itself (through "${at}").`);
        seen.add(key);
        chain.push(file);
        const parent = typeof file.inherits === 'string' ? file.inherits : '';
        if (!parent)
            break;
        at = parent;
    }
    const out = {};
    for (const [key, value] of Object.entries(defaults[type]))
        if (!STAMPS.has(key))
            out[key] = value;
    for (let i = chain.length - 1; i >= 0; i--) {
        for (const [key, value] of Object.entries(chain[i]))
            if (!METADATA.has(key.toLowerCase()))
                out[key] = value;
    }
    if (type === 'filament') {
        const id = chain.map((file) => file.filament_id).find((v) => typeof v === 'string' && v !== '');
        if (id)
            out.filament_id = id;
    }
    const adjust = owner.adjust[type]?.[current];
    if (adjust)
        Object.assign(out, adjust);
    out.name = current;
    out.from = 'system';
    out.type = type;
    return out;
}
