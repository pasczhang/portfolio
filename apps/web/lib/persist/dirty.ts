import { useEffect } from "react";

let unsaved = 0;
let writes = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeDirty(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function shouldBlockUnload(): boolean {
  return unsaved > 0 || writes > 0;
}

export function markFormDirty(): () => void {
  unsaved += 1;
  notify();
  return () => {
    unsaved = Math.max(0, unsaved - 1);
    notify();
  };
}

export function useFormDirty() {
  useEffect(() => markFormDirty(), []);
}

export function beginPersistWrite(): void {
  writes += 1;
  notify();
}

export function endPersistWrite(): void {
  writes = Math.max(0, writes - 1);
  notify();
}

export function getDirtyState() {
  return { unsaved, writes };
}
