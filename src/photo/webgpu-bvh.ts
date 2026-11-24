/**
 * webgpu-bvh.ts: compact 64-byte dual-AABB SAH BVH2 builder for WebGPU path tracing.
 *
 * Each node (16 x 32-bit words) holds the AABBs and child descriptors of both children:
 *   word  0..2 : lMin (f32x3)   word  3 : left   (node index if lCount == 0, else first tri)
 *   word  4..6 : lMax (f32x3)   word  7 : lCount (0 internal, >0 leaf tri count)
 *   word  8..10: rMin (f32x3)   word 11 : right  (node index if rCount == 0, else first tri)
 *   word 12..14: rMax (f32x3)   word 15 : rCount (0 internal, >0 leaf tri count)
 *
 * Leaves reference contiguous slices of `reorderedIndices` so GPU traversal needs no extra
 * indirection table. Large meshes partition at the top via SAH and build disjoint subtrees in
 * parallel across Web Workers over a SharedArrayBuffer.
 */

export const BVH_NODE_WORDS = 16;
export const BVH_EMPTY_CHILD = 0xffffffff;
export const DEFAULT_MAX_LEAF = 4;
export const MAX_BVH_DEPTH = 60;
const SAH_BINS = 8;
const PARALLEL_THRESHOLD_TRIS = 65_536;

export interface BvhData {
  /** 16 x 32-bit words per internal node (node 0 is root). */
  readonly nodes: Uint32Array;
  /** Triangles reordered by leaf order (3 u32 per triangle). */
  readonly reorderedIndices: Uint32Array;
  /** Original triangle index per slot in reorderedIndices (useful for per-triangle material lookup). */
  readonly triOrder: Uint32Array;
  readonly nodeCount: number;
  readonly rootMin: readonly [number, number, number];
  readonly rootMax: readonly [number, number, number];
}

export interface BvhBuildOptions {
  readonly maxLeaf?: number;
  readonly signal?: AbortSignal;
}

const INF = 1e30;

function writeChild(
  nodesU32: Uint32Array,
  nodesF32: Float32Array,
  nodeIndex: number,
  side: 0 | 1,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  indexOrStart: number,
  count: number,
): void {
  const base = nodeIndex * BVH_NODE_WORDS + side * 8;
  nodesF32[base + 0] = minX;
  nodesF32[base + 1] = minY;
  nodesF32[base + 2] = minZ;
  nodesU32[base + 3] = indexOrStart;
  nodesF32[base + 4] = maxX;
  nodesF32[base + 5] = maxY;
  nodesF32[base + 6] = maxZ;
  nodesU32[base + 7] = count;
}

