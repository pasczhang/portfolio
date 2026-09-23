"use client";

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast } from "@/components/dashboard/Toast";
import { TradeRecordModal } from "@/components/trading/TradeRecordModal";
import { usePermissions } from "@/lib/auth/usePermissions";
import { moneyFull, pctFmt } from "@/lib/format";
import {
  SETTLEMENT_STATUSES,
  TRADE_SIDES,
  TRADE_SIDE_LABELS,
  type DeskTrade,
  type SettlementStatus,
  type TradeSide,
} from "@/lib/holdings/trades";

export default function TradingPage() {
  const { fund, role } = useDesk();
  const { canWrite } = usePermissions();
  const { trades, addTrade, updateTrade, removeTrade, source, cashPosition } = useBook();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeskTrade | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeskTrade | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [side, setSide] = useState<TradeSide | "ALL">("ALL");
  const [status, setStatus] = useState<SettlementStatus | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const canEdit = canWrite && role === "maker";

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

  function flash(message: string, tone: "ok" | "error" = "ok") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2800);
  }

  function handleSaveTrade(trade: DeskTrade) {
    try {
      if (editing?.id) {
        updateTrade(trade);
        flash("交易记录已更新");
      } else {
        addTrade(trade);
        flash("交易记录已写入");
      }
      setModalOpen(false);
      setEditing(null);
    } catch {
      flash("保存失败，请重试", "error");
    }
  }

  function handleDeleteTrade() {
    if (!pendingDelete) return;
    try {
      removeTrade(pendingDelete.id);
      flash("交易记录已成功删除");
      setPendingDelete(null);
    } catch {
      flash("删除失败，请重试", "error");
    }
  }

  const columnDefs = useMemo<ColDef<DeskTrade>[]>(
    () => [
      { field: "id", headerName: "交易编号", width: 170, pinned: "left" },
      { field: "tradeDate", headerName: "交易日", width: 110 },
      { field: "settlementDate", headerName: "交收日", width: 110 },
      {
        field: "side",
        headerName: "交易方向",
        width: 130,
        valueFormatter: (p) => TRADE_SIDE_LABELS[(p.value as TradeSide) ?? "Buy"] ?? String(p.value ?? ""),
      },
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
      {
        colId: "actions",
        headerName: "操作",
        width: 128,
        pinned: "right",
        sortable: false,
        hide: !canWrite,
        cellClass: "text-right",
        headerClass: "text-right",
        cellRenderer: (p: ICellRendererParams<DeskTrade>) => (
          <div className="flex h-full items-center justify-end gap-1">
            <button
              type="button"
              className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-amber-300"
              title="编辑"
              onClick={() => {
                if (!p.data) return;
                setEditing(p.data);
                setModalOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-red-500/20 hover:text-red-300"
              title="删除"
              onClick={() => p.data && setPendingDelete(p.data)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [fund.ccy, canEdit, canWrite],
  );

  return (
    <AppShell
      title="交易记录 · Trade Blotter"
      subtitle={`${fund.name} · 买卖 / 定存 / 到期兑付台账 · T+0 可用 ${moneyFull(cashPosition.t0Available, fund.ccy)}`}
      source={source}
      actions={
        canWrite ? (
        <Button
          variant="accent"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          disabled={!canEdit}
        >
          {canEdit ? "手动录入交易" : "Checker 只读"}
        </Button>
        ) : undefined
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
              <option key={s} value={s}>
                {TRADE_SIDE_LABELS[s]}
              </option>
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

      {modalOpen ? (
        <TradeRecordModal
          initial={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSaveTrade}
        />
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <Card className="w-full max-w-md p-4">
            <h2 className="text-sm font-semibold">删除交易记录</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              确定要删除该笔交易记录吗？删除后不可恢复
            </p>
            <p className="mt-2 font-mono text-[11px] text-amber-300">
              {pendingDelete.id} · {pendingDelete.assetName}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
                取消
              </Button>
              <Button type="button" variant="accent" onClick={handleDeleteTrade}>
                确认删除
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </AppShell>
  );
}
