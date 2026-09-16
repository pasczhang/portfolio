"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
import { chartRows, kindDot, kindTone, monthGrid, type DailyPack } from "@/lib/cashLadder";
import { moneyFull, num, pctFmt, signedMoney } from "@/lib/format";

const tooltip = {
  contentStyle: { background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
};

export function CashLadderDesk() {
  const { fund } = useDesk();
  const { cashLadder: data, source } = useBook();
  const [view, setView] = useState<"month" | "list">("month");
  const [selected, setSelected] = useState<string | null>(null);

  const bars = useMemo(() => chartRows(data.chart_buckets), [data.chart_buckets]);
  const cells = useMemo(() => monthGrid(data.calendar_month, data.days), [data.calendar_month, data.days]);
  const dayMap = useMemo(() => new Map(data.days.map((d) => [d.date, d])), [data.days]);
  const picked: DailyPack | undefined = selected ? dayMap.get(selected) : undefined;
  const dlaBreak = data.dla_wla.some((d) => !d.dla_ok || !d.wla_ok);
  const net7 = num(data.net_7d);

  const listDays = data.days.filter((d) => d.event_count > 0 || d.holiday_hk || d.holiday_us || d.weekend);
  const m = (v: number | string) => moneyFull(v, fund.ccy);
  const sm = (v: number | string) => signedMoney(v, fund.ccy);

  return (
    <AppShell
      title="现金流日历"
      subtitle={`${fund.name} · ${fund.code} · ${fund.ccy} 到期本息与申赎结算`}
      source={source}
      actions={
        <div className="flex gap-1">
          <Button variant={view === "month" ? "accent" : "outline"} onClick={() => setView("month")}>
            月历
          </Button>
          <Button variant={view === "list" ? "accent" : "outline"} onClick={() => setView("list")}>
            列表
          </Button>
        </div>
      }
    >
      {data.deficit ? (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          流动性缺口/透支预警：累计现金在预测路径上转为负数，需提前安排融资或递延买入交割。
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Available Cash</p>
          <p className="font-mono text-xl">{m(data.available_cash)}</p>
          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{fund.ccy} T+0 可用</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">7-Day Net Cash Flow</p>
          <p className={`font-mono text-xl ${net7 >= 0 ? "text-emerald-400" : "text-red-400"}`}>{sm(net7)}</p>
          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">含到期、申赎与未交割 DVP</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">DLA / WLA 7D 预测</p>
          <div className="mt-1 flex gap-2">
            <Badge tone={dlaBreak ? "breach" : "ok"}>{dlaBreak ? "破位风险" : "达标"}</Badge>
            <Badge tone={data.deficit ? "breach" : "ok"}>{data.kpis.gap_status}</Badge>
          </div>
          <p className="mt-2 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
            DLA≥10% · WLA≥30%
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Reinvestment Alert (3D)</p>
          <p className="font-mono text-xl text-amber-400">{m(data.reinvestment_3d)}</p>
          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">即将到期本息，需即时配置</p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">现金流阶梯 · Time Buckets</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={bars}>
              <CartesianGrid stroke="#1e2a3f" />
              <XAxis dataKey="bucket" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip {...tooltip} />
              <Legend />
              <ReferenceLine y={0} stroke="#64748b" />
              <Bar dataKey="maturity" name="到期本金" stackId="in" fill="#34d399" />
              <Bar dataKey="coupon" name="票息" stackId="in" fill="#38bdf8" />
              <Bar dataKey="subscription" name="申购" stackId="in" fill="#818cf8" />
              <Bar dataKey="dvp" name="DVP 买入" stackId="out" fill="#f59e0b" />
              <Bar dataKey="redemption" name="赎回" stackId="out" fill="#f87171" />
              <Bar dataKey="fee" name="费用" stackId="out" fill="#fb7185" />
              <Line type="monotone" dataKey="cumulative" name="累计现金 (m)" stroke="#fbbf24" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="py-1">SFC 桶</th>
                <th>流入</th>
                <th>流出</th>
                <th>净额</th>
                <th>累计</th>
              </tr>
            </thead>
            <tbody>
              {data.sfc_buckets.map((b) => (
                <tr key={b.bucket} className="border-t border-[hsl(var(--border))]">
                  <td className="py-1">{b.bucket}</td>
                  <td className="text-emerald-400">{m(b.inflow)}</td>
                  <td className="text-red-400">{m(b.outflow)}</td>
                  <td>{sm(b.net)}</td>
                  <td>{m(b.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">到期与结算日历 · {data.calendar_month}</h2>
          </div>
          <p className="mb-2 text-[11px] text-[hsl(var(--muted-foreground))]">
            🟢 到期兑付 · 🔵 票息 · 🟠 交易交割 · 🔴 节假日休市
          </p>
          {view === "month" ? (
            <div className="grid grid-cols-7 gap-1 text-[11px]">
              {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
                <div key={w} className="px-1 py-1 text-center text-[10px] text-[hsl(var(--muted-foreground))]">
                  {w}
                </div>
              ))}
              {cells.map((cell, i) =>
                cell ? (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelected(cell.iso)}
                    className={`min-h-[72px] rounded border p-1 text-left ${
                      selected === cell.iso
                        ? "border-amber-500 bg-amber-500/10"
                        : cell.pack?.deficit
                          ? "border-red-500/50 bg-red-500/10"
                          : cell.pack?.holiday_hk || cell.pack?.holiday_us
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-[hsl(var(--border))] hover:border-amber-500/40"
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-mono">{cell.day}</span>
                      {cell.pack?.holiday_hk || cell.pack?.holiday_us ? <span>🔴</span> : null}
                    </div>
                    {cell.pack && cell.pack.event_count > 0 ? (
                      <>
                        <div className={`font-mono text-[10px] ${num(cell.pack.net) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {sm(cell.pack.net)}
                        </div>
                        <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{cell.pack.event_count} 笔</div>
                      </>
                    ) : null}
                  </button>
                ) : (
                  <div key={`e-${i}`} />
                ),
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="py-1">日期</th>
                  <th>净额</th>
                  <th>累计</th>
                  <th>事件</th>
                </tr>
              </thead>
              <tbody>
                {listDays.map((d) => (
                  <tr
                    key={d.date}
                    className="cursor-pointer border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/30"
                    onClick={() => setSelected(d.date)}
                  >
                    <td className="py-1 font-mono">
                      {d.date}
                      {d.holiday_hk || d.holiday_us ? " 🔴" : ""}
                      {d.weekend ? " 休" : ""}
                    </td>
                    <td className={num(d.net) >= 0 ? "text-emerald-400" : "text-red-400"}>{sm(d.net)}</td>
                    <td className={d.deficit ? "text-red-400" : ""}>{m(d.cumulative)}</td>
                    <td>{d.event_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">当日现金流明细</h2>
          {picked ? (
            <div className="mt-2 space-y-2">
              <p className="font-mono text-xs">
                {picked.date} · 净 {sm(picked.net)} · 累计 {m(picked.cumulative)}
              </p>
              {picked.holiday_hk || picked.holiday_us ? (
                <Badge tone="breach">节假日休市 {picked.holiday_hk ? "HK" : ""} {picked.holiday_us ? "US Fed" : ""}</Badge>
              ) : null}
              {picked.events.length === 0 ? (
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">无结算事件</p>
              ) : (
                picked.events.map((e) => (
                  <div key={e.event_id} className="rounded border border-[hsl(var(--border))] p-2 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className={kindTone(e.kind)}>
                        {kindDot(e.kind)} {e.kind}
                      </span>
                      <span className="font-mono">{sm(e.signed_amount)}</span>
                    </div>
                    <p className="mt-1 font-mono text-amber-400">{e.security_id}</p>
                    <p>{e.name}</p>
                    <p className="text-[hsl(var(--muted-foreground))]">
                      {e.counterparty} · {e.status}
                      {e.rolled ? ` · 顺延 ${e.value_date} → ${e.adjusted_date}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">点击日历日期查看债券代码、对手方与起息状态。</p>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">再投资与滚动续作</h2>
        <div className="space-y-2">
          {data.reinvest.map((idea) => (
            <div key={idea.security_id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-3 py-2">
              <p className="text-xs">{idea.suggestion}</p>
              <Link href={idea.workbench_href}>
                <span className="inline-flex items-center rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400">
                  合规试算下单
                </span>
              </Link>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">未来 7 日 DLA / WLA</h2>
        <table className="w-full text-left font-mono text-[11px]">
          <thead className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="py-1">日期</th>
              <th>现金</th>
              <th>DLA</th>
              <th>WLA</th>
            </tr>
          </thead>
          <tbody>
            {data.dla_wla.map((d) => (
              <tr key={d.date} className="border-t border-[hsl(var(--border))]">
                <td className="py-1">{d.date}</td>
                <td className={num(d.cash) < 0 ? "text-red-400" : ""}>{m(d.cash)}</td>
                <td className={d.dla_ok ? "text-emerald-400" : "text-red-400"}>{pctFmt(d.dla_pct)}</td>
                <td className={d.wla_ok ? "text-emerald-400" : "text-red-400"}>{pctFmt(d.wla_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
