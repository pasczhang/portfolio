import type { BookPosition } from "@/lib/holdings/types";
import type { ParsedValuationHolding } from "@/lib/services/types";
import { extractIsin } from "@/lib/utils/valuationExcelParser";

export type MatchMethod = "ISIN" | "CODE" | "NAME" | "MATURITY_CCY" | "NONE";

export type MatchPair = {
  internal: BookPosition;
  holdingIndex: number;
  holding: ParsedValuationHolding;
  method: MatchMethod;
  score: number;
};

function squash(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function tokens(s: string): Set<string> {
  const raw = s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const out = new Set<string>();
  for (const t of raw) {
    out.add(t);
    if (t === "UST" || t === "US") {
      out.add("TREASURY");
      out.add("TBILL");
      out.add("BILL");
    }
    if (t === "TBILL" || t === "TBILLS") {
      out.add("TREASURY");
      out.add("BILL");
      out.add("UST");
    }
    if (t === "TREASURY") {
      out.add("UST");
      out.add("TBILL");
    }
    if (t === "NCD" || t === "CD") {
      out.add("CERTIFICATE");
      out.add("DEPOSIT");
      out.add("NCD");
      out.add("CD");
    }
    if (t === "CP") out.add("COMMERCIAL");
    if (t === "EFB" || t === "HKMA") {
      out.add("EXCHANGE");
      out.add("FUND");
    }
  }
  return out;
}

function nameSimilarity(a: string, b: string): number {
  const sa = squash(a);
  const sb = squash(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  if (sa.includes(sb) || sb.includes(sa)) return 0.92;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of Array.from(ta)) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size, 1);
}

function codesOf(p: BookPosition): string[] {
  return [p.isin, p.securityId].map((x) => squash(x || "")).filter((x) => x.length >= 4);
}

function codesOfHolding(h: ParsedValuationHolding): string[] {
  return [h.isin, extractIsin(h.securityId) ?? "", h.securityId].map((x) => squash(x || "")).filter((x) => x.length >= 4);
}

function prefixHit(a: string, b: string): boolean {
  if (a.length < 6 || b.length < 6) return a === b;
  return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a);
}

export function scorePair(p: BookPosition, h: ParsedValuationHolding): { score: number; method: MatchMethod } {
  const pIsin = squash(p.isin || "");
  const hIsin = squash(h.isin || "");
  if (pIsin.length === 12 && hIsin.length === 12 && pIsin === hIsin) return { score: 100, method: "ISIN" };

  const pc = codesOf(p);
  const hc = codesOfHolding(h);
  for (const a of pc) {
    for (const b of hc) {
      if (a === b) return { score: 90, method: "CODE" };
    }
  }
  for (const a of pc) {
    for (const b of hc) {
      if (prefixHit(a, b)) return { score: 80, method: "CODE" };
    }
  }

  const sim = nameSimilarity(p.assetName, h.name);
  if (sim >= 0.55) return { score: 55 + sim * 30, method: "NAME" };

  const ccyOk = !h.currency || squash(h.currency) === squash(p.currency);
  const matOk = Boolean(p.maturityDate && h.maturityDate && p.maturityDate === h.maturityDate);
  if (ccyOk && matOk) return { score: 52, method: "MATURITY_CCY" };

  return { score: 0, method: "NONE" };
}

const MIN_SCORE = 52;

/** Unique greedy pairing, highest score first. */
export function pairHoldings(positions: BookPosition[], holdings: ParsedValuationHolding[]): MatchPair[] {
  const candidates: MatchPair[] = [];
  positions.forEach((internal) => {
    holdings.forEach((holding, holdingIndex) => {
      const { score, method } = scorePair(internal, holding);
      if (score >= MIN_SCORE && method !== "NONE") {
        candidates.push({ internal, holdingIndex, holding, method, score });
      }
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  const usedP = new Set<string>();
  const usedH = new Set<number>();
  const pairs: MatchPair[] = [];
  for (const c of candidates) {
    if (usedP.has(c.internal.securityId) || usedH.has(c.holdingIndex)) continue;
    usedP.add(c.internal.securityId);
    usedH.add(c.holdingIndex);
    pairs.push(c);
  }
  return pairs;
}

export function findHoldingIndex(
  p: BookPosition,
  holdings: ParsedValuationHolding[],
  used: Set<number>,
): number {
  let best = -1;
  let bestScore = MIN_SCORE - 1;
  holdings.forEach((h, i) => {
    if (used.has(i)) return;
    const { score } = scorePair(p, h);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= MIN_SCORE ? best : -1;
}

export function booksDiverge(internal: BookPosition[], holdings: ParsedValuationHolding[]): boolean {
  if (!holdings.length) return false;
  const pairs = pairHoldings(internal, holdings);
  return pairs.length / Math.max(holdings.length, 1) < 0.35;
}
