/**
 * part-cache.ts: browser IndexedDB cache for big 3D print files and prop STLs.
 *
 * URL hashes hold every booth setting, never multi-megabyte meshes. Whenever a
 * user or local MCP agent opens a part or imports a prop STL, its bytes are
 * cached here by content hash. Clicking any share link in this browser then
 * reopens the exact model automatically, even after opening other models or
 * closing the local bridge.
 *
 * Bounded by count and total bytes (LRU eviction). Every operation fails
 * silently when IndexedDB is absent or refuses writes (private mode, tests).
 */

export interface PartCache {
  put(key: string, name: string, bytes: ArrayBuffer): Promise<void>;
  get(key: string): Promise<File | null>;
}

const DB_NAME = "filament-booth-parts";
const DB_VERSION = 1;
const STORE = "files";
const MAX_ENTRIES = 20;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MiB

interface StoredFile {
  readonly key: string;
  readonly name: string;
  readonly bytes: ArrayBuffer;
  readonly size: number;
  readonly savedAt: number;
}

export const partCacheKey = (hash: string): string => `part:${hash.slice(0, 16).toLowerCase()}`;
export const propCacheKey = (meshId: string): string => `prop:${meshId}`;

/** A cache that stores nothing, for tests or environments without IndexedDB. */
export const NO_PART_CACHE: PartCache = {
  put: async () => {},
  get: async () => null,
};

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result); };
    req.onerror = () => { reject(req.error ?? new Error("IndexedDB request failed")); };
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { reject(tx.error ?? new Error("IndexedDB transaction failed")); };
    tx.onabort = () => { reject(tx.error ?? new Error("IndexedDB transaction aborted")); };
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => { resolve(req.result); };
    req.onerror = () => { reject(req.error ?? new Error("IndexedDB open failed")); };
  });
}

/** Lazy IndexedDB cache with LRU eviction. Never throws to callers. */
export function createBrowserPartCache(): PartCache {
  if (typeof indexedDB === "undefined") return NO_PART_CACHE;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    dbPromise ??= openDb().catch((e) => { dbPromise = null; throw e; });
    return dbPromise;
  };

  return {
    async put(key, name, bytes) {
      if (bytes.byteLength > MAX_TOTAL_BYTES) return;
      try {
        const database = await db();
        const tx = database.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const entry: StoredFile = { key, name, bytes: bytes.slice(0), size: bytes.byteLength, savedAt: Date.now() };
        store.put(entry);
        const all = await request<StoredFile[]>(store.getAll());
        all.sort((a, b) => b.savedAt - a.savedAt);
        let total = 0;
        for (let i = 0; i < all.length; i++) {
          const item = all[i]!;
          if (i >= MAX_ENTRIES || total + item.size > MAX_TOTAL_BYTES) {
            store.delete(item.key);
          } else {
            total += item.size;
          }
        }
        await transactionDone(tx);
      } catch {
        // Quota or private window: caching is best-effort and never blocks opening a part.
      }
    },

    async get(key) {
      try {
        const database = await db();
        const tx = database.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const hit = await request<StoredFile | undefined>(store.get(key));
        if (hit === undefined) return null;
        // Touch LRU timestamp on read.
        store.put({ ...hit, savedAt: Date.now() });
        await transactionDone(tx);
        return new File([hit.bytes], hit.name);
      } catch {
        return null;
      }
    },
  };
}
