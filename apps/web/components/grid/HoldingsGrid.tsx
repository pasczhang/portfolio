"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { useDesk } from "@/components/layout/DeskProvider";
import { issuerAlertLevel } from "@/lib/holdings/analysis";
import { moneyFull, pctFmt } from "@/lib/format";

export type HoldingRow = {
  security_id: string;
  instrument: string;
  product_type: "TD" | "NCD" | "T-Bill" | string;
  asset_type?: string;
  isin?: string;
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
  nav_weight_pct?: number | string;
  issuer_weight_pct?: number | string;
  rating?: string;
};

function NavWeightCell(p: ICellRendererParams<HoldingRow>) {
  const nav = Number(p.data?.nav_weight_pct ?? p.value ?? 0);
  const issuerW = Number(p.data?.issuer_weight_pct ?? 0);
  const issuer = p.data?.counterparty ?? "";
  const level = issuerAlertLevel(issuerW, issuer);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono tabular-nums">{pctFmt(nav)}</span>
      {level === "watch" ? (
        <span className="rounded bg-amber-500/20 px-1 font-mono text-[9px] text-amber-300">SFC 8.2 {pctFmt(issuerW)}</span>
      ) : null}
      {level === "breach" ? (
        <span className="rounded bg-red-500/25 px-1 font-mono text-[9px] text-red-300">LIMIT {pctFmt(issuerW)}</span>
      ) : null}
    </span>
  );
}

export function HoldingsGrid({ rows, analysis = false }: { rows: HoldingRow[]; analysis?: boolean }) {
  const { fund } = useDesk();
  const columnDefs = useMemo<ColDef<HoldingRow>[]>(
    () => [
      { field: "security_id", headerName: "资产代码", width: 150, pinned: "left" },
      { field: "instrument", headerName: "资产名称", flex: 1.5, minWidth: 220 },
      { field: "isin", headerName: "ISIN", width: 128, hide: !analysis },
      { field: "asset_type", headerName: "资产类型", width: 150, hide: !analysis },
      { field: "product_type", headerName: "产品", width: 90, hide: analysis },
      { field: "counterparty", headerName: "发行人", width: 170 },
      { field: "value_date", headerName: "起息日", width: 110 },
      { field: "maturity_date", headerName: "到期日", width: 110 },
      {
        field: "tenor_days",
        headerName: "剩余天数",
        width: 100,
        type: "numericColumn",
        valueFormatter: (p) => `${Number(p.value ?? 0)}d`,
      },
      {
        field: "coupon_rate_pct",
        headerName: "票息 / 买入收益率",
        width: 140,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p) => `${Number(p.value ?? 0).toFixed(2)}%`,
      },
      {
        field: "amortized_cost",
        headerName: "摊余成本",
        flex: 1,
        minWidth: 140,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p: ValueFormatterParams<HoldingRow, number | string>) => moneyFull(p.value ?? 0, fund.ccy),
      },
      {
        field: "shadow_mtm",
        headerName: "公允估值",
        flex: 1,
        minWidth: 140,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p: ValueFormatterParams<HoldingRow, number | string>) => moneyFull(p.value ?? 0, fund.ccy),
      },
      {
        field: "nav_weight_pct",
        headerName: "% of NAV",
        width: 170,
        pinned: "right",
        cellRenderer: NavWeightCell,
        comparator: (a, b) => Number(a ?? 0) - Number(b ?? 0),
      },
      { field: "rating", headerName: "评级", width: 90, hide: !analysis },
      {
        field: "wam_contribution",
        headerName: "WAM贡献",
        width: 110,
        hide: analysis,
        type: "numericColumn",
        valueFormatter: (p) => `${Number(p.value ?? 0).toFixed(2)}d`,
      },
    ],
    [fund.ccy, analysis],
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
