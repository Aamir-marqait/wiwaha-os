"use client";
/**
 * A tiny IndexedDB queue for task completions made without a network.
 * Each entry keeps the proof file as a Blob and the time it was ticked; the
 * replay uploads the file, then calls complete_task with that time (the RPC
 * is idempotent, so replays never double-complete).
 */
export interface QueuedCompletion { taskId: string; note: string; completedAt: string; file: Blob | null; fileName: string | null }

const DB = "wiwaha-tasks";
const STORE = "completions";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "taskId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const enqueue = (c: QueuedCompletion) => tx("readwrite", (s) => s.put(c));
export const pending = () => tx<QueuedCompletion[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedCompletion[]>);
export const remove = (taskId: string) => tx("readwrite", (s) => s.delete(taskId));
