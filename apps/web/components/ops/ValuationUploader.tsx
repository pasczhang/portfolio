"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { moneyFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  downloadCustodianTemplate,
  parseValuationWorkbook,
  syntheticCustodianReport,
} from "@/lib/services/parsers/valuationParser";
import { downloadBociValuationTemplate } from "@/lib/utils/valuationExcelParser";

function reconTone(status: string | undefined): "ok" | "watch" | "breach" | "neutral" {
  if (status === "MATCHED" || status === "PERFECT_MATCH") return "ok";
  if (status === "WARNING") return "watch";
  if (status === "BREAK") return "breach";
  return "neutral";
}

export function ValuationUploader({
  label = "导入估值表",
  defaultOpen = false,
}: {
  label?: string;
  defaultOpen?: boolean;
}) {
  const { fund, asOf } = useDesk();
  const {
    positions,
    valuationReport,
    reconciliation,
    setValuationReport,
    adoptCustodian,
  } = useBook();
  const [open, setOpen] = useState(defaultOpen);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
        setError("仅支持 .xlsx / .xls / .csv");
        return;
      }
      setBusy(true);
      try {
        const buf = await file.arrayBuffer();
        const report = parseValuationWorkbook(buf, file.name);
        if (!report.holdings.length && report.cashBalance == null) {
          setError(report.warnings[0] || "解析结果为空");
        }
        setValuationReport(report);
      } catch (err) {
        setError(err instanceof Error ? err.message : "解析失败");
      } finally {
        setBusy(false);
      }
    },
    [setValuationReport],
  );

  return (
    <>
      <Button variant="accent" type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-auto p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">托管行估值表导入 · {fund.code}</h2>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                  HSBC / BOCI / CITI Excel 或 CSV · 模糊列映射 · 解析后写入对账中心
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadCustodianTemplate(positions, asOf, fund.code)}>
                下载托管行模板
              </Button>
              <Button variant="outline" onClick={() => downloadBociValuationTemplate(positions, asOf, fund.code)}>
                下载 BOCI / 保诚双行模板
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  setFileName("HSBC_Valuation_Demo.xlsx");
                  setValuationReport(syntheticCustodianReport(positions, asOf));
                }}
              >
                加载演示差异
              </Button>
            </div>

            <div
              className={cn(
                "mb-3 rounded-md border border-dashed px-4 py-8 text-center text-xs",
                drag ? "border-amber-500 bg-amber-500/10" : "border-[hsl(var(--border))]",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const file = e.dataTransfer.files[0];
                if (file) void ingest(file);
              }}
            >
              <p>拖拽 .xlsx / .xls / .csv 到此处，或</p>
              <Button variant="outline" className="mt-2" disabled={busy} onClick={() => inputRef.current?.click()}>
                选择文件
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void ingest(file);
                }}
              />
              {fileName ? <p className="mt-2 font-mono text-[11px] text-amber-400">{fileName}</p> : null}
              {busy ? <p className="mt-1 text-[hsl(var(--muted-foreground))]">解析中…</p> : null}
            </div>

            {error ? <p className="mb-2 text-xs text-red-400">{error}</p> : null}

            {valuationReport ? (
              <div className="mb-3 space-y-2 rounded-md border border-[hsl(var(--border))] p-3 text-xs">
                <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                  {valuationReport.template} · {valuationReport.custodian} · {valuationReport.holdings.length} 行 · 现金{" "}
                  {valuationReport.cashBalance == null ? "—" : moneyFull(valuationReport.cashBalance, fund.ccy)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={reconTone(reconciliation?.status)}>{reconciliation?.status ?? "PENDING"}</Badge>
                  {reconciliation ? (
                    <span className="font-mono">
                      通过率 {reconciliation.matchRatePct.toFixed(1)}% · Breaks {reconciliation.breaks.length}
                    </span>
                  ) : null}
                </div>
                {valuationReport.warnings.slice(0, 3).map((w, i) => (
                  <p key={`${w}-${i}`} className="text-amber-400">
                    {w}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-[11px] text-[hsl(var(--muted-foreground))]">尚未解析文件。</p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                关闭
              </Button>
              <Link href="/ops" onClick={() => setOpen(false)}>
                <Button variant="outline" type="button">
                  打开对账中心
                </Button>
              </Link>
              <Button
                variant="accent"
                disabled={!valuationReport}
                onClick={() => {
                  adoptCustodian();
                  setOpen(false);
                }}
              >
                采纳托管行数据
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
