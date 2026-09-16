"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiGetOr } from "@/lib/api";
import { useDesk } from "@/components/layout/DeskProvider";
import { money, num, pctFmt } from "@/lib/format";
import {
  ASSET_OPTIONS,
  counterpartiesFor,
  DEFAULT_WHAT_IF,
  TENOR_PRESETS,
  tenorDaysOf,
} from "@/lib/whatIf";
import {
  applySecurityToForm,
  applyTenorPreset,
  filterSecurityMaster,
  MOCK_SECURITY_MASTER,
  VALUATION_AS_OF,
  type SecurityMasterRow,
} from "@/lib/securityMaster";
import type { MetricDelta, PreTradeWhatIfResult, WhatIfForm } from "@/types/workbench";
import { X } from "lucide-react";

function fmtMetric(metric: MetricDelta, value: number | string, ccy: "USD" | "HKD") {
  if (metric.unit === "usd") return money(value, ccy);
  if (metric.unit === "days") return `${num(value).toFixed(1)}D`;
  if (metric.unit === "pct") return pctFmt(value);
  return num(value).toFixed(2);
}

function DeltaTag({ metric, ccy }: { metric: MetricDelta; ccy: "USD" | "HKD" }) {
  const d = num(metric.delta);
  const sign = d > 0 ? "+" : "";
  const text =
    metric.unit === "usd" ? `${sign}${money(d, ccy)}` : metric.unit === "days" ? `${sign}${d.toFixed(1)}D` : `${sign}${d.toFixed(2)}`;
  const cls =
    metric.breached ? "bg-red-500/20 text-red-300" : d === 0 ? "bg-slate-500/20 text-slate-300" : d > 0 ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300";
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>Δ {text}</span>;
}

