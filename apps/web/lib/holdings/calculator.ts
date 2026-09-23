import { remainingDays } from "@/lib/holdings/dates";
import {
  accruedInterest,
  conventionBase,
  parseDayCount,
} from "@/lib/engine/dayCount";
import { computeWamWal as engineWamWal, wamTenorDays } from "@/lib/engine/durationCalculator";
import { computeLiquidity, isDailyLiquidAsset, isWeeklyLiquidAsset } from "@/lib/engine/complianceEngine";
import { computeBookMetrics } from "@/lib/engine/bookMetrics";
import type { BookMetrics, BookPosition } from "@/lib/holdings/types";

/** Cross-section engine: every figure is a pure function of (positions, asOf). */

export const MATURITY_CUTS = [0, 1, 7, 30, 60, 90] as const;

export const LADDER_LABELS = ["T+0 (0d)", "T+1 (1d)", "2–7d", "8–30d", "31–60d", "61–90d", ">90d"] as const;

export function dayCountBase(pos: BookPosition): number {
  return conventionBase(parseDayCount(pos.dayCount));
}

export function residualDays(pos: BookPosition, asOf: string): number {
  return Math.max(0, remainingDays(asOf, pos.maturityDate));
}

export function wamDaysOf(pos: BookPosition, asOf: string): number {
  return wamTenorDays(pos, asOf);
}

export function isDailyLiquid(pos: BookPosition, asOf: string): boolean {
  return isDailyLiquidAsset(pos, asOf);
}

export function isWeeklyLiquid(pos: BookPosition, asOf: string): boolean {
  return isWeeklyLiquidAsset(pos, asOf);
}

export function bookAum(positions: BookPosition[]): number {
  return positions.reduce((s, p) => {
    if (p.bookRole === "liability" || p.parValue < 0) return s;
    return s + (p.shadowMtm > 0 ? p.shadowMtm : p.amortizedCost);
  }, 0);
}

/** WAM / WAL — market-value weighted (FRN reset vs legal maturity). */
export function computeWamWal(positions: BookPosition[], asOf: string): { wamDays: number; walDays: number } {
  const { wamDays, walDays } = engineWamWal(positions, asOf);
  return { wamDays, walDays };
}

/** DLA / WLA — 1 / 5 business-day SFC buckets. */
export function computeDlaWla(positions: BookPosition[], asOf: string): { dlaPct: number; wlaPct: number; dlaAmt: number; wlaAmt: number } {
  const { dlaPct, wlaPct, dlaAmt, wlaAmt } = computeLiquidity(positions, asOf);
  return { dlaPct, wlaPct, dlaAmt, wlaAmt };
}

/** Remaining principal + accrued coupon to stated maturity (day-count convention). */
export function maturityProceeds(pos: BookPosition, asOf: string): number {
  const coupon = accruedInterest(pos.parValue, pos.couponRatePct, asOf, pos.maturityDate, parseDayCount(pos.dayCount));
  return pos.parValue + coupon;
}

export function ladderBucketIndex(days: number): number {
  if (days <= 0) return 0;
  if (days <= 1) return 1;
  if (days <= 7) return 2;
  if (days <= 30) return 3;
  if (days <= 60) return 4;
  if (days <= 90) return 5;
  return 6;
}

export type LadderSlice = {
  bucket: string;
  daysMax: number | null;
  td: number;
  cd: number;
  govt: number;
  total: number;
  pct: number;
};

function stackOf(p: BookPosition): "td" | "cd" | "govt" {
  if (p.assetType === "Govt Bills") return "govt";
  if (p.assetType === "NCD" || p.assetType === "Commercial Paper") return "cd";
  return "td";
}

/** Maturity cash ladder — cuts [0, 1, 7, 30, 60, 90, >90], amounts = 到期本息. */
export function computeMaturityLadder(positions: BookPosition[], asOf: string): LadderSlice[] {
  const aum = Math.max(bookAum(positions), 1);
  const bins = LADDER_LABELS.map((bucket) => ({ bucket, td: 0, cd: 0, govt: 0 }));
  for (const p of positions) {
    const i = ladderBucketIndex(residualDays(p, asOf));
    bins[i][stackOf(p)] += maturityProceeds(p, asOf);
  }
  const caps: (number | null)[] = [0, 1, 7, 30, 60, 90, null];
  return bins.map((row, i) => {
    const total = row.td + row.cd + row.govt;
    return { ...row, daysMax: caps[i], total, pct: (total / aum) * 100 };
  });
}

export type GroupSlice = { key: string; amount: number; pct: number; count: number };

function groupBy(positions: BookPosition[], keyOf: (p: BookPosition) => string): GroupSlice[] {
  const aum = Math.max(bookAum(positions), 1);
  const map = new Map<string, { amount: number; count: number }>();
  for (const p of positions) {
    const key = keyOf(p) || "—";
    const cur = map.get(key) ?? { amount: 0, count: 0 };
    cur.amount += p.amortizedCost;
    cur.count += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, amount: v.amount, pct: (v.amount / aum) * 100, count: v.count }))
    .sort((a, b) => b.amount - a.amount);
}

export function groupByIssuer(positions: BookPosition[]): GroupSlice[] {
  return groupBy(positions, (p) => p.counterparty);
}

export function groupByRating(positions: BookPosition[]): GroupSlice[] {
  return groupBy(positions, (p) => p.rating || "NR");
}

export function computeMetrics(positions: BookPosition[], asOf: string): BookMetrics {
  return computeBookMetrics(positions, asOf);
}

export type BookSnapshot = {
  metrics: BookMetrics;
  ladder: LadderSlice[];
  issuers: GroupSlice[];
  ratings: GroupSlice[];
};

export function computeBookSnapshot(positions: BookPosition[], asOf: string): BookSnapshot {
  return {
    metrics: computeMetrics(positions, asOf),
    ladder: computeMaturityLadder(positions, asOf),
    issuers: groupByIssuer(positions),
    ratings: groupByRating(positions),
  };
}

export function modifiedDuration(wamDays: number): number {
  return wamDays / 365;
}

export function dv01(aum: number, wamDays: number): number {
  return aum * modifiedDuration(wamDays) * 0.0001;
}
