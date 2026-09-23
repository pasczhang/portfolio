import { businessDaysBetween, calendarOfCcy } from "@/lib/engine/dayCount";
import { computeWamWal } from "@/lib/engine/durationCalculator";
import { computeValuation } from "@/lib/engine/valuationEngine";
import { computeLiquidity, runCompliance } from "@/lib/engine/complianceEngine";
import { computePortfolioDuration, toUnifiedHoldings } from "@/lib/holdings/unified";
import type { BookMetrics, BookPosition } from "@/lib/holdings/types";

export function computeBookMetrics(positions: BookPosition[], asOf: string): BookMetrics {
  const duration = computePortfolioDuration(positions, asOf);
  const liq = computeLiquidity(positions, asOf);
  const val = computeValuation(positions, asOf);
  const securities = positions.reduce((s, p) => s + p.amortizedCost, 0);
  const cash = positions
    .filter((p) => p.assetType === "Cash / Bank Deposit" && businessDaysBetween(asOf, p.maturityDate, calendarOfCcy(p.currency)) <= 1)
    .reduce((s, p) => s + p.amortizedCost, 0);
  const aum = Math.max(securities, 1);
  const portfolioYieldPct =
    positions.reduce((s, p) => s + p.amortizedCost * p.couponRatePct, 0) / aum;
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
    cashRatio: duration.cashRatio,
    bondRatio: duration.bondRatio,
    depositRatio: duration.depositRatio,
    repoRatio: duration.repoRatio,
    dlaPct: liq.dlaPct,
    wlaPct: liq.wlaPct,
    portfolioYieldPct: Number(portfolioYieldPct.toFixed(2)),
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
