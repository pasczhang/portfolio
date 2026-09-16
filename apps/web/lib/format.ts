import type { FundCcy } from "@/lib/fund";

export const HKD_PER_USD = 7.8;

export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Demo book is USD; HKD share class is shown at a 7.80 peg for desk display. */
export function bookToFund(usdAmount: number | string, ccy: FundCcy): number {
  const n = num(usdAmount);
  return ccy === "HKD" ? n * HKD_PER_USD : n;
}

function nativeMoney(amount: number | string, ccy: FundCcy, digits: number): string {
  return new Intl.NumberFormat(ccy === "HKD" ? "en-HK" : "en-US", {
    style: "currency",
    currency: ccy,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num(amount));
}

export function money(amount: number | string, ccy: FundCcy = "USD", digits = 0): string {
  return nativeMoney(amount, ccy, digits);
}

/** Format a position in the desk share-class currency (USD book × 7.80; native HKD left as-is). */
export function moneyPosition(
  amount: number | string,
  positionCcy: string,
  fundCcy: FundCcy,
  digits = 2,
): string {
  if (positionCcy === fundCcy) return nativeMoney(amount, fundCcy, digits);
  if (positionCcy === "HKD" && fundCcy === "USD") return nativeMoney(num(amount) / HKD_PER_USD, "USD", digits);
  if (positionCcy === "USD" && fundCcy === "HKD") return nativeMoney(num(amount) * HKD_PER_USD, "HKD", digits);
  return nativeMoney(amount, fundCcy, digits);
}

export function moneyNative(amount: number | string, ccy: FundCcy = "USD", digits = 0): string {
  return nativeMoney(amount, ccy, digits);
}

export function moneyFull(amount: number | string, ccy: FundCcy = "USD"): string {
  return money(amount, ccy, 2);
}

export function signedMoney(amount: number | string, ccy: FundCcy = "USD"): string {
  const n = num(amount);
  const txt = moneyFull(Math.abs(n), ccy);
  if (n > 0) return `+${txt}`;
  if (n < 0) return `−${txt}`;
  return txt;
}

export function usd(value: number | string): string {
  return money(value, "USD", 0);
}

export function usdFull(value: number | string): string {
  return moneyFull(value, "USD");
}
export function navPx(value: number | string): string {
  return num(value).toFixed(4);
}

export function navPx5(value: number | string): string {
  return num(value).toFixed(5);
}

export function daysFmt(value: number | string): string {
  return `${num(value).toFixed(1)}d`;
}

export function pctFmt(value: number | string, digits = 2): string {
  return `${num(value).toFixed(digits)}%`;
}

export function bpsFmt(value: number | string): string {
  return `${num(value).toFixed(1)} bps`;
}

export function signedUsd(value: number): string {
  const formatted = usdFull(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted.replace("$", "$")}`;
  return formatted;
}
