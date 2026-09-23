"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams, ValueFormatterParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Pencil, Trash2 } from "lucide-react";
import { useDesk } from "@/components/layout/DeskProvider";
import { issuerAlertLevel } from "@/lib/holdings/analysis";
import { moneyFull, num, pctFmt } from "@/lib/format";

export type HoldingRow = {
  row_key: string;
  book_security_id?: string;
  security_id: string;
  instrument: string;
  product_type: "TD" | "NCD" | "T-Bill" | string;
  asset_type?: string;
  asset_category?: string;
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
  asset_weight_pct?: number | string;
  nav_weight_pct?: number | string;
  issuer_weight_pct?: number | string;
  rating?: string;
};

function isSummaryRow(p: {
  data?: HoldingRow | null;
  node?: { rowPinned?: string | null } | null;
}): boolean {
  return p.node?.rowPinned === "bottom" || p.data?.row_key === "SUMMARY_TOTAL";
}

function PctCell(p: ICellRendererParams<HoldingRow>) {
  const v = Number(p.value ?? 0);
  const cls = isSummaryRow(p)
    ? "flex h-full w-full items-center justify-end font-mono text-[13px] font-semibold tabular-nums text-amber-300"
    : "flex h-full w-full items-center justify-end font-mono tabular-nums";
  return <span className={cls}>{pctFmt(v)}</span>;
}

