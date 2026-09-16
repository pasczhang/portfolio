"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HoldingsGrid } from "@/components/grid/HoldingsGrid";
import { HoldingsActions } from "@/components/holdings/HoldingsActions";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Card } from "@/components/ui/card";
import { allocationByClass, maturityBuckets, topIssuers } from "@/lib/holdings/analysis";
import { moneyFull, pctFmt } from "@/lib/format";
import { PIE_COLORS } from "@/lib/report";

const tooltip = {
  contentStyle: { background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
};

export default function HoldingsAnalysisPage() {
  const { fund } = useDesk();
  const { holdings, positions, source, aum, asOf } = useBook();
  const pie = allocationByClass(positions, asOf);
  const buckets = maturityBuckets(positions, asOf);
  const issuers = topIssuers(positions, 5);

  return (
    <AppShell
      title="持仓分析 · Holdings Analysis"
      subtitle={`${fund.name} · 占 NAV 比重 · SFC 8.2 单一主体限额 10% / 20%`}
      source={source}
      actions={<HoldingsActions />}
    >
      <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
        {fund.code} · as of {asOf} · Total NAV {moneyFull(aum, fund.ccy)} · {holdings.length} names
      </p>
      <HoldingsGrid rows={holdings} analysis />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-3">
          <h2 className="mb-2 text-sm font-semibold">资产大类配置 · Asset Class</h2>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>
                  {pie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...tooltip}
                  formatter={(value, name) => {
                    const row = pie.find((p) => p.name === name);
                    return [`${moneyFull(Number(value ?? 0), fund.ccy)} · ${pctFmt(row?.pct ?? 0)}`, String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-3">
          <h2 className="mb-2 text-sm font-semibold">到期期限分布 · Maturity Buckets</h2>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(0)}m`} />
                <Tooltip
                  {...tooltip}
                  formatter={(value, _n, item) => {
                    const pct = Number(item?.payload?.pct ?? 0);
                    return [`${moneyFull(Number(value ?? 0), fund.ccy)} · ${pctFmt(pct)}`, "Amount"];
                  }}
                />
                <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-3">
          <h2 className="mb-2 text-sm font-semibold">前五大发行人 · Top 5 Issuers</h2>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={issuers} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                <YAxis type="category" dataKey="issuer" width={110} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip
                  {...tooltip}
                  formatter={(value, _n, item) => {
                    const amt = Number(item?.payload?.value ?? 0);
                    return [`${pctFmt(Number(value ?? 0))} · ${moneyFull(amt, fund.ccy)}`, "% of NAV"];
                  }}
                />
                <Bar dataKey="pct" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
