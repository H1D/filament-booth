/**
 * share.ts: URL-hash encoding for a whole BoothDocument plus optional part metadata.
 *
 * Pure: no DOM, no three.js. Runs in the browser, Node and Bun.
 *
 * Format:
 *   #s=1j.<base64url(utf8(diffJson))>[&part=<name>][&hash=<sha256-16>][&partUrl=<https://...>]
 *   #s=1z.<base64url(deflateRaw(utf8(diffJson)))>[&...]
 *
 * `diffJson` is a sparse object diff against the preset baseline (defaultDocument with the
 * document's lookBase and filament preset applied), so typical scenes encode in ~150-250 chars
 * while heavily custom scenes (many lights and props) stay compact under deflate-raw.
 * Every decoded document passes through parseDocument, which stays the one validator.
 */
import {
  DocumentError, FILAMENT_PRESET_IDS, LOOK_IDS, defaultDocument, parseDocument,
  type BoothDocument, type FilamentPresetId, type LookId,
} from "./document";
import { FILAMENT_PRESETS, LOOK_PRESETS } from "./presets";

export interface SharePartMeta {
  /** File name of the part, e.g. "bracket.stl". */
  readonly name?: string;
  /** Lowercase hex SHA-256 prefix (up to 64 chars; 16 chars written) for IndexedDB lookup. */
  readonly hash?: string;
  /** Optional http(s) URL to auto-fetch the model on another browser or device. */
  readonly url?: string;
}

export interface ShareState {
  readonly doc: BoothDocument;
  readonly part: SharePartMeta | null;
}

const HASH_PREFIX = 16;
const MAX_COMPRESSED_CHARS = 32_768;
const MAX_DECODED_BYTES = 256 * 1024;
const HASH_PATTERN = /^[0-9a-f]{8,64}$/i;

type PlainObj = Record<string, unknown>;

function isPlainObject(v: unknown): v is PlainObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (Array.isArray(b)) return false;
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
  }
  return false;
}

/**
 * The baseline a diff is taken against: defaultDocument(), with the named look
 * and filament preset applied when present. Changing only camera or a couple of
 * sliders then emits only those few keys instead of five lights and a recipe.
 */
function baselineFor(lookBase: LookId | null, presetId: FilamentPresetId | null): BoothDocument {
  const base = defaultDocument();
  if (lookBase !== null) {
    base.studio = structuredClone(LOOK_PRESETS[lookBase].studio);
    base.lookBase = lookBase;
  } else {
    base.lookBase = null;
  }
  if (presetId !== null) {
    base.filament.presetId = presetId;
    base.filament.recipe = structuredClone(FILAMENT_PRESETS[presetId].recipe);
  } else {
    base.filament.presetId = null;
  }
  return base;
}

function diffValues(base: unknown, value: unknown): unknown {
  if (sameJson(base, value)) return undefined;
  if (isPlainObject(base) && isPlainObject(value)) {
    const out: PlainObj = {};
    for (const [k, v] of Object.entries(value)) {
      const d = diffValues(base[k], v);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  }
  return value;
}

/** Sparse patch relative to the document's preset baseline. */
export function documentToPatch(doc: BoothDocument): PlainObj {
  const def = defaultDocument();
  const base = baselineFor(doc.lookBase, doc.filament.presetId);
  const diff = diffValues(base, doc);
  const patch: PlainObj = isPlainObject(diff) ? { ...diff } : {};
  // Always include non-default preset selectors so decoding picks the exact same baseline.
  if (doc.lookBase !== def.lookBase) patch.lookBase = doc.lookBase;
  if (doc.filament.presetId !== def.filament.presetId) {
    const fil = isPlainObject(patch.filament) ? { ...patch.filament } : {};
    fil.presetId = doc.filament.presetId;
    patch.filament = fil;
  }
  return patch;
}

function mergeInto(target: PlainObj, patch: PlainObj): void {
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (isPlainObject(v) && isPlainObject(target[k])) {
      mergeInto(target[k], v);
    } else {
      target[k] = structuredClone(v);
    }
  }
}

/**
 * Reconstructs a validated BoothDocument from a full or partial JSON patch.
 * Applies lookBase and filament.presetId baselines before merging overrides, then
 * validates every field through parseDocument.
 */
export function documentFromPatch(raw: unknown): BoothDocument {
  if (!isPlainObject(raw)) throw new DocumentError("share", "expected a JSON object");
  const def = defaultDocument();
  let lookBase: LookId | null = def.lookBase;
  if ("lookBase" in raw) {
    if (raw.lookBase === null) lookBase = null;
    else if (typeof raw.lookBase === "string" && (LOOK_IDS as readonly string[]).includes(raw.lookBase)) lookBase = raw.lookBase as LookId;
    else throw new DocumentError("lookBase", `unknown look ${JSON.stringify(raw.lookBase)}`);
  }
  let presetId: FilamentPresetId | null = def.filament.presetId;
  if (isPlainObject(raw.filament) && "presetId" in raw.filament) {
    const p = raw.filament.presetId;
    if (p === null) presetId = null;
    else if (typeof p === "string" && (FILAMENT_PRESET_IDS as readonly string[]).includes(p)) presetId = p as FilamentPresetId;
    else throw new DocumentError("filament.presetId", `unknown filament preset ${JSON.stringify(p)}`);
  }
  const merged = baselineFor(lookBase, presetId) as unknown as PlainObj;
  mergeInto(merged, raw);
  return parseDocument(merged);
}

