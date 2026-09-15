"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import type { CashLadderRow } from "@/types/workbench";
import { useDesk } from "@/components/layout/DeskProvider";
import { moneyFull } from "@/lib/format";
import type { FundCcy } from "@/lib/fund";

function moneyFmt(params: ValueFormatterParams<CashLadderRow, number | string>, ccy: FundCcy) {
  const v = Number(params.value ?? 0);
  if (!v) return "—";
  return moneyFull(v, ccy);
}

export function CashLadderGrid({ rows, dark }: { rows: CashLadderRow[]; dark: boolean }) {
  const { fund } = useDesk();
  const columnDefs = useMemo<ColDef<CashLadderRow>[]>(
    () => [
      { field: "tenor", headerName: "Tenor", width: 88, pinned: "left" },
      { field: "date", headerName: "日期", width: 118, pinned: "left" },
      { field: "subscription_inflow", headerName: "申购流入", type: "numericColumn", flex: 1, valueFormatter: (p) => moneyFmt(p, fund.ccy) },
      { field: "redemption_outflow", headerName: "赎回到期", type: "numericColumn", flex: 1, valueFormatter: (p) => moneyFmt(p, fund.ccy) },
      { field: "principal_maturity", headerName: "资产到期还本", type: "numericColumn", flex: 1, valueFormatter: (p) => moneyFmt(p, fund.ccy) },
      { field: "interest_income", headerName: "利息收入", type: "numericColumn", flex: 1, valueFormatter: (p) => moneyFmt(p, fund.ccy) },
      { field: "fx_hedge_flow", headerName: "FX对冲出入款", type: "numericColumn", flex: 1, valueFormatter: (p) => moneyFmt(p, fund.ccy) },
      { field: "net_flow", headerName: "当日净额", type: "numericColumn", flex: 1, valueFormatter: (p) => moneyFmt(p, fund.ccy) },
      {
        field: "closing_cash",
        headerName: "期末预测净现金",
        type: "numericColumn",
        flex: 1.2,
        valueFormatter: (p) => moneyFmt(p, fund.ccy),
        cellClass: "font-semibold",
      },
    ],
    [fund.ccy],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          Cash Ladder · {fund.code} · {fund.ccy}
        </h2>
        <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{rows.length} sessions</span>
      </div>
      <div className={`${dark ? "ag-theme-quartz-dark" : "ag-theme-quartz"} h-[440px] w-full`}>
        <AgGridReact<CashLadderRow>
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
          rowHeight={32}
          headerHeight={34}
          getRowId={(p) => p.data.tenor}
          getRowClass={(p) => (p.data?.tenor === "T+0" ? "font-semibold" : undefined)}
        />
      </div>
    </div>
  );
}
