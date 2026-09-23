import type { BookPosition } from "@/lib/holdings/types";
import { accruedInterest, parseDayCount, yearFraction } from "@/lib/engine/dayCount";

export const DEV_NORMAL_PCT = 0.25;
export const DEV_BREACH_PCT = 0.5;

export type DeviationTone = "ok" | "watch" | "breach";

export type PositionValuation = {
  securityId: string;
  accrued: number;
  amortizedCost: number;
  carryingValue: number;
  shadowDirty: number;
  theoreticalDirty: number;
};

export type ValuationResult = {
  amortizedNav: number;
  shadowNav: number;
  deviationPct: number;
  deviationBps: number;
  tone: DeviationTone;
  status: "NORMAL" | "WARNING" | "BREACH";
  positions: PositionValuation[];
};

function moneyMarketDirty(pos: BookPosition, asOf: string): number {
  const conv = parseDayCount(pos.dayCount);
  const yf = yearFraction(asOf, pos.maturityDate, conv);
  const y = pos.couponRatePct / 100;
  if (yf <= 0) return pos.parValue;
  const clean = pos.parValue / (1 + y * yf);
  const accrued = accruedInterest(pos.parValue, pos.couponRatePct, pos.issueDate, asOf, conv);
  if (pos.assetType === "Govt Bills" || pos.assetType === "Commercial Paper") return clean;
  return clean + accrued;
}

export function valuePosition(pos: BookPosition, asOf: string): PositionValuation {
  const conv = parseDayCount(pos.dayCount);
  const accrued = accruedInterest(pos.parValue, pos.couponRatePct, pos.issueDate || asOf, asOf, conv);
  const theoreticalDirty = moneyMarketDirty(pos, asOf);
  const shadowDirty = pos.shadowMtm > 0 ? pos.shadowMtm : theoreticalDirty;
  const amortizedCost = pos.amortizedCost;
  // Book already stores cost + accretion; accrued is disclosed separately to avoid double-count.
  const carryingValue = amortizedCost;
  return {
    securityId: pos.securityId,
    accrued,
    amortizedCost,
    carryingValue,
    shadowDirty,
    theoreticalDirty,
  };
}

export function deviationTone(absPct: number): { tone: DeviationTone; status: ValuationResult["status"] } {
  if (absPct >= DEV_BREACH_PCT) return { tone: "breach", status: "BREACH" };
  if (absPct >= DEV_NORMAL_PCT) return { tone: "watch", status: "WARNING" };
  return { tone: "ok", status: "NORMAL" };
}

export function computeValuation(positions: BookPosition[], asOf: string): ValuationResult {
  const rows = positions.map((p) => valuePosition(p, asOf));
  const amortizedSum = rows.reduce((s, r) => s + r.carryingValue, 0);
  const shadowSum = rows.reduce((s, r) => s + r.shadowDirty, 0);
  const den = amortizedSum > 0 ? amortizedSum : 1;
  const amortizedNav = 1;
  const shadowNav = Number((shadowSum / den).toFixed(6));
  const shadowDen = Math.abs(shadowNav) > 1e-8 ? shadowNav : 1;
  const deviationPct = Number((((amortizedNav - shadowNav) / shadowDen) * 100).toFixed(4));
  const deviationBps = Number((deviationPct * 100).toFixed(1));
  const { tone, status } = deviationTone(Math.abs(deviationPct));
  return { amortizedNav, shadowNav, deviationPct, deviationBps, tone, status, positions: rows };
}
