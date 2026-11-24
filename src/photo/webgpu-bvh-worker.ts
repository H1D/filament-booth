/**
 * webgpu-bvh-worker.ts: worker thread for parallel bounds computation, subtree BVH
 * construction, and triangle index reordering over SharedArrayBuffers.
 */
import { buildSubtree, fillTriBoundsRange } from "./webgpu-bvh";

type WorkerRequest =
  | {
      readonly type: "bounds";
      readonly posSab: SharedArrayBuffer;
      readonly idxSab: SharedArrayBuffer;
      readonly boundsSab: SharedArrayBuffer;
      readonly orderSab: SharedArrayBuffer;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly type: "subtree";
      readonly idxSab: SharedArrayBuffer;
      readonly outIdxSab: SharedArrayBuffer;
      readonly boundsSab: SharedArrayBuffer;
      readonly orderSab: SharedArrayBuffer;
      readonly start: number;
      readonly end: number;
      readonly maxLeaf: number;
    }
  | {
      readonly type: "reorder";
      readonly idxSab: SharedArrayBuffer;
      readonly outIdxSab: SharedArrayBuffer;
      readonly orderSab: SharedArrayBuffer;
      readonly start: number;
      readonly end: number;
    };

function reorderSlice(indices: Uint32Array, out: Uint32Array, order: Uint32Array, start: number, end: number): void {
  for (let i = start; i < end; i++) {
    const src = order[i] * 3;
    const dst = i * 3;
    out[dst + 0] = indices[src + 0];
    out[dst + 1] = indices[src + 1];
    out[dst + 2] = indices[src + 2];
  }
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === "bounds") {
      fillTriBoundsRange(
        new Float32Array(req.posSab),
        new Uint32Array(req.idxSab),
        new Float32Array(req.boundsSab),
        new Uint32Array(req.orderSab),
        req.start,
        req.end,
      );
      workerScope.postMessage({});
      return;
    }
    if (req.type === "reorder") {
      reorderSlice(new Uint32Array(req.idxSab), new Uint32Array(req.outIdxSab), new Uint32Array(req.orderSab), req.start, req.end);
      workerScope.postMessage({});
      return;
    }
    const triBounds = new Float32Array(req.boundsSab);
    const triOrder = new Uint32Array(req.orderSab);
    const { nodes, nodeCount } = buildSubtree(triBounds, triOrder, req.start, req.end, req.maxLeaf);
    reorderSlice(new Uint32Array(req.idxSab), new Uint32Array(req.outIdxSab), triOrder, req.start, req.end);
    const copy = new Uint32Array(nodes);
    workerScope.postMessage({ nodes: copy.buffer, nodeCount }, [copy.buffer]);
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
