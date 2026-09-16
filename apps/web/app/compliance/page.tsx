"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { useBook } from "@/components/layout/BookProvider";
import { StatusPill, ProgressBar } from "@/components/desk/meters";
import { num, pctFmt, money } from "@/lib/format";
import { Card } from "@/components/ui/card";

export default function CompliancePage() {
  const { fund } = useDesk();
  const { compliance: data, source } = useBook();
  const metricCards = data.cards.filter((c) => ["WAM", "WAL", "MAX_RESIDUAL"].includes(c.code));
  const liqCards = data.cards.filter((c) => ["DLA", "WLA"].includes(c.code));

  return (
    <AppShell title="SFC Compliance" subtitle={`${fund.name} · SFC 单位信托守则第 8.2 章`} source={source}>
      <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
        {fund.code} · {fund.shortName} · as of {data.as_of} · AUM {money(data.aum, fund.ccy)}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {metricCards.map((card) => (
          <Card key={card.code} className="p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="text-sm font-medium">{card.title}</h2>
              <StatusPill status={card.status} />
            </div>
            <p className="font-mono text-2xl text-amber-400">
              {num(card.value).toFixed(1)}
              <span className="ml-1 text-sm text-[hsl(var(--muted-foreground))]">{card.unit}</span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
              限额 {num(card.limit)}
              {card.unit}
            </p>
            <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">{card.detail}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">单一发行人 / 银行存款集中度（≤10% 及 20% 特许限额）</h2>
        <div className="space-y-3">
          {data.concentration.map((row) => (
            <div key={row.issuer}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  <span className="font-medium">{row.issuer}</span>
                  <span className="ml-2 font-mono text-[hsl(var(--muted-foreground))]">
                    {row.product_hint} · {money(row.amount, fund.ccy)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono">{pctFmt(row.weight_pct)}</span>
                  <StatusPill status={row.status} />
                </span>
              </div>
              <div className="relative h-2 rounded bg-[hsl(var(--muted))]">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-sky-500/80"
                  style={{ width: `${Math.min(num(row.weight_pct) * 5, 100)}%` }}
                />
                <div className="absolute inset-y-0 w-px bg-amber-400" style={{ left: "50%" }} title="10%" />
                <div className="absolute inset-y-0 w-px bg-red-500" style={{ left: "100%" }} />
              </div>
              <div className="mt-0.5 flex justify-between font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                <span>0%</span>
                <span>10% 上限</span>
                <span>20% 特许</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {liqCards.map((card) => (
          <Card key={card.code} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">{card.title}</h2>
              <StatusPill status={card.status} />
            </div>
            <p className="mb-2 font-mono text-xl text-amber-400">{pctFmt(card.value)}</p>
            <ProgressBar value={card.value} limit={card.limit} />
            <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">{card.detail}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-[hsl(var(--border))] px-4 py-3 text-sm font-semibold">Breach Alerts</div>
        <table className="w-full text-left text-xs">
          <thead className="bg-[hsl(var(--muted))] font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Rule</th>
              <th className="px-3 py-2">Alert</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {data.alerts.map((a) => (
              <tr key={a.id} className="border-t border-[hsl(var(--border))]">
                <td className="px-3 py-2 font-mono">{a.id}</td>
                <td className="px-3 py-2">
                  <StatusPill status={a.severity} />
                </td>
                <td className="px-3 py-2 font-mono">{a.rule}</td>
                <td className="px-3 py-2">{a.title}</td>
                <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
