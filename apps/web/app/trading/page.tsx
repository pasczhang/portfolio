"use client";

import { FormEvent, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiPost } from "@/lib/api";
import { useApiOr } from "@/hooks/useApiOr";
import { MOCK_TRADES } from "@/lib/mocks";
import type { BlotterTrade } from "@/lib/desk-types";
import { num, usdFull } from "@/lib/format";

export default function TradingPage() {
  const { fund } = useDesk();
  const { data, source, reload } = useApiOr("/trades", MOCK_TRADES);
  const [rows, setRows] = useState<BlotterTrade[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trades = rows ?? data;

  const columnDefs = useMemo<ColDef<BlotterTrade>[]>(
    () => [
      { field: "trade_time", headerName: "交易时间", flex: 1.2, minWidth: 170 },
      { field: "trade_type", headerName: "交易类型", width: 110 },
      { field: "counterparty", headerName: "对手方", width: 160 },
      {
        field: "amount",
        headerName: "金额",
        flex: 1,
        minWidth: 130,
        valueFormatter: (p: ValueFormatterParams<BlotterTrade>) => usdFull(p.value ?? 0),
      },
      {
        field: "rate",
        headerName: "利率",
        width: 100,
        valueFormatter: (p) => `${(num(p.value) * 100).toFixed(3)}%`,
      },
      { field: "maturity_date", headerName: "到期日", width: 120 },
      { field: "trader", headerName: "交易员", width: 120 },
      { field: "status", headerName: "状态", width: 110 },
    ],
    [],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      trade_type: String(fd.get("trade_type")),
      counterparty: String(fd.get("counterparty")),
      amount: Number(fd.get("amount")),
      rate: Number(fd.get("rate")) / 100,
      tenor_days: Number(fd.get("tenor_days")),
      trader: String(fd.get("trader") || "PM Desk"),
    };
    setBusy(true);
    setError(null);
    try {
      const booked = await apiPost<BlotterTrade>("/trades", payload);
      setRows([booked, ...trades]);
      setOpen(false);
      reload();
    } catch {
      const local: BlotterTrade = {
        id: `TRD-LOCAL-${Date.now()}`,
        trade_time: new Date().toISOString(),
        trade_type: payload.trade_type,
        counterparty: payload.counterparty,
        amount: payload.amount,
        rate: payload.rate,
        maturity_date: new Date(Date.now() + payload.tenor_days * 86400000).toISOString().slice(0, 10),
        trader: payload.trader,
        status: "BOOKED (mock)",
      };
      setRows([local, ...trades]);
      setOpen(false);
      setError("后端不可用，已写入本地 mock 交易簿");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Trade Blotter"
      subtitle={`${fund.name} · 交易记录簿 · BUY / SELL / REPO / DEPOSIT`}
      source={source}
      actions={
        <Button variant="accent" onClick={() => setOpen(true)}>
          快速记账
        </Button>
      }
    >
      {error ? <p className="text-xs text-amber-400">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
        <div className="ag-theme-quartz-dark h-[560px] w-full">
          <AgGridReact<BlotterTrade>
            rowData={trades}
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
            <h2 className="mb-3 text-sm font-semibold">新交易 / 存款</h2>
            <form className="space-y-3" onSubmit={onSubmit}>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                类型
                <select
                  name="trade_type"
                  className="mt-1 h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
                  defaultValue="DEPOSIT"
                >
                  <option>BUY</option>
                  <option>SELL</option>
                  <option>REPO</option>
                  <option>DEPOSIT</option>
                </select>
              </label>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                对手方
                <Input name="counterparty" defaultValue="HSBC" required />
              </label>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                金额 (USD)
                <Input name="amount" type="number" defaultValue={2000000} min={1} required />
              </label>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                利率 (%)
                <Input name="rate" type="number" step="0.001" defaultValue={4.25} required />
              </label>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                期限 (天)
                <Input name="tenor_days" type="number" defaultValue={7} min={1} max={397} required />
              </label>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                交易员
                <Input name="trader" defaultValue="Amy Chen" />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button type="submit" variant="accent" disabled={busy}>
                  {busy ? "提交中…" : "提交并刷新持仓"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