// ---- base64url + deflate-raw --------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new DocumentError("share", "invalid base64url characters");
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === "undefined") throw new DocumentError("share", "this environment cannot decompress shared links");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  if (buf.byteLength > MAX_DECODED_BYTES) throw new DocumentError("share", "shared setup is too large");
  return new Uint8Array(buf);
}

/** Validates an optional remote model URL (http or https only). */
export function validPartUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === "") return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
}

function appendPartParams(params: URLSearchParams, part: SharePartMeta | null | undefined): void {
  if (!part) return;
  if (part.name) params.set("part", part.name);
  if (part.hash && HASH_PATTERN.test(part.hash)) params.set("hash", part.hash.slice(0, HASH_PREFIX).toLowerCase());
  const url = validPartUrl(part.url);
  if (url !== undefined) params.set("partUrl", url);
}

function readPartParams(params: URLSearchParams): SharePartMeta | null {
  const name = params.get("part") || undefined;
  const rawHash = params.get("hash") || undefined;
  const hash = rawHash && HASH_PATTERN.test(rawHash) ? rawHash.toLowerCase() : undefined;
  const url = validPartUrl(params.get("partUrl") ?? undefined);
  if (name === undefined && hash === undefined && url === undefined) return null;
  return {
    ...(name === undefined ? {} : { name }),
    ...(hash === undefined ? {} : { hash }),
    ...(url === undefined ? {} : { url }),
  };
}

/** True when `hash` carries an encoded booth setup (`#s=...`). Never matches `#agent=...`. */
export function isShareHash(hash: string): boolean {
  if (!hash.startsWith("#") || hash.startsWith("#agent=")) return false;
  return new URLSearchParams(hash.slice(1)).has("s");
}

/** True when `doc` has any setting different from defaultDocument(). */
export function isDefaultDocument(doc: BoothDocument): boolean {
  return sameJson(defaultDocument(), doc);
}

/** Encodes a document and optional part metadata into a `#s=...` URL hash. */
export async function encodeShareHash(doc: BoothDocument, part?: SharePartMeta | null): Promise<string> {
  const json = JSON.stringify(documentToPatch(doc));
  const rawBytes = new TextEncoder().encode(json);
  const rawBuf = new Uint8Array(new ArrayBuffer(rawBytes.byteLength));
  rawBuf.set(rawBytes);
  const compressed = await deflateRaw(rawBuf);
  const token = compressed !== null && compressed.byteLength < rawBuf.byteLength
    ? `1z.${toBase64Url(compressed)}`
    : `1j.${toBase64Url(rawBuf)}`;
  const params = new URLSearchParams();
  params.set("s", token);
  appendPartParams(params, part);
  return `#${params.toString()}`;
}

/** Encodes a full clickable URL for `doc` on `baseUrl` (e.g. `https://booth.artems.net/`). */
export async function encodeShareUrl(baseUrl: string | URL, doc: BoothDocument, part?: SharePartMeta | null): Promise<string> {
  const hash = await encodeShareHash(doc, part);
  const target = new URL(baseUrl instanceof URL ? baseUrl.href : baseUrl);
  target.hash = hash;
  return target.href;
}

/**
 * Decodes a `#s=...` hash back into a validated BoothDocument and optional part metadata.
 * Returns null when the hash carries no shared setup (empty or `#agent=...`).
 * Throws DocumentError on a corrupt or invalid setup payload.
 */
export async function decodeShareHash(hash: string): Promise<ShareState | null> {
  if (!isShareHash(hash)) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("s") ?? "";
  if (token.length === 0 || token.length > MAX_COMPRESSED_CHARS) {
    throw new DocumentError("share", "shared setup link is empty or too long");
  }
  let bytes: Uint8Array<ArrayBuffer>;
  if (token.startsWith("1j.")) {
    bytes = fromBase64Url(token.slice(3));
  } else if (token.startsWith("1z.")) {
    try {
      bytes = await inflateRaw(fromBase64Url(token.slice(3)));
    } catch (e) {
      if (e instanceof DocumentError) throw e;
      throw new DocumentError("share", "could not decompress shared setup link");
    }
  } else {
    throw new DocumentError("share", "unsupported shared setup link format");
  }
  if (bytes.byteLength > MAX_DECODED_BYTES) throw new DocumentError("share", "shared setup is too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DocumentError("share", "shared setup link is not valid JSON");
  }
  return { doc: documentFromPatch(parsed), part: readPartParams(params) };
}
