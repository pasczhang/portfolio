"use client";

import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="p-4 text-xs text-slate-400">Loading workbench…</p>}>
      <Dashboard />
    </Suspense>
  );
}
