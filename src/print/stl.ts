/** STL bytes to the triangle soup the slicer engine takes, placed on a bed. */

/** The engine takes binary STL: an ASCII one is rewritten. */
export function binaryStl(buf: ArrayBuffer): ArrayBuffer {
  if (buf.byteLength >= 84 && buf.byteLength === 84 + 50 * new DataView(buf).getUint32(80, true)) return buf; // binary (its header may say 'solid' too)
  const v = [...new TextDecoder().decode(buf).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const n = Math.floor(v.length / 3);
  if (!n) throw new Error("no triangles found in this STL");
  const out = new DataView(new ArrayBuffer(84 + 50 * n));
  out.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 9; k++) out.setFloat32(84 + 50 * t + 12 + 4 * k, v[3 * t + Math.floor(k / 3)][k % 3], true); // normals left 0: recomputed
  }
  return out.buffer;
}

/** Nine floats per triangle, as in an STL. */
export function triangleSoup(stl: ArrayBuffer): Float32Array {
  const bin = binaryStl(stl), dv = new DataView(bin), n = dv.getUint32(80, true);
  const out = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
  }
  return out;
}

/** Centres the soup on (cx, cy) and rests it on z = 0, as the engine asks for a mesh in bed coordinates. */
export function placeOnBed(soup: Float32Array, cx: number, cy: number): Float32Array {
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i < soup.length; i += 3) {
    minx = Math.min(minx, soup[i]); maxx = Math.max(maxx, soup[i]);
    miny = Math.min(miny, soup[i + 1]); maxy = Math.max(maxy, soup[i + 1]);
    minz = Math.min(minz, soup[i + 2]);
  }
  const dx = cx - (minx + maxx) / 2, dy = cy - (miny + maxy) / 2, dz = -minz;
  const out = new Float32Array(soup.length);
  for (let i = 0; i < soup.length; i += 3) { out[i] = soup[i] + dx; out[i + 1] = soup[i + 1] + dy; out[i + 2] = soup[i + 2] + dz; }
  return out;
}
