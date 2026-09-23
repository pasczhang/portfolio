/**
 * 日期与数值转换工具
 */

export function isIsoDate(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const iso = `${y}-${mo}-${d}`;
  return isIsoDate(iso) ? iso : null;
}

export function parseNamedDayMonYear(s: string): string | null {
  if (!s || typeof s !== "string") return null;
  const months: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };
  const match = s.match(/(\d{1,2})[-/ ]?([A-Za-z]{3})[-/ ]?(\d{2,4})/);
  if (!match) return null;

  const day = String(Number(match[1])).padStart(2, "0");
  const monKey = match[2]!.toUpperCase();
  const month = months[monKey];
  if (!month) return null;

  let year = Number(match[3]);
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }
  const iso = `${year}-${month}-${day}`;
  return isIsoDate(iso) ? iso : null;
}

export function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    return excelSerialToIso(value);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(value).trim();
  if (!s) return null;

  const named = parseNamedDayMonYear(s);
  if (named) return named;

  const iso = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) {
    const next = `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
    return isIsoDate(next) ? next : null;
  }

  const dmy = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const p1 = Number(dmy[1]);
    const p2 = Number(dmy[2]);

    if (p1 > 12 && p2 <= 12) {
      const eu = `${year}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      return isIsoDate(eu) ? eu : null;
    }
    if (p2 > 12 && p1 <= 12) {
      const us = `${year}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
      return isIsoDate(us) ? us : null;
    }
    const eu = `${year}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
    return isIsoDate(eu) ? eu : null;
  }

  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    return excelSerialToIso(n);
  }

  return null;
}

export function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let clean = String(value)
    .replace(/[$£¥€]/g, "")
    .replace(/,/g, "")
    .replace(/\u2212/g, "-")
    .trim();
  if (!clean || /^(n\/a|na|nil|null|undefined|-|—|–)$/i.test(clean)) return null;
  const neg = /^\(.*\)$/.test(clean);
  if (neg) clean = clean.slice(1, -1);
  if (clean.endsWith("%")) clean = clean.slice(0, -1);
  const n = Number(clean.trim());
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function remainingDays(valuationDate: string, maturityDate: string): number {
  const a = new Date(valuationDate).getTime();
  const b = new Date(maturityDate).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}
