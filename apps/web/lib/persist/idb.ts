import { AUTO_SNAPSHOT_LIMIT, emptyPersistBundle, type AutoSnapshotRecord, type PersistBundle } from "@/lib/persist/types";

const DB_NAME = "bam-pms-idb";
const DB_VERSION = 1;
const KV_STORE = "kv";
const SNAP_STORE = "auto_snapshots";
export const BUNDLE_KEY = "persist_bundle";
export const LAST_OPEN_KEY = "last_open_date";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const timer = window.setTimeout(() => {
        finish(() => {
          dbPromise = null;
          reject(new Error("IndexedDB open timeout"));
        });
      }, 2500);
      const req = indexedDB.open(DB_NAME);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
        if (!db.objectStoreNames.contains(SNAP_STORE)) {
          const snaps = db.createObjectStore(SNAP_STORE, { keyPath: "id" });
          snaps.createIndex("createdAt", "createdAt");
        }
      };
      req.onsuccess = () =>
        finish(() => {
          window.clearTimeout(timer);
          resolve(req.result);
        });
      req.onerror = () =>
        finish(() => {
          window.clearTimeout(timer);
          dbPromise = null;
          reject(req.error ?? new Error("IndexedDB open failed"));
        });
    });
  }
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(KV_STORE, "readonly");
  const value = await reqToPromise(tx.objectStore(KV_STORE).get(key));
  await txDone(tx);
  return value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(KV_STORE, "readwrite");
  tx.objectStore(KV_STORE).put(value, key);
  await txDone(tx);
}

export async function loadPersistBundle(): Promise<PersistBundle | null> {
  try {
    const bundle = await kvGet<PersistBundle>(BUNDLE_KEY);
    return bundle ?? null;
  } catch {
    return null;
  }
}

export async function savePersistBundle(bundle: PersistBundle): Promise<void> {
  await kvSet(BUNDLE_KEY, bundle);
}

export async function listAutoSnapshots(): Promise<AutoSnapshotRecord[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(SNAP_STORE, "readonly");
    const rows = (await reqToPromise(tx.objectStore(SNAP_STORE).getAll())) as AutoSnapshotRecord[];
    await txDone(tx);
    return (rows || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function putAutoSnapshot(record: AutoSnapshotRecord): Promise<void> {
  const db = await openDb();
  const existing = await listAutoSnapshots();
  const tx = db.transaction(SNAP_STORE, "readwrite");
  const store = tx.objectStore(SNAP_STORE);
  store.put(record);
  const extras = existing.filter((r) => r.id !== record.id).slice(AUTO_SNAPSHOT_LIMIT - 1);
  extras.forEach((r) => store.delete(r.id));
  await txDone(tx);
}

export async function getAutoSnapshot(id: string): Promise<AutoSnapshotRecord | undefined> {
  const db = await openDb();
  const tx = db.transaction(SNAP_STORE, "readonly");
  const row = (await reqToPromise(tx.objectStore(SNAP_STORE).get(id))) as AutoSnapshotRecord | undefined;
  await txDone(tx);
  return row;
}

export async function deleteAutoSnapshot(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SNAP_STORE, "readwrite");
  tx.objectStore(SNAP_STORE).delete(id);
  await txDone(tx);
}

export function cloneBundle(bundle: PersistBundle | null | undefined): PersistBundle {
  if (!bundle) return emptyPersistBundle();
  return JSON.parse(JSON.stringify(bundle)) as PersistBundle;
}
