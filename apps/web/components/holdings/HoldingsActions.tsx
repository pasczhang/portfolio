"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDesk } from "@/components/layout/DeskProvider";
import { useBook } from "@/components/layout/BookProvider";
import { buildImportPreview, downloadHoldingsTemplate, parseHoldingRecords, workbookToRows } from "@/lib/holdings";
import type { ImportPreview } from "@/lib/holdings/types";
import { X } from "lucide-react";

export function HoldingsActions() {
  const { fund } = useDesk();
  const { origin, resetDemo } = useBook();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => downloadHoldingsTemplate(fund.ccy, fund.code)}>
        下载模板
      </Button>
      <Button variant="accent" onClick={() => setOpen(true)}>
        导入持仓
      </Button>
      {origin === "import" ? (
        <Button variant="ghost" onClick={resetDemo}>
          恢复样本账本
        </Button>
      ) : null}
      {open ? <ImportHoldingsModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ImportHoldingsModal({ onClose }: { onClose: () => void }) {
  const { fund } = useDesk();
  const { applyImport } = useBook();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ingest = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
        setError("仅支持 .xlsx / .csv");
        return;
      }
      setBusy(true);
      try {
        const buf = await file.arrayBuffer();
        const records = workbookToRows(buf);
        if (!records.length) {
          setError("文件没有可解析的数据行");
          setPreview(null);
          return;
        }
        const rows = parseHoldingRecords(records, fund.ccy);
        setPreview(buildImportPreview(rows, fund.ccy));
      } catch (err) {
        setError(err instanceof Error ? err.message : "解析失败");
        setPreview(null);
      } finally {
        setBusy(false);
      }
    },
    [fund.ccy],
  );

  function commit(mode: "overwrite" | "merge") {
    if (!preview?.valid.length) return;
    applyImport(preview.valid, mode);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <Card className="max-h-[90vh] w-full max-w-4xl overflow-auto p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">导入持仓 · {fund.code}</h2>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              解析绑定当前份额 {fund.ccy} · Excel / CSV · 即传即用
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`mb-3 rounded-md border border-dashed px-4 py-8 text-center text-xs ${
            drag ? "border-amber-500 bg-amber-500/10" : "border-[hsl(var(--border))]"
          }`}
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
          <p>拖拽 .xlsx / .csv 到此处，或</p>
          <Button variant="outline" className="mt-2" onClick={() => inputRef.current?.click()}>
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

        {preview ? (
          <div className="space-y-3">
            {preview.currencyMismatches > 0 ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                警示：有 {preview.currencyMismatches} 行资产币种与当前基金 {fund.ccy} 不一致，确认导入后仍会写入本份额账本。
              </p>
            ) : null}
            <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
              通过 {preview.valid.length} 行 · 错误 {preview.errorCount} 行 · 警示 {preview.warningCount}
            </p>
            <div className="max-h-64 overflow-auto rounded-md border border-[hsl(var(--border))]">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-[hsl(var(--muted))] font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-2 py-1">行</th>
                    <th>状态</th>
                    <th>名称</th>
                    <th>类型</th>
                    <th>到期</th>
                    <th>摊余成本</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const ok = row.errors.length === 0;
                    return (
                      <tr
                        key={row.rowNumber}
                        className={`border-t border-[hsl(var(--border))] ${ok ? "" : "bg-red-500/10"}`}
                      >
                        <td className="px-2 py-1 font-mono">{row.rowNumber}</td>
                        <td className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "通过" : "错误"}</td>
                        <td>{row.position.assetName || "—"}</td>
                        <td>{row.position.assetType || row.raw.assetType || "—"}</td>
                        <td className="font-mono">{row.position.maturityDate || "—"}</td>
                        <td className="font-mono">{row.position.amortizedCost ?? "—"}</td>
                        <td className="text-[hsl(var(--muted-foreground))]">
                          {[...row.errors, ...row.warnings].join("；") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button variant="outline" disabled={!preview.valid.length} onClick={() => commit("merge")}>
                追加合并
              </Button>
              <Button variant="accent" disabled={!preview.valid.length} onClick={() => commit("overwrite")}>
                确认覆盖当前持仓
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
