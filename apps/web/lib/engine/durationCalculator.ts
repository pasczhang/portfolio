import { daysBetween } from "@/lib/holdings/dates";
import type { BookPosition } from "@/lib/holdings/types";

function marketValue(p: BookPosition): number {
  if (p.bookRole === "liability" || p.parValue < 0) return 0;
  return p.shadowMtm > 0 ? p.shadowMtm : p.amortizedCost;
}

function calendarDays(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to));
}

/** Demand cash / nostro: 0 remaining tenor for WAM/WAL. Overnight TD and repo keep legal/reset days. */
function isZeroTenorCash(pos: BookPosition): boolean {
  if (/CASH-/i.test(pos.securityId)) return true;
  if (pos.assetType !== "Cash / Bank Deposit") return false;
  return /custodian|demand|call|cash ac|cash at|bank balance|current account|银行存款|托管现金|\bcash\b/i.test(
    pos.assetName,
  );
}

/** Interest-rate tenor: cash → 0; FRN → next coupon reset; else legal maturity. */
export function wamTenorDays(pos: BookPosition, asOf: string): number {
  if (isZeroTenorCash(pos)) return 0;
  if (pos.couponType === "floating" && pos.resetDate && pos.resetDate > asOf) {
    return calendarDays(asOf, pos.resetDate);
  }
  if (!pos.maturityDate) return 0;
  return calendarDays(asOf, pos.maturityDate);
}

/** Credit/legal life: cash → 0; otherwise legal final maturity. */
export function walTenorDays(pos: BookPosition, asOf: string): number {
  if (isZeroTenorCash(pos)) return 0;
  if (!pos.maturityDate) return 0;
  return calendarDays(asOf, pos.maturityDate);
}

export type DurationResult = {
  wamDays: number;
  walDays: number;
  totalMarketValue: number;
};

export function computeWamWal(positions: BookPosition[], asOf: string): DurationResult {
  const totalMarketValue = positions.reduce((s, p) => s + marketValue(p), 0);
  const den = totalMarketValue > 0 ? totalMarketValue : 1;
  const wamDays = positions.reduce((s, p) => s + (marketValue(p) / den) * wamTenorDays(p, asOf), 0);
  const walDays = positions.reduce((s, p) => s + (marketValue(p) / den) * walTenorDays(p, asOf), 0);
  return {
    wamDays: Number(wamDays.toFixed(2)),
    walDays: Number(walDays.toFixed(2)),
    totalMarketValue,
  };
}
