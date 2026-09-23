"use client";

import { Fragment, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { useBook } from "@/components/layout/BookProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { applyStress, type DualPosition } from "@/lib/dualNav";
import { bpsFmt, moneyFull, moneyPosition, navPx5, num, pctFmt } from "@/lib/format";

const tooltip = {
  contentStyle: { background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
};

const CURVE_STOPS = [0, 25, 50, 100];
const SPREAD_STOPS = [0, 15, 30, 65];

function tone(status: string): "ok" | "watch" | "breach" {
  if (status === "WARNING") return "watch";
  if (status === "BREACH") return "breach";
  return "ok";
}

function statusLabel(status: string) {
  if (status === "WARNING") return "Alert";
  if (status === "BREACH") return "Breach";
  return "Safe";
}

function PositionDrawer({ row, ccy }: { row: DualPosition; ccy: "USD" | "HKD" }) {
  return (
    <tr className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20">
      <td colSpan={9} className="px-4 py-3 text-[11px]">
        <p className="mb-2 text-[hsl(var(--muted-foreground))]">{row.model_notes}</p>
        <p className="mb-1 font-semibold">贴现参数</p>
        <p className="font-mono">
          r={pctFmt(num(row.discount_rate) * 100, 3)} · s={pctFmt(num(row.credit_spread) * 100, 3)} · all-in=
          {pctFmt(num(row.all_in_rate) * 100, 3)} · {row.day_count} · Level {row.level}
        </p>
        <table className="mt-2 w-full max-w-xl text-left font-mono">
          <thead>
            <tr className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              <th className="py-1">日期</th>
              <th>天数</th>
              <th>现金流</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {row.cashflows.map((cf) => (
              <tr key={`${cf.date}-${cf.days}`}>
                <td className="py-1">{cf.date}</td>
                <td>{cf.days}D</td>
                <td>{moneyPosition(cf.amount, row.currency, ccy)}</td>
                <td>{cf.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function DualNavDesk() {
  const { fund } = useDesk();
  const { dualNav, source } = useBook();
  const [curve, setCurve] = useState(0);
  const [spread, setSpread] = useState(0);
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [vnavOpen, setVnavOpen] = useState(false);

  const data = useMemo(() => applyStress(dualNav, curve, spread), [dualNav, curve, spread]);
  const k = data.kpis;
  const rows = data.positions.filter((p) => {
    const pool = fund.ccy === "USD" ? p.currency !== "HKD" : true;
    const hit = !q || `${p.isin} ${p.name} ${p.issuer} ${p.currency}`.toLowerCase().includes(q.toLowerCase());
    const typ = type === "ALL" || p.asset_type === type;
    return pool && hit && typ;
  });

  const line = data.history.map((p) => ({
    date: String(p.date).slice(5),
    official: num(p.accounting_nav),
    shadow: num(p.shadow_nav),
    deviation: num(p.deviation_bps),
  }));

  return (
    <AppShell
      title="双轨估值"
      subtitle={`${fund.name} · ${fund.code} · ${fund.ccy} Accounting vs Shadow NAV`}
      source={source}
      actions={
        <Button
          variant="outline"
          onClick={() => {
            setCurve(0);
            setSpread(0);
          }}
        >
          重新估值
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Accounting NAV</p>
          <p className="font-mono text-2xl">
            {fund.symbol}
            {navPx5(k.accounting_nav)}
          </p>
          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">摊余成本 / 恒定 1.00000</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Shadow NAV</p>
          <p className="font-mono text-2xl text-amber-400">
            {fund.symbol}
            {navPx5(k.shadow_nav)}
          </p>
          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">MtM / MtModel</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Deviation</p>
          <p className="font-mono text-2xl">
            {num(k.deviation_pct).toFixed(3)}% / {bpsFmt(k.deviation_bps)}
          </p>
          <Badge tone={tone(k.status)} className="mt-2">
            {statusLabel(k.status)}
          </Badge>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Shares / AUM</p>
          <p className="font-mono text-sm">{moneyFull(k.units, fund.ccy)} units</p>
          <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
            Acct {moneyFull(k.accounting_aum, fund.ccy)}
            <br />
            Shadow {moneyFull(k.shadow_aum, fund.ccy)}
            <br />
            Cash {moneyFull(k.cash, fund.ccy)}
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">利差冲击压力测试</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] text-[hsl(var(--muted-foreground))]">收益率曲线平行上移 {curve} bps</p>
            <input
              type="range"
              min={0}
              max={3}
              value={CURVE_STOPS.indexOf(curve)}
              onChange={(e) => setCurve(CURVE_STOPS[Number(e.target.value)] ?? 0)}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
              {CURVE_STOPS.map((s) => (
                <span key={s}>+{s}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] text-[hsl(var(--muted-foreground))]">信用利差走阔 {spread} bps</p>
            <input
              type="range"
              min={0}
              max={3}
              value={SPREAD_STOPS.indexOf(spread)}
              onChange={(e) => setSpread(SPREAD_STOPS[Number(e.target.value)] ?? 0)}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
              {SPREAD_STOPS.map((s) => (
                <span key={s}>+{s}</span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs">
          压力后 Shadow NAV{" "}
          <span className="font-mono text-amber-400">
            {fund.symbol}
            {navPx5(k.shadow_nav)}
          </span>{" "}
          · 偏离 <span className="font-mono">{bpsFmt(k.deviation_bps)}</span>
          {data.vnav_trigger ? " · 已击穿 0.50% SFC 红线" : " · 未击穿 0.50% 红线"}
        </p>
        {data.vnav_trigger ? (
          <Button className="mt-3" variant="danger" onClick={() => setVnavOpen(true)}>
            SFC 应急处置：切换至浮动净值（VNAV）
          </Button>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">最近 30 天 Accounting vs Shadow NAV</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={line}>
              <CartesianGrid stroke="#1e2a3f" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="nav" domain={["auto", "auto"]} stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="bps" orientation="right" stroke="#38bdf8" tick={{ fontSize: 11 }} />
              <Tooltip {...tooltip} />
              <Legend />
              <Line yAxisId="nav" type="monotone" dataKey="official" name="Accounting NAV" stroke="#94a3b8" dot={false} />
              <Line yAxisId="nav" type="monotone" dataKey="shadow" name="Shadow NAV" stroke="#f59e0b" dot={false} />
              <ReferenceLine yAxisId="bps" y={25} stroke="#fbbf24" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="bps" y={-25} stroke="#fbbf24" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="bps" y={50} stroke="#f87171" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="bps" y={-50} stroke="#f87171" strokeDasharray="4 4" />
              <Line yAxisId="bps" type="monotone" dataKey="deviation" name="Deviation bps" stroke="#38bdf8" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
          <h2 className="text-sm font-semibold">资产穿透双轨估值</h2>
          <Input className="max-w-[200px]" placeholder="搜索代码 / 名称" value={q} onChange={(e) => setQ(e.target.value)} />
          <select
            className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="ALL">全部类型</option>
            <option value="T-Bill">T-Bill</option>
            <option value="NCD">NCD</option>
            <option value="TD">Term Deposit</option>
            <option value="CASH">Cash</option>
          </select>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-[hsl(var(--muted))] font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-3 py-2">代码 / 名称</th>
              <th>类型</th>
              <th>币种</th>
              <th>剩余期限</th>
              <th>摊余成本</th>
              <th>影子估值</th>
              <th>Diff / bps</th>
              <th>定价源</th>
              <th>Discount / Spread</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <Fragment key={`${p.security_id}#${i}`}>
                <tr className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2">
                    <div className="font-mono text-amber-400">{p.isin}</div>
                    <div>{p.name}</div>
                  </td>
                  <td>{p.asset_type}</td>
                  <td className="font-mono">{p.currency}</td>
                  <td className="font-mono">{p.days_to_maturity}D</td>
                  <td className="font-mono">{moneyPosition(p.amortised_book, p.currency, fund.ccy)}</td>
                  <td className="font-mono">{moneyPosition(p.shadow_value, p.currency, fund.ccy)}</td>
                  <td className={`font-mono ${num(p.diff_amount) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {moneyPosition(p.diff_amount, p.currency, fund.ccy)} / {bpsFmt(p.diff_bps)}
                  </td>
                  <td className="max-w-[160px] text-[11px]">{p.pricing_source}</td>
                  <td className="font-mono text-[11px]">
                    {pctFmt(num(p.discount_rate) * 100, 3)} / {pctFmt(num(p.credit_spread) * 100, 2)}
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => setOpenId(openId === p.security_id ? null : p.security_id)}>
                      {openId === p.security_id ? "收起" : "现金流"}
                    </Button>
                  </td>
                </tr>
                {openId === p.security_id ? <PositionDrawer row={p} ccy={fund.ccy} /> : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      {vnavOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <Card className="w-full max-w-lg p-5">
            <h2 className="text-sm font-semibold">SFC 应急处置 · 切换至 VNAV</h2>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">模拟《SFC 偏离度超标报告简表》</p>
            <dl className="mt-3 space-y-1 font-mono text-xs">
              {Object.entries(data.report ?? {}).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4">
                  <dt className="text-[hsl(var(--muted-foreground))]">{key}</dt>
                  <dd className="text-right">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVnavOpen(false)}>
                关闭
              </Button>
              <Button variant="danger" onClick={() => setVnavOpen(false)}>
                确认进入浮动净值预案
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
