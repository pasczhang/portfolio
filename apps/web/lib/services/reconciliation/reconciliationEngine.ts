import { isDemandCash } from "@/lib/holdings/cashPosition";
import { valuePosition } from "@/lib/engine/valuationEngine";
import type { BookPosition } from "@/lib/holdings/types";
import { pairHoldings } from "@/lib/services/reconciliation/matching";
import type { ParsedValuationReport, ReconBreak, ReconciliationResult } from "@/lib/services/types";

function isBociTape(report: ParsedValuationReport): boolean {
  return report.template === "BOCI_USD_MMF" || report.template === "BOCI_PRUDENTIAL";
}

const CASH_PERFECT = 0.01;
const CASH_WARN = 1;
const PAR_WARN = 1;
const ACCRUED_WARN = 50;
const NAV_WARN = 1;

function severity(abs: number, warn: number, breakAt: number): "WARNING" | "BREAK" | null {
  if (abs <= 1e-9) return null;
  if (abs <= warn) return "WARNING";
  if (abs > breakAt) return "BREAK";
  return "WARNING";
}

function push(
  breaks: ReconBreak[],
  dimension: ReconBreak["dimension"],
  key: string,
  label: string,
  internal: number,
  custodian: number,
  reason: string,
  warn: number,
  hard: number,
) {
  const diff = internal - custodian;
  const sev = severity(Math.abs(diff), warn, hard);
  if (!sev) return;
  breaks.push({
    id: `${dimension}-${key}`,
    dimension,
    key,
    label,
    internal,
    custodian,
    diff,
    reason,
    severity: sev,
  });
}

function snapshotTotals(positions: BookPosition[], report: ParsedValuationReport, asOf: string) {
  const cashInternal = positions.filter((p) => isDemandCash(p, asOf)).reduce((s, p) => s + p.amortizedCost, 0);
  const cashFromHoldings = report.holdings
    .filter((h) => h.assetClass === "CASH" || (h.assetClass === "DEPOSIT" && /cash|demand|custody/i.test(h.name)))
    .reduce((s, h) => s + h.amortizedCost, 0);
  const cashCustodian = report.cashBalance != null ? report.cashBalance : cashFromHoldings || null;
  const navInternal = positions.reduce((s, p) => s + p.amortizedCost, 0);
  const navCustodian =
    report.nav ??
    report.holdings.reduce((s, h) => s + (isBociTape(report) ? h.amortizedCost : h.marketValue), 0) +
      (report.cashBalance ?? 0);
  const parInternal = positions.filter((p) => !isDemandCash(p, asOf)).reduce((s, p) => s + p.parValue, 0);
  const parCustodian = report.holdings.reduce((s, h) => s + h.parValue, 0);
  const accruedInternal = positions.filter((p) => !isDemandCash(p, asOf)).reduce((s, p) => s + valuePosition(p, asOf).accrued, 0);
  const accruedCustodian = report.holdings.reduce((s, h) => s + h.accruedInterest, 0);
  return {
    cashInternal,
    cashCustodian,
    navInternal,
    navCustodian,
    parInternal,
    parCustodian,
    accruedInternal,
    accruedCustodian,
    unitsInternal: navInternal,
    yieldPer10k: Number((((positions.reduce((s, p) => s + p.amortizedCost * p.couponRatePct, 0) / Math.max(navInternal, 1)) / 100 / 365) * 10_000).toFixed(4)),
  };
}

export function matchedRecon(positions: BookPosition[], report: ParsedValuationReport, asOf: string): ReconciliationResult {
  const t = snapshotTotals(positions, report, asOf);
  const compared = positions.filter((p) => !isDemandCash(p, asOf)).length + 1;
  return {
    asOf,
    status: "MATCHED",
    matchRatePct: 100,
    compared: Math.max(compared, 1),
    breaks: [],
    ...t,
  };
}