function NavWeightCell(p: ICellRendererParams<HoldingRow>) {
  const nav = Number(p.data?.nav_weight_pct ?? p.value ?? 0);
  if (isSummaryRow(p)) {
    return <span className="flex h-full w-full items-center justify-end font-mono text-[13px] font-semibold tabular-nums text-amber-300">{pctFmt(nav)}</span>;
  }
  const issuerW = Number(p.data?.issuer_weight_pct ?? 0);
  const issuer = p.data?.counterparty ?? "";
  const level = issuerAlertLevel(issuerW, issuer);
  return (
    <span className="inline-flex h-full w-full items-center justify-end gap-1.5">
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

function isCashGridRow(item: HoldingRow): boolean {
  if (item.asset_category === "CASH") return true;
  const code = `${item.security_id ?? ""} ${item.row_key ?? ""}`;
  if (/CASH/i.test(code)) return true;
  return /cash at bank|demand deposit|custody cash|托管现金|银行存款|\bcash\b/i.test(item.instrument ?? "");
}

function toCashGridRow(opts: {
  ccy: string;
  cashVal: number;
  totalNav: number;
  asOfDate: string;
  label?: string;
  issuer?: string;
}): HoldingRow {
  const navRatio = opts.totalNav > 0 ? (opts.cashVal / opts.totalNav) * 100 : 0;
  const instrument =
    opts.label?.trim() || `${opts.ccy} Cash Custody Account (中银保诚托管现金)`;
  return {
    row_key: "CASH_ROW_1",
    book_security_id: `${opts.ccy}-CASH`,
    security_id: `${opts.ccy}-CASH`,
    instrument,
    product_type: "Cash",
    asset_type: "Cash & Bank",
    asset_category: "CASH",
    isin: "--",
    counterparty: opts.issuer || "BOCI Custody",
    value_date: opts.asOfDate,
    maturity_date: opts.asOfDate,
    coupon_rate_pct: 0,
    tenor: "0D",
    tenor_days: 0,
    amortized_cost: opts.cashVal,
    shadow_mtm: opts.cashVal,
    wam_contribution: 0,
    wam_days: 0,
    weight_pct: Number(navRatio.toFixed(2)),
    asset_weight_pct: Number(navRatio.toFixed(2)),
    nav_weight_pct: Number(navRatio.toFixed(2)),
    issuer_weight_pct: Number(navRatio.toFixed(2)),
    rating: "NR",
  };
}

export function HoldingsGrid({
  rows,
  analysis = false,
  cashAmount,
  totalNav,
  officialNav,
  asOfDate,
  cashLabel,
  cashIssuer,
  onEdit,
  onRemove,
}: {
  rows: HoldingRow[];
  analysis?: boolean;
  cashAmount?: number | null;
  totalNav?: number | null;
  officialNav?: number | null;
  asOfDate?: string;
  cashLabel?: string | null;
  cashIssuer?: string | null;
  onEdit?: (row: HoldingRow) => void;
  onRemove?: (row: HoldingRow) => void;
}) {
  const { fund } = useDesk();
  const tableDataSource = useMemo(() => {
    const list = [...(rows || [])];
    const cashIdx = list.findIndex(isCashGridRow);
    if (cashIdx > 0) {
      const [cashRow] = list.splice(cashIdx, 1);
      list.unshift(cashRow);
      return list;
    }
    if (cashIdx === 0) return list;

    const cashVal = Number(cashAmount ?? 0);
    if (!(cashVal > 0)) return list;
    const nav = Number(officialNav ?? totalNav ?? 0);
    list.unshift(
      toCashGridRow({
        ccy: fund.ccy,
        cashVal,
        totalNav: nav > 0 ? nav : cashVal,
        asOfDate: asOfDate || new Date().toISOString().slice(0, 10),
        label: cashLabel || undefined,
        issuer: cashIssuer || undefined,
      }),
    );
    return list;
  }, [rows, cashAmount, totalNav, officialNav, asOfDate, cashLabel, cashIssuer, fund.ccy]);

  const displayRows = useMemo(() => {
    const grossTotalAssets = tableDataSource.reduce((s, item) => {
      const amt = num(item.amortized_cost) || num(item.shadow_mtm);
      return s + amt;
    }, 0);
    const tapeNav = Number(officialNav ?? totalNav ?? 0);
    const fundNav = tapeNav > 0 ? tapeNav : grossTotalAssets;
    return tableDataSource.map((item) => {
      const amt = num(item.amortized_cost) || num(item.shadow_mtm);
      const pctOfTotalAssets = grossTotalAssets > 0 ? (amt / grossTotalAssets) * 100 : 0;
      const pctOfNav = fundNav > 0 ? (amt / fundNav) * 100 : 0;
      return {
        ...item,
        asset_weight_pct: Number(pctOfTotalAssets.toFixed(2)),
        nav_weight_pct: Number(pctOfNav.toFixed(2)),
        weight_pct: Number(pctOfTotalAssets.toFixed(2)),
      };
    });
  }, [tableDataSource, officialNav, totalNav]);

  const summaryData = useMemo(() => {
    const totalAmortized = displayRows.reduce((sum, item) => sum + num(item.amortized_cost), 0);
    const totalFairValue = displayRows.reduce(
      (sum, item) => sum + num(item.shadow_mtm || item.amortized_cost),
      0,
    );
    const totalAssetRatio = displayRows.reduce((sum, item) => sum + num(item.asset_weight_pct ?? item.weight_pct), 0);
    const totalNavRatio = displayRows.reduce((sum, item) => sum + num(item.nav_weight_pct), 0);
    return { totalAmortized, totalFairValue, totalAssetRatio, totalNavRatio };
  }, [displayRows]);

  const pinnedBottomRowData = useMemo<HoldingRow[]>(
    () => [
      {
        row_key: "SUMMARY_TOTAL",
        security_id: "合计",
        instrument: `合计 / Total（${displayRows.length} 笔）`,
        product_type: "",
        asset_type: "",
        asset_category: "",
        isin: "",
        counterparty: "",
        value_date: "",
        maturity_date: "",
        coupon_rate_pct: "",
        tenor: "",
        tenor_days: 0,
        amortized_cost: summaryData.totalAmortized,
        shadow_mtm: summaryData.totalFairValue,
        wam_contribution: "",
        wam_days: "",
        weight_pct: Number(summaryData.totalAssetRatio.toFixed(2)),
        asset_weight_pct: Number(summaryData.totalAssetRatio.toFixed(2)),
        nav_weight_pct: Number(summaryData.totalNavRatio.toFixed(2)),
        rating: "",
      },
    ],
    [summaryData, displayRows.length],
  );
  const columnDefs = useMemo<ColDef<HoldingRow>[]>(
    () => [
      { field: "security_id", headerName: "资产代码", width: 150, pinned: "left" },
      { field: "instrument", headerName: "资产名称", flex: 1.5, minWidth: 220 },
      { field: "isin", headerName: "ISIN", width: 128, hide: !analysis },
      {
        field: "asset_category",
        headerName: "资产类别",
        width: 120,
        valueFormatter: (p) => {
          if (isSummaryRow(p)) return "";
          const v = String(p.value ?? "");
          if (v === "CASH") return "现金";
          if (v === "TIME_DEPOSIT") return "定期存款";
          if (v === "REPO") return "回购";
          if (v === "BOND") return "债券";
          return v || "—";
        },
      },
      { field: "asset_type", headerName: "资产类型", width: 140, hide: !analysis },
      { field: "product_type", headerName: "产品", width: 110, hide: analysis },
      { field: "counterparty", headerName: "发行人", width: 170 },
      { field: "value_date", headerName: "起息日", width: 110 },
      { field: "maturity_date", headerName: "到期日", width: 110 },
      {
        field: "tenor_days",
        headerName: "剩余天数",
        width: 100,
        type: "numericColumn",
        valueFormatter: (p) => (isSummaryRow(p) ? "" : `${Number(p.value ?? 0)}d`),
      },
      {
        field: "coupon_rate_pct",
        headerName: "票息 / 买入收益率",
        width: 140,
        type: "numericColumn",
        cellClass: "font-mono tabular-nums",
        valueFormatter: (p) => (isSummaryRow(p) ? "" : `${Number(p.value ?? 0).toFixed(2)}%`),
      },
      {
        field: "amortized_cost",
        headerName: "摊余成本",
        width: 160,
        minWidth: 140,
        pinned: "right",
        type: "numericColumn",
        cellClass: "font-mono tabular-nums text-right",
        headerClass: "text-right",
        valueFormatter: (p: ValueFormatterParams<HoldingRow, number | string>) => moneyFull(p.value ?? 0, fund.ccy),
      },
      {
        field: "shadow_mtm",
        headerName: "公允估值",
        width: 160,
        minWidth: 140,
        pinned: "right",
        type: "numericColumn",
        cellClass: "font-mono tabular-nums text-right",
        headerClass: "text-right",
        valueFormatter: (p: ValueFormatterParams<HoldingRow, number | string>) => moneyFull(p.value ?? 0, fund.ccy),
      },
      {
        field: "asset_weight_pct",
        headerName: "% of Total Assets",
        width: 148,
        pinned: "right",
        type: "numericColumn",
        cellClass: "font-mono tabular-nums text-right",
        headerClass: "text-right",
        cellRenderer: PctCell,
        comparator: (a, b) => Number(a ?? 0) - Number(b ?? 0),
      },
      {
        field: "nav_weight_pct",
        headerName: "% of NAV",
        width: 120,
        pinned: "right",
        type: "numericColumn",
        cellClass: "font-mono tabular-nums text-right",
        headerClass: "text-right",
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
      {
        colId: "actions",
        headerName: "操作",
        width: 108,
        pinned: "right",
        sortable: false,
        hide: !onEdit && !onRemove,
        cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
          if (isSummaryRow(p)) return null;
          return (
          <div className="flex h-full items-center gap-1">
            {onEdit ? (
              <button
                type="button"
                className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-amber-300"
                title="编辑"
                onClick={() => p.data && onEdit(p.data)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-red-500/20 hover:text-red-300"
                title="删除"
                onClick={() => p.data && onRemove(p.data)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          );
        },
      },
    ],
    [fund.ccy, analysis, onEdit, onRemove],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="ag-theme-quartz-dark h-[560px] w-full">
        <AgGridReact<HoldingRow>
          rowData={displayRows}
          pinnedBottomRowData={pinnedBottomRowData}
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
          getRowId={(p) => {
            const d = p.data;
            if (d?.row_key) return d.row_key;
            return [d?.security_id, d?.maturity_date, d?.instrument, d?.value_date, d?.amortized_cost, d?.shadow_mtm]
              .map((x) => String(x ?? ""))
              .join("|");
          }}
          getRowStyle={(p) =>
            isSummaryRow(p)
              ? {
                  fontWeight: 700,
                  background: "hsl(38 92% 50% / 0.12)",
                  borderTop: "1px solid hsl(38 92% 50% / 0.35)",
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

