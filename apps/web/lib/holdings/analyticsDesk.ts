import { addDays } from "@/lib/holdings/dates";
import {
  computeMaturityLadder,
  groupByIssuer,
  groupByRating,
  type LadderSlice,
} from "@/lib/holdings/calculator";
import type { BookCcy, BookMetrics } from "@/lib/holdings/types";

export const RANGE_OPTIONS = [
  { id: "7d", label: "近7天", days: 7 },
  { id: "1m", label: "近1月", days: 30 },
  { id: "3m", label: "近3月", days: 90 },
  { id: "all", label: "全部", days: 365 },
] as const;

export type AnalyticsRange = (typeof RANGE_OPTIONS)[number]["id"];

export const LADDER_BUCKETS = ["T+0 (0d)", "T+1 (1d)", "2–7d", "8–30d", "31–60d", "61–90d", ">90d"] as const;

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

/** Fallback levels used only to sketch a simulated path — not a live feed. */
export function benchmarkLevel(ccy: BookCcy): number {
  return ccy === "HKD" ? 3.42 : 5.31;
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
  if (rows.length) {
    const last = rows[rows.length - 1];
    rows[rows.length - 1] = { ...last, fund7d, bench, shadow };
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
  if (rows.length) {
    const last = rows[rows.length - 1];
    rows[rows.length - 1] = { ...last, dla, wla };
  }
  return rows;
}

export function buildMaturityLadder(positions: Parameters<typeof computeMaturityLadder>[0], asOf: string): LadderSlice[] {
  return computeMaturityLadder(positions, asOf);
}

export function buildCreditMix(positions: Parameters<typeof groupByRating>[0]): CreditRow[] {
  return groupByRating(positions).map((g) => ({ rating: g.key, value: g.amount, pct: g.pct }));
}

export function buildIssuerMix(positions: Parameters<typeof groupByIssuer>[0]): GeoRow[] {
  return groupByIssuer(positions).map((g) => ({ name: g.key, value: g.amount, pct: g.pct }));
}

function tone(dev: number, dla: number, wla: number): "ok" | "watch" | "breach" {
  if (Math.abs(dev) >= 50 || dla < DLA_FLOOR || wla < WLA_FLOOR) return "breach";
  if (Math.abs(dev) >= 25 || dla < DLA_FLOOR + 2 || wla < 20) return "watch";
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

export { modifiedDuration, dv01 } from "@/lib/holdings/calculator";
