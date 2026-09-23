import { PRODUCT_AS_OF } from "@/constants/calendar";
import { addDays } from "@/lib/holdings/dates";
import type { BookCcy } from "@/lib/holdings/types";

export const TRADE_SIDES = ["Buy", "Sell", "Deposit", "Maturity", "Repo", "Subscription", "Redemption"] as const;
export type TradeSide = (typeof TRADE_SIDES)[number];
export const SETTLEMENT_STATUSES = ["Settled", "Pending"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const TRADE_SIDE_LABELS: Record<TradeSide, string> = {
  Buy: "买入 Buy",
  Sell: "卖出 Sell",
  Deposit: "定存 Deposit",
  Maturity: "到期兑付 Maturity",
  Repo: "回购 Repo",
  Subscription: "申购 Subscription",
  Redemption: "赎回 Redemption",
};

export type DeskTrade = {
  id: string;
  tradeDate: string;
  settlementDate: string;
  side: TradeSide;
  assetName: string;
  securityId: string;
  isin?: string;
  counterparty: string;
  amount: number;
  currency: BookCcy;
  yieldPct: number;
  price?: number;
  grossAmount?: number;
  accruedInterest?: number;
  commission?: number;
  notes?: string;
  status: SettlementStatus;
};

export type CashAdj = {
  t0Subscription: number;
  t0Redemption: number;
  t1Subscription: number;
  t1Redemption: number;
  t0Expenses: number;
  t1Expenses: number;
};

export type SimSettle = "T+0" | "T+1";
export type SimAssetKind = "Govt Bills" | "NCD" | "Cash / Bank Deposit" | "Commercial Paper";

export type CashSimTrade = {
  id: string;
  side: "Buy" | "Sell";
  assetKind: SimAssetKind;
  name: string;
  amount: number;
  settle: SimSettle;
};

export const SIM_ASSET_KINDS: { id: SimAssetKind; label: string }[] = [
  { id: "Govt Bills", label: "国债 / 外汇基金票据" },
  { id: "NCD", label: "同业存单 (CD)" },
  { id: "Cash / Bank Deposit", label: "定存 (TD)" },
  { id: "Commercial Paper", label: "商业票据 (CP)" },
];

export function defaultCashAdj(_ccy?: BookCcy): CashAdj {
  return {
    t0Subscription: 0,
    t0Redemption: 0,
    t1Subscription: 0,
    t1Redemption: 0,
    t0Expenses: 0,
    t1Expenses: 0,
  };
}

const asOf = PRODUCT_AS_OF;
const t1 = addDays(asOf, 1);
const yest = addDays(asOf, -1);

export const USD_SAMPLE_TRADES: DeskTrade[] = [
  {
    id: "TRD-USD-20260916-001",
    tradeDate: asOf,
    settlementDate: asOf,
    side: "Buy",
    assetName: "US Treasury Bill 4W",
    securityId: "UST-4W-20261014",
    counterparty: "US Treasury",
    amount: 5_000_000,
    currency: "USD",
    yieldPct: 5.18,
    status: "Pending",
  },
  {
    id: "TRD-USD-20260916-002",
    tradeDate: asOf,
    settlementDate: asOf,
    side: "Maturity",
    assetName: "Standard Chartered USD NCD (maturing today)",
    securityId: "SCB-USD-NCD-T0",
    counterparty: "Standard Chartered",
    amount: 8_000_000,
    currency: "USD",
    yieldPct: 5.08,
    status: "Settled",
  },
  {
    id: "TRD-USD-20260915-003",
    tradeDate: yest,
    settlementDate: asOf,
    side: "Deposit",
    assetName: "BOCI USD Term Deposit 7D",
    securityId: "BOCI-USD-TD-7D",
    counterparty: "BOCI",
    amount: 8_000_000,
    currency: "USD",
    yieldPct: 4.85,
    status: "Settled",
  },
  {
    id: "TRD-USD-20260916-004",
    tradeDate: asOf,
    settlementDate: t1,
    side: "Repo",
    assetName: "Overnight Federal Reserve Reverse Repo",
    securityId: "FED-ON-RRP",
    counterparty: "Federal Reserve",
    amount: 38_000_000,
    currency: "USD",
    yieldPct: 5.3,
    status: "Pending",
  },
  {
    id: "TRD-USD-20260912-005",
    tradeDate: "2026-09-12",
    settlementDate: "2026-09-12",
    side: "Buy",
    assetName: "HSBC USD Negotiable CD 45D",
    securityId: "HSBC-USD-NCD-45",
    counterparty: "HSBC",
    amount: 18_200_000,
    currency: "USD",
    yieldPct: 5.05,
    status: "Settled",
  },
  {
    id: "TRD-USD-20260910-006",
    tradeDate: "2026-09-10",
    settlementDate: "2026-09-11",
    side: "Sell",
    assetName: "ICBC USD Negotiable CD 120D",
    securityId: "ICBC-USD-NCD-120-TRIM",
    counterparty: "ICBC",
    amount: 2_000_000,
    currency: "USD",
    yieldPct: 4.9,
    status: "Settled",
  },
];

export const HKD_SAMPLE_TRADES: DeskTrade[] = [
  {
    id: "TRD-HKD-20260916-001",
    tradeDate: asOf,
    settlementDate: asOf,
    side: "Buy",
    assetName: "HKMA Exchange Fund Bill 1M",
    securityId: "HKMA-EFB-1M",
    counterparty: "HKMA",
    amount: 40_000_000,
    currency: "HKD",
    yieldPct: 3.92,
    status: "Pending",
  },
  {
    id: "TRD-HKD-20260916-002",
    tradeDate: asOf,
    settlementDate: asOf,
    side: "Maturity",
    assetName: "Hang Seng HKD Time Deposit (maturing today)",
    securityId: "HASE-HKD-TD-T0",
    counterparty: "Hang Seng Bank",
    amount: 80_000_000,
    currency: "HKD",
    yieldPct: 3.48,
    status: "Settled",
  },
  {
    id: "TRD-HKD-20260915-003",
    tradeDate: yest,
    settlementDate: asOf,
    side: "Deposit",
    assetName: "HSBC HKD Term Deposit 14D",
    securityId: "HSBC-HKD-TD-14D",
    counterparty: "HSBC",
    amount: 160_000_000,
    currency: "HKD",
    yieldPct: 3.52,
    status: "Settled",
  },
  {
    id: "TRD-HKD-20260916-004",
    tradeDate: asOf,
    settlementDate: t1,
    side: "Repo",
    assetName: "HKMA Overnight Reverse Repo",
    securityId: "HKMA-ON-REPO",
    counterparty: "HKMA",
    amount: 180_000_000,
    currency: "HKD",
    yieldPct: 3.35,
    status: "Pending",
  },
  {
    id: "TRD-HKD-20260908-005",
    tradeDate: "2026-09-08",
    settlementDate: "2026-09-08",
    side: "Buy",
    assetName: "Bank of China (Hong Kong) HKD NCD 2M",
    securityId: "BOCHK-NCD-2M",
    counterparty: "Bank of China (Hong Kong)",
    amount: 180_000_000,
    currency: "HKD",
    yieldPct: 4.15,
    status: "Settled",
  },
  {
    id: "TRD-HKD-20260911-006",
    tradeDate: "2026-09-11",
    settlementDate: "2026-09-12",
    side: "Sell",
    assetName: "HSBC HKD Commercial Paper 45D",
    securityId: "HSBC-HKD-CP-45-TRIM",
    counterparty: "HSBC",
    amount: 12_000_000,
    currency: "HKD",
    yieldPct: 3.69,
    status: "Settled",
  },
];

export function sampleTradesFor(ccy: BookCcy): DeskTrade[] {
  return (ccy === "HKD" ? HKD_SAMPLE_TRADES : USD_SAMPLE_TRADES).map((row) => ({ ...row }));
}

export function isCashOutflowSide(side: TradeSide): boolean {
  return side === "Buy" || side === "Deposit" || side === "Repo" || side === "Redemption";
}

export function isCashInflowSide(side: TradeSide): boolean {
  return side === "Sell" || side === "Maturity" || side === "Subscription";
}

export function suggestedTradeGross(opts: {
  amount: number;
  price?: number | null;
  accruedInterest?: number | null;
  commission?: number | null;
}): number {
  const qty = Number(opts.amount) || 0;
  const px = opts.price == null || !Number.isFinite(Number(opts.price)) ? 100 : Number(opts.price);
  const acc = Number(opts.accruedInterest) || 0;
  const fee = Number(opts.commission) || 0;
  return qty * (px / 100) + acc + fee;
}
