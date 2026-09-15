"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { Card } from "@/components/ui/card";
import { useApiOr } from "@/hooks/useApiOr";
import { MOCK_RUNOFF, MOCK_TENOR, MOCK_YIELD } from "@/lib/mocks";
import { num, navPx, pctFmt, usd } from "@/lib/format";
import type { RateShockPoint } from "@/lib/desk-types";
import { StatusPill } from "@/components/desk/meters";

const SHIFTS = [-100, -50, -25, 0, 25, 50, 100];
const tooltip = {
  contentStyle: { background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
};

export default function AnalyticsPage() {
  const { fund } = useDesk();
  const tenor = useApiOr("/analytics/tenor-distribution", MOCK_TENOR);
  const yieldShock = useApiOr("/analytics/yield-curve-shock", MOCK_YIELD);
  const runoff = useApiOr("/analytics/runoff", MOCK_RUNOFF);
  const [shift, setShift] = useState(0);
  const source = tenor.source === "api" && yieldShock.source === "api" && runoff.source === "api" ? "api" : tenor.source;

  const selected: RateShockPoint = useMemo(() => {
    const hit = yieldShock.data.curve.find((p) => p.shift_bps === shift);
    return hit ?? yieldShock.data.selected;
  }, [yieldShock.data, shift]);

  const tenorRows = tenor.data.buckets.map((b) => ({
    bucket: b.bucket,
    amount: num(b.amount) / 1e6,
    weight: num(b.weight_pct),
  }));

  const shockRows = yieldShock.data.curve.map((p) => ({
    shift: p.shift_bps,
    shadow: num(p.shadow_nav),
    deviation: num(p.deviation_bps),
  }));

  const runoffRows = runoff.data.scenarios.map((s) => ({
    name: `${num(s.redemption_pct)}%`,
    cash: num(s.cash_after) / 1e6,
    dla: num(s.dla_pct_after),
    wla: num(s.wla_pct_after),
  }));

  return (
    <AppShell title="Analytics" subtitle={`${fund.name} · 久期分布 · 利率曲线冲击`} source={source}>
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">久期与到期分布</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tenorRows}>
              <CartesianGrid stroke="#1e2a3f" />
              <XAxis dataKey="bucket" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip {...tooltip} formatter={(v) => [`${Number(v ?? 0).toFixed(2)}m`, "摊余成本"]} />
              <Bar dataKey="amount" name="摊余成本 (USD m)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">利率曲线冲击 Yield Curve Shock</h2>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">平行移动 ±25 / ±50 / ±100 bps，实时重估 Shadow NAV</p>
          </div>
          <div className="min-w-[240px]">
            <input
              type="range"
              min={0}
              max={6}
              step={1}
              value={SHIFTS.indexOf(shift)}
              onChange={(e) => setShift(SHIFTS[Number(e.target.value)] ?? 0)}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
              {SHIFTS.map((s) => (
                <span key={s}>{s > 0 ? `+${s}` : s}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-[hsl(var(--border))] p-3">
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Selected shock</p>
            <p className="font-mono text-lg text-amber-400">
              {shift > 0 ? "+" : ""}
              {shift} bps
            </p>
          </div>
          <div className="rounded-md border border-[hsl(var(--border))] p-3">
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Shadow NAV</p>
            <p className="font-mono text-lg">{navPx(selected.shadow_nav)}</p>
          </div>
          <div className="rounded-md border border-[hsl(var(--border))] p-3">
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">偏离度</p>
            <p className="font-mono text-lg">{num(selected.deviation_bps).toFixed(1)} bps</p>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={shockRows}>
              <CartesianGrid stroke="#1e2a3f" />
              <XAxis dataKey="shift" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="nav" stroke="#94a3b8" domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="bps" orientation="right" stroke="#38bdf8" tick={{ fontSize: 11 }} />
              <Tooltip {...tooltip} />
              <Legend />
              <Line yAxisId="nav" type="monotone" dataKey="shadow" name="Shadow NAV" stroke="#f59e0b" dot />
              <Line yAxisId="bps" type="monotone" dataKey="deviation" name="Deviation bps" stroke="#38bdf8" dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold">巨额赎回压力测试 Run-off</h2>
        <p className="mb-3 text-[11px] text-[hsl(var(--muted-foreground))]">模拟 10% / 20% / 30% 赎回对现金与 DLA/WLA 的消耗</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={runoffRows}>
              <CartesianGrid stroke="#1e2a3f" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip {...tooltip} />
              <Legend />
              <Bar dataKey="cash" name="剩余现金 (USD m)" fill="#64748b" />
              <Bar dataKey="dla" name="DLA %" fill="#34d399" />
              <Bar dataKey="wla" name="WLA %" fill="#38bdf8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="mt-4 w-full text-left text-xs">
          <thead className="font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="py-1">赎回</th>
              <th>流出</th>
              <th>现金后</th>
              <th>DLA后</th>
              <th>WLA后</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {runoff.data.scenarios.map((s) => (
              <tr key={String(s.redemption_pct)} className="border-t border-[hsl(var(--border))]">
                <td className="py-2 font-mono">{pctFmt(s.redemption_pct, 0)}</td>
                <td className="font-mono">{usd(s.outflow)}</td>
                <td className="font-mono">{usd(s.cash_after)}</td>
                <td className="font-mono">{pctFmt(s.dla_pct_after)}</td>
                <td className="font-mono">{pctFmt(s.wla_pct_after)}</td>
                <td>
                  <StatusPill status={!s.dla_ok || !s.wla_ok || s.fire_sale ? "WARN" : "PASS"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
