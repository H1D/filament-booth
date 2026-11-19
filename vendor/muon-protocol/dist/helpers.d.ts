import type { Config } from './data.ts';
import type { HelloResult } from './ops.ts';
/**
 * The ArrayBuffers of every typed array (and ArrayBuffer) in `value`, each once: the transfer list for
 * postMessage, so the buffers move instead of being copied. Walks plain objects and arrays. A
 * SharedArrayBuffer is never listed (it cannot be transferred, and the protocol never carries one).
 * After a transfer the sender's arrays are empty: send copies of arrays you still need.
 */
export declare function transferablesOf(value: unknown): ArrayBuffer[];
/**
 * A content hash of a config (64-bit FNV-1a over its keys in sorted order and their values), as hex:
 * what ConfigRef.hash names a cached config by. Cached per object, so hashing the same config object
 * again is free (treat configs as immutable).
 */
export declare function configHash(config: Config): string;
export type Negotiation = {
    ok: true;
    minor: number;
} | {
    ok: false;
    reason: string;
    missing: string[];
};
/**
 * Whether a host's `hello` answer serves a client that speaks protocol `major` (default this package's),
 * needs at least minor `minMinor` and the capabilities `required`.
 */
export declare function negotiate(hello: HelloResult, want?: {
    major?: number;
    minMinor?: number;
    required?: readonly string[];
}): Negotiation;
