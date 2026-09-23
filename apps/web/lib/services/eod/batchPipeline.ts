import { addDays } from "@/lib/holdings/dates";
import { isDemandCash, settlementProceeds } from "@/lib/holdings/cashPosition";
import { residualDays } from "@/lib/holdings/calculator";
import { runPortfolioEngine } from "@/lib/engine/bookMetrics";
import type { BookCcy, BookPosition } from "@/lib/holdings/types";
import type {
  DailySnapshot,
  EodRunResult,
  EodStepLog,
  OpsWebhookPayload,
  ReconciliationResult,
} from "@/lib/services/types";

export function rollMaturedToCash(positions: BookPosition[], asOf: string): BookPosition[] {
  let proceeds = 0;
  const kept: BookPosition[] = [];
  for (const p of positions) {
    if (isDemandCash(p, asOf)) {
      kept.push(p);
      continue;
    }
    if (residualDays(p, asOf) <= 0) {
      proceeds += settlementProceeds(p, asOf);
      continue;
    }
    kept.push(p);
  }
  if (proceeds === 0) return kept;
  const cashIdx = kept.findIndex((p) => isDemandCash(p, asOf));
  if (cashIdx >= 0) {
    const cash = kept[cashIdx]!;
    const nextAmt = cash.amortizedCost + proceeds;
    kept[cashIdx] = { ...cash, parValue: nextAmt, amortizedCost: nextAmt, shadowMtm: nextAmt };
    return kept;
  }
  const proto = positions[0];
  const ccy = proto?.currency ?? "USD";
  kept.unshift({
    securityId: ccy === "HKD" ? "CASH-HKD-CUSTODY" : "CASH-USD-CUSTODY",
    assetName: "Custodian Demand Deposit",
    assetType: "Cash / Bank Deposit",
    currency: ccy,
    counterparty: "Custodian",
    isin: "",
    issueDate: addDays(asOf, 1),
    maturityDate: addDays(asOf, 1),
    parValue: proceeds,
    amortizedCost: proceeds,
    shadowMtm: proceeds,
    couponRatePct: 0,
    couponType: "fixed",
    resetDate: null,
    rating: "A-1+",
    dayCount: ccy === "HKD" ? "Act/365" : "Act/360",
  });
  return kept;
}

export function buildWebhookPayload(
  fundCode: string,
  ccy: BookCcy,
  asOf: string,
  recon: ReconciliationResult | null,
  positions: BookPosition[],
): OpsWebhookPayload {
  const eng = runPortfolioEngine(positions, asOf);
  const m = eng.metrics;
  const top = (recon?.breaks ?? []).slice(0, 5).map((b) => `${b.key} ${b.diff.toFixed(2)}`).join("; ");
  return {
    title: `${fundCode} 日终运营日报`,
    fund: fundCode,
    asOf,
    nav: m.officialNav,
    yield7d: m.portfolioYieldPct,
    wamDays: m.wamDays,
    walDays: m.walDays,
    deviationPct: m.deviationPct,
    deviationStatus: m.deviationStatus,
    dlaPct: m.dlaPct,
    wlaPct: m.wlaPct,
    breakCount: recon?.breaks.length ?? 0,
    reconStatus: recon?.status ?? "SKIPPED",
    breaksSummary: top || "无差异",
    ccy,
  };
}

export function formatWebhookText(p: OpsWebhookPayload): string {
  return [
    `**【${p.title}】**`,
    `日期 ${p.asOf} · ${p.fund}`,
    `NAV ${p.nav.toFixed(5)} · 7日年化 ${p.yield7d.toFixed(2)}%`,
    `WAM ${p.wamDays.toFixed(1)}d · WAL ${p.walDays.toFixed(1)}d · 偏离 ${p.deviationPct.toFixed(3)}% (${p.deviationStatus})`,
    `DLA ${p.dlaPct.toFixed(2)}% · WLA ${p.wlaPct.toFixed(2)}%`,
    `对账 ${p.reconStatus} · Breaks ${p.breakCount}`,
    p.breaksSummary,
  ].join("\n");
}

