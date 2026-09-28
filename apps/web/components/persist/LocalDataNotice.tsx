"use client";

import { cn } from "@/lib/utils";

const COPY =
  "当前数据保存在本地浏览器中（IndexedDB / localStorage），跨电脑使用需接入后端或云数据库。";

export function LocalDataNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <p
      className={cn(
        "rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-200/90",
        className,
      )}
    >
      {compact ? "账户与持仓仅保存在本机浏览器，换电脑无法自动同步。" : COPY}
    </p>
  );
}
