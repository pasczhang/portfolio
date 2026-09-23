"use client";

import { useEffect } from "react";
import { shouldBlockUnload, subscribeDirty } from "@/lib/persist/dirty";

export function PersistGuard() {
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!shouldBlockUnload()) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    const unsub = subscribeDirty(() => undefined);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      unsub();
    };
  }, []);
  return null;
}
