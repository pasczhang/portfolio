import { addDays } from "@/lib/holdings/dates";
import { DLA_FLOOR, WLA_SFC_FLOOR, WLA_INTERNAL_FLOOR } from "@/lib/engine/complianceEngine";
import {
  bookAum,
  computeDlaWla,
  dayCountBase,
  maturityProceeds,
  residualDays,
} from "@/lib/holdings/calculator";
import type { BookCcy, BookPosition } from "@/lib/holdings/types";
import type { CashAdj, CashSimTrade, DeskTrade } from "@/lib/holdings/trades";
import { defaultCashAdj } from "@/lib/holdings/trades";
import type { TaFlow } from "@/lib/services/types";
import { taSettleBuckets } from "@/lib/services/marketData/ta";

export type CashLedgerRow = {
  id: string;
  type: string;
  counterparty: string;
  amount: number;
  direction: "in" | "out";
  settle: "opening" | "T+0" | "T+1";
  status: "Locked" | "Pending" | "Applied";
  simulated: boolean;
};

export type CashPositionSnapshot = {
  asOf: string;
  t1Date: string;
  openingCash: number;
  t0Maturing: number;
  t1Maturing: number;
  t0NetSub: number;
  t1NetSub: number;
  t0BuySettle: number;
  t0SellSettle: number;
  t1BuySettle: number;
  t1SellSettle: number;
  t0Expenses: number;
  t1Expenses: number;
  autoFee: number;
  t0Available: number;
  t1Available: number;
  netSubT0: number;
  excessOk: boolean;
  dlaPct: number;
  wlaPct: number;
  dlaOk: boolean;
  wlaOk: boolean;
  ledger: CashLedgerRow[];
  maturitiesT0: { securityId: string; name: string; counterparty: string; amount: number }[];
  maturitiesT1: { securityId: string; name: string; counterparty: string; amount: number }[];
};

const MGMT_FEE = 0.0015;
const CUSTODY_FEE = 0.0002;
const WLA_FLOOR = WLA_SFC_FLOOR;

export function isBookCash(p: BookPosition): boolean {
  if (/CASH-/i.test(p.securityId)) return true;
  if (p.assetType !== "Cash / Bank Deposit") return false;
  return /custodian|demand|call|cash ac|cash at|bank balance|current account|银行存款|托管现金|\bcash\b/i.test(
    p.assetName,
  );
}

export function isDemandCash(p: BookPosition, _asOf?: string): boolean {
  return isBookCash(p);
}

/** If the book has no demand-cash line, synthesize one so the holdings grid always shows cash. */
export function ensureCashHoldingRow(
  positions: BookPosition[],
  opts: {
    cashAmount?: number | null;
    asOf: string;
    ccy: BookCcy;
    counterparty?: string;
    label?: string;
  },
): BookPosition[] {
  const list = [...(positions ?? [])];
  if (list.some((p) => isBookCash(p))) return list;
  const amount = Number(opts.cashAmount ?? 0);
  if (!(amount > 0)) return list;
  const ccy = opts.ccy;
  list.unshift({
    securityId: `CASH-${ccy}-HOLDING`,
    assetName: opts.label?.trim() || `${ccy} Cash - Custody Account`,
    assetType: "Cash / Bank Deposit",
    currency: ccy,
    counterparty: opts.counterparty || "Custodian",
    isin: "",
    issueDate: opts.asOf,
    maturityDate: opts.asOf,
    parValue: amount,
    amortizedCost: amount,
    shadowMtm: amount,
    couponRatePct: 0,
    couponType: "fixed",
    resetDate: null,
    rating: "NR",
    dayCount: ccy === "HKD" ? "Act/365" : "Act/360",
  });
  return list;
}

export function settlementProceeds(pos: BookPosition, asOf: string): number {
  const days = residualDays(pos, asOf);
  const oneDay = pos.parValue * (pos.couponRatePct / 100) / dayCountBase(pos);
  if (days <= 0) return pos.parValue + oneDay;
  return maturityProceeds(pos, asOf);
}