function surfaceArea(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number {
  const dx = Math.max(0, maxX - minX);
  const dy = Math.max(0, maxY - minY);
  const dz = Math.max(0, maxZ - minZ);
  return 2 * (dx * dy + dy * dz + dz * dx);
}

/** Precomputes [minX, minY, minZ, maxX, maxY, maxZ] per triangle for [triStart, triEnd). */
export function fillTriBoundsRange(
  positions: Float32Array,
  indices: Uint32Array,
  triBounds: Float32Array,
  triOrder: Uint32Array,
  triStart: number,
  triEnd: number,
): void {
  for (let t = triStart; t < triEnd; t++) {
    triOrder[t] = t;
    const i0 = indices[t * 3 + 0] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;
    const x0 = positions[i0], y0 = positions[i0 + 1], z0 = positions[i0 + 2];
    const x1 = positions[i1], y1 = positions[i1 + 1], z1 = positions[i1 + 2];
    const x2 = positions[i2], y2 = positions[i2 + 1], z2 = positions[i2 + 2];
    const o = t * 6;
    triBounds[o + 0] = x0 < x1 ? (x0 < x2 ? x0 : x2) : (x1 < x2 ? x1 : x2);
    triBounds[o + 1] = y0 < y1 ? (y0 < y2 ? y0 : y2) : (y1 < y2 ? y1 : y2);
    triBounds[o + 2] = z0 < z1 ? (z0 < z2 ? z0 : z2) : (z1 < z2 ? z1 : z2);
    triBounds[o + 3] = x0 > x1 ? (x0 > x2 ? x0 : x2) : (x1 > x2 ? x1 : x2);
    triBounds[o + 4] = y0 > y1 ? (y0 > y2 ? y0 : y2) : (y1 > y2 ? y1 : y2);
    triBounds[o + 5] = z0 > z1 ? (z0 > z2 ? z0 : z2) : (z1 > z2 ? z1 : z2);
  }
}

interface PartitionResult {
  readonly mid: number;
  readonly lMinX: number;
  readonly lMinY: number;
  readonly lMinZ: number;
  readonly lMaxX: number;
  readonly lMaxY: number;
  readonly lMaxZ: number;
  readonly rMinX: number;
  readonly rMinY: number;
  readonly rMinZ: number;
  readonly rMaxX: number;
  readonly rMaxY: number;
  readonly rMaxZ: number;
}

const binCount = new Int32Array(SAH_BINS);
const binMinX = new Float32Array(SAH_BINS);
const binMinY = new Float32Array(SAH_BINS);
const binMinZ = new Float32Array(SAH_BINS);
const binMaxX = new Float32Array(SAH_BINS);
const binMaxY = new Float32Array(SAH_BINS);
const binMaxZ = new Float32Array(SAH_BINS);
const leftArea = new Float32Array(SAH_BINS - 1);
const leftCount = new Int32Array(SAH_BINS - 1);

function computeBounds(
  triBounds: Float32Array,
  triOrder: Uint32Array,
  start: number,
  end: number,
): [number, number, number, number, number, number] {
  let minX = INF, minY = INF, minZ = INF;
  let maxX = -INF, maxY = -INF, maxZ = -INF;
  for (let i = start; i < end; i++) {
    const o = triOrder[i] * 6;
    if (triBounds[o + 0] < minX) minX = triBounds[o + 0];
    if (triBounds[o + 1] < minY) minY = triBounds[o + 1];
    if (triBounds[o + 2] < minZ) minZ = triBounds[o + 2];
    if (triBounds[o + 3] > maxX) maxX = triBounds[o + 3];
    if (triBounds[o + 4] > maxY) maxY = triBounds[o + 4];
    if (triBounds[o + 5] > maxZ) maxZ = triBounds[o + 5];
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

function partitionRange(
  triBounds: Float32Array,
  triOrder: Uint32Array,
  start: number,
  end: number,
): PartitionResult {
  // Compute centroid bounds across [start, end).
  let cMinX = INF, cMinY = INF, cMinZ = INF;
  let cMaxX = -INF, cMaxY = -INF, cMaxZ = -INF;
  for (let i = start; i < end; i++) {
    const o = triOrder[i] * 6;
    const cx = 0.5 * (triBounds[o + 0] + triBounds[o + 3]);
    const cy = 0.5 * (triBounds[o + 1] + triBounds[o + 4]);
    const cz = 0.5 * (triBounds[o + 2] + triBounds[o + 5]);
    if (cx < cMinX) cMinX = cx;
    if (cy < cMinY) cMinY = cy;
    if (cz < cMinZ) cMinZ = cz;
    if (cx > cMaxX) cMaxX = cx;
    if (cy > cMaxY) cMaxY = cy;
    if (cz > cMaxZ) cMaxZ = cz;
  }

  let bestAxis = -1;
  let bestSplit = 0;
  let bestCost = INF;

  const spanX = cMaxX - cMinX;
  const spanY = cMaxY - cMinY;
  const spanZ = cMaxZ - cMinZ;

  for (let axis = 0; axis < 3; axis++) {
    const span = axis === 0 ? spanX : axis === 1 ? spanY : spanZ;
    if (!(span > 1e-12)) continue;
    const cMin = axis === 0 ? cMinX : axis === 1 ? cMinY : cMinZ;
    const invSpan = SAH_BINS / span;

    for (let b = 0; b < SAH_BINS; b++) {
      binCount[b] = 0;
      binMinX[b] = INF; binMinY[b] = INF; binMinZ[b] = INF;
      binMaxX[b] = -INF; binMaxY[b] = -INF; binMaxZ[b] = -INF;
    }

    for (let i = start; i < end; i++) {
      const o = triOrder[i] * 6;
      const c = 0.5 * (triBounds[o + axis] + triBounds[o + 3 + axis]);
      let b = ((c - cMin) * invSpan) | 0;
      if (b < 0) b = 0;
      else if (b >= SAH_BINS) b = SAH_BINS - 1;
      binCount[b]++;
      if (triBounds[o + 0] < binMinX[b]) binMinX[b] = triBounds[o + 0];
      if (triBounds[o + 1] < binMinY[b]) binMinY[b] = triBounds[o + 1];
      if (triBounds[o + 2] < binMinZ[b]) binMinZ[b] = triBounds[o + 2];
      if (triBounds[o + 3] > binMaxX[b]) binMaxX[b] = triBounds[o + 3];
      if (triBounds[o + 4] > binMaxY[b]) binMaxY[b] = triBounds[o + 4];
      if (triBounds[o + 5] > binMaxZ[b]) binMaxZ[b] = triBounds[o + 5];
    }

    let minX = INF, minY = INF, minZ = INF, maxX = -INF, maxY = -INF, maxZ = -INF, acc = 0;
    for (let b = 0; b < SAH_BINS - 1; b++) {
      acc += binCount[b];
      if (binMinX[b] < minX) minX = binMinX[b];
      if (binMinY[b] < minY) minY = binMinY[b];
      if (binMinZ[b] < minZ) minZ = binMinZ[b];
      if (binMaxX[b] > maxX) maxX = binMaxX[b];
      if (binMaxY[b] > maxY) maxY = binMaxY[b];
      if (binMaxZ[b] > maxZ) maxZ = binMaxZ[b];
      leftCount[b] = acc;
      leftArea[b] = acc > 0 ? surfaceArea(minX, minY, minZ, maxX, maxY, maxZ) : 0;
    }

    minX = INF; minY = INF; minZ = INF; maxX = -INF; maxY = -INF; maxZ = -INF; acc = 0;
    for (let b = SAH_BINS - 1; b >= 1; b--) {
      acc += binCount[b];
      if (binMinX[b] < minX) minX = binMinX[b];
      if (binMinY[b] < minY) minY = binMinY[b];
      if (binMinZ[b] < minZ) minZ = binMinZ[b];
      if (binMaxX[b] > maxX) maxX = binMaxX[b];
      if (binMaxY[b] > maxY) maxY = binMaxY[b];
      if (binMaxZ[b] > maxZ) maxZ = binMaxZ[b];
      const lc = leftCount[b - 1];
      if (lc === 0 || acc === 0) continue;
      const ra = surfaceArea(minX, minY, minZ, maxX, maxY, maxZ);
      const cost = lc * leftArea[b - 1] + acc * ra;
      if (cost < bestCost) {
        bestCost = cost;
        bestAxis = axis;
        bestSplit = cMin + (b / SAH_BINS) * span;
      }
    }
  }

  let mid = start;
  if (bestAxis >= 0) {
    let lo = start;
    let hi = end - 1;
    while (lo <= hi) {
      const o = triOrder[lo] * 6;
      const c = 0.5 * (triBounds[o + bestAxis] + triBounds[o + 3 + bestAxis]);
      if (c < bestSplit) {
        lo++;
      } else {
        const tmp = triOrder[lo];
        triOrder[lo] = triOrder[hi];
        triOrder[hi] = tmp;
        hi--;
      }
    }
    mid = lo;
  }

  if (mid <= start || mid >= end) {
    mid = (start + end) >>> 1;
  }

  const [lMinX, lMinY, lMinZ, lMaxX, lMaxY, lMaxZ] = computeBounds(triBounds, triOrder, start, mid);
  const [rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ] = computeBounds(triBounds, triOrder, mid, end);
  return { mid, lMinX, lMinY, lMinZ, lMaxX, lMaxY, lMaxZ, rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ };
}

/** Builds a flat dual-AABB BVH2 over `triOrder[triStart..triEnd)`. Returns the allocated node buffer and node count. */
export function buildSubtree(
  triBounds: Float32Array,
  triOrder: Uint32Array,
  triStart: number,
  triEnd: number,
  maxLeaf = DEFAULT_MAX_LEAF,
): { readonly nodes: Uint32Array; readonly nodeCount: number; readonly rootMin: [number, number, number]; readonly rootMax: [number, number, number] } {
  const ntris = triEnd - triStart;
  // With median fallback on coincident centroids, tree depth <= log2(ntris) and internal nodes <= max(1, ntris).
  let capacity = Math.max(4, Math.min(ntris + 4, Math.ceil((ntris / Math.max(1, maxLeaf * 0.5)) * 1.25) + 8));
  let nodesU32 = new Uint32Array(capacity * BVH_NODE_WORDS);
  let nodesF32 = new Float32Array(nodesU32.buffer);

  const ensureCapacity = (needed: number) => {
    if (needed <= capacity) return;
    while (capacity < needed) capacity = Math.ceil(capacity * 1.5);
    const next = new Uint32Array(capacity * BVH_NODE_WORDS);
    next.set(nodesU32);
    nodesU32 = next;
    nodesF32 = new Float32Array(nodesU32.buffer);
  };

  const [rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ] = computeBounds(triBounds, triOrder, triStart, triEnd);

  if (ntris <= maxLeaf) {
    writeChild(nodesU32, nodesF32, 0, 0, rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ, triStart, Math.max(1, ntris));
    writeChild(nodesU32, nodesF32, 0, 1, INF, INF, INF, -INF, -INF, -INF, BVH_EMPTY_CHILD, 0);
    return {
      nodes: nodesU32.subarray(0, BVH_NODE_WORDS),
      nodeCount: 1,
      rootMin: [rMinX, rMinY, rMinZ],
      rootMax: [rMaxX, rMaxY, rMaxZ],
    };
  }

  let nextNode = 1;
  // Stack entries: [parentNode, side, start, end, depth]
  const stack: number[] = [];
  const rootSplit = partitionRange(triBounds, triOrder, triStart, triEnd);

  const pushSide = (
    parent: number,
    side: 0 | 1,
    s: number,
    e: number,
    depth: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) => {
    const c = e - s;
    if (c <= maxLeaf || depth >= MAX_BVH_DEPTH) {
      writeChild(nodesU32, nodesF32, parent, side, minX, minY, minZ, maxX, maxY, maxZ, s, c);
      return;
    }
    const child = nextNode++;
    ensureCapacity(nextNode);
    writeChild(nodesU32, nodesF32, parent, side, minX, minY, minZ, maxX, maxY, maxZ, child, 0);
    stack.push(child, s, e, depth + 1);
  };

  pushSide(0, 0, triStart, rootSplit.mid, 1, rootSplit.lMinX, rootSplit.lMinY, rootSplit.lMinZ, rootSplit.lMaxX, rootSplit.lMaxY, rootSplit.lMaxZ);
  pushSide(0, 1, rootSplit.mid, triEnd, 1, rootSplit.rMinX, rootSplit.rMinY, rootSplit.rMinZ, rootSplit.rMaxX, rootSplit.rMaxY, rootSplit.rMaxZ);

  while (stack.length > 0) {
    const depth = stack.pop()!;
    const e = stack.pop()!;
    const s = stack.pop()!;
    const nodeIdx = stack.pop()!;
    const split = partitionRange(triBounds, triOrder, s, e);
    pushSide(nodeIdx, 0, s, split.mid, depth, split.lMinX, split.lMinY, split.lMinZ, split.lMaxX, split.lMaxY, split.lMaxZ);
    pushSide(nodeIdx, 1, split.mid, e, depth, split.rMinX, split.rMinY, split.rMinZ, split.rMaxX, split.rMaxY, split.rMaxZ);
  }

  return {
    nodes: nodesU32.slice(0, nextNode * BVH_NODE_WORDS),
    nodeCount: nextNode,
    rootMin: [rMinX, rMinY, rMinZ],
    rootMax: [rMaxX, rMaxY, rMaxZ],
  };
}

/** Offsets every internal child node index in a compacted subtree node array by `nodeOffset`. */
function offsetSubtreeNodes(nodes: Uint32Array, nodeCount: number, nodeOffset: number): void {
  for (let i = 0; i < nodeCount; i++) {
    const base = i * BVH_NODE_WORDS;
    if (nodes[base + 7] === 0 && nodes[base + 3] !== 0xffffffff) nodes[base + 3] += nodeOffset;
    if (nodes[base + 15] === 0 && nodes[base + 11] !== 0xffffffff) nodes[base + 11] += nodeOffset;
  }
}

function reorderTriangleIndices(indices: Uint32Array, triOrder: Uint32Array): Uint32Array {
  const ntris = triOrder.length;
  const out = new Uint32Array(ntris * 3);
  for (let i = 0; i < ntris; i++) {
    const src = triOrder[i] * 3;
    const dst = i * 3;
    out[dst + 0] = indices[src + 0];
    out[dst + 1] = indices[src + 1];
    out[dst + 2] = indices[src + 2];
  }
  return out;
}

/** Synchronous SAH BVH2 build (any size, runs directly on caller thread). */
export function buildBvhSync(positions: Float32Array, indices: Uint32Array, options: BvhBuildOptions = {}): BvhData {
  const maxLeaf = options.maxLeaf ?? DEFAULT_MAX_LEAF;
  const ntris = indices.length / 3;
  if (ntris === 0) {
    const emptyNodes = new Uint32Array(BVH_NODE_WORDS);
    const emptyF32 = new Float32Array(emptyNodes.buffer);
    writeChild(emptyNodes, emptyF32, 0, 0, INF, INF, INF, -INF, -INF, -INF, BVH_EMPTY_CHILD, 0);
    writeChild(emptyNodes, emptyF32, 0, 1, INF, INF, INF, -INF, -INF, -INF, BVH_EMPTY_CHILD, 0);
    return {
      nodes: emptyNodes,
      reorderedIndices: new Uint32Array(0),
      triOrder: new Uint32Array(0),
      nodeCount: 1,
      rootMin: [0, 0, 0],
      rootMax: [0, 0, 0],
    };
  }
  const triBounds = new Float32Array(ntris * 6);
  const triOrder = new Uint32Array(ntris);
  fillTriBoundsRange(positions, indices, triBounds, triOrder, 0, ntris);
  const { nodes, nodeCount, rootMin, rootMax } = buildSubtree(triBounds, triOrder, 0, ntris, maxLeaf);
  const reorderedIndices = reorderTriangleIndices(indices, triOrder);
  return { nodes, reorderedIndices, triOrder, nodeCount, rootMin, rootMax };
}

interface TopJob {
  readonly parentNode: number;
  readonly side: 0 | 1;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/**
 * Parallel SAH BVH2 build across Web Workers using SharedArrayBuffer when available and
 * `ntris >= PARALLEL_THRESHOLD_TRIS`, falling back cleanly to buildSubtree otherwise.
 */
export async function buildBvhParallel(
  positions: Float32Array,
  indices: Uint32Array,
  options: BvhBuildOptions = {},
): Promise<BvhData> {
  const maxLeaf = options.maxLeaf ?? DEFAULT_MAX_LEAF;
  const signal = options.signal;
  if (signal?.aborted) throw signal.reason;
  const ntris = indices.length / 3;
  const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 1;
  const workerCount = Math.min(8, Math.max(1, hc - 1));
  if (ntris < PARALLEL_THRESHOLD_TRIS || typeof SharedArrayBuffer === "undefined" || typeof Worker === "undefined" || workerCount <= 1) {
    return buildBvhSync(positions, indices, options);
  }

  const posSab = new SharedArrayBuffer(positions.byteLength);
  const idxSab = new SharedArrayBuffer(indices.byteLength);
  const boundsSab = new SharedArrayBuffer(ntris * 6 * 4);
  const orderSab = new SharedArrayBuffer(ntris * 4);
  const outIdxSab = new SharedArrayBuffer(indices.byteLength);

  new Float32Array(posSab).set(positions);
  new Uint32Array(idxSab).set(indices);
  const triBounds = new Float32Array(boundsSab);
  const triOrder = new Uint32Array(orderSab);

  const workers: Worker[] = [];
  const terminateAll = () => {
    for (const w of workers) w.terminate();
    workers.length = 0;
  };
  const onAbort = () => terminateAll();
  signal?.addEventListener("abort", onAbort);

  try {
    for (let i = 0; i < workerCount; i++) {
      workers.push(new Worker(new URL("./webgpu-bvh-worker.ts", import.meta.url), { type: "module", name: `bvh-${i}` }));
    }

    const runOnWorkers = async <T>(tasks: readonly unknown[]): Promise<T[]> => {
      if (signal?.aborted) throw signal.reason;
      const results = new Array<T>(tasks.length);
      let next = 0;
      const abortRejectors = new Set<(reason: unknown) => void>();
      const onWorkersAbort = () => {
        for (const rej of abortRejectors) rej(signal?.reason);
      };
      signal?.addEventListener("abort", onWorkersAbort, { once: true });
      try {
        await Promise.all(workers.map((worker) => new Promise<void>((resolve, reject) => {
          abortRejectors.add(reject);
          const settle = (fn: () => void) => {
            abortRejectors.delete(reject);
            fn();
          };
          const pump = () => {
            if (signal?.aborted) { settle(() => reject(signal.reason)); return; }
            if (next >= tasks.length) { settle(resolve); return; }
            const taskIndex = next++;
            worker.onmessage = (e: MessageEvent<T | { readonly error: string }>) => {
              const msg = e.data;
              if (typeof msg === "object" && msg !== null && "error" in msg) {
                settle(() => reject(new Error(msg.error)));
                return;
              }
              results[taskIndex] = msg;
              pump();
            };
            worker.onerror = (e) => settle(() => reject(new Error(`BVH worker: ${e.message}`)));
            worker.postMessage(tasks[taskIndex]);
          };
          pump();
        })));
        return results;
      } finally {
        signal?.removeEventListener("abort", onWorkersAbort);
      }
    };

    // Phase 1: compute per-triangle bounds across workers.
    const boundChunk = Math.ceil(ntris / workerCount);
    const boundTasks: unknown[] = [];
    for (let w = 0; w < workerCount; w++) {
      const start = w * boundChunk;
      const end = Math.min(ntris, start + boundChunk);
      if (start < end) boundTasks.push({ type: "bounds", posSab, idxSab, boundsSab, orderSab, start, end });
    }
    await runOnWorkers(boundTasks);
    if (signal?.aborted) throw signal.reason;

    // Phase 2: build top-level SAH tree down to ~4 * workerCount leaves / jobs.
    const targetJobs = workerCount * 4;
    const topNodesF32 = new Float32Array(new ArrayBuffer(256 * BVH_NODE_WORDS * 4));
    const topNodesU32 = new Uint32Array(topNodesF32.buffer);
    let topCount = 0;
    const allocTopNode = () => {
      if (topCount * BVH_NODE_WORDS >= topNodesU32.length) throw new Error("top-level BVH overflow");
      return topCount++;
    };
    const [rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ] = computeBounds(triBounds, triOrder, 0, ntris);
    let active: TopJob[] = [];
    {
      const root = allocTopNode();
      const split = partitionRange(triBounds, triOrder, 0, ntris);
      active.push(
        { parentNode: root, side: 0, start: 0, end: split.mid, depth: 1, minX: split.lMinX, minY: split.lMinY, minZ: split.lMinZ, maxX: split.lMaxX, maxY: split.lMaxY, maxZ: split.lMaxZ },
        { parentNode: root, side: 1, start: split.mid, end: ntris, depth: 1, minX: split.rMinX, minY: split.rMinY, minZ: split.rMinZ, maxX: split.rMaxX, maxY: split.rMaxY, maxZ: split.rMaxZ },
      );
    }

    const readyLeaves: TopJob[] = [];
    while (active.length + readyLeaves.length < targetJobs) {
      let bestIdx = -1;
      let bestCount = maxLeaf;
      for (let i = 0; i < active.length; i++) {
        const j = active[i];
        const c = j.end - j.start;
        if (c > bestCount && j.depth < MAX_BVH_DEPTH - 2) {
          bestCount = c;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const job = active.splice(bestIdx, 1)[0];
      const child = allocTopNode();
      writeChild(topNodesU32, topNodesF32, job.parentNode, job.side, job.minX, job.minY, job.minZ, job.maxX, job.maxY, job.maxZ, child, 0);
      const split = partitionRange(triBounds, triOrder, job.start, job.end);
      for (const sub of [
        { parentNode: child, side: 0 as const, start: job.start, end: split.mid, depth: job.depth + 1, minX: split.lMinX, minY: split.lMinY, minZ: split.lMinZ, maxX: split.lMaxX, maxY: split.lMaxY, maxZ: split.lMaxZ },
        { parentNode: child, side: 1 as const, start: split.mid, end: job.end, depth: job.depth + 1, minX: split.rMinX, minY: split.rMinY, minZ: split.rMinZ, maxX: split.rMaxX, maxY: split.rMaxY, maxZ: split.rMaxZ },
      ]) {
        if (sub.end - sub.start <= maxLeaf) readyLeaves.push(sub);
        else active.push(sub);
      }
    }

    for (const leaf of readyLeaves) {
      writeChild(topNodesU32, topNodesF32, leaf.parentNode, leaf.side, leaf.minX, leaf.minY, leaf.minZ, leaf.maxX, leaf.maxY, leaf.maxZ, leaf.start, leaf.end - leaf.start);
    }

    // Phase 3: build subtrees and reorder indices in parallel.
    const subtreeTasks = active.map((job) => ({
      type: "subtree", idxSab, outIdxSab, boundsSab, orderSab, start: job.start, end: job.end, maxLeaf,
    }));
    interface SubtreeReply { readonly nodes: ArrayBuffer; readonly nodeCount: number; }
    const subtrees = await runOnWorkers<SubtreeReply>(subtreeTasks);
    if (signal?.aborted) throw signal.reason;

    if (readyLeaves.length > 0) {
      const reorderTasks = readyLeaves.map((leaf) => ({ type: "reorder", idxSab, outIdxSab, orderSab, start: leaf.start, end: leaf.end }));
      await runOnWorkers(reorderTasks);
      if (signal?.aborted) throw signal.reason;
    }

    // Phase 4: compact top nodes + subtrees into one flat Uint32Array.
    let totalNodes = topCount;
    for (const st of subtrees) totalNodes += st.nodeCount;
    const allNodes = new Uint32Array(totalNodes * BVH_NODE_WORDS);
    allNodes.set(topNodesU32.subarray(0, topCount * BVH_NODE_WORDS), 0);

    let cursor = topCount;
    for (let i = 0; i < active.length; i++) {
      const job = active[i];
      const st = subtrees[i];
      const stNodes = new Uint32Array(st.nodes);
      offsetSubtreeNodes(stNodes, st.nodeCount, cursor);
      allNodes.set(stNodes, cursor * BVH_NODE_WORDS);
      // Point parent slot to subtree root node at `cursor`.
      const parentBase = job.parentNode * BVH_NODE_WORDS + job.side * 8;
      const fView = new Float32Array(allNodes.buffer);
      fView[parentBase + 0] = job.minX;
      fView[parentBase + 1] = job.minY;
      fView[parentBase + 2] = job.minZ;
      allNodes[parentBase + 3] = cursor;
      fView[parentBase + 4] = job.maxX;
      fView[parentBase + 5] = job.maxY;
      fView[parentBase + 6] = job.maxZ;
      allNodes[parentBase + 7] = 0;
      cursor += st.nodeCount;
    }

    const reorderedIndices = new Uint32Array(indices.length);
    reorderedIndices.set(new Uint32Array(outIdxSab));
    const finalOrder = new Uint32Array(triOrder);

    return {
      nodes: allNodes,
      reorderedIndices,
      triOrder: finalOrder,
      nodeCount: totalNodes,
      rootMin: [rMinX, rMinY, rMinZ],
      rootMax: [rMaxX, rMaxY, rMaxZ],
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    terminateAll();
  }
}

/** CPU reference ray-BVH closest-hit test (used in unit tests to verify BVH correctness). */
export function intersectBvhCpu(
  bvh: BvhData,
  positions: Float32Array,
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  tMax = 1e30,
): { readonly t: number; readonly tri: number } | null {
  if (bvh.reorderedIndices.length === 0) return null;
  const f32 = new Float32Array(bvh.nodes.buffer, bvh.nodes.byteOffset, bvh.nodes.length);
  const u32 = bvh.nodes;
  const invX = 1 / (Math.abs(dir[0]) > 1e-12 ? dir[0] : (dir[0] >= 0 ? 1e-12 : -1e-12));
  const invY = 1 / (Math.abs(dir[1]) > 1e-12 ? dir[1] : (dir[1] >= 0 ? 1e-12 : -1e-12));
  const invZ = 1 / (Math.abs(dir[2]) > 1e-12 ? dir[2] : (dir[2] >= 0 ? 1e-12 : -1e-12));

  const hitBox = (base: number, bestT: number): number => {
    const tx0 = (f32[base + 0] - origin[0]) * invX;
    const tx1 = (f32[base + 4] - origin[0]) * invX;
    const ty0 = (f32[base + 1] - origin[1]) * invY;
    const ty1 = (f32[base + 5] - origin[1]) * invY;
    const tz0 = (f32[base + 2] - origin[2]) * invZ;
    const tz1 = (f32[base + 6] - origin[2]) * invZ;
    const tmin = Math.max(Math.min(tx0, tx1), Math.min(ty0, ty1), Math.min(tz0, tz1), 0);
    const tmax = Math.min(Math.max(tx0, tx1), Math.max(ty0, ty1), Math.max(tz0, tz1), bestT);
    return tmin <= tmax ? tmin : INF;
  };

  let bestT = tMax;
  let bestTri = -1;
  const stack = new Int32Array(64);
  let sp = 1;
  stack[0] = 0;

  while (sp > 0) {
    const nodeIdx = stack[--sp];
    const base = nodeIdx * BVH_NODE_WORDS;

    const lCount = u32[base + 7];
    const lIdx = u32[base + 3];
    const lValid = lCount > 0 || lIdx !== BVH_EMPTY_CHILD;
    const lHit = lValid ? hitBox(base, bestT) : INF;
    if (lHit < INF && lCount > 0) {
      for (let i = lIdx; i < lIdx + lCount; i++) {
        const hit = intersectTri(positions, bvh.reorderedIndices, i, origin, dir, bestT);
        if (hit >= 0) { bestT = hit; bestTri = bvh.triOrder[i]; }
      }
    }

    const rCount = u32[base + 15];
    const rIdx = u32[base + 11];
    const rValid = rCount > 0 || rIdx !== BVH_EMPTY_CHILD;
    const rHit = rValid ? hitBox(base + 8, bestT) : INF;
    if (rHit < INF && rCount > 0) {
      for (let i = rIdx; i < rIdx + rCount; i++) {
        const hit = intersectTri(positions, bvh.reorderedIndices, i, origin, dir, bestT);
        if (hit >= 0) { bestT = hit; bestTri = bvh.triOrder[i]; }
      }
    }

    const pushL = lHit < INF && lCount === 0 && lIdx !== BVH_EMPTY_CHILD;
    const pushR = rHit < INF && rCount === 0 && rIdx !== BVH_EMPTY_CHILD;
    if (pushL && pushR) {
      if (lHit < rHit) { stack[sp++] = rIdx; stack[sp++] = lIdx; }
      else { stack[sp++] = lIdx; stack[sp++] = rIdx; }
    } else if (pushL) {
      stack[sp++] = lIdx;
    } else if (pushR) {
      stack[sp++] = rIdx;
    }
  }
  return bestTri >= 0 ? { t: bestT, tri: bestTri } : null;
}

function intersectTri(
  positions: Float32Array,
  indices: Uint32Array,
  triIdx: number,
  o: readonly [number, number, number],
  d: readonly [number, number, number],
  tMax: number,
): number {
  const i0 = indices[triIdx * 3 + 0] * 3;
  const i1 = indices[triIdx * 3 + 1] * 3;
  const i2 = indices[triIdx * 3 + 2] * 3;
  const v0x = positions[i0], v0y = positions[i0 + 1], v0z = positions[i0 + 2];
  const e1x = positions[i1] - v0x, e1y = positions[i1 + 1] - v0y, e1z = positions[i1 + 2] - v0z;
  const e2x = positions[i2] - v0x, e2y = positions[i2 + 1] - v0y, e2z = positions[i2 + 2] - v0z;
  const px = d[1] * e2z - d[2] * e2y;
  const py = d[2] * e2x - d[0] * e2z;
  const pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const invDet = 1 / det;
  const tx = o[0] - v0x, ty = o[1] - v0y, tz = o[2] - v0z;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * invDet;
  if (v < 0 || u + v > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return t > 0 && t < tMax ? t : -1;
}
