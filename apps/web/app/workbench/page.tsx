"use client";

import { Suspense } from "react";
import { Workbench } from "@/components/dashboard/Workbench";

export default function WorkbenchPage() {
  return (
    <Suspense fallback={<p className="p-4 text-xs text-slate-400">Loading workbench…</p>}>
      <Workbench />
    </Suspense>
  );
}
