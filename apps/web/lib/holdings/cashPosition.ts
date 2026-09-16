import { addDays } from "@/lib/holdings/dates";
import { residualDays } from "@/lib/holdings/metrics";
import type { BookPosition } from "@/lib/holdings/types";
import {
  type CashAdj,
  type DeskTrade,
  isCashInflowSide,
  isCashOutflowSide,
} from "@/lib/holdings/trades";

export type CashLine = {
  id: string;
  label: string;
  detail: string;
  amount: number;
};

export type CashPositionSnapshot = {
  asOf: string;
  t1Date: string;
  openingCash: number;
  t0Maturing: number;
  t0NetSub: number;
  t0BuySettle: number;
  t0Available: number;
  t1Maturing: number;
  t1NetSub: number;
  t1ScheduledOut: number;
  t1Available: number;
  netSubT0: number;
  fees: number;
  excessOk: boolean;
  inflows: CashLine[];
  outflows: CashLine[];
};

const MGMT_FEE = 0.0015;
const CUSTODY_FEE = 0.0002;

function isDemandCash(p: BookPosition, asOf: string): boolean {
  const days = residualDays(p, asOf);
  if (p.assetType !== "Cash / Bank Deposit") return false;
  if (/custodian|demand|call/i.test(p.assetName) || /CASH-/i.test(p.securityId)) return days <= 0;
  return false;
}

function dayCountBase(p: BookPosition): number {
  return /365/.test(p.dayCount) ? 365 : 360;
}

function maturityProceeds(p: BookPosition): number {
  const interest = p.parValue * (p.couponRatePct / 100) * (1 / dayCountBase(p));
  return p.parValue + interest;
}

function settleOn(trades: DeskTrade[], date: string, predicate: (t: DeskTrade) => boolean): number {
  return trades.filter((t) => t.settlementDate === date && predicate(t)).reduce((s, t) => s + t.amount, 0);
}

export function computeCashPosition(
  positions: BookPosition[],
  trades: DeskTrade[],
  adj: CashAdj,
  asOf: string,
): CashPositionSnapshot {
  const t1Date = addDays(asOf, 1);
  const aum = positions.reduce((s, p) => s + p.amortizedCost, 0);
  const fees = (aum * (MGMT_FEE + CUSTODY_FEE)) / 365;

  const demand = positions.filter((p) => isDemandCash(p, asOf));
  const openingCash = demand.reduce((s, p) => s + p.amortizedCost, 0);

  const maturingT0 = positions.filter((p) => residualDays(p, asOf) === 0 && !isDemandCash(p, asOf));
  const maturingT1 = positions.filter((p) => residualDays(p, asOf) === 1);

  const t0Maturing = maturingT0.reduce((s, p) => s + maturityProceeds(p), 0);
  const t1Maturing = maturingT1.reduce((s, p) => s + maturityProceeds(p), 0);

  const t0NetSub = adj.t0Subscription - adj.t0Redemption;
  const t1NetSub = adj.t1Subscription - adj.t1Redemption;

  const t0BuySettle = settleOn(trades, asOf, (t) => t.status === "Pending" && isCashOutflowSide(t.side));
  const t1ScheduledOut = settleOn(trades, t1Date, (t) => t.status === "Pending" && isCashOutflowSide(t.side));
  const t0SellSettle = settleOn(trades, asOf, (t) => t.status === "Pending" && isCashInflowSide(t.side) && t.side === "Sell");

  const t0Available = openingCash + t0Maturing + t0NetSub + t0SellSettle - t0BuySettle - fees;
  const t1Available = t0Available + t1Maturing + t1NetSub - t1ScheduledOut;
  const excessOk = t0Available >= 0 && t1Available >= 0;

  const inflows: CashLine[] = [
    { id: "open", label: "期初托管账户现金", detail: "Custodian demand", amount: openingCash },
    ...maturingT0.map((p) => ({
      id: `mat-${p.securityId}`,
      label: p.assetType === "Reverse Repo" ? "逆回购到期" : p.assetType === "NCD" ? "存单到期兑付" : "今日到期资产本息",
      detail: `${p.assetName} · ${p.counterparty}`,
      amount: maturityProceeds(p),
    })),
    { id: "sub", label: "今日申购划款", detail: "T+0 subscriptions", amount: adj.t0Subscription },
    ...(t0SellSettle
      ? [{ id: "sell", label: "今日卖出交收入账", detail: "Settling sells", amount: t0SellSettle }]
      : []),
  ].filter((r) => r.amount !== 0);

  const outflows: CashLine[] = [
    { id: "red", label: "今日赎回出款", detail: "T+0 redemptions", amount: adj.t0Redemption },
    ...trades
      .filter((t) => t.settlementDate === asOf && t.status === "Pending" && isCashOutflowSide(t.side))
      .map((t) => ({
        id: t.id,
        label: t.side === "Deposit" ? "新开立定存交收" : t.side === "Repo" ? "逆回购放款" : "新买入资产交收",
        detail: `${t.assetName} · ${t.counterparty}`,
        amount: t.amount,
      })),
    { id: "fees", label: "管理费 / 托管费计提", detail: "15 bps + 2 bps p.a. / 365", amount: fees },
  ].filter((r) => r.amount !== 0);

  return {
    asOf,
    t1Date,
    openingCash,
    t0Maturing,
    t0NetSub,
    t0BuySettle,
    t0Available,
    t1Maturing,
    t1NetSub,
    t1ScheduledOut,
    t1Available,
    netSubT0: t0NetSub,
    fees,
    excessOk,
    inflows,
    outflows,
  };
}
