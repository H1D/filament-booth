/**
 * zip.ts: a ZIP archive of finished files, stored without compression. A PNG
 * is already compressed, so deflate would cost time for nothing, and a stored
 * archive needs only a CRC-32 per file.
 */

export interface ZipEntry {
  readonly name: string;
  readonly data: Blob;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The same name twice gets " (2)", " (3)" before its extension, as a browser names a second download. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const dot = name.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let n = 2; seen.has(candidate); n += 1) candidate = `${stem} (${n})${ext}`;
    seen.add(candidate);
    return candidate;
  });
}

const FLAG_UTF8 = 0x0800;
/** 1980-01-01 00:00 in DOS time: the photos carry their time in their names. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** One archive of the entries, in order. Names must be unique (see uniqueNames). Under 4 GiB, so no ZIP64. */
export async function zipStored(entries: readonly ZipEntry[]): Promise<Blob> {
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const data = new Uint8Array(await entry.data.arrayBuffer());
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, FLAG_UTF8, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, 0, true);
    l.setUint16(12, DOS_DATE, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);

    const dir = new Uint8Array(46 + name.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, FLAG_UTF8, true);
    d.setUint16(10, 0, true);
    d.setUint16(12, 0, true);
    d.setUint16(14, DOS_DATE, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);

    parts.push(local, data);
    central.push(dir);
    offset += local.length + data.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, dirSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
