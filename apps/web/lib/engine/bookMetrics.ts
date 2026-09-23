import { businessDaysBetween, calendarOfCcy } from "@/lib/engine/dayCount";
import { computeWamWal } from "@/lib/engine/durationCalculator";
import { computeValuation } from "@/lib/engine/valuationEngine";
import { computeLiquidity, runCompliance } from "@/lib/engine/complianceEngine";
import { computePortfolioDuration, toUnifiedHoldings } from "@/lib/holdings/unified";
import { calculatePortfolioRisk, carryingValue, isLiabilityPosition } from "@/lib/engine/portfolioLedger";
import type { BookMetrics, BookPosition } from "@/lib/holdings/types";

export function computeBookMetrics(positions: BookPosition[], asOf: string): BookMetrics {
  const assets = positions.filter((p) => !isLiabilityPosition(p));
  const duration = computePortfolioDuration(assets, asOf);
  const liq = computeLiquidity(assets, asOf);
  const val = computeValuation(assets, asOf);
  const risk = calculatePortfolioRisk(positions, asOf);
  const securities = assets.reduce((s, p) => s + carryingValue(p), 0);
  const cash = assets
    .filter((p) => p.assetType === "Cash / Bank Deposit" && businessDaysBetween(asOf, p.maturityDate, calendarOfCcy(p.currency)) <= 1)
    .reduce((s, p) => s + carryingValue(p), 0);
  const aum = Math.max(risk.nav, risk.totalAssets, 1);
  const portfolioYieldPct =
    assets.reduce((s, p) => s + carryingValue(p) * p.couponRatePct, 0) / Math.max(risk.totalAssets, 1);
  return {
    asOf,
    aum,
    cash,
    securities,
    officialNav: val.amortizedNav,
    shadowNav: val.shadowNav,
    deviationBps: val.deviationBps,
    deviationPct: val.deviationPct,
    deviationStatus: val.status,
    wamDays: duration.wamDays,
    walDays: duration.walDays,
    cashRatio: risk.allocation.cashPct,
    bondRatio: risk.allocation.bondPct,
    depositRatio: risk.allocation.depositPct,
    repoRatio: risk.allocation.repoPct,
    dlaPct: liq.dlaPct,
    wlaPct: liq.wlaPct,
    portfolioYieldPct: Number(portfolioYieldPct.toFixed(4)),
    modifiedDuration: risk.modifiedDuration,
    dv01: risk.dv01,
    weightedYtm: risk.weightedYtm,
    leveragePct: risk.leveragePct,
    totalAssets: risk.totalAssets,
    nav: risk.nav,
    repoLiabilities: risk.repoLiabilities,
  };
}

export function runPortfolioEngine(positions: BookPosition[], asOf: string) {
  const duration = computeWamWal(positions, asOf);
  const portfolioDuration = computePortfolioDuration(positions, asOf);
  const valuation = computeValuation(positions, asOf);
  const liquidity = computeLiquidity(positions, asOf);
  const compliance = runCompliance(positions, asOf);
  return {
    metrics: computeBookMetrics(positions, asOf),
    valuation,
    duration,
    portfolioDuration,
    unifiedHoldings: toUnifiedHoldings(positions, asOf),
    liquidity,
    compliance,
    marketValue: duration.totalMarketValue,
  };
}