export async function postOpsWebhook(url: string, payload: OpsWebhookPayload): Promise<{ ok: boolean; detail: string }> {
  if (!url.trim()) return { ok: false, detail: "未配置 Webhook URL" };
  const text = formatWebhookText(payload);
  const body = url.includes("qyapi.weixin")
    ? { msgtype: "markdown", markdown: { content: text } }
    : url.includes("hooks.slack.com")
      ? { text }
      : url.includes("feishu") || url.includes("lark")
        ? { msg_type: "text", content: { text } }
        : { text, ...payload };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, detail: res.ok ? `HTTP ${res.status}` : `HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 120))}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "网络失败（静态站跨域时属预期，请改用服务端转发）" };
  }
}

export function runEodPipeline(input: {
  fundId: string;
  fundCode: string;
  ccy: BookCcy;
  asOf: string;
  positions: BookPosition[];
  recon: ReconciliationResult | null;
  force: boolean;
}): EodRunResult {
  const steps: EodStepLog[] = [
    { id: "recon", title: "Step 1 校验对账", status: "pending", detail: "" },
    { id: "engine", title: "Step 2 估值与合规引擎", status: "pending", detail: "" },
    { id: "archive", title: "Step 3 归档 daily_snapshots", status: "pending", detail: "" },
    { id: "roll", title: "Step 4 到期结转并推进 T→T+1", status: "pending", detail: "" },
  ];
  const recon = input.recon;
  if (input.force) {
    steps[0] = {
      ...steps[0]!,
      status: "ok",
      detail: "Checker 强制过账：已跳过 Step 1 对账校验，继续 Step 2–4",
    };
  } else if (!recon) {
    steps[0] = { ...steps[0]!, status: "blocked", detail: "尚未导入托管行估值表，无法完成对账门禁。可先一键采纳，或由 Checker 强制过账。" };
    return emptyFail(steps, input);
  } else if (recon.status === "BREAK") {
    steps[0] = {
      ...steps[0]!,
      status: "blocked",
      detail: `存在 ${recon.breaks.filter((b) => b.severity === "BREAK").length} 条严重 Break，需一键采纳托管行数据或 Checker 强制过账。`,
    };
    return emptyFail(steps, input);
  } else {
    steps[0] = {
      ...steps[0]!,
      status: "ok",
      detail: `对账 ${recon.status}，通过率 ${recon.matchRatePct.toFixed(1)}%，Step 1 门禁已解除`,
    };
  }

  const eng = runPortfolioEngine(input.positions, input.asOf);
  steps[1] = {
    ...steps[1]!,
    status: "ok",
    detail: `WAM ${eng.metrics.wamDays.toFixed(1)}d · WAL ${eng.metrics.walDays.toFixed(1)}d · 偏离 ${eng.metrics.deviationPct.toFixed(3)}% · DLA ${eng.metrics.dlaPct.toFixed(2)}% · WLA ${eng.metrics.wlaPct.toFixed(2)}%`,
  };

  const snapshot: DailySnapshot = {
    id: `${input.fundId}-${input.asOf}`,
    fundId: input.fundId,
    asOf: input.asOf,
    createdAt: new Date().toISOString(),
    metrics: eng.metrics,
    reconStatus: recon?.status ?? (input.force ? "MATCHED" : "SKIPPED"),
    breakCount: recon?.breaks.length ?? 0,
    notes: steps[1]!.detail,
  };
  steps[2] = { ...steps[2]!, status: "ok", detail: `已写入快照 ${snapshot.id}` };

  const nextAsOf = addDays(input.asOf, 1);
  const nextPositions = rollMaturedToCash(input.positions, input.asOf).map((p) =>
    isDemandCash(p, input.asOf) ? { ...p, issueDate: nextAsOf, maturityDate: nextAsOf } : p,
  );
  steps[3] = {
    ...steps[3]!,
    status: "ok",
    detail: `到期本息已转入托管现金，基准日 ${input.asOf} → ${nextAsOf}`,
  };

  return {
    ok: true,
    blocked: false,
    steps,
    snapshot,
    nextAsOf,
    nextPositions,
    webhookPayload: buildWebhookPayload(input.fundCode, input.ccy, input.asOf, recon, input.positions),
  };
}

function emptyFail(steps: EodStepLog[], input: { fundCode: string; ccy: BookCcy; asOf: string; positions: BookPosition[]; recon: ReconciliationResult | null }): EodRunResult {
  return {
    ok: false,
    blocked: true,
    steps,
    snapshot: null,
    nextAsOf: input.asOf,
    nextPositions: input.positions,
    webhookPayload: buildWebhookPayload(input.fundCode, input.ccy, input.asOf, input.recon, input.positions),
  };
}