export function reconcileValuation(
  positions: BookPosition[],
  report: ParsedValuationReport,
  asOf: string,
): ReconciliationResult {
  if (report.bookSynced) return matchedRecon(positions, report, asOf);

  const cashInternal = positions.filter((p) => isDemandCash(p, asOf)).reduce((s, p) => s + p.amortizedCost, 0);
  const cashFromHoldings = report.holdings
    .filter((h) => h.assetClass === "CASH" || (h.assetClass === "DEPOSIT" && /cash|demand|custody/i.test(h.name)))
    .reduce((s, h) => s + h.amortizedCost, 0);
  const cashCustodian = report.cashBalance != null ? report.cashBalance : cashFromHoldings || null;

  const breaks: ReconBreak[] = [];
  if (cashCustodian != null) {
    push(
      breaks,
      "CASH",
      "CASH",
      "现金结余 Cash Match",
      cashInternal,
      cashCustodian,
      Math.abs(cashInternal - cashCustodian) <= CASH_PERFECT
        ? "在 $0.01 容差内"
        : "内部托管现金 vs 估值表 Cash Balance / 银行存款 / 结算备付金",
      CASH_WARN,
      CASH_WARN,
    );
    const cashBreak = breaks.find((b) => b.dimension === "CASH");
    if (cashBreak && Math.abs(cashBreak.diff) > CASH_PERFECT && Math.abs(cashBreak.diff) <= CASH_WARN) {
      cashBreak.severity = "WARNING";
    } else if (cashBreak && Math.abs(cashBreak.diff) > CASH_PERFECT) {
      cashBreak.severity = "BREAK";
    }
  }

  const pairs = pairHoldings(
    positions.filter((p) => !isDemandCash(p, asOf)),
    report.holdings,
  );
  const used = new Set(pairs.map((x) => x.holdingIndex));
  const pairedIds = new Set(pairs.map((x) => x.internal.securityId));
  let parInternal = 0;
  let parCustodian = 0;
  let accruedInternal = 0;
  let accruedCustodian = 0;

  for (const p of positions) {
    if (isDemandCash(p, asOf)) continue;
    if (isBociTape(report) && !p.isin && !pairedIds.has(p.securityId)) continue;
    parInternal += p.parValue;
    const acc = valuePosition(p, asOf).accrued;
    accruedInternal += acc;
    const pair = pairs.find((x) => x.internal.securityId === p.securityId);
    if (!pair) {
      breaks.push({
        id: `MISSING-${p.securityId}`,
        dimension: "MISSING",
        key: p.securityId,
        label: p.assetName,
        internal: p.parValue,
        custodian: 0,
        diff: p.parValue,
        reason: "托管行估值表缺券（疑漏单 / 交收未入账）",
        severity: "BREAK",
      });
      continue;
    }
    const h = pair.holding;
    parCustodian += h.parValue;
    accruedCustodian += h.accruedInterest;
    push(
      breaks,
      "PAR",
      p.securityId,
      `${p.assetName} 面值`,
      p.parValue,
      h.parValue,
      p.dayCount.includes("365") && /360/.test(h.assetTypeRaw)
        ? "可能混用 ACT/365 与 ACT/360 名义口径"
        : "持仓面值 / Nominal 不一致",
      PAR_WARN,
      PAR_WARN,
    );
    if (
      Math.abs(p.parValue - h.parValue) > PAR_WARN &&
      !(isBociTape(report) && h.accruedInterest === 0)
    ) {
      push(
        breaks,
        "ACCRUED",
        p.securityId,
        `${p.assetName} 应计利息`,
        acc,
        h.accruedInterest,
        `内部 ${p.dayCount} 计提 vs 托管行应计；常见于 ACT/360 vs ACT/365`,
        ACCRUED_WARN,
        ACCRUED_WARN * 4,
      );
    }
  }

  report.holdings.forEach((h, i) => {
    if (used.has(i)) return;
    if (h.assetClass === "CASH") return;
    if (isBociTape(report) && /cash at bank|bank balance|current account/i.test(h.name)) return;
    parCustodian += h.parValue;
    accruedCustodian += h.accruedInterest;
    breaks.push({
      id: `EXTRA-${h.securityId}`,
      dimension: "EXTRA",
      key: h.securityId,
      label: h.name,
      internal: 0,
      custodian: h.parValue,
      diff: -h.parValue,
      reason: "内部账无此券（疑多单 / 已到期未下账）",
      severity: "BREAK",
    });
  });

  const navInternal = positions.reduce((s, p) => s + p.amortizedCost, 0);
  const navCustodian =
    report.nav ??
    report.holdings.reduce((s, h) => s + (isBociTape(report) ? h.amortizedCost : h.marketValue), 0) +
      (report.cashBalance ?? 0);
  const unitsInternal = navInternal;
  const inventoryBroken = breaks.some((b) => b.severity === "BREAK");
  if (!isBociTape(report) && inventoryBroken) {
    push(breaks, "NAV", "NAV", "资产净值 NAV Match", navInternal, navCustodian, "摊余总成本 vs 托管行 NAV / TOTAL NET ASSETS", NAV_WARN, NAV_WARN);
    if (report.units != null) {
      push(breaks, "NAV", "UNITS", "总份额 Units", unitsInternal, report.units, "内部份额（以摊余 AUM 代理）vs 托管行 Units Outstanding", NAV_WARN, 1000);
    }
  }

  const yieldPer10k = Number((((positions.reduce((s, p) => s + p.amortizedCost * p.couponRatePct, 0) / Math.max(navInternal, 1)) / 100 / 365) * 10_000).toFixed(4));

  const compared = positions.filter((p) => !isDemandCash(p, asOf)).length + 1;
  const broken = breaks.filter((b) => b.severity === "BREAK").length;
  const warned = breaks.filter((b) => b.severity === "WARNING").length;
  const status = broken ? "BREAK" : warned ? "WARNING" : "MATCHED";
  const matchRatePct = Number((((compared - broken) / Math.max(compared, 1)) * 100).toFixed(1));

  return {
    asOf,
    status,
    matchRatePct: Math.max(0, Math.min(100, matchRatePct)),
    compared,
    breaks,
    cashInternal,
    cashCustodian,
    parInternal,
    parCustodian,
    accruedInternal,
    accruedCustodian,
    navInternal,
    navCustodian,
    unitsInternal,
    yieldPer10k,
  };
}
