"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moneyFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  downloadCustodianTemplate,
  parseValuationWorkbook,
  syntheticCustodianReport,
} from "@/lib/services/parsers/valuationParser";
import { downloadBociValuationTemplate } from "@/lib/utils/valuationExcelParser";
import { downloadTaTemplate, parseTaWorkbook, syncBenchmarks } from "@/lib/services/marketData";
import { postOpsWebhook, runEodPipeline } from "@/lib/services/eod/batchPipeline";
import type { BenchmarkFixing, EodStepLog } from "@/lib/services/types";
import { PRODUCT_AS_OF } from "@/constants/calendar";
import { ValuationUploader } from "@/components/ops/ValuationUploader";
import { usePermissions } from "@/lib/auth/usePermissions";

function reconTone(status: string | undefined): "ok" | "watch" | "breach" | "neutral" {
  if (status === "MATCHED" || status === "PERFECT_MATCH") return "ok";
  if (status === "WARNING") return "watch";
  if (status === "BREAK") return "breach";
  return "neutral";
}

function stepClass(status: EodStepLog["status"]) {
  if (status === "ok") return "border-emerald-500/40 bg-emerald-500/10";
  if (status === "running") return "border-amber-500/50 bg-amber-500/10";
  if (status === "blocked") return "border-red-500/50 bg-red-500/10";
  return "border-[hsl(var(--border))]";
}

