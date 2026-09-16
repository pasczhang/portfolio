"use client";

import { FormEvent, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moneyFull, pctFmt } from "@/lib/format";
import {
  SETTLEMENT_STATUSES,
  TRADE_SIDES,
  type DeskTrade,
  type SettlementStatus,
  type TradeSide,
} from "@/lib/holdings/trades";

export default function TradingPage() {
  const { fund, role, asOf } = useDesk();
  const { trades, addTrade, source, cashPosition } = useBook();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<TradeSide | "ALL">("ALL");
  const [status, setStatus] = useState<SettlementStatus | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(
    () =>
      trades.filter((t) => {
        if (side !== "ALL" && t.side !== side) return false;
        if (status !== "ALL" && t.status !== status) return false;
        if (from && t.tradeDate < from) return false;
        if (to && t.tradeDate > to) return false;
        return true;
      }),
    [trades, side, status, from, to],
  );

  const columnDefs = useMemo<ColDef<DeskTrade>[]>(
    () => [
      { field: "id", headerName: "交易编号", width: 170, pinned: "left" },
      { field: "tradeDate", headerName: "交易日", width: 110 },
      { field: "settlementDate", headerName: "交收日", width: 110 },
      { field: "side", headerName: "交易方向", width: 110 },
      { field: "assetName", headerName: "资产名称 / 代码", flex: 1.4, minWidth: 200 },
      { field: "counterparty", headerName: "发行人 / 对手方", width: 170 },
      {
        field: "amount",
        headerName: "交易面值",
        width: 140,
        valueFormatter: (p: ValueFormatterParams<DeskTrade>) => moneyFull(p.value ?? 0, fund.ccy),
      },
      { field: "currency", headerName: "币种", width: 80 },
      {
        field: "yieldPct",
        headerName: "执行利率",
        width: 110,
        valueFormatter: (p) => pctFmt(Number(p.value ?? 0)),
      },
      { field: "status", headerName: "交收状态", width: 110 },
    ],
    [fund.ccy],
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const trade: DeskTrade = {
      id: `TRD-${fund.ccy}-${Date.now()}`,
      tradeDate: String(fd.get("tradeDate") || asOf),
      settlementDate: String(fd.get("settlementDate") || asOf),
      side: String(fd.get("side")) as TradeSide,
      assetName: String(fd.get("assetName")),
      securityId: String(fd.get("securityId") || `MANUAL-${Date.now()}`),
      counterparty: String(fd.get("counterparty")),
      amount: Number(fd.get("amount")),
      currency: fund.ccy,
      yieldPct: Number(fd.get("yieldPct")),
      status: String(fd.get("status")) as SettlementStatus,
    };
    addTrade(trade);
    setOpen(false);
  }

  return (
    <AppShell
      title="交易记录 · Trade Blotter"
      subtitle={`${fund.name} · 买卖 / 定存 / 到期兑付台账 · T+0 可用 ${moneyFull(cashPosition.t0Available, fund.ccy)}`}
      source={source}
      actions={
        <Button variant="accent" onClick={() => setOpen(true)} disabled={role !== "maker"}>
          {role === "maker" ? "手动录入交易" : "Checker 只读"}
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <Label>交易方向</Label>
          <select
            className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
            value={side}
            onChange={(e) => setSide(e.target.value as TradeSide | "ALL")}
          >
            <option value="ALL">全部</option>
            {TRADE_SIDES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <Label>交收状态</Label>
          <select
            className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
            value={status}
            onChange={(e) => setStatus(e.target.value as SettlementStatus | "ALL")}
          >
            <option value="ALL">全部</option>
            {SETTLEMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <Label>交易日起</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1">
          <Label>交易日止</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
        <div className="ag-theme-quartz-dark h-[560px] w-full">
          <AgGridReact<DeskTrade>
            rowData={filtered}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, resizable: true, cellClass: "font-mono text-[12px]" }}
            rowHeight={34}
            headerHeight={36}
            getRowId={(p) => p.data.id}
          />
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-4">
            <h2 className="mb-3 text-sm font-semibold">手动录入交易</h2>
            <form className="grid gap-3" onSubmit={onSubmit}>
              <label className="space-y-1">
                <Label>交易方向</Label>
                <select
                  name="side"
                  className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
                  defaultValue="Buy"
                >
                  {TRADE_SIDES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <Label>资产名称</Label>
                <Input name="assetName" defaultValue="Manual NCD" required />
              </label>
              <label className="space-y-1">
                <Label>资产代码</Label>
                <Input name="securityId" defaultValue="" placeholder="可选" />
              </label>
              <label className="space-y-1">
                <Label>发行人 / 对手方</Label>
                <Input name="counterparty" defaultValue="HSBC" required />
              </label>
              <label className="space-y-1">
                <Label>交易面值 ({fund.ccy})</Label>
                <Input name="amount" type="number" defaultValue={5_000_000} min={1} required />
              </label>
              <label className="space-y-1">
                <Label>执行利率 (%)</Label>
                <Input name="yieldPct" type="number" step="0.01" defaultValue={4.25} required />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <Label>交易日</Label>
                  <Input name="tradeDate" type="date" defaultValue={asOf} required />
                </label>
                <label className="space-y-1">
                  <Label>交收日</Label>
                  <Input name="settlementDate" type="date" defaultValue={asOf} required />
                </label>
              </div>
              <label className="space-y-1">
                <Label>交收状态</Label>
                <select
                  name="status"
                  className="h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
                  defaultValue="Pending"
                >
                  {SETTLEMENT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button type="submit" variant="accent">
                  写入并刷新头寸
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
