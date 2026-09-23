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
import { HoldingsGrid } from "@/components/grid/HoldingsGrid";
import { HoldingsActions } from "@/components/holdings/HoldingsActions";
import { ManualPositionModal } from "@/components/holdings/ManualPositionModal";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/desk/meters";
import { allocationByClass, maturityBuckets, topIssuers } from "@/lib/holdings/analysis";
import { ensureCashHoldingRow, toHoldingRows } from "@/lib/holdings";
import { moneyFull, pctFmt } from "@/lib/format";
import { usePermissions } from "@/lib/auth/usePermissions";
import type { BookPosition } from "@/lib/holdings/types";
import { PIE_COLORS } from "@/lib/report";

const tooltip = {
  contentStyle: { background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 },
  labelStyle: { color: "#94a3b8" },
};

export default function HoldingsAnalysisPage() {
  const { fund } = useDesk();
  const { canWrite } = usePermissions();
  const {
    positions,
    cashPositions,
    valuationReport,
    source,
    asOf,
    metrics,
    compliance,
    removeManualPosition,
  } = useBook();
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<BookPosition | null>(null);
  const cashAmount = cashPositions.reduce((s, p) => s + p.amortizedCost, 0);
  const displayPositions = useMemo(() => {
    return ensureCashHoldingRow(positions || [], {
      cashAmount,
      asOf,
      ccy: fund.ccy,
      counterparty: valuationReport?.custodian ?? "Custodian",
      label: valuationReport?.cashLabel || undefined,
    });
  }, [positions, cashAmount, asOf, fund.ccy, valuationReport?.custodian, valuationReport?.cashLabel]);
  const assetTotal = useMemo(
    () => displayPositions.reduce((s, p) => s + p.amortizedCost, 0),
    [displayPositions],
  );
  const baseNav = metrics.nav > 0 ? metrics.nav : metrics.aum;
  const holdings = useMemo(() => toHoldingRows(displayPositions, asOf, baseNav), [displayPositions, asOf, baseNav]);
  const pie = allocationByClass(displayPositions, asOf);
  const buckets = maturityBuckets(displayPositions, asOf);
  const issuers = topIssuers(displayPositions, 5);
  const absDev = Math.abs(metrics.deviationPct);
  const collarTone = absDev >= 0.5 ? "breach" : absDev >= 0.25 ? "watch" : "ok";

  return (
    <AppShell
      title="持仓明细 · Holdings"
      subtitle={`${fund.name} · 占 NAV 比重 · SFC 8.2 单一主体限额 10% / 20%`}
      source={source}
      actions={
        <HoldingsActions
          onManualAdd={
            canWrite
              ? () => {
                  setEditing(null);
                  setManualOpen(true);
                }
              : undefined
          }
        />
      }
    >
      <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
        {fund.code} · as of {asOf} · NAV {moneyFull(baseNav, fund.ccy)}
        {Math.abs(assetTotal - baseNav) > 1 ? ` · 资产合计 ${moneyFull(assetTotal, fund.ccy)}` : ""} · {holdings.length} 笔持仓
        （现金 {holdings.filter((h) => h.asset_category === "CASH").length} /
        定存 {holdings.filter((h) => h.asset_category === "TIME_DEPOSIT").length} /
        回购 {holdings.filter((h) => h.asset_category === "REPO").length} /
        债券 {holdings.filter((h) => h.asset_category === "BOND").length}）
      </p>
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        {[
          { label: "WAM", value: `${metrics.wamDays.toFixed(1)}d`, hint: "含现金 0d / 定存·回购·债券" },
          { label: "WAL", value: `${metrics.walDays.toFixed(1)}d`, hint: "含现金 0d / 定存·回购·债券" },
          { label: "现金占比", value: pctFmt(metrics.cashRatio), hint: "CASH" },
          { label: "债券占比", value: pctFmt(metrics.bondRatio), hint: "BOND" },
          { label: "定存占比", value: pctFmt(metrics.depositRatio), hint: "TIME_DEPOSIT" },
          { label: "回购占比", value: pctFmt(metrics.repoRatio), hint: "REPO" },
          { label: "DLA", value: pctFmt(metrics.dlaPct), hint: "≥ 10%" },
          { label: "WLA", value: pctFmt(metrics.wlaPct), hint: "≥ 15%" },
          { label: "修正久期", value: metrics.modifiedDuration.toFixed(4), hint: "市值加权" },
          { label: "DV01", value: moneyFull(metrics.dv01, fund.ccy), hint: "组合 1bp" },
          { label: "加权 YTM", value: pctFmt(metrics.weightedYtm), hint: "市值加权" },
          { label: "杠杆率", value: pctFmt(metrics.leveragePct), hint: "总资产 / NAV" },
        ].map((k) => (
          <Card key={k.label} className="p-3">
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{k.label}</p>
            <p className="font-mono text-lg text-amber-400">{k.value}</p>
            <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{k.hint}</p>
          </Card>
        ))}
        <Card className="p-3">
          <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">合规</p>
          <Badge tone={collarTone} className="mt-1">
            {metrics.deviationStatus}
          </Badge>
          <div className="mt-2 space-y-1">
            {compliance.cards.slice(0, 3).map((c) => (
              <div key={c.code} className="flex items-center justify-between gap-1 text-[10px]">
                <span>{c.code}</span>
                <StatusPill status={c.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="h-2 overflow-hidden rounded bg-[hsl(var(--muted))]">
        <div
          className={
            collarTone === "breach" ? "h-full bg-red-500" : collarTone === "watch" ? "h-full bg-amber-400" : "h-full bg-emerald-500"
          }
          style={{ width: `${Math.min(100, (absDev / 0.5) * 100)}%` }}
        />
      </div>
      <HoldingsGrid
        rows={holdings}
        analysis
        cashAmount={cashAmount}
        totalNav={baseNav}
        officialNav={baseNav}
        asOfDate={asOf}
        cashLabel={valuationReport?.cashLabel}
        cashIssuer={valuationReport?.custodian}
        onEdit={
          canWrite
            ? (row) => {
          const id = row.book_security_id || row.security_id;
          const found = positions.find((p) => p.securityId === id);
          setEditing(
            found ?? {
              securityId: id,
              assetName: row.instrument,
              assetType: "Cash / Bank Deposit",
              currency: fund.ccy,
              counterparty: row.counterparty,
              isin: row.isin && row.isin !== "—" && row.isin !== "--" ? row.isin : "",
              issueDate: row.value_date,
              maturityDate: row.maturity_date,
              parValue: Number(row.amortized_cost) || 0,
              amortizedCost: Number(row.amortized_cost) || 0,
              shadowMtm: Number(row.shadow_mtm) || Number(row.amortized_cost) || 0,
              couponRatePct: Number(row.coupon_rate_pct) || 0,
              couponType: "fixed",
              resetDate: null,
              rating: row.rating || "NR",
              dayCount: fund.ccy === "HKD" ? "Act/365" : "Act/360",
            },
          );
          setManualOpen(true);
        }
            : undefined
        }
        onRemove={
          canWrite
            ? (row) => {
          const id = row.book_security_id || row.security_id;
          if (!id) return;
          if (!window.confirm(`确认删除持仓 ${row.instrument || id}？删除后将重算 NAV / WAM / DLA。`)) return;
          removeManualPosition(id);
        }
            : undefined
        }
      />
      {manualOpen ? (
        <ManualPositionModal
          initial={editing}
          onClose={() => {
            setManualOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

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
