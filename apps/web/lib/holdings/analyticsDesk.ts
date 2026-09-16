import { addDays } from "@/lib/holdings/dates";
import { residualDays } from "@/lib/holdings/metrics";
import type { BookCcy, BookMetrics, BookPosition } from "@/lib/holdings/types";

export const RANGE_OPTIONS = [
  { id: "7d", label: "近7天", days: 7 },
  { id: "1m", label: "近1月", days: 30 },
  { id: "3m", label: "近3月", days: 90 },
  { id: "all", label: "全部", days: 365 },
] as const;

export type AnalyticsRange = (typeof RANGE_OPTIONS)[number]["id"];

export const LADDER_BUCKETS = ["T+0 (今)", "T+1", "2-7天", "8-30天", "31-60天", "61-90天", "90天以上"] as const;

export const DLA_FLOOR = 10;
export const WLA_FLOOR = 15;
export const WAM_CAP = 60;
export const WAL_CAP = 120;

function hash(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

function noise(seed: number, i: number): number {
  const x = Math.sin(seed * 0.001 + i * 0.37) * 10000;
  return (x - Math.floor(x)) * 2 - 1;
}

export function benchmarkName(ccy: BookCcy): "SOFR" | "HIBOR" {
  return ccy === "HKD" ? "HIBOR" : "SOFR";
}

export function benchmarkLevel(ccy: BookCcy): number {
  return ccy === "HKD" ? 3.42 : 5.31;
}

function ladderLabel(days: number): (typeof LADDER_BUCKETS)[number] {
  if (days <= 0) return "T+0 (今)";
  if (days === 1) return "T+1";
  if (days <= 7) return "2-7天";
  if (days <= 30) return "8-30天";
  if (days <= 60) return "31-60天";
  if (days <= 90) return "61-90天";
  return "90天以上";
}

function stackOf(p: BookPosition): "td" | "cd" | "govt" {
  if (p.assetType === "Govt Bills") return "govt";
  if (p.assetType === "NCD" || p.assetType === "Commercial Paper") return "cd";
  return "td";
}

export function regionOf(p: BookPosition): string {
  const n = `${p.counterparty} ${p.assetName} ${p.isin}`.toLowerCase();
  if (/us treasury|federal reserve|citigroup|j\.?p\.? morgan|jpm|united states/.test(n)) return "US";
  if (/icbc|bo ci|boci|bank of china \(hong kong\)|boc hk/.test(n)) return /hong kong|hk/.test(n) ? "HK" : "CN";
  if (/bank of china/.test(n) && /hong kong/.test(n)) return "HK";
  if (/bank of china|icbc|cnb/.test(n)) return "CN";
  if (/dbs|ocbc|uob|singapore/.test(n)) return "SG";
  if (/hsbc/.test(n) && /hk/.test(n)) return "HK";
  if (/hsbc/.test(n)) return "UK";
  if (/hkma|hang seng|standard chartered|east asia|hong kong/.test(n)) return "HK";
  return p.currency === "HKD" ? "HK" : "US";
}

export type YieldPoint = { date: string; iso: string; fund7d: number; bench: number; shadow: number };
export type LiqPoint = { date: string; iso: string; dla: number; wla: number };
export type LadderRow = { bucket: string; td: number; cd: number; govt: number; total: number };
export type CreditRow = { rating: string; value: number; pct: number };
export type GeoRow = { name: string; value: number; pct: number };
export type StressRow = {
  id: string;
  scenario: string;
  deviationBps: number;
  wamDays: number;
  dlaPct: number;
  wlaPct: number;
  status: "ok" | "watch" | "breach";
};

export function buildYieldSeries(
  asOf: string,
  days: number,
  fund7d: number,
  bench: number,
  shadow: number,
  seedKey: string,
): YieldPoint[] {
  const seed = hash(seedKey);
  const rows: YieldPoint[] = [];
  for (let i = days; i >= 0; i--) {
    const iso = addDays(asOf, -i);
    const t = 1 - i / Math.max(days, 1);
    const n = noise(seed, i) * 0.045;
    rows.push({
      iso,
      date: iso.slice(5),
      fund7d: Number((fund7d - 0.14 * (1 - t) + n).toFixed(3)),
      bench: Number((bench - 0.05 * (1 - t) + n * 0.35).toFixed(3)),
      shadow: Number((shadow - 0.1 * (1 - t) + n * 1.15).toFixed(3)),
    });
  }
  return rows;
}

export function buildLiquiditySeries(
  asOf: string,
  days: number,
  dla: number,
  wla: number,
  seedKey: string,
): LiqPoint[] {
  const seed = hash(seedKey) + 17;
  const rows: LiqPoint[] = [];
  for (let i = days; i >= 0; i--) {
    const iso = addDays(asOf, -i);
    const t = 1 - i / Math.max(days, 1);
    const n = noise(seed, i) * 1.1;
    rows.push({
      iso,
      date: iso.slice(5),
      dla: Number(Math.max(6, dla - 2.4 * (1 - t) + n).toFixed(2)),
      wla: Number(Math.max(12, wla - 3.2 * (1 - t) + n * 1.2).toFixed(2)),
    });
  }
  return rows;
}

export function buildMaturityLadder(positions: BookPosition[], asOf: string): LadderRow[] {
  const empty = Object.fromEntries(LADDER_BUCKETS.map((b) => [b, { td: 0, cd: 0, govt: 0 }])) as Record<
    string,
    { td: number; cd: number; govt: number }
  >;
  for (const p of positions) {
    const bucket = ladderLabel(residualDays(p, asOf));
    empty[bucket][stackOf(p)] += p.amortizedCost;
  }
  return LADDER_BUCKETS.map((bucket) => {
    const row = empty[bucket];
    return { bucket, ...row, total: row.td + row.cd + row.govt };
  });
}

export function buildCreditMix(positions: BookPosition[]): CreditRow[] {
  const aum = positions.reduce((s, p) => s + p.amortizedCost, 0) || 1;
  const map = new Map<string, number>();
  for (const p of positions) {
    const rating = p.rating || "NR";
    map.set(rating, (map.get(rating) ?? 0) + p.amortizedCost);
  }
  const order = ["SOVEREIGN", "AA+", "AAA", "A-1+", "A-1", "A-2", "NR"];
  return Array.from(map.entries())
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || b[1] - a[1])
    .map(([rating, value]) => ({ rating, value, pct: (value / aum) * 100 }));
}

