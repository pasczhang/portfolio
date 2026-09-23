"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HoldingsActions } from "@/components/holdings/HoldingsActions";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  RANGE_OPTIONS,
  WAM_CAP,
  WAL_CAP,
  DLA_FLOOR,
  WLA_FLOOR,
  benchmarkLevel,
  benchmarkName,
  buildCreditMix,
  buildIssuerMix,
  buildLiquiditySeries,
  buildStressMatrix,
  buildYieldSeries,
  dv01,
  modifiedDuration,
  type AnalyticsRange,
} from "@/lib/holdings/analyticsDesk";
import { moneyFull, pctFmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PIE_COLORS } from "@/lib/report";

const tooltip = {
  contentStyle: { background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
  itemStyle: { color: "#e2e8f0" },
};

const STATUS_LABEL = { ok: "绿色安全", watch: "黄色预警", breach: "红色超标" } as const;

export function AnalyticsView() {
  const { fund } = useDesk();
  const { metrics, positions, source, asOf, snapshot } = useBook();
  const [range, setRange] = useState<AnalyticsRange>("1m");
  const days = RANGE_OPTIONS.find((r) => r.id === range)?.days ?? 30;
  const bench = benchmarkName(fund.ccy);
  const benchPx = benchmarkLevel(fund.ccy);
  const y7 = metrics.portfolioYieldPct;
  const shadowY = y7 + metrics.deviationBps / 100;
  const duration = modifiedDuration(metrics.wamDays);
  const dv = dv01(metrics.aum, metrics.wamDays);

  const yieldRows = useMemo(
    () => buildYieldSeries(asOf, days, y7, benchPx, shadowY, `${fund.id}:${asOf}`),
    [asOf, days, y7, benchPx, shadowY, fund.id],
  );
  const liqRows = useMemo(
    () => buildLiquiditySeries(asOf, Math.min(days, 30), metrics.dlaPct, metrics.wlaPct, `${fund.id}:liq`),
    [asOf, days, metrics.dlaPct, metrics.wlaPct, fund.id],
  );
  const ladder = snapshot.ladder;
  const credit = useMemo(() => buildCreditMix(positions), [positions]);
  const issuers = useMemo(() => buildIssuerMix(positions), [positions]);
  const stress = useMemo(() => buildStressMatrix(metrics), [metrics]);

  const last = yieldRows[yieldRows.length - 1];
  const prev = yieldRows[yieldRows.length - 2] ?? last;
  const vsYestBps = Math.round(((last?.fund7d ?? y7) - (prev?.fund7d ?? y7)) * 100);
  const excessBps = Math.round(((last?.fund7d ?? y7) - (last?.bench ?? benchPx)) * 100);

  return (
    <AppShell
      title="分析看板 · Analytics"
      subtitle={`${fund.name} · 截面指标均由当前持仓实时加权 · as of ${asOf}`}
      source={source}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HoldingsActions />
          <div className="flex overflow-hidden rounded-md border border-[hsl(var(--border))]">
            {RANGE_OPTIONS.map((r) => (
              <Button
                key={r.id}
                type="button"
                variant={range === r.id ? "accent" : "ghost"}
                className="rounded-none px-2.5"
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <p className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200">
        历史收益 / {bench} 曲线无真实时序行情，当前为「基于当前持仓模拟的近{days}天走势」；终点强制对齐截面 7 日年化、DLA、WLA。导入 JSON/CSV
        覆盖持仓后，WAM、DLA、阶梯与分布立即重算。
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          kicker="7-Day Yield"
          title="7日年化收益率"
          value={pctFmt(y7)}
          footnote={
            <>
              <span className={vsYestBps >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {vsYestBps >= 0 ? "+" : ""}
                {vsYestBps} bps vs 昨日（模拟路径）
              </span>
              <span className="text-[hsl(var(--muted-foreground))]">
                {" "}
                · vs {bench} {excessBps >= 0 ? "+" : ""}
                {excessBps} bps
              </span>
            </>
          }
        />
        <Kpi
          kicker="WAM"
          title="加权平均到期日"
          value={`${metrics.wamDays.toFixed(1)} 天`}
          footnote={<span>监管上限 {WAM_CAP} 天 · 余量 {(WAM_CAP - metrics.wamDays).toFixed(1)} 天</span>}
        >
          <Meter pct={(metrics.wamDays / WAM_CAP) * 100} warn={metrics.wamDays > WAM_CAP * 0.85} />
        </Kpi>
        <Kpi
          kicker="WAL"
          title="加权平均生命周期"
          value={`${metrics.walDays.toFixed(1)} 天`}
          footnote={<span>上限 {WAL_CAP} 天 · 安全边际 {(WAL_CAP - metrics.walDays).toFixed(1)} 天</span>}
        >
          <Meter pct={(metrics.walDays / WAL_CAP) * 100} warn={metrics.walDays > WAL_CAP * 0.85} />
        </Kpi>
        <Kpi
          kicker="Mod. Duration / DV01"
          title="修正久期与 DV01"
          value={moneyFull(dv, fund.ccy)}
          footnote={
            <span>
              {duration.toFixed(3)} 年 · {moneyFull(dv, fund.ccy)} / bp
            </span>
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="收益走势与基准利差" hint={`基于当前持仓模拟的近${days}天走势 · 非交易所历史行情 · 终点=截面年化`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yieldRows}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Tooltip
                {...tooltip}
                formatter={(value, name) => [`${Number(value ?? 0).toFixed(3)}%`, String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="fund7d" name="7日年化" stroke="#34d399" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="bench" name={bench} stroke="#38bdf8" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="shadow" name="影子市值年化" stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="现金流到期阶梯" hint="截面动态 · 切分 [0,1,7,30,60,90,>90] · 金额=到期本息">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ladder}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `${(Number(v) / 1e6).toFixed(0)}m`} />
              <Tooltip
                {...tooltip}
                formatter={(value, name) => [moneyFull(Number(value ?? 0), fund.ccy), String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="td" name="定期存款到期" stackId="a" fill="#38bdf8" />
              <Bar dataKey="cd" name="CD/商票兑付" stackId="a" fill="#818cf8" />
              <Bar dataKey="govt" name="国债到期" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="流动性缓冲垫动态监控"
          hint={`DLA/WLA 截面来自持仓到期日；近 ${Math.min(days, 30)} 天面积为模拟路径，终点对齐最新 ${pctFmt(metrics.dlaPct)} / ${pctFmt(metrics.wlaPct)}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={liqRows}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
              <Tooltip {...tooltip} formatter={(value, name) => [`${Number(value ?? 0).toFixed(2)}%`, String(name)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={DLA_FLOOR} stroke="#f87171" strokeDasharray="5 4" label={{ value: `DLA ${DLA_FLOOR}%`, fill: "#f87171", fontSize: 10 }} />
              <ReferenceLine y={WLA_FLOOR} stroke="#fb923c" strokeDasharray="5 4" label={{ value: `WLA ${WLA_FLOOR}%`, fill: "#fb923c", fontSize: 10 }} />
              <Area type="monotone" dataKey="dla" name="DLA %" stroke="#34d399" fill="#34d39933" />
              <Area type="monotone" dataKey="wla" name="WLA %" stroke="#38bdf8" fill="#38bdf822" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="p-3">
          <h2 className="mb-1 text-sm font-semibold">双维度信用与资产穿透</h2>
          <p className="mb-2 text-[10px] text-[hsl(var(--muted-foreground))]">评级 groupBy · 发行人 groupBy（当前账本）</p>
          <div className="grid h-[280px] gap-2 md:grid-cols-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={credit} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                <YAxis type="category" dataKey="rating" width={72} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip
                  {...tooltip}
                  formatter={(value, _n, item) => [
                    `${pctFmt(Number(value ?? 0))} · ${moneyFull(Number(item?.payload?.value ?? 0), fund.ccy)}`,
                    "占比",
                  ]}
                />
                <Bar dataKey="pct" fill="#818cf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={issuers} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                  {issuers.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...tooltip}
                  formatter={(value, name) => {
                    const row = issuers.find((g) => g.name === name);
                    return [`${moneyFull(Number(value ?? 0), fund.ccy)} · ${pctFmt(row?.pct ?? 0)}`, String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-[hsl(var(--border))] px-3 py-2">
          <h2 className="text-sm font-semibold">利率与流动性压力测试矩阵</h2>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            敏感度快照 · 偏离度 / WAM / DLA / WLA · 修正久期 {duration.toFixed(3)}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[hsl(var(--muted))] font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-3 py-2">情景</th>
                <th className="px-3 py-2">预估偏离度 (bps)</th>
                <th className="px-3 py-2">预估 WAM</th>
                <th className="px-3 py-2">DLA 剩余</th>
                <th className="px-3 py-2">WLA 剩余</th>
                <th className="px-3 py-2">合规状态</th>
              </tr>
            </thead>
            <tbody>
              {stress.map((row) => (
                <tr key={row.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2">{row.scenario}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">
                    {row.deviationBps >= 0 ? "+" : ""}
                    {row.deviationBps.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums">{row.wamDays.toFixed(1)}d</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{pctFmt(row.dlaPct)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{pctFmt(row.wlaPct)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={row.status}>{STATUS_LABEL[row.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function Kpi({
  kicker,
  title,
  value,
  footnote,
  children,
}: {
  kicker: string;
  title: string;
  value: string;
  footnote: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{kicker}</p>
      <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{title}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-emerald-300">{value}</p>
      {children}
      <p className="mt-2 text-[10px] leading-snug">{footnote}</p>
    </Card>
  );
}

function Meter({ pct, warn }: { pct: number; warn?: boolean }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
      <div
        className={cn("h-full rounded-full", warn ? "bg-amber-400" : "bg-sky-400")}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Card className="p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-2 text-[10px] text-[hsl(var(--muted-foreground))]">{hint}</p>
      <div className="h-[280px]">{children}</div>
    </Card>
  );
}
