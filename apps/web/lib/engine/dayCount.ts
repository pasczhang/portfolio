import { addDays, daysBetween } from "@/lib/holdings/dates";

export type DayCountConv = "ACT/360" | "ACT/365" | "ACT/ACT" | "30/360";
export type MarketCalendar = "HK" | "US";

export function parseDayCount(raw: string | undefined | null): DayCountConv {
  const s = (raw ?? "").toUpperCase().replace(/\s+/g, "");
  if (s.includes("30/360") || s.includes("30U/360")) return "30/360";
  if (s.includes("ACT/ACT") || s.includes("ACTUAL/ACTUAL") || s.includes("ACTACT")) return "ACT/ACT";
  if (s.includes("365")) return "ACT/365";
  return "ACT/360";
}

function parts(iso: string): { y: number; m: number; d: number } {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function weekdayUtc(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

const HK_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-02-17",
  "2026-02-18",
  "2026-04-03",
  "2026-04-06",
  "2026-05-01",
  "2026-06-19",
  "2026-07-01",
  "2026-10-01",
  "2026-10-19",
  "2026-12-25",
  "2026-12-26",
]);

const US_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);

export function isHoliday(iso: string, cal: MarketCalendar): boolean {
  return (cal === "HK" ? HK_HOLIDAYS : US_HOLIDAYS).has(iso);
}

export function isBusinessDay(iso: string, cal: MarketCalendar): boolean {
  const wd = weekdayUtc(iso);
  if (wd === 0 || wd === 6) return false;
  return !isHoliday(iso, cal);
}

export function nextBusinessDay(iso: string, cal: MarketCalendar): string {
  let d = iso;
  for (let i = 0; i < 14; i++) {
    if (isBusinessDay(d, cal)) return d;
    d = addDays(d, 1);
  }
  return d;
}

export function addBusinessDays(iso: string, n: number, cal: MarketCalendar): string {
  let d = nextBusinessDay(iso, cal);
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isBusinessDay(d, cal)) left -= 1;
  }
  return d;
}

/** Count business days strictly after `from` up to and including `to`. */
export function businessDaysBetween(from: string, to: string, cal: MarketCalendar): number {
  if (to <= from) return 0;
  let n = 0;
  let d = from;
  while (d < to) {
    d = addDays(d, 1);
    if (isBusinessDay(d, cal)) n += 1;
  }
  return n;
}

export function calendarOfCcy(ccy: string): MarketCalendar {
  return ccy === "HKD" ? "HK" : "US";
}

function thirty360YearFraction(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  let d1 = a.d;
  let d2 = b.d;
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  return (360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1)) / 360;
}

function actActYearFraction(from: string, to: string): number {
  if (to <= from) return 0;
  let acc = 0;
  let cur = from;
  while (cur < to) {
    const y = parts(cur).y;
    const yearEnd = `${y}-12-31`;
    const next = to < addDays(yearEnd, 1) ? to : addDays(yearEnd, 1);
    const den = isLeap(y) ? 366 : 365;
    acc += daysBetween(cur, next) / den;
    cur = next;
  }
  return acc;
}

export function yearFraction(from: string, to: string, conv: DayCountConv): number {
  if (!from || !to || to <= from) return 0;
  const actual = daysBetween(from, to);
  if (conv === "ACT/360") return actual / 360;
  if (conv === "ACT/365") return actual / 365;
  if (conv === "30/360") return thirty360YearFraction(from, to);
  return actActYearFraction(from, to);
}

export function accruedDays(from: string, to: string, conv: DayCountConv): number {
  if (conv === "30/360") return Math.round(thirty360YearFraction(from, to) * 360);
  return Math.max(0, daysBetween(from, to));
}

export function accruedInterest(
  parValue: number,
  couponRatePct: number,
  from: string,
  to: string,
  conv: DayCountConv,
): number {
  return parValue * (couponRatePct / 100) * yearFraction(from, to, conv);
}

export function conventionBase(conv: DayCountConv): number {
  if (conv === "ACT/365" || conv === "ACT/ACT") return 365;
  return 360;
}