function CompareCard({ metric, ccy }: { metric: MetricDelta; ccy: "USD" | "HKD" }) {
  const cap =
    metric.limit != null
      ? `上限 ${fmtMetric(metric, metric.limit, ccy)}`
      : metric.floor != null
        ? `下限 ${fmtMetric(metric, metric.floor, ccy)}`
        : metric.note ?? "";
  return (
    <div
      className={`rounded-md border p-3 ${
        metric.breached
          ? "border-red-500/70 bg-red-500/10"
          : metric.watch
            ? "border-amber-500/50 bg-amber-500/10"
            : "border-[hsl(var(--border))] bg-[hsl(var(--background))]/40"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
          {metric.label}
        </span>
        <DeltaTag metric={metric} ccy={ccy} />
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm tabular-nums">
        <div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">当前</div>
          <div>{fmtMetric(metric, metric.before, ccy)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))]">试算后</div>
          <div className={metric.breached ? "font-semibold text-red-400" : ""}>{fmtMetric(metric, metric.after, ccy)}</div>
        </div>
      </div>
      {cap ? <p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{cap}</p> : null}
    </div>
  );
}

export function WhatIfModal({
  open,
  onClose,
  busy,
  committing,
  error,
  result,
  asOf,
  onFormChange,
  onCommit,
  initialForm,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  committing: boolean;
  error: string | null;
  result: PreTradeWhatIfResult | null;
  asOf?: string;
  onFormChange: (form: WhatIfForm) => void;
  onCommit: (form: WhatIfForm) => Promise<boolean>;
  initialForm?: Partial<WhatIfForm>;
}) {
  const { fund, role } = useDesk();
  const [form, setForm] = useState<WhatIfForm>({ ...DEFAULT_WHAT_IF, currency: fund.ccy });
  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const [universe, setUniverse] = useState<SecurityMasterRow[]>(MOCK_SECURITY_MASTER);
  const asOfDate = asOf || VALUATION_AS_OF;

  useEffect(() => {
    void apiGetOr<SecurityMasterRow[]>(`/instruments?as_of=${asOfDate}`, MOCK_SECURITY_MASTER).then((res) => {
      if (res.data?.length) setUniverse(res.data);
    });
  }, [asOfDate]);

  useEffect(() => {
    if (!open) return;
    if (initialForm) {
      const merged = { ...DEFAULT_WHAT_IF, currency: fund.ccy, ...initialForm, listed: false };
      setForm(applyTenorPreset(merged, merged.tenorPreset, asOfDate));
    } else {
      setForm((prev) => ({ ...prev, currency: fund.ccy }));
    }
  }, [open, initialForm, asOfDate, fund.ccy]);

  useEffect(() => {
    if (!open) return;
    onFormChange(form);
  }, [form, open, onFormChange]);

  const matches = useMemo(() => filterSecurityMaster(universe, query), [universe, query]);
  const cps = useMemo(() => counterpartiesFor(form.assetClass), [form.assetClass]);
  const days = tenorDaysOf(form, asOfDate);
  const custom = !form.listed;
  const issuer = result?.concentration.find((row) => row.is_trade_issuer);
  const blocked = Boolean(result?.intercept);
  const decision = result?.decision;
  const gateTone = !result ? "neutral" : blocked ? "breach" : decision === "WATCH" ? "watch" : "ok";

  function patch(partial: Partial<WhatIfForm>) {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (partial.assetClass && partial.assetClass !== prev.assetClass) {
        const list = counterpartiesFor(partial.assetClass);
        if (!list.includes(next.counterparty)) next.counterparty = list[0] ?? next.counterparty;
      }
      if (partial.tenorPreset && partial.tenorPreset !== "CUSTOM") {
        return applyTenorPreset({ ...prev, ...partial }, partial.tenorPreset, asOfDate);
      }
      if (partial.maturityDate) {
        next.tenorDays = String(tenorDaysOf({ ...next, maturityDate: partial.maturityDate }, asOfDate));
      }
      return next;
    });
  }

  function pickSecurity(row: SecurityMasterRow) {
    setForm((prev) => applySecurityToForm(row, prev, asOfDate));
    setQuery(`${row.security_code}  ${row.name}`);
    setOpenList(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-6 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="w-full max-w-5xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide">
              投资试算 · {fund.shortName} · {fund.ccy}
            </h2>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              SFC 8.2 实时引擎 · 改表单即重算 Current vs Projected
              {busy ? " · 计算中" : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[hsl(var(--muted))]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <div className="relative space-y-1">
              <Label>标的代码 / 名称（Security Master）</Label>
              <Input
                value={query}
                placeholder="输入 BOCHK、US、ISIN 或下拉选择"
                onFocus={() => setOpenList(true)}
                onBlur={() => window.setTimeout(() => setOpenList(false), 180)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenList(true);
                }}
              />
              {openList ? (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
                  {matches.map((row) => (
                    <li key={row.security_code}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left hover:bg-amber-500/10"
                        onClick={() => pickSecurity(row)}
                      >
                        <div className="font-mono text-[11px] text-amber-400">{row.security_code}</div>
                        <div className="text-[11px]">{row.name}</div>
                        <div className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                          {row.issuer_name} · {row.asset_class} · {row.currency}
                          {row.maturity_date ? ` · ${row.maturity_date}` : ""} · {row.rating}
                        </div>
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 ? (
                    <li className="px-2 py-2 text-[11px] text-[hsl(var(--muted-foreground))]">无匹配标的</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-2 py-1.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
              {form.securityCode} · {form.securityName}
              {form.listed ? " · 主数据联动" : " · 手工录入"}
              {form.rating !== "—" ? ` · ${form.rating}` : ""}
            </div>

            <div className="space-y-1">
              <Label>资产类别</Label>
              <select
                disabled={form.listed}
                className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 font-mono text-xs disabled:opacity-60"
                value={form.assetClass}
                onChange={(e) => patch({ assetClass: e.target.value as WhatIfForm["assetClass"] })}
              >
                {ASSET_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>对手方 / 发行主体</Label>
              <select
                disabled={form.listed}
                className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 font-mono text-xs disabled:opacity-60"
                value={form.counterparty}
                onChange={(e) => patch({ counterparty: e.target.value })}
              >
                {cps.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>币种</Label>
                <select
                  className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 font-mono text-xs disabled:opacity-60"
                  value={form.currency}
                  disabled={form.listed}
                  onChange={(e) => patch({ currency: e.target.value as "USD" | "HKD" })}
                >
                  <option value="USD">USD</option>
                  <option value="HKD">HKD</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>本金</Label>
                <Input
                  value={form.notional}
                  onChange={(e) => patch({ notional: e.target.value.replace(/[^0-9.]/g, "") })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {["5000000", "10000000", "20000000"].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className="rounded border border-[hsl(var(--border))] px-2 py-0.5 font-mono text-[10px] hover:border-amber-500"
                  onClick={() => patch({ notional: amt })}
                >
                  {(Number(amt) / 1e6).toFixed(0)}m
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>期限 / 到期日</Label>
              {custom ? (
                <>
                  <div className="flex flex-wrap gap-1">
                    {TENOR_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`rounded border px-2 py-0.5 text-[10px] ${
                          form.tenorPreset === p.id
                            ? "border-amber-500 bg-amber-500/15 text-amber-300"
                            : "border-[hsl(var(--border))]"
                        }`}
                        onClick={() => patch({ tenorPreset: p.id })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <Input type="date" value={form.maturityDate} onChange={(e) => patch({ maturityDate: e.target.value, tenorPreset: "CUSTOM" })} />
                </>
              ) : (
                <Input type="date" value={form.maturityDate} disabled className="disabled:opacity-60" />
              )}
              <p className="font-mono text-[11px] text-amber-400">
                Days to Maturity {days}D · as of {asOfDate}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>票面 / 到期收益率 (%)</Label>
                <Input
                  value={form.yieldPct}
                  disabled={form.listed}
                  className="disabled:opacity-60"
                  onChange={(e) => patch({ yieldPct: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>计息基础</Label>
                <Input value={form.dayCount} disabled={form.listed} className="disabled:opacity-60" onChange={(e) => patch({ dayCount: e.target.value })} />
              </div>
            </div>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
          </div>

          <div className="space-y-3">
            <div
              className={`rounded-md border p-3 ${
                blocked
                  ? "border-red-500/70 bg-red-500/10"
                  : decision === "WATCH"
                    ? "border-amber-500/60 bg-amber-500/10"
                    : "border-emerald-500/50 bg-emerald-500/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {!result
                    ? "计算中…"
                    : `${blocked ? "🔴 " : decision === "WATCH" ? "🟡 " : "🟢 "}${result.gate_title}`}
                </p>
                {decision ? <Badge tone={gateTone}>{decision}</Badge> : <Badge>…</Badge>}
              </div>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{result?.gate_detail}</p>
              {result?.flags.length ? (
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-red-200">
                  {result.flags.map((flag) => (
                    <li key={flag.code}>
                      [{flag.severity}] {flag.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-emerald-300">未触发 SFC 8.2 红线。</p>
              )}
            </div>

            {result ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {result.metrics.map((metric) => (
                  <CompareCard
                    key={metric.id}
                    ccy={fund.ccy}
                    metric={
                      metric.id === "aum"
                        ? {
                            ...metric,
                            before: result.nav_before,
                            after: result.nav_after,
                            delta: num(result.nav_after) - num(result.nav_before),
                          }
                        : metric
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))]">
                正在连接试算引擎…
              </div>
            )}

            {issuer ? (
              <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                {form.counterparty} 集中度 {pctFmt(num(issuer.before_pct) * (num(issuer.before_pct) <= 1 ? 100 : 1))} →{" "}
                {pctFmt(num(issuer.after_pct) * (num(issuer.after_pct) <= 1 ? 100 : 1))} · 10% 普适 / 20% 特许
              </p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-3">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={blocked || committing || !result || role !== "maker"}
                title={
                  role !== "maker"
                    ? "Checker 只读：需 PM Maker 提交"
                    : blocked
                      ? "SFC 违规，禁止提交"
                      : "写入 Blotter 与 Holdings"
                }
                onClick={() => void onCommit(form)}
              >
                {role !== "maker" ? "Checker 只读" : committing ? "入账中…" : "确认执行交易（Execute & Commit）"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
