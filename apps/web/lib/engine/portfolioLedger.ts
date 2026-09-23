import { daysBetween } from "@/lib/holdings/dates";
import type { BookCcy, BookPosition, SfcAssetType } from "@/lib/holdings/types";
import type { DeskTrade } from "@/lib/holdings/trades";
import { suggestedTradeGross } from "@/lib/holdings/trades";
import { assetCategoryOf } from "@/lib/holdings/unified";
import { wamTenorDays } from "@/lib/engine/durationCalculator";
import { inferCategory, type TradeAssetCategory } from "@/lib/trading/polymorphicTrade";

const EPS = 0.005;
const MGMT_FEE = 0.0015;
const CUSTODY_FEE = 0.0002;

export type PositionLifecycle = "Active" | "Matured";

export type RealizedPnlLot = {
  tradeId: string;
  securityId: string;
  amount: number;
};

export type PortfolioAllocation = {
  bondPct: number;
  depositPct: number;
  repoPct: number;
  cashPct: number;
};

export type PortfolioRiskSnapshot = {
  totalAssets: number;
  nav: number;
  cash: number;
  repoLiabilities: number;
  accruedFees: number;
  modifiedDuration: number;
  dv01: number;
  weightedYtm: number;
  leveragePct: number;
  allocation: PortfolioAllocation;
};

export type LedgerResult = {
  positions: BookPosition[];
  overlayTrades: DeskTrade[];
  realizedPnl: RealizedPnlLot[];
  risk: PortfolioRiskSnapshot;
};

type Lot = BookPosition & {
  lifecycle: PositionLifecycle;
  bookRole: "asset" | "liability";
  avgCostPrice: number;
};

function isBookCash(p: BookPosition): boolean {
  if (/CASH-/i.test(p.securityId)) return true;
  if (p.assetType !== "Cash / Bank Deposit") return false;
  return /custodian|demand|call|cash ac|cash at|bank balance|current account|银行存款|托管现金|\bcash\b/i.test(
    p.assetName,
  );
}

