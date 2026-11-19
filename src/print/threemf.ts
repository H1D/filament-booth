/** A Bambu `.gcode.3mf` is a plain zip holding one `.gcode` per plate. */

export interface UnzippedGcode {
  text: string;
  /** Set when the file holds several plates, naming the one shown. */
  note: string | null;
}

export async function gcodeFrom3mf(buf: ArrayBuffer): Promise<UnzippedGcode> {
  const dv = new DataView(buf);
  let e = buf.byteLength - 22; // end-of-central-directory record, whose comment must reach the end of the file
  while (e >= 0 && !(dv.getUint32(e, true) === 0x06054b50 && e + 22 + dv.getUint16(e + 20, true) === buf.byteLength)) e--;
  if (e < 0) throw new Error("not a zip / .3mf file");
  if (dv.getUint32(e + 16, true) === 0xffffffff) throw new Error("zip64 .3mf is not supported");
  const plates: { name: string; p: number }[] = [];
  for (let i = 0, p = dv.getUint32(e + 16, true); i < dv.getUint16(e + 10, true); i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("corrupt .3mf (central directory)");
    const nlen = dv.getUint16(p + 28, true), name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nlen));
    if (/\.gcode$/.test(name)) plates.push({ name, p });
    p += 46 + nlen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  if (!plates.length) throw new Error("no .gcode inside this .3mf (export it from the slicer as a sliced plate file)");
  plates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const { p } = plates[0], method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), lho = dv.getUint32(p + 42, true);
  if (size === 0xffffffff || dv.getUint32(lho, true) !== 0x04034b50) throw new Error("unsupported .3mf entry (zip64 or corrupt)");
  if (method !== 0 && method !== 8) throw new Error(`unsupported zip compression (method ${method})`);
  const raw = new Uint8Array(buf, lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), size);
  const text = method === 0
    ? new TextDecoder().decode(raw)
    : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  return { text, note: plates.length > 1 ? `showing ${plates[0].name.split("/").pop()}, 1 of ${plates.length} plates` : null };
}

/** A zip starts with "PK". */
export const isZip = (buf: ArrayBuffer): boolean => {
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  return head[0] === 0x50 && head[1] === 0x4b;
};
