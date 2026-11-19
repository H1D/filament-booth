/** The ops of protocol 2.0, in the order docs/PROTOCOL.md lists them. */
export const OPS_2_0 = [
    'hello', 'load', 'status', 'cancel', 'slice', 'check', 'config.definitions', 'settings.catalogue', 'settings.view', 'settings.edit',
];
/** The ops protocol 2.1 adds: a host that serves one lists it in `hello.capabilities`. */
export const PROFILE_OPS = ['profiles.normalize', 'profiles.resolve', 'profiles.validate'];
/** Every op of protocol 2.3 (2.2 and 2.3 add none: painting is a field of slice, the conflict one of its error), in the order docs/PROTOCOL.md lists them. */
export const OPS = [...OPS_2_0, ...PROFILE_OPS];
/** Ops that need the engine (wasm): the host loads it on the first of them ('auto' variant). */
export const ENGINE_OPS = ['load', 'slice', 'check', 'config.definitions', ...PROFILE_OPS];
/**
 * Capability names besides the op names. A client checks one before sending a request or a field that
 * needs it; strings it does not know it ignores.
 */
export const Capability = {
    /** Toolpaths format 1 in slice results. */
    toolpathsV1: 'toolpaths.v1',
    /** SliceParams.output.toolpathExtras and SliceResult.toolpathExtras. */
    toolpathExtras: 'slice.toolpathExtras',
    /** Mesh.indices (indexed meshes) in slice and check. */
    indexedMeshes: 'mesh.indexed',
    /** A running request can be cancelled and the engine stays loaded (without it: only queued requests). */
    cooperativeCancel: 'cancel.cooperative',
    /** settings.view format 1. */
    settingsViewV1: 'settings.view.v1',
    /** SliceParams.output.log, SliceResult.log and EngineError.log (2.1). */
    sliceLog: 'slice.log',
    /** PlateObject.paint: support, seam, fuzzy skin and filament painting on a mesh's triangles (2.2). */
    paintV1: 'paint.v1',
    /** EngineError.conflict, and a conflicting slice's toolpaths in its error (2.3). */
    sliceConflict: 'slice.conflict',
    /**
     * Organic tree supports go around the plate's other objects instead of through them, and a slice warns ('support_dropped')
     * when some could find no way past one (2.3).
     */
    supportAvoidObjects: 'support.avoidObjects',
};
