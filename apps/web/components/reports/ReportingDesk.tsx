"use client";

import { useMemo, useState } from "react";
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
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiOr } from "@/hooks/useApiOr";
import { apiPost } from "@/lib/api";
import { downloadText, MOCK_REPORT, PIE_COLORS, pieData, reportToCsv, type ReportSnapshot } from "@/lib/report";
import { money, moneyFull, navPx, navPx5, num, pctFmt } from "@/lib/format";

const tooltip = {
  contentStyle: { background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
};

const PRESETS = [
  { id: "2026-08-31", label: "Aug month-end" },
  { id: "2026-09-15", label: "Valuation 15 Sep" },
  { id: "2026-09-30", label: "Sep month-end" },
];

function statusTone(status: string): "ok" | "watch" | "breach" {
  if (status === "PASS" || status === "OK") return "ok";
  if (status === "WATCH") return "watch";
  return "breach";
}

export function ReportingDesk() {
  const { fund } = useDesk();
  const [asOf, setAsOf] = useState("2026-09-15");
  const [tab, setTab] = useState<"compliance" | "factsheet">("compliance");
  const [officer, setOfficer] = useState("Chan Wai-ling");
  const [notes, setNotes] = useState("");
  const [commentary, setCommentary] = useState("");
  const { data, source, reload } = useApiOr<ReportSnapshot>(`/reporting/snapshot?as_of=${asOf}`, MOCK_REPORT, asOf);
  const k = data.kpis;
  const text = commentary || data.commentary;
  const brandedSnap: ReportSnapshot = {
    ...data,
    fund_code: fund.code,
    fund_name: fund.name,
    base_ccy: fund.ccy,
    isin: fund.isin,
    inception: fund.inception,
    manager: fund.manager,
    manager_short: fund.managerShort,
  };

  const allocPie = useMemo(() => pieData(data.allocation), [data.allocation]);
  const creditPie = useMemo(() => pieData(data.credit_quality), [data.credit_quality]);
  const matBars = useMemo(
    () => data.maturity_profile.map((r) => ({ name: r.label, weight: num(r.weight_pct) })),
    [data.maturity_profile],
  );

  async function signOff() {
    try {
      await apiPost("/reporting/sign-off", {
        as_of: asOf,
        officer,
        notes,
        signed_at: new Date().toISOString(),
      });
      reload();
    } catch {
      /* mock path */
    }
  }

  function exportCsv() {
    downloadText(`SFC_8.2_WINGS_${fund.code}_${data.as_of}.csv`, reportToCsv(brandedSnap), "text/csv;charset=utf-8");
  }

  return (
    <AppShell
      title="合规与报表"
      subtitle={`${fund.name} · ${fund.shortName} · 8.2 监管底稿 / Factsheet`}
      source={source}
      actions={
        <div className="flex flex-wrap items-center gap-1 print:hidden">
          <Button variant={tab === "compliance" ? "accent" : "outline"} onClick={() => setTab("compliance")}>
            监管审查
          </Button>
          <Button variant={tab === "factsheet" ? "accent" : "outline"} onClick={() => setTab("factsheet")}>
            投资人月报
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setTab("factsheet");
              window.setTimeout(() => window.print(), 200);
            }}
          >
            导出 PDF
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            导出 CSV
          </Button>
        </div>
      }
    >
      <Card className="flex flex-wrap items-end gap-3 p-3 print:hidden">
        <div>
          <Label>As-of / 月末截取</Label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        {PRESETS.map((p) => (
          <Button key={p.id} variant={asOf === p.id ? "accent" : "outline"} onClick={() => setAsOf(p.id)}>
            {p.label}
          </Button>
        ))}
        <a className="text-[11px] text-amber-400 underline" href={`/api/pms/reporting/wings.csv?as_of=${asOf}`}>
          WINGS CSV（API）
        </a>
      </Card>

      {tab === "compliance" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">AUM</p>
              <p className="font-mono text-xl">{money(k.aum, fund.ccy)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Accounting / Shadow NAV</p>
              <p className="font-mono text-xl">
                {fund.symbol}
                {navPx5(k.accounting_nav)} / {fund.symbol}
                {navPx5(k.shadow_nav)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                {num(k.deviation_bps).toFixed(1)} bps · 当月最大 {num(k.max_spread_bps).toFixed(1)} · 超标 {k.breach_count} 次
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">7D / 30D / YTD Yield</p>
              <p className="font-mono text-xl text-amber-400">{num(k.yield_7d).toFixed(2)}%</p>
              <p className="mt-1 font-mono text-[11px]">{num(k.yield_30d).toFixed(2)}% · {num(k.yield_ytd).toFixed(2)}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">WAM / WAL · DLA / WLA</p>
              <p className="font-mono text-xl">
                {num(k.wam_days).toFixed(1)}d / {num(k.wal_days).toFixed(1)}d
              </p>
              <p className="mt-1 font-mono text-[11px]">
                {pctFmt(k.dla_pct)} / {pctFmt(k.wla_pct)}
              </p>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-[hsl(var(--border))] px-4 py-3">
              <p className="text-sm font-semibold">SFC 8.2 核对清单</p>
              <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                {fund.managerShort} · {fund.code} · {fund.name}
              </p>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-[hsl(var(--muted))] font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="px-3 py-2">指标</th>
                  <th>限额</th>
                  <th>期末实际</th>
                  <th>状态</th>
                  <th>期内 Min / Max</th>
                </tr>
              </thead>
              <tbody>
                {data.checklist.map((row) => (
                  <tr key={row.metric} className="border-t border-[hsl(var(--border))]">
                    <td className="px-3 py-2">
                      {row.metric}
                      {row.note ? <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{row.note}</p> : null}
                    </td>
                    <td className="font-mono">{row.limit}</td>
                    <td className="font-mono">{row.actual}</td>
                    <td>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="font-mono text-[hsl(var(--muted-foreground))]">
                      {row.period_min} · {row.period_max}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">前五大发行主体（穿透至母集团）</h2>
            <table className="w-full text-left text-xs">
              <thead className="font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="py-1">Parent Group</th>
                  <th>金额</th>
                  <th>% NAV</th>
                </tr>
              </thead>
              <tbody>
                {data.top_issuers.map((r) => (
                  <tr key={r.label} className="border-t border-[hsl(var(--border))]">
                    <td className="py-1">{r.label}</td>
                    <td className="font-mono">{moneyFull(r.amount, fund.ccy)}</td>
                    <td className={`font-mono ${num(r.weight_pct) > 10 ? "text-red-400" : "text-emerald-400"}`}>
                      {pctFmt(r.weight_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">豁免与异常事件日志</h2>
            <div className="space-y-2">
              {data.exceptions.map((ex) => (
                <div key={ex.id} className="rounded border border-[hsl(var(--border))] p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(ex.severity)}>{ex.severity}</Badge>
                    {ex.exemption ? <Badge tone="watch">EXEMPTION</Badge> : null}
                    <span>{ex.title}</span>
                  </div>
                  <p className="mt-1 text-[hsl(var(--muted-foreground))]">{ex.detail}</p>
                  <p className="mt-1 font-mono text-[10px]">Approval: {ex.approval}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">合规官声明签字</h2>
            {data.sign_off ? (
              <p className="font-mono text-xs text-emerald-400">
                Signed {data.sign_off.officer} · {data.sign_off.signed_at} · {data.sign_off.notes}
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <Label>Officer</Label>
                  <Input value={officer} onChange={(e) => setOfficer(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label>审计附注</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="本期声明 / 整改时限" />
                </div>
                <Button variant="accent" onClick={() => void signOff()}>
                  签署本期底稿
                </Button>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="factsheet-sheet mx-auto max-w-[210mm] space-y-4 bg-white p-8 text-slate-900 shadow-xl print:max-w-none print:shadow-none">
          <header className="flex items-start justify-between border-b border-slate-300 pb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-700">{fund.managerShort}</p>
              <h2 className="max-w-[420px] text-lg font-semibold leading-tight tracking-tight text-slate-900">
                {fund.name}
              </h2>
              <p className="font-mono text-[11px] text-slate-500">
                {fund.code} · {fund.shortName} · ISIN {fund.isin} · {fund.ccy} · Inception {fund.inception}
              </p>
            </div>
            <div className="text-right text-xs">
              <p>Morningstar {data.morningstar}</p>
              <p>S&P {data.sp_rating}</p>
              <p className="font-mono">As of {data.as_of}</p>
            </div>
          </header>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded bg-slate-100 p-2">
              <p className="text-[10px] uppercase text-slate-500">AUM</p>
              <p className="font-mono text-sm font-semibold">{money(k.aum, fund.ccy)}</p>
            </div>
            <div className="rounded bg-slate-100 p-2">
              <p className="text-[10px] uppercase text-slate-500">7-Day Yield</p>
              <p className="font-mono text-sm font-semibold">{num(k.yield_7d).toFixed(2)}%</p>
            </div>
            <div className="rounded bg-slate-100 p-2">
              <p className="text-[10px] uppercase text-slate-500">WAM / WAL</p>
              <p className="font-mono text-sm font-semibold">
                {num(k.wam_days).toFixed(1)} / {num(k.wal_days).toFixed(1)}d
              </p>
            </div>
            <div className="rounded bg-slate-100 p-2">
              <p className="text-[10px] uppercase text-slate-500">NAV / Unit</p>
              <p className="font-mono text-sm font-semibold">
                {fund.symbol}
                {navPx(k.accounting_nav)}
              </p>
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold">Investment Objective</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{data.objective}</p>
          </section>
          <section className="print:break-inside-avoid">
            <h3 className="text-sm font-semibold">Manager&apos;s Commentary</h3>
            <textarea
              className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-[12px] leading-relaxed print:border-0"
              rows={4}
              value={text}
              onChange={(e) => setCommentary(e.target.value)}
            />
          </section>

          <div className="grid gap-3 md:grid-cols-3 print:break-inside-avoid">
            <div className="h-52">
              <p className="mb-1 text-center text-[11px] font-semibold">Asset Allocation</p>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={allocPie} dataKey="value" nameKey="name" innerRadius={35} outerRadius={60}>
                    {allocPie.map((slice, i) => (
                      <Cell key={slice.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="h-52">
              <p className="mb-1 text-center text-[11px] font-semibold">Maturity Profile</p>
              <ResponsiveContainer>
                <BarChart data={matBars}>
                  <CartesianGrid stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip {...tooltip} />
                  <Bar dataKey="weight" fill="#0f766e" name="% NAV" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-52">
              <p className="mb-1 text-center text-[11px] font-semibold">Credit Quality</p>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={creditPie} dataKey="value" nameKey="name" innerRadius={35} outerRadius={60}>
                    {creditPie.map((slice, i) => (
                      <Cell key={slice.name} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold">Top Holdings</h3>
            <table className="mt-1 w-full text-left text-[11px]">
              <thead className="border-b border-slate-300 font-mono text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-1">#</th>
                  <th>Issuer / Name</th>
                  <th>Class</th>
                  <th>Maturity</th>
                  <th>Rating</th>
                  <th>% NAV</th>
                </tr>
              </thead>
              <tbody>
                {data.top_holdings.map((h) => (
                  <tr key={h.security_id} className="border-b border-slate-200">
                    <td className="py-1 font-mono">{h.rank}</td>
                    <td>
                      {h.issuer}
                      <div className="text-[10px] text-slate-500">{h.name}</div>
                    </td>
                    <td>{h.asset_class}</td>
                    <td className="font-mono">{h.maturity_date}</td>
                    <td className="font-mono">{h.rating}</td>
                    <td className="font-mono">{pctFmt(h.weight_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="border-t border-slate-300 pt-3 text-[10px] leading-relaxed text-slate-600">
            <p className="mb-1 font-medium text-slate-700">
              Issued by {fund.manager} · © 2026 Balance Asset Management
            </p>
            {data.disclaimer}
          </footer>
        </div>
      )}
    </AppShell>
  );
}
