// SPDX-License-Identifier: Apache-2.0
// Data shapes shared by the operations of protocol v2: configs in OrcaSlicer's preset-file text form,
// meshes as float arrays. Every value a message carries is JSON (objects, arrays, strings, finite
// numbers, booleans, null) or a typed array; nothing else (no Map, Set, Date, class instance,
// undefined in arrays, BigInt or SharedArrayBuffer), so every transport can carry it (docs/PROTOCOL.md,
// "Transports").
export {};