export function buildGeoMix(positions: BookPosition[]): GeoRow[] {
  const aum = positions.reduce((s, p) => s + p.amortizedCost, 0) || 1;
  const map = new Map<string, number>();
  for (const p of positions) {
    const r = regionOf(p);
    map.set(r, (map.get(r) ?? 0) + p.amortizedCost);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, pct: (value / aum) * 100 }));
}

function tone(dev: number, dla: number, wla: number): "ok" | "watch" | "breach" {
  if (Math.abs(dev) >= 50 || dla < DLA_FLOOR || wla < WLA_FLOOR) return "breach";
  if (Math.abs(dev) >= 20 || dla < DLA_FLOOR + 2 || wla < WLA_FLOOR + 3) return "watch";
  return "ok";
}

export function buildStressMatrix(m: BookMetrics): StressRow[] {
  const duration = m.wamDays / 365;
  const shift = (bps: number) => Number((m.deviationBps - duration * bps * 100).toFixed(1));
  const redeem = 0.1;
  const dlaAfter = Number((((m.dlaPct / 100 - redeem) / (1 - redeem)) * 100).toFixed(2));
  const wlaAfter = Number((((m.wlaPct / 100 - redeem) / (1 - redeem)) * 100).toFixed(2));
  const rows: { id: string; scenario: string; deviationBps: number; wamDays: number; dlaPct: number; wlaPct: number }[] = [
    { id: "base", scenario: "基准情景 (Base Case)", deviationBps: m.deviationBps, wamDays: m.wamDays, dlaPct: m.dlaPct, wlaPct: m.wlaPct },
    { id: "up25", scenario: "市场利率上行 +25 bps", deviationBps: shift(25), wamDays: m.wamDays, dlaPct: m.dlaPct, wlaPct: m.wlaPct },
    { id: "up50", scenario: "市场利率上行 +50 bps", deviationBps: shift(50), wamDays: m.wamDays, dlaPct: m.dlaPct, wlaPct: m.wlaPct },
    { id: "dn25", scenario: "市场利率下行 −25 bps", deviationBps: shift(-25), wamDays: m.wamDays, dlaPct: m.dlaPct, wlaPct: m.wlaPct },
    { id: "dn50", scenario: "市场利率下行 −50 bps", deviationBps: shift(-50), wamDays: m.wamDays, dlaPct: m.dlaPct, wlaPct: m.wlaPct },
    {
      id: "red10",
      scenario: "10% 大额赎回冲击",
      deviationBps: Number((m.deviationBps - 4.5).toFixed(1)),
      wamDays: Number((m.wamDays + 3.2).toFixed(2)),
      dlaPct: Math.max(0, dlaAfter),
      wlaPct: Math.max(0, wlaAfter),
    },
  ];
  return rows.map((r) => ({ ...r, status: tone(r.deviationBps, r.dlaPct, r.wlaPct) }));
}

export function modifiedDuration(wamDays: number): number {
  return wamDays / 365;
}

export function dv01(aum: number, wamDays: number): number {
  return aum * modifiedDuration(wamDays) * 0.0001;
}
