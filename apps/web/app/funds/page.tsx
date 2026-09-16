"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { daysFmt, moneyFull, pctFmt } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function FundsPage() {
  const { fund, setFundId } = useDesk();
  const { fundSnapshots } = useBook();
  const totalNames = fundSnapshots.length;

  return (
    <AppShell
      title="多基金总览 · Funds"
      subtitle={`${fund.manager} · ${totalNames} 只公募 MMF · 规模与流动性大盘`}
    >
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        当前交易台：
        <span className="ml-1 font-mono text-amber-400">
          {fund.code} · {fund.name}
        </span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {fundSnapshots.map((row) => {
          const active = row.fund.id === fund.id;
          const m = row.metrics;
          return (
            <Card
              key={row.fund.id}
              className={cn("p-4", active && "border-amber-500/70 ring-1 ring-amber-500/30")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-amber-400">{row.fund.code}</p>
                  <p className="mt-1 text-sm font-medium">{row.fund.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                    {row.fund.shortName} · {row.fund.currency} · ISIN {row.fund.isin}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-emerald-400">{row.fund.status}</span>
                  <Button variant={active ? "accent" : "outline"} onClick={() => setFundId(row.fund.id)}>
                    {active ? "当前份额" : "切换至此"}
                  </Button>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs">
                <div>
                  <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">AUM</dt>
                  <dd className="text-sm text-amber-300">{moneyFull(m.aum, row.fund.ccy)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">WAM / WAL</dt>
                  <dd>
                    {daysFmt(m.wamDays)} / {daysFmt(m.walDays)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">WLA</dt>
                  <dd>{pctFmt(m.wlaPct)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Spread</dt>
                  <dd>
                    {m.deviationBps >= 0 ? "+" : ""}
                    {m.deviationBps.toFixed(1)} bps
                  </dd>
                </div>
              </dl>
              <p className="mt-3 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                {row.fund.wamLimit} · {row.fund.walLimit} · {row.origin === "import" ? "IMPORTED" : "SAMPLE"}
              </p>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
        <Link className="text-amber-500 hover:underline" href="/workbench">
          进入事前试算（独立模块） →
        </Link>
      </p>
    </AppShell>
  );
}
