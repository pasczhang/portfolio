"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { Button } from "@/components/ui/button";
import { FUND_LIST } from "@/constants/funds";
import { cn } from "@/lib/utils";

export default function FundsPage() {
  const { fund, setFundId } = useDesk();

  return (
    <AppShell
      title="Funds"
      subtitle={`${fund.manager} · 公募货币基金份额主数据（与顶部 Fund Selector 同源）`}
    >
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        当前交易台：
        <span className="ml-1 font-mono text-amber-400">
          {fund.code} · {fund.name}
        </span>
      </p>
      <ul className="space-y-2">
        {FUND_LIST.map((row) => {
          const active = row.id === fund.id;
          return (
            <li
              key={row.id}
              className={cn(
                "rounded-lg border bg-[hsl(var(--card))] p-4",
                active ? "border-amber-500/70 ring-1 ring-amber-500/30" : "border-[hsl(var(--border))]",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-amber-400">{row.code}</p>
                  <p className="mt-1 text-sm font-medium">{row.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                    {row.shortName} · {row.currency} · ISIN {row.isin} · Inception {row.inception}
                  </p>
                  <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{row.manager}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-emerald-400">{row.status}</span>
                  <Button variant={active ? "accent" : "outline"} onClick={() => setFundId(row.id)}>
                    {active ? "当前份额" : "设为当前"}
                  </Button>
                </div>
              </div>
              <p className="mt-3 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                {row.wamLimit} · {row.walLimit}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
        <Link className="text-amber-500 hover:underline" href="/workbench">
          进入事前试算 →
        </Link>
      </p>
    </AppShell>
  );
}
