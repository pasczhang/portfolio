"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { useDesk } from "@/components/layout/DeskProvider";
import { moneyFull } from "@/lib/format";

export type HoldingRow = {
  security_id: string;
  instrument: string;
  product_type: "TD" | "NCD" | "T-Bill" | string;
  counterparty: string;
  value_date: string;
  maturity_date: string;
  coupon_rate_pct: number | string;
  tenor: string;
  tenor_days: number;
  amortized_cost: number | string;
  shadow_mtm: number | string;
  wam_contribution: number | string;
  wam_days: number | string;
  weight_pct: number | string;
};

export function HoldingsGrid({ rows }: { rows: HoldingRow[] }) {
  const { fund } = useDesk();
  const columnDefs = useMemo<ColDef<HoldingRow>[]>(
    () => [
      { field: "security_id", headerName: "资产代码", width: 130, pinned: "left" },
      { field: "product_type", headerName: "资产类型", width: 100, pinned: "left" },
      { field: "instrument", headerName: "资产名称", flex: 1.4, minWidth: 200 },
      { field: "counterparty", headerName: "对手方银行", width: 160 },
      { field: "value_date", headerName: "起息日", width: 118 },
      { field: "maturity_date", headerName: "到期日", width: 118 },
      {
        field: "coupon_rate_pct",
        headerName: "票面利率",
        width: 110,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p) => `${Number(p.value ?? 0).toFixed(3)}%`,
      },
      { field: "tenor", headerName: "剩余期限 Tenor", width: 130, cellClass: "font-mono tabular-nums" },
      {
        field: "amortized_cost",
        headerName: "摊余成本金额",
        flex: 1,
        minWidth: 150,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p: ValueFormatterParams<HoldingRow, number | string>) => moneyFull(p.value ?? 0, fund.ccy),
      },
      {
        field: "shadow_mtm",
        headerName: "影子估值 MTM",
        flex: 1,
        minWidth: 150,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p: ValueFormatterParams<HoldingRow, number | string>) => moneyFull(p.value ?? 0, fund.ccy),
      },
      {
        field: "wam_contribution",
        headerName: "WAM贡献天数",
        width: 120,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p) => `${Number(p.value ?? 0).toFixed(2)}d`,
      },
    ],
    [fund.ccy],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="ag-theme-quartz-dark h-[560px] w-full">
        <AgGridReact<HoldingRow>
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            resizable: true,
            suppressMovable: true,
            cellClass: "font-mono tabular-nums text-[12px]",
            headerClass: "text-[11px]",
          }}
          rowHeight={34}
          headerHeight={36}
          animateRows
          getRowId={(p) => p.data.security_id}
        />
      </div>
    </div>
  );
}