export function listMaturities(positions: BookPosition[], asOf: string, days: 0 | 1) {
  return positions
    .filter((p) => residualDays(p, asOf) === days && !(days === 0 && isDemandCash(p, asOf)))
    .map((p) => ({
      securityId: p.securityId,
      name: p.assetName,
      counterparty: p.counterparty,
      amount: settlementProceeds(p, asOf),
      assetType: p.assetType,
    }));
}

function simOn(sims: CashSimTrade[], settle: "T+0" | "T+1", side: "Buy" | "Sell"): number {
  return sims.filter((t) => t.settle === settle && t.side === side).reduce((s, t) => s + t.amount, 0);
}

function withAdj(adj: Partial<CashAdj>): CashAdj {
  return { ...defaultCashAdj(), ...adj };
}

export function computeCashPosition(
  positions: BookPosition[],
  trades: DeskTrade[] | unknown,
  adjInput: CashAdj,
  asOf: string,
  sims: CashSimTrade[] = [],
  taFlows: TaFlow[] = [],
): CashPositionSnapshot {
  const adj = withAdj(adjInput);
  const ta = taSettleBuckets(taFlows, asOf);
  const t1Date = addDays(asOf, 1);
  const aum = Math.max(bookAum(positions), 1);
  const autoFee = (aum * (MGMT_FEE + CUSTODY_FEE)) / 365;

  const openingCash = positions.filter((p) => isDemandCash(p, asOf)).reduce((s, p) => s + p.amortizedCost, 0);
  const maturitiesT0 = listMaturities(positions, asOf, 0);
  const maturitiesT1 = listMaturities(positions, asOf, 1);
  const t0Maturing = maturitiesT0.reduce((s, r) => s + r.amount, 0);
  const t1Maturing = maturitiesT1.reduce((s, r) => s + r.amount, 0);

  const t0BuySettle = simOn(sims, "T+0", "Buy");
  const t0SellSettle = simOn(sims, "T+0", "Sell");
  const t1BuySettle = simOn(sims, "T+1", "Buy");
  const t1SellSettle = simOn(sims, "T+1", "Sell");

  const t0NetSub = adj.t0Subscription + ta.t0Sub - adj.t0Redemption - ta.t0Red;
  const t1NetSub = adj.t1Subscription + ta.t1Sub - adj.t1Redemption - ta.t1Red;

  const t0Available =
    openingCash + t0Maturing + t0NetSub + t0SellSettle - t0BuySettle - adj.t0Expenses - autoFee;
  const t1Available =
    t0Available + t1Maturing + t1NetSub + t1SellSettle - t1BuySettle - adj.t1Expenses;

  const { dlaAmt, wlaAmt } = computeDlaWla(positions, asOf);
  const cashDeltaT0 = t0NetSub + t0SellSettle - t0BuySettle - adj.t0Expenses - autoFee;
  const cashDeltaT1 = cashDeltaT0 + t1NetSub + t1SellSettle - t1BuySettle - adj.t1Expenses;
  const dlaPct = ((dlaAmt + cashDeltaT0) / aum) * 100;
  const wlaPct = ((wlaAmt + cashDeltaT1) / aum) * 100;

  const ledger: CashLedgerRow[] = [
    {
      id: "open",
      type: "期初托管现金",
      counterparty: "Custodian",
      amount: openingCash,
      direction: "in",
      settle: "opening",
      status: "Locked",
      simulated: false,
    },
    ...maturitiesT0.map((m) => ({
      id: `mat0-${m.securityId}`,
      type: "T+0 持仓到期本息",
      counterparty: m.counterparty,
      amount: m.amount,
      direction: "in" as const,
      settle: "T+0" as const,
      status: "Locked" as const,
      simulated: false,
    })),
    ...maturitiesT1.map((m) => ({
      id: `mat1-${m.securityId}`,
      type: "T+1 持仓到期本息",
      counterparty: m.counterparty,
      amount: m.amount,
      direction: "in" as const,
      settle: "T+1" as const,
      status: "Locked" as const,
      simulated: false,
    })),
    {
      id: "sub0",
      type: "T+0 申购划款",
      counterparty: "Transfer Agent",
      amount: adj.t0Subscription,
      direction: "in",
      settle: "T+0",
      status: "Applied",
      simulated: adj.t0Subscription !== 0,
    },
    {
      id: "red0",
      type: "T+0 赎回出款",
      counterparty: "Transfer Agent",
      amount: adj.t0Redemption,
      direction: "out",
      settle: "T+0",
      status: "Applied",
      simulated: adj.t0Redemption !== 0,
    },
    {
      id: "exp0",
      type: "T+0 清算/杂费",
      counterparty: "Fund expenses",
      amount: adj.t0Expenses,
      direction: "out",
      settle: "T+0",
      status: "Applied",
      simulated: adj.t0Expenses !== 0,
    },
    {
      id: "fee",
      type: "管理费/托管费计提",
      counterparty: "Accrual",
      amount: autoFee,
      direction: "out",
      settle: "T+0",
      status: "Locked",
      simulated: false,
    },
    {
      id: "sub1",
      type: "T+1 预估申购",
      counterparty: "Transfer Agent",
      amount: adj.t1Subscription,
      direction: "in",
      settle: "T+1",
      status: "Applied",
      simulated: adj.t1Subscription !== 0,
    },
    {
      id: "red1",
      type: "T+1 预估赎回",
      counterparty: "Transfer Agent",
      amount: adj.t1Redemption,
      direction: "out",
      settle: "T+1",
      status: "Applied",
      simulated: adj.t1Redemption !== 0,
    },
    {
      id: "exp1",
      type: "T+1 清算/杂费",
      counterparty: "Fund expenses",
      amount: adj.t1Expenses,
      direction: "out",
      settle: "T+1",
      status: "Applied",
      simulated: adj.t1Expenses !== 0,
    },
    ...ta.confirmed.map((f) => ({
      id: f.id,
      type: f.type === "SUB" ? "TA 申购确认" : "TA 赎回确认",
      counterparty: f.investorCode,
      amount: f.amount,
      direction: (f.type === "SUB" ? "in" : "out") as "in" | "out",
      settle: (f.settlementDate === asOf ? "T+0" : f.settlementDate === t1Date ? "T+1" : "T+1") as "T+0" | "T+1",
      status: "Applied" as const,
      simulated: false,
    })),
    ...sims.map((t) => ({
      id: t.id,
      type: t.side === "Buy" ? `拟买入 ${t.assetKind}` : `拟卖出 ${t.assetKind}`,
      counterparty: t.name || t.assetKind,
      amount: t.amount,
      direction: (t.side === "Buy" ? "out" : "in") as "in" | "out",
      settle: t.settle,
      status: "Applied" as const,
      simulated: true,
    })),
  ].filter((r) => r.amount !== 0) as CashLedgerRow[];

  return {
    asOf,
    t1Date,
    openingCash,
    t0Maturing,
    t1Maturing,
    t0NetSub,
    t1NetSub,
    t0BuySettle,
    t0SellSettle,
    t1BuySettle,
    t1SellSettle,
    t0Expenses: adj.t0Expenses,
    t1Expenses: adj.t1Expenses,
    autoFee,
    t0Available,
    t1Available,
    netSubT0: t0NetSub,
    excessOk: t0Available >= 0 && t1Available >= 0,
    dlaPct: Number(dlaPct.toFixed(2)),
    wlaPct: Number(wlaPct.toFixed(2)),
    dlaOk: dlaPct >= DLA_FLOOR,
    wlaOk: wlaPct >= WLA_FLOOR,
    ledger,
    maturitiesT0,
    maturitiesT1,
  };
}

export function emptyCashAdj(): CashAdj {
  return defaultCashAdj();
}

export { DLA_FLOOR, WLA_FLOOR, WLA_INTERNAL_FLOOR, WLA_SFC_FLOOR };
