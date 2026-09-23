"use client";

import { useCallback, useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast } from "@/components/dashboard/Toast";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { formatBackupClock, parseBackupFile, summarizeBackup } from "@/lib/persist/backup";
import { useFormDirty } from "@/lib/persist/dirty";
import type { AutoSnapshotReason, BackupSummary, PMSBackupPayload } from "@/lib/persist/types";
import { usePermissions } from "@/lib/auth/usePermissions";
import { moneyFull } from "@/lib/format";

const REASON_LABEL: Record<AutoSnapshotReason, string> = {
  session_open: "打开系统",
  daily_open: "每日首次打开",
  import_holdings: "导入持仓",
  import_valuation: "导入估值表",
  adopt_custodian: "采纳托管行",
  import_ta: "导入 TA 流水",
  inception_reset: "基金初始化前",
  manual: "手动快照",
  pre_restore: "恢复前备份",
};

function RestoreConfirm({
  summary,
  onCancel,
  onConfirm,
}: {
  summary: BackupSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useFormDirty();
  const [phrase, setPhrase] = useState("");
  const ok = phrase.trim().toUpperCase() === "OVERWRITE";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-md border-amber-500/40 p-4">
        <h2 className="text-sm font-semibold">覆盖恢复 · Overwrite Restore</h2>
        <p className="mt-2 text-[12px] text-amber-200">
          将清空当前 IndexedDB 中的持仓、交易、现金与估值，并还原为该备份。此操作不可撤销（本地会先自动存一份恢复前快照）。
        </p>
        <dl className="mt-3 space-y-1 font-mono text-[11px]">
          <div className="flex justify-between gap-2">
            <dt className="text-[hsl(var(--muted-foreground))]">备份时间</dt>
            <dd>{formatBackupClock(summary.exportTime)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[hsl(var(--muted-foreground))]">包含交易笔数</dt>
            <dd>{summary.tradeCount} 条</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[hsl(var(--muted-foreground))]">包含持仓数量</dt>
            <dd>{summary.positionCount} 只</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[hsl(var(--muted-foreground))]">NAV 资产总额</dt>
            <dd>${summary.navTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[hsl(var(--muted-foreground))]">Schema</dt>
            <dd>{summary.schemaVersion}</dd>
          </div>
        </dl>
        <label className="mt-3 block space-y-1">
          <Label>输入 OVERWRITE 确认覆盖</Label>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="button" variant="danger" disabled={!ok} onClick={onConfirm}>
            确认覆盖恢复
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function DataBackupCard() {
  const { fund } = useDesk();
  const { canWrite, canFundReset } = usePermissions();
  const {
    exportFullBackup,
    restoreFromBackup,
    autoSnapshots,
    rollbackAutoSnapshot,
    downloadAutoSnapshot,
    captureAutoSnapshot,
    persistReady,
  } = useBook();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [pending, setPending] = useState<{ payload: PMSBackupPayload; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);

  function flash(message: string, tone: "ok" | "error" = "ok") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }

  const ingestFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = await parseBackupFile(text);
      if (!parsed.ok) {
        flash(parsed.error, "error");
        return;
      }
      setPending({ payload: parsed.payload, summary: summarizeBackup(parsed.payload) });
    } catch {
      flash("无效的备份文件格式", "error");
    }
  }, []);

  async function onExport() {
    try {
      setBusy(true);
      await exportFullBackup();
      flash("全量备份已导出");
    } catch {
      flash("导出失败，请重试", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (!pending) return;
    try {
      setBusy(true);
      await restoreFromBackup(pending.payload);
      setPending(null);
      window.sessionStorage.setItem("pms-flash", "备份已覆盖恢复");
      window.location.assign("/holdings");
    } catch {
      flash("恢复失败，请重试", "error");
      setBusy(false);
    }
  }

  async function onRollback(id: string) {
    try {
      setBusy(true);
      await rollbackAutoSnapshot(id);
      setRollbackId(null);
      window.sessionStorage.setItem("pms-flash", "已回滚至所选快照");
      window.location.assign("/holdings");
    } catch {
      flash("回滚失败，请重试", "error");
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">数据备份与恢复 · Data Backup & Restore</h2>
        <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">
          主存储为 IndexedDB（schema {persistReady ? "已就绪" : "加载中"}）。导出 JSON 含基金信息、持仓、交易、现金、估值快照与 checksum。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="accent" disabled={busy} onClick={() => void onExport()}>
            <Download className="h-3.5 w-3.5" />
            导出全量备份 / Export Full Backup
          </Button>
          {canWrite ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void captureAutoSnapshot("manual")}>
              立即创建本地快照
            </Button>
          ) : null}
        </div>

        {canFundReset ? (
        <div
          className={`mt-4 rounded-md border border-dashed px-3 py-6 text-center text-[12px] ${
            dragOver ? "border-amber-400 bg-amber-500/10" : "border-[hsl(var(--border))]"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void ingestFile(file);
          }}
        >
          <Upload className="mx-auto mb-2 h-5 w-5 text-amber-400" />
          <p>拖拽备份 JSON 到此处，或</p>
          <Button type="button" variant="outline" className="mt-2" onClick={() => fileRef.current?.click()}>
            选择 .json 文件
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void ingestFile(file);
              e.target.value = "";
            }}
          />
        </div>
        ) : null}

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          本地历史快照（最多 10 份滚动保留）
        </h3>
        <div className="mt-2 overflow-auto rounded-md border border-[hsl(var(--border))]">
          <table className="w-full min-w-[640px] text-left font-mono text-[11px]">
            <thead className="bg-[hsl(var(--muted))]/50 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-2 py-2">快照时间</th>
                <th className="px-2 py-2">触发原因</th>
                <th className="px-2 py-2 text-right">当时 NAV</th>
                <th className="px-2 py-2 text-right">持仓 / 交易</th>
                <th className="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {autoSnapshots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-[hsl(var(--muted-foreground))]">
                    暂无快照（打开系统或执行重大写入后自动生成）
                  </td>
                </tr>
              ) : (
                autoSnapshots.map((row) => (
                  <tr key={row.id} className="border-t border-[hsl(var(--border))]">
                    <td className="px-2 py-2">{formatBackupClock(row.createdAt)}</td>
                    <td className="px-2 py-2">{REASON_LABEL[row.reason] ?? row.reason}</td>
                    <td className="px-2 py-2 text-right">{moneyFull(row.nav, fund.ccy)}</td>
                    <td className="px-2 py-2 text-right">
                      {row.positionCount} / {row.tradeCount}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" onClick={() => void downloadAutoSnapshot(row.id)}>
                          下载
                        </Button>
                        {canFundReset ? (
                          <Button type="button" variant="outline" onClick={() => setRollbackId(row.id)}>
                            <RotateCcw className="h-3 w-3" />
                            回滚
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pending ? (
        <RestoreConfirm summary={pending.summary} onCancel={() => setPending(null)} onConfirm={() => void onRestore()} />
      ) : null}

      {rollbackId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md p-4">
            <h2 className="text-sm font-semibold">回滚至此版本</h2>
            <p className="mt-2 text-[12px] text-[hsl(var(--muted-foreground))]">
              当前数据将被该快照覆盖。回滚前会自动再存一份「恢复前备份」。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRollbackId(null)}>
                取消
              </Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => void onRollback(rollbackId)}>
                确认回滚
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </>
  );
}