function num(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function detailsOf(t: DeskTrade): Record<string, unknown> {
  return (t.details ?? {}) as Record<string, unknown>;
}

function formSideOf(t: DeskTrade): string {
  return String(detailsOf(t).formSide ?? "");
}

export function isLiabilityPosition(p: BookPosition): boolean {
  return p.bookRole === "liability" || p.parValue < 0;
}

export function carryingValue(p: BookPosition): number {
  if (isLiabilityPosition(p)) return 0;
  return p.shadowMtm > 0 ? p.shadowMtm : p.amortizedCost;
}

export function isSeedTrade(t: DeskTrade): boolean {
  if (/INCEPT/i.test(t.id)) return true;
  if (/成立出资|capital injection/i.test(`${t.assetName} ${t.notes ?? ""}`)) return true;
  return false;
}

/** Overlay trades that are not already baked into the imported/opening snapshot. */
export function selectOverlayTrades(opening: BookPosition[], trades: DeskTrade[]): DeskTrade[] {
  return trades.filter((t) => {
    if (isSeedTrade(t)) return false;
    if (t.assetCategory) return true;
    const hit = opening.find(
      (p) => p.securityId === t.securityId || (t.isin && p.isin && p.isin === t.isin),
    );
    return !hit;
  });
}

export function dirtyPxOfTrade(t: DeskTrade): number {
  const d = detailsOf(t);
  if (num(d.dirtyPrice) > 0) return num(d.dirtyPrice);
  const clean = num(t.price, 100);
  const acc = t.amount > 0 ? (num(t.accruedInterest) / t.amount) * 100 : 0;
  return clean + acc;
}

export function cashDeltaOfTrade(t: DeskTrade): number {
  const cat = inferCategory(t);
  const fee = num(t.commission);
  const principal = num(t.amount);
  const gross = num(t.grossAmount);
  const side = formSideOf(t);

  if (cat === "BOND") {
    const notional = (dirtyPxOfTrade(t) / 100) * principal;
    if (t.side === "Sell" || side === "SELL") return notional - fee;
    return -(notional + fee);
  }
  if (cat === "TERM_DEPOSIT") {
    if (t.side === "Maturity" || side === "WITHDRAW") {
      const d = detailsOf(t);
      const mature = num(d.totalMaturityAmount ?? d.matureAmount, principal + num(t.accruedInterest));
      return mature - fee;
    }
    return -(principal + fee);
  }
  if (cat === "REPO") {
    const borrow = side === "REPO" || (t.assetCategory === "REPO" && t.side === "Sell");
    return borrow ? principal - fee : -(principal + fee);
  }
  if (t.side === "Subscription" || side === "INFLOW") return (gross || principal) - fee;
  if (t.side === "Redemption" || side === "OUTFLOW") return -((gross || principal) + fee);
  if (t.side === "Buy") return -(gross || suggestedTradeGross({ amount: principal, price: t.price, accruedInterest: t.accruedInterest, commission: t.commission }) || principal);
  if (t.side === "Sell") return (gross || suggestedTradeGross({ amount: principal, price: t.price, accruedInterest: t.accruedInterest, commission: t.commission }) || principal) - fee;
  if (t.side === "Deposit") return -principal;
  if (t.side === "Maturity") return principal + num(t.accruedInterest);
  if (t.side === "Repo") return -principal;
  return 0;
}

function mapAssetType(cat: TradeAssetCategory, name: string): SfcAssetType {
  if (cat === "TERM_DEPOSIT") return "Cash / Bank Deposit";
  if (cat === "REPO") return "Reverse Repo";
  if (cat === "CASH") return "Cash / Bank Deposit";
  if (/t-?bill|treasury|efn|外汇基金/i.test(name)) return "Govt Bills";
  if (/ncd|cd\b|存单/i.test(name)) return "NCD";
  return "Commercial Paper";
}

function lotKey(t: DeskTrade): string {
  return t.securityId || t.isin || t.assetName;
}

function cloneLot(p: BookPosition): Lot {
  return {
    ...p,
    lifecycle: p.lifecycle ?? "Active",
    bookRole: p.bookRole ?? (p.parValue < 0 ? "liability" : "asset"),
    avgCostPrice: p.avgCostPrice ?? (p.parValue > 0 ? (p.amortizedCost / p.parValue) * 100 : 100),
  };
}

function emptyLot(t: DeskTrade, ccy: BookCcy, asOf: string, role: "asset" | "liability"): Lot {
  const cat = inferCategory(t);
  const d = detailsOf(t);
  const maturity = String(d.maturityDate || d.secondLegDate || t.settlementDate);
  const valueDate = String(d.valueDate || d.firstLegDate || t.settlementDate || asOf);
  const dayCount = String(d.dayCount || (ccy === "HKD" ? "Act/365" : "Act/360"));
  return {
    securityId: lotKey(t),
    assetName: t.assetName,
    assetType: mapAssetType(cat, t.assetName),
    currency: t.currency || ccy,
    counterparty: t.counterparty,
    isin: t.isin || "",
    issueDate: valueDate,
    maturityDate: maturity,
    parValue: 0,
    amortizedCost: 0,
    shadowMtm: 0,
    couponRatePct: num(t.yieldPct),
    couponType: "fixed",
    resetDate: null,
    rating: "NR",
    dayCount,
    lifecycle: "Active",
    bookRole: role,
    avgCostPrice: 100,
  };
}

function markLifecycle(lot: Lot, asOf: string): Lot {
  if (isBookCash(lot)) return { ...lot, lifecycle: "Active" };
  const matured = lot.maturityDate && lot.maturityDate <= asOf;
  return { ...lot, lifecycle: matured ? "Matured" : "Active" };
}

function applyBuy(lot: Lot, par: number, cost: number): Lot {
  const newPar = lot.parValue + par;
  const newCost = lot.amortizedCost + cost;
  const avg = newPar > 0 ? (newCost / newPar) * 100 : lot.avgCostPrice;
  return {
    ...lot,
    parValue: newPar,
    amortizedCost: newCost,
    shadowMtm: newCost,
    avgCostPrice: avg,
    lifecycle: "Active",
  };
}

function applySell(lot: Lot, par: number, proceeds: number): { lot: Lot; realized: number } {
  const sellPar = Math.min(par, lot.parValue);
  const costReleased = lot.parValue > 0 ? (lot.amortizedCost * sellPar) / lot.parValue : 0;
  const remainPar = lot.parValue - sellPar;
  const remainCost = lot.amortizedCost - costReleased;
  const realized = proceeds - costReleased;
  if (remainPar <= EPS) {
    return {
      lot: { ...lot, parValue: 0, amortizedCost: 0, shadowMtm: 0 },
      realized,
    };
  }
  return {
    lot: {
      ...lot,
      parValue: remainPar,
      amortizedCost: remainCost,
      shadowMtm: remainCost,
    },
    realized,
  };
}

function accrueCarry(lot: Lot, asOf: string): Lot {
  if (isBookCash(lot) || lot.bookRole === "liability" || lot.parValue <= 0) return lot;
  const cat = assetCategoryOf(lot);
  if (cat !== "TIME_DEPOSIT" && cat !== "REPO") return lot;
  const start = lot.issueDate || asOf;
  const days = Math.max(0, daysBetween(start, asOf < lot.maturityDate ? asOf : lot.maturityDate));
  const interest = lot.parValue * (lot.couponRatePct / 100) * (days / 365);
  const mv = lot.parValue + interest;
  return { ...lot, shadowMtm: mv, amortizedCost: mv };
}

export function calculatePortfolioRisk(positions: BookPosition[], asOf: string): PortfolioRiskSnapshot {
  const assets = positions.filter((p) => !isLiabilityPosition(p));
  const cash = assets.filter(isBookCash).reduce((s, p) => s + carryingValue(p), 0);
  const repoLiabilities = positions.filter(isLiabilityPosition).reduce((s, p) => s + Math.abs(p.amortizedCost || p.parValue), 0);
  const totalAssets = assets.reduce((s, p) => s + carryingValue(p), 0);
  const accruedFees = (Math.max(totalAssets, 0) * (MGMT_FEE + CUSTODY_FEE)) / 365;
  const nav = totalAssets - repoLiabilities - accruedFees;
  const den = totalAssets > 0 ? totalAssets : 1;

  let durWeighted = 0;
  let ytmWeighted = 0;
  let dv01Sum = 0;
  for (const p of assets) {
    const mv = carryingValue(p);
    const w = mv / den;
    const days = wamTenorDays(p, asOf);
    const ytm = p.couponRatePct / 100;
    const modDur = days / 365 / (1 + ytm);
    durWeighted += modDur * w;
    ytmWeighted += p.couponRatePct * w;
    dv01Sum += mv * modDur * 0.0001;
  }

  const sumCat = (pred: (p: BookPosition) => boolean) =>
    assets.filter(pred).reduce((s, p) => s + carryingValue(p), 0);

  const bond = sumCat((p) => assetCategoryOf(p) === "BOND");
  const deposit = sumCat((p) => assetCategoryOf(p) === "TIME_DEPOSIT");
  const repo = sumCat((p) => assetCategoryOf(p) === "REPO");
  const cashAmt = sumCat(isBookCash);

  return {
    totalAssets,
    nav,
    cash,
    repoLiabilities,
    accruedFees,
    modifiedDuration: Number(durWeighted.toFixed(6)),
    dv01: Number(dv01Sum.toFixed(4)),
    weightedYtm: Number(ytmWeighted.toFixed(4)),
    leveragePct: Number(((totalAssets / Math.max(nav, 1)) * 100).toFixed(4)),
    allocation: {
      bondPct: Number(((bond / den) * 100).toFixed(2)),
      depositPct: Number(((deposit / den) * 100).toFixed(2)),
      repoPct: Number(((repo / den) * 100).toFixed(2)),
      cashPct: Number(((cashAmt / den) * 100).toFixed(2)),
    },
  };
}

function demandCashTemplate(opening: BookPosition[], asOf: string, ccy: BookCcy): BookPosition {
  const row = opening.find(isBookCash);
  if (row) return { ...row };
  return {
    securityId: `CASH-${ccy}-HOLDING`,
    assetName: `${ccy} Cash Custody Account (托管活期)`,
    assetType: "Cash / Bank Deposit",
    currency: ccy,
    counterparty: "Custodian",
    isin: "",
    issueDate: asOf,
    maturityDate: asOf,
    parValue: 0,
    amortizedCost: 0,
    shadowMtm: 0,
    couponRatePct: 0,
    couponType: "fixed",
    resetDate: null,
    rating: "NR",
    dayCount: ccy === "HKD" ? "Act/365" : "Act/360",
    lifecycle: "Active",
    bookRole: "asset",
  };
}

export function replayPortfolio(opts: {
  opening: BookPosition[];
  trades: DeskTrade[];
  asOf: string;
  ccy: BookCcy;
}): LedgerResult {
  const opening = opts.opening ?? [];
  const overlayTrades = selectOverlayTrades(opening, opts.trades ?? []).slice().sort((a, b) => {
    const da = a.settlementDate || a.tradeDate;
    const db = b.settlementDate || b.tradeDate;
    if (da !== db) return da.localeCompare(db);
    return a.id.localeCompare(b.id);
  });

  const lots = new Map<string, Lot>();
  for (const p of opening.filter((row) => !isBookCash(row))) {
    lots.set(p.securityId, cloneLot(p));
  }

  let cash = opening.filter(isBookCash).reduce((s, p) => s + p.amortizedCost, 0);
  const realizedPnl: RealizedPnlLot[] = [];

  for (const t of overlayTrades) {
    cash += cashDeltaOfTrade(t);
    const cat = inferCategory(t);
    const side = formSideOf(t);
    const key = lotKey(t);
    const par = num(t.amount);

    if (cat === "CASH") continue;

    if (cat === "BOND") {
      const cost = Math.abs((dirtyPxOfTrade(t) / 100) * par);
      const isSell = t.side === "Sell" || side === "SELL";
      const cur = lots.get(key) ?? emptyLot(t, opts.ccy, opts.asOf, "asset");
      if (isSell) {
        const { lot, realized } = applySell(cur, par, cost - num(t.commission));
        if (Math.abs(realized) > EPS) realizedPnl.push({ tradeId: t.id, securityId: key, amount: realized });
        if (lot.parValue <= EPS) lots.delete(key);
        else lots.set(key, lot);
      } else {
        lots.set(key, applyBuy(cur, par, cost + num(t.commission)));
      }
      continue;
    }

    if (cat === "TERM_DEPOSIT") {
      const withdraw = t.side === "Maturity" || side === "WITHDRAW";
      const cur = lots.get(key) ?? emptyLot(t, opts.ccy, opts.asOf, "asset");
      if (withdraw) {
        const { lot } = applySell(cur, par, par);
        if (lot.parValue <= EPS) lots.delete(key);
        else lots.set(key, lot);
      } else {
        lots.set(key, applyBuy(cur, par, par));
      }
      continue;
    }

    if (cat === "REPO") {
      const borrow = side === "REPO" || (t.assetCategory === "REPO" && t.side === "Sell");
      const role = borrow ? "liability" : "asset";
      const repoKey = borrow ? `LIAB-${key}` : key;
      const cur = lots.get(repoKey) ?? emptyLot(t, opts.ccy, opts.asOf, role);
      lots.set(repoKey, applyBuy({ ...cur, bookRole: role, assetType: "Reverse Repo" }, par, par));
    }
  }

  const securities = Array.from(lots.values())
    .map((lot) => accrueCarry(lot, opts.asOf))
    .map((lot) => markLifecycle(lot, opts.asOf))
    .filter((lot) => lot.parValue > EPS || lot.amortizedCost > EPS);

  const cashRow = demandCashTemplate(opening, opts.asOf, opts.ccy);
  cashRow.parValue = cash;
  cashRow.amortizedCost = cash;
  cashRow.shadowMtm = cash;
  cashRow.maturityDate = opts.asOf;
  cashRow.lifecycle = "Active";
  cashRow.bookRole = "asset";

  const positions = [cashRow, ...securities];
  return {
    positions,
    overlayTrades,
    realizedPnl,
    risk: calculatePortfolioRisk(positions, opts.asOf),
  };
}
