import { residualDays, computeMaturityLadder, groupByIssuer } from "@/lib/holdings/calculator";
import { isBookCash } from "@/lib/holdings/cashPosition";
import type { BookPosition } from "@/lib/holdings/types";

export const PRIVILEGED_ISSUERS = /treasury|hkma|federal reserve|sovereign|hk government/i;

export const CLASS_CHART_LABEL: Record<string, string> = {
  Cash: "活期现金 (Cash)",
  "Time Deposit": "定期存款 (Time Deposit)",
  NCD: "同业存单 (NCD)",
  "Govt Bills": "短期国债 / 外汇基金票据 (Govt Bills)",
  "Commercial Paper": "商业票据 (CP)",
  "Reverse Repo": "逆回购 (Repo)",
};

export const MATURITY_BUCKETS = [
  { id: "d7", label: "≤ 7 天", min: 0, max: 7 },
  { id: "d30", label: "8–30 天", min: 8, max: 30 },
  { id: "d90", label: "31–90 天", min: 31, max: 90 },
  { id: "d180", label: "91–180 天", min: 91, max: 180 },
  { id: "d397", label: "181–397 天", min: 181, max: 397 },
] as const;

export function chartClassOf(p: BookPosition, asOf: string): keyof typeof CLASS_CHART_LABEL {
  if (isBookCash(p)) return "Cash";
  if (p.assetType === "NCD") return "NCD";
  if (p.assetType === "Govt Bills") return "Govt Bills";
  if (p.assetType === "Commercial Paper") return "Commercial Paper";
  if (p.assetType === "Reverse Repo") return "Reverse Repo";
  if (p.assetType === "Cash / Bank Deposit") return "Time Deposit";
  return residualDays(p, asOf) <= 1 ? "Cash" : "Time Deposit";
}

export function issuerWeightMap(positions: BookPosition[]): Record<string, number> {
  return Object.fromEntries(groupByIssuer(positions).map((g) => [g.key, g.pct]));
}

export function issuerAlertLevel(weightPct: number, issuer: string): "ok" | "watch" | "breach" {
  if (PRIVILEGED_ISSUERS.test(issuer)) return "ok";
  if (weightPct > 20) return "breach";
  if (weightPct > 10) return "watch";
  return "ok";
}

export function allocationByClass(positions: BookPosition[], asOf: string) {
  const aum = positions.reduce((s, p) => s + p.amortizedCost, 0) || 1;
  const map = new Map<string, number>();
  for (const p of positions) {
    const key = CLASS_CHART_LABEL[chartClassOf(p, asOf)];
    map.set(key, (map.get(key) ?? 0) + p.amortizedCost);
  }
  return Array.from(map.entries()).map(([name, value]) => ({
    name,
    value,
    pct: (value / aum) * 100,
  }));
}

export function maturityBuckets(positions: BookPosition[], asOf: string) {
  return computeMaturityLadder(positions, asOf).map((r) => ({
    bucket: r.bucket,
    value: r.total,
    pct: r.pct,
  }));
}

export function topIssuers(positions: BookPosition[], n = 5) {
  return groupByIssuer(positions)
    .slice(0, n)
    .map((g) => ({ issuer: g.key, value: g.amount, pct: g.pct }));
}
