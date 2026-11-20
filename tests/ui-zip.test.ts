import { expect, test } from "vitest";
import { crc32, uniqueNames, zipStored } from "../src/ui/zip";

test("crc32 is the standard CRC-32", () => {
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  expect(crc32(new Uint8Array())).toBe(0);
});

test("a repeated name gets a number before its extension", () => {
  expect(uniqueNames(["a.png", "a.png", "b.png", "a.png", "noext", "noext"])).toEqual(["a.png", "a (2).png", "b.png", "a (3).png", "noext", "noext (2)"]);
});

/** Reads a stored ZIP back through its central directory, as an unzip tool does. */
function readZip(bytes: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    expect(v.getUint16(local + 8, true)).toBe(0);
    const dataAt = local + 30 + v.getUint16(local + 26, true);
    out.push({ name, data: bytes.subarray(dataAt, dataAt + size), crc });
    at += 46 + nameLen;
  }
  return out;
}

test("zipStored writes every file whole, in order, with its CRC", async () => {
  const files = [
    { name: "clip Front_20261120-2300.png", data: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])]) },
    { name: "clip Über_20261120-2301.png", data: new Blob(["second"]) },
  ];
  const zip = await zipStored(files);
  expect(zip.type).toBe("application/zip");
  const read = readZip(new Uint8Array(await zip.arrayBuffer()));
  expect(read.map((r) => r.name)).toEqual(files.map((f) => f.name));
  for (const [i, r] of read.entries()) {
    const want = new Uint8Array(await files[i].data.arrayBuffer());
    expect([...r.data]).toEqual([...want]);
    expect(r.crc).toBe(crc32(want));
  }
});
