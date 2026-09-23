import { computeWamWal, walTenorDays, wamTenorDays } from "@/lib/engine/durationCalculator";
import type { BookPosition } from "@/lib/holdings/types";
import type { AssetCategory, PortfolioDurationMetrics, UnifiedHoldingPosition } from "@/types/holdings";

export type { AssetCategory, PortfolioDurationMetrics, UnifiedHoldingPosition } from "@/types/holdings";

function dirtyValue(p: BookPosition): number {
  return p.shadowMtm > 0 ? p.shadowMtm : p.amortizedCost;
}

export function assetCategoryOf(p: BookPosition): AssetCategory {
  if (p.assetType === "Reverse Repo" || /\brepo\b|repurchase/i.test(p.assetName)) return "REPO";
  if (/CASH-/i.test(p.securityId)) return "CASH";
  if (p.assetType === "Cash / Bank Deposit") {
    if (/custodian|demand|call|cash ac|cash at|bank balance|current account|银行存款|托管现金|\bcash\b/i.test(p.assetName)) {
      return "CASH";
    }
    return "TIME_DEPOSIT";
  }
  if (p.assetType === "Govt Bills" || p.assetType === "NCD" || p.assetType === "Commercial Paper") return "BOND";
  return "OTHER";
}

export function toUnifiedHolding(p: BookPosition, asOf: string, totalAssetValue: number): UnifiedHoldingPosition {
  const marketValue = dirtyValue(p);
  const den = totalAssetValue > 0 ? totalAssetValue : 1;
  return {
    id: p.securityId,
    assetCategory: assetCategoryOf(p),
    assetCode: p.isin || p.securityId,
    assetName: p.assetName,
    currency: p.currency,
    nominalAmount: p.parValue,
    bookCost: p.amortizedCost,
    marketValue,
    navRatio: Number(((marketValue / den) * 100).toFixed(4)),
    valueDate: p.issueDate || undefined,
    maturityDate: p.maturityDate || undefined,
    couponRate: p.couponRatePct,
    daysToMaturity: wamTenorDays(p, asOf),
  };
}

export function toUnifiedHoldings(positions: BookPosition[], asOf: string, fundNav?: number | null): UnifiedHoldingPosition[] {
  const totalAssetValue =
    fundNav && fundNav > 0 ? fundNav : positions.reduce((s, p) => s + dirtyValue(p), 0);
  return positions.map((p) => toUnifiedHolding(p, asOf, totalAssetValue));
}

export function computePortfolioDuration(
  positions: BookPosition[],
  asOf: string,
  fundNav?: number | null,
): PortfolioDurationMetrics {
  const rows = toUnifiedHoldings(positions, asOf, fundNav);
  const { wamDays, walDays, totalMarketValue } = computeWamWal(positions, asOf);
  const den = totalMarketValue > 0 ? totalMarketValue : 1;
  const sumCat = (cat: AssetCategory) => rows.filter((r) => r.assetCategory === cat).reduce((s, r) => s + r.marketValue, 0);
  return {
    totalAssetValue: totalMarketValue,
    wamDays,
    walDays,
    cashRatio: Number(((sumCat("CASH") / den) * 100).toFixed(2)),
    bondRatio: Number(((sumCat("BOND") / den) * 100).toFixed(2)),
    depositRatio: Number(((sumCat("TIME_DEPOSIT") / den) * 100).toFixed(2)),
    repoRatio: Number(((sumCat("REPO") / den) * 100).toFixed(2)),
  };
}

/** WAL days for a single unified line (legal maturity; cash = 0). */
export function walDaysOfHolding(p: BookPosition, asOf: string): number {
  return walTenorDays(p, asOf);
}
