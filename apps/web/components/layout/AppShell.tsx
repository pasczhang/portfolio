"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({
  title,
  subtitle,
  source,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  source?: "api" | "mock";
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="page-sub-header print:hidden flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 px-4 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">{title}</h1>
          {subtitle ? <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {source ? (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                source === "api" ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400",
              )}
            >
              {source === "api" ? "LIVE API" : "MOCK"}
            </span>
          ) : null}
          {actions}
        </div>
      </div>
      <main className="space-y-4 p-4">{children}</main>
    </>
  );
}