export default function OpsDeskPage() {
  const { fund, fundId, asOf, setAsOf, role } = useDesk();
  const { canWrite } = usePermissions();
  const book = useBook();
  const {
    positions,
    source,
    metrics,
    cashPosition,
    valuationReport,
    reconciliation,
    snapshots,
    webhookUrl,
    taFlows,
    setValuationReport,
    adoptCustodian,
    applyTaImport,
    appendSnapshot,
    applyEodBook,
    setWebhookUrl,
  } = book;

  const valInput = useRef<HTMLInputElement>(null);
  const taInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<EodStepLog[]>([]);
  const [eodLog, setEodLog] = useState<string | null>(null);
  const [hookMsg, setHookMsg] = useState<string | null>(null);
  const [fixings, setFixings] = useState<BenchmarkFixing[]>([]);
  const [ticket, setTicket] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);

  const reconCleared =
    reconciliation?.status === "MATCHED" || reconciliation?.status === "PERFECT_MATCH";
  const idleEodSteps: EodStepLog[] = useMemo(
    () => [
      {
        id: "recon",
        title: "Step 1 校验对账",
        status: reconCleared ? "ok" : reconciliation?.status === "BREAK" ? "blocked" : "pending",
        detail: reconCleared
          ? "对账 MATCHED 100%，Step 1 门禁已解除"
          : reconciliation?.status === "BREAK"
            ? `存在 Break，请一键采纳托管行数据或 Checker 强制过账`
            : reconciliation
              ? `当前 ${reconciliation.status}，通过率 ${reconciliation.matchRatePct.toFixed(1)}%`
              : "等待导入估值表并完成对账",
      },
      { id: "engine", title: "Step 2 估值与合规引擎", status: "pending", detail: "" },
      { id: "archive", title: "Step 3 归档 daily_snapshots", status: "pending", detail: "" },
      { id: "roll", title: "Step 4 到期结转并推进 T→T+1", status: "pending", detail: "" },
    ],
    [reconCleared, reconciliation],
  );

  const adoptTape = useCallback(() => {
    adoptCustodian();
    setSteps([]);
    setEodLog(null);
  }, [adoptCustodian]);

  const ingestValuation = useCallback(
    async (file: File) => {
      setParseError(null);
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
        setParseError("仅支持 .xlsx / .xls / .csv");
        return;
      }
      setBusy(true);
      try {
        const buf = await file.arrayBuffer();
        const report = parseValuationWorkbook(buf, file.name);
        if (!report.holdings.length && report.cashBalance == null) {
          setParseError(report.warnings[0] || "解析结果为空");
        }
        setValuationReport(report);
        setSteps([]);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "解析失败");
      } finally {
        setBusy(false);
      }
    },
    [setValuationReport],
  );

  const ingestTa = useCallback(
    async (file: File) => {
      setParseError(null);
      setBusy(true);
      try {
        const buf = await file.arrayBuffer();
        const flows = parseTaWorkbook(buf);
        if (!flows.length) {
          setParseError("TA 文件没有有效申赎行（需 Type SUB/RED 与 Amount）");
          return;
        }
        applyTaImport(flows, "merge");
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "TA 解析失败");
      } finally {
        setBusy(false);
      }
    },
    [applyTaImport],
  );

  async function runEod(force: boolean) {
    setEodLog(null);
    const skeleton: EodStepLog[] = [
      { id: "recon", title: "Step 1 校验对账", status: "running", detail: "检查 Break…" },
      { id: "engine", title: "Step 2 估值与合规引擎", status: "pending", detail: "" },
      { id: "archive", title: "Step 3 归档 daily_snapshots", status: "pending", detail: "" },
      { id: "roll", title: "Step 4 到期结转并推进 T→T+1", status: "pending", detail: "" },
    ];
    setSteps(skeleton);
    await new Promise((r) => setTimeout(r, 280));
    const result = runEodPipeline({
      fundId,
      fundCode: fund.code,
      ccy: fund.ccy,
      asOf,
      positions,
      recon: reconciliation,
      force,
    });
    for (let i = 0; i < result.steps.length; i++) {
      setSteps(result.steps.slice(0, i + 1).concat(skeleton.slice(i + 1).map((s) => ({ ...s, status: "pending" as const }))));
      await new Promise((r) => setTimeout(r, 240));
    }
    setSteps(result.steps);
    if (!result.ok) {
      setEodLog(result.steps.find((s) => s.status === "blocked")?.detail ?? "已阻断");
      return;
    }
    if (result.snapshot) appendSnapshot(result.snapshot);
    applyEodBook(result.nextPositions);
    setAsOf(result.nextAsOf);
    setValuationReport(null);
    setEodLog(`日终完成。基准日已推进至 ${result.nextAsOf}。下一交易日请重新导入估值表。`);
    if (webhookUrl.trim()) {
      const hook = await postOpsWebhook(webhookUrl, result.webhookPayload);
      setHookMsg(hook.ok ? `Webhook 已发送 · ${hook.detail}` : `Webhook 未送达 · ${hook.detail}`);
    }
  }

  const passRate = reconciliation?.matchRatePct ?? 0;
  const fundSnaps = useMemo(() => snapshots.filter((s) => s.fundId === fundId), [snapshots, fundId]);

  return (
    <AppShell
      title="运营台 · 估值对账 / 日终"
      subtitle={`${fund.name} · 托管行估值表解析 · 智能对账 · TA 申赎 · EOD Pipeline`}
      source={source}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? <ValuationUploader /> : null}
          {canWrite ? (
            <Button variant="ghost" onClick={() => setAsOf(PRODUCT_AS_OF)}>
              重置估值日 {PRODUCT_AS_OF}
            </Button>
          ) : null}
        </div>
      }
    >
      {parseError ? <p className="text-xs text-red-400">{parseError}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">估值表导入与对账中心</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadCustodianTemplate(positions, asOf, fund.code)}>
                下载托管行模板
              </Button>
              <Button variant="outline" onClick={() => downloadBociValuationTemplate(positions, asOf, fund.code)}>
                下载 BOCI / 保诚双行模板
              </Button>
              {canWrite ? (
              <Button
                variant="outline"
                onClick={() => {
                  setValuationReport(syntheticCustodianReport(positions, asOf));
                  setSteps([]);
                  setEodLog(null);
                }}
              >
                加载演示差异
              </Button>
              ) : null}
            </div>
          </div>
          {canWrite ? (
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
              if (file) void ingestValuation(file);
            }}
          >
            <p>拖拽 HSBC / BOCI / CITI 估值表 (.xlsx .xls .csv)</p>
            <Button variant="outline" className="mt-2" disabled={busy} onClick={() => valInput.current?.click()}>
              选择文件
            </Button>
            <input
              ref={valInput}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void ingestValuation(file);
              }}
            />
          </div>
          ) : (
            <p className="mb-3 text-[11px] text-[hsl(var(--muted-foreground))]">只读账户可查看对账结果，导入估值表需交易员或管理员权限。</p>
          )}
          {valuationReport ? (
            <p className="mb-2 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
              {valuationReport.custodian} · {valuationReport.fileName} · {valuationReport.holdings.length} 行 · 现金{" "}
              {valuationReport.cashBalance == null ? "—" : moneyFull(valuationReport.cashBalance, fund.ccy)}
            </p>
          ) : (
            <p className="mb-2 text-[11px] text-[hsl(var(--muted-foreground))]">尚未导入托管行报表。</p>
          )}
          {valuationReport?.warnings.map((w, i) => (
            <p key={`${w}-${i}`} className="text-[11px] text-amber-400">
              {w}
            </p>
          ))}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Card className="p-3">
              <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">对账通过率</p>
              <p
                className={cn(
                  "font-mono text-xl",
                  reconCleared ? "text-emerald-400" : reconciliation?.status === "BREAK" ? "text-red-400" : "text-amber-400",
                )}
              >
                {reconciliation ? `${passRate.toFixed(1)}%` : "—"}
              </p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">状态</p>
              <Badge tone={reconTone(reconciliation?.status)} className="mt-1">
                {reconciliation?.status ?? "PENDING"}
              </Badge>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Breaks</p>
              <p className="font-mono text-xl">{reconciliation?.breaks.length ?? 0}</p>
            </Card>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-[hsl(var(--muted))]">
            <div
              className={cn(
                "h-full",
                reconTone(reconciliation?.status) === "breach"
                  ? "bg-red-500"
                  : reconTone(reconciliation?.status) === "watch"
                    ? "bg-amber-400"
                    : "bg-emerald-500",
              )}
              style={{ width: `${reconciliation ? passRate : 0}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {canWrite ? (
            <Button variant="accent" disabled={!valuationReport} onClick={adoptTape}>
              一键采纳托管行数据
            </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={!reconciliation?.breaks.length}
              onClick={() => {
                const blob = new Blob([JSON.stringify(reconciliation, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${fund.code}_recon_ticket_${asOf}.json`;
                a.click();
                setTicket(a.download);
              }}
            >
              生成差异工单
            </Button>
          </div>
          {ticket ? <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">已下载 {ticket}</p> : null}

          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-[hsl(var(--card))] font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="py-1">维度</th>
                  <th>标的</th>
                  <th>内部</th>
                  <th>托管</th>
                  <th>差额</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {(reconciliation?.breaks ?? []).map((b, i) => (
                  <tr key={`${b.id}-${i}`} className="border-t border-[hsl(var(--border))]">
                    <td className="py-1">
                      <Badge tone={b.severity === "BREAK" ? "breach" : "watch"}>{b.dimension}</Badge>
                    </td>
                    <td className="font-mono">{b.key}</td>
                    <td className="font-mono">{b.internal.toFixed(2)}</td>
                    <td className="font-mono">{b.custodian.toFixed(2)}</td>
                    <td className={cn("font-mono", b.diff === 0 ? "" : "text-amber-400")}>{b.diff.toFixed(2)}</td>
                    <td className="text-[hsl(var(--muted-foreground))]">{b.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reconciliation && !reconciliation.breaks.length ? (
              <p className="py-3 text-center text-xs text-emerald-400">MATCHED · 现金 / 面值 / 应计 / NAV 均在容差内 · 通过率 100%</p>
            ) : null}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">TA 申赎 · 基准利率</h2>
            <div className="mb-2 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadTaTemplate(asOf, fund.code)}>
                下载 TA 模板
              </Button>
              {canWrite ? (
              <Button variant="outline" onClick={() => taInput.current?.click()}>
                导入申赎清单
              </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  void syncBenchmarks(asOf).then(setFixings);
                }}
              >
                同步 SOFR / HIBOR / SHIBOR
              </Button>
              <input
                ref={taInput}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void ingestTa(file);
                }}
              />
            </div>
            <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
              已确认 TA {taFlows.filter((f) => f.confirmed).length} 笔 · T+0 可用 {moneyFull(cashPosition.t0Available, fund.ccy)}
            </p>
            <div className="mt-2 max-h-28 overflow-auto text-[11px]">
              {taFlows.slice(0, 8).map((f) => (
                <p key={f.id} className="font-mono">
                  {f.settlementDate} {f.type} {f.investorCode} {moneyFull(f.amount, fund.ccy)}
                </p>
              ))}
            </div>
            {fixings.length ? (
              <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px]">
                {fixings.map((f) => (
                  <span key={`${f.index}-${f.tenor}`}>
                    {f.index} {f.tenor} {f.ratePct.toFixed(2)}%
                  </span>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">日终结算 EOD Run</h2>
            <p className="mb-3 text-[11px] text-[hsl(var(--muted-foreground))]">
              当前估值日 {asOf} · NAV {metrics.officialNav.toFixed(5)} · AUM {moneyFull(metrics.aum, fund.ccy)} · WAM{" "}
              {metrics.wamDays.toFixed(1)}d · WAL {metrics.walDays.toFixed(1)}d · DLA {metrics.dlaPct.toFixed(2)}% · WLA{" "}
              {metrics.wlaPct.toFixed(2)}% · 偏离 {metrics.deviationPct.toFixed(3)}%
            </p>
            <div className="mb-3 space-y-2">
              {(steps.length ? steps : idleEodSteps).map((s, i) => (
                <div key={`${s.id}-${i}`} className={cn("rounded-md border px-3 py-2 text-xs", stepClass(s.status))}>
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {i + 1}. {s.title}
                    </span>
                    <Badge tone={s.status === "ok" ? "ok" : s.status === "blocked" ? "breach" : s.status === "running" ? "watch" : "neutral"}>
                      {s.status}
                    </Badge>
                  </div>
                  {s.detail ? <p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{s.detail}</p> : null}
                </div>
              ))}
            </div>
            <div className="mb-3">
              <Label className="text-[11px]">Webhook（飞书 / 企业微信 / Slack）</Label>
              <Input
                className="mt-1"
                placeholder="https://…"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {canWrite ? (
              <Button variant="accent" onClick={() => void runEod(false)}>
                运行日终
              </Button>
              ) : null}
              {canWrite ? (
              <Button
                variant="danger"
                onClick={() => setForceOpen(true)}
              >
                Checker 强制过账
              </Button>
              ) : null}
            </div>
            {eodLog ? <p className="mt-2 text-xs text-amber-300">{eodLog}</p> : null}
            {hookMsg ? <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{hookMsg}</p> : null}
            <div className="mt-3">
              <p className="mb-1 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">历史快照</p>
              {fundSnaps.slice(0, 6).map((s, i) => (
                <p key={`${s.id}-${i}`} className="font-mono text-[10px]">
                  {s.asOf} · {s.reconStatus} · WAM {s.metrics.wamDays.toFixed(1)}d · 偏离 {s.metrics.deviationPct.toFixed(3)}%
                </p>
              ))}
              {!fundSnaps.length ? <p className="text-[11px] text-[hsl(var(--muted-foreground))]">尚无归档。</p> : null}
            </div>
          </Card>
        </div>
      </div>
      {forceOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <Card className="w-full max-w-md p-4">
            <h2 className="text-sm font-semibold">Checker 强制过账</h2>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              将跳过 Step 1 对账校验（即使存在 Break 或尚未 MATCHED），直接执行 Step 2 估值合规、Step 3 快照归档、Step 4
              到期结转。当前角色：{role === "checker" ? "Risk Checker" : "PM Maker"}。确认继续？
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForceOpen(false)}>
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setForceOpen(false);
                  void runEod(true);
                }}
              >
                确认强制过账
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
