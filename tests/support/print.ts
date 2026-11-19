import { crc32, deflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { PrintSource } from "../../src/print";
import type { Job } from "../../src/print/session";

export const MINI_GCODE = readFileSync(new URL("../fixtures/mini.gcode", import.meta.url), "utf8");

export function gcodeSource(text: string, name = "part.gcode"): PrintSource {
  return { kind: "gcode", file: new File([text], name), fileHash: `${name}:${text.length}` };
}

/** A job that records its stages and never aborts. */
export function recordingJob(stages: string[] = []): Job {
  return { signal: new AbortController().signal, stage: (s) => { stages.push(s); }, checkpoint: async () => {} };
}

/** A zip with one stored or deflated entry per file, the way a Bambu .gcode.3mf is laid out. */
export function zip(entries: { name: string; text: string; deflate: boolean }[]): ArrayBuffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.text), data = e.deflate ? deflateRawSync(raw) : raw, name = Buffer.from(e.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(e.deflate ? 8 : 0, 10);
    dir.writeUInt32LE(crc32(raw), 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(dir, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}
