import { daysBetween } from "@/lib/holdings/dates";
import type { BookMetrics, BookPosition } from "@/lib/holdings/types";

export function residualDays(pos: BookPosition, asOf: string): number {
  return Math.max(0, daysBetween(asOf, pos.maturityDate));
}

export function wamDaysOf(pos: BookPosition, asOf: string): number {
  if (pos.assetType === "Cash / Bank Deposit" || pos.assetType === "Reverse Repo") {
    const d = residualDays(pos, asOf);
    return Math.min(d, 1) || 1;
  }
  if (pos.couponType === "floating" && pos.resetDate && pos.resetDate > asOf) {
    return Math.max(1, daysBetween(asOf, pos.resetDate));
  }
  return Math.max(1, residualDays(pos, asOf));
}

export function isDailyLiquid(pos: BookPosition, asOf: string): boolean {
  const d = residualDays(pos, asOf);
  return pos.assetType === "Reverse Repo" || (pos.assetType === "Cash / Bank Deposit" && d <= 1) || d <= 1;
}

export function isWeeklyLiquid(pos: BookPosition, asOf: string): boolean {
  if (isDailyLiquid(pos, asOf)) return true;
  if (pos.assetType === "Govt Bills") return residualDays(pos, asOf) <= 397;
  return residualDays(pos, asOf) <= 7;
}

export function computeMetrics(positions: BookPosition[], asOf: string): BookMetrics {
  const securities = positions.reduce((s, p) => s + p.amortizedCost, 0);
  const cash = positions
    .filter((p) => p.assetType === "Cash / Bank Deposit" && residualDays(p, asOf) <= 1)
    .reduce((s, p) => s + p.amortizedCost, 0);
  const aum = Math.max(securities, 1);
  const shadowAum = positions.reduce((s, p) => s + p.shadowMtm, 0);
  const wamDays = positions.reduce((s, p) => s + p.amortizedCost * wamDaysOf(p, asOf), 0) / aum;
  const walDays = positions.reduce((s, p) => s + p.amortizedCost * Math.max(1, residualDays(p, asOf)), 0) / aum;
  const dlaPct = (positions.filter((p) => isDailyLiquid(p, asOf)).reduce((s, p) => s + p.amortizedCost, 0) / aum) * 100;
  const wlaPct = (positions.filter((p) => isWeeklyLiquid(p, asOf)).reduce((s, p) => s + p.amortizedCost, 0) / aum) * 100;
  const portfolioYieldPct = positions.reduce((s, p) => s + p.amortizedCost * p.couponRatePct, 0) / aum;
  const officialNav = 1;
  const shadowNav = Number((shadowAum / aum).toFixed(5));
  const deviationBps = Number((((shadowNav - officialNav) * 10_000).toFixed(1)));
  const abs = Math.abs(deviationBps);
  const deviationStatus = abs >= 50 ? "BREACH" : abs >= 20 ? "WARNING" : "OK";
  return {
    asOf,
    aum,
    cash,
    securities,
    officialNav,
    shadowNav,
    deviationBps,
    deviationStatus,
    wamDays: Number(wamDays.toFixed(2)),
    walDays: Number(walDays.toFixed(2)),
    dlaPct: Number(dlaPct.toFixed(2)),
    wlaPct: Number(wlaPct.toFixed(2)),
    portfolioYieldPct: Number(portfolioYieldPct.toFixed(2)),
  };
}
