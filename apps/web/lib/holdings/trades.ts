import { PRODUCT_AS_OF } from "@/constants/calendar";
import { addDays } from "@/lib/holdings/dates";
import type { BookCcy } from "@/lib/holdings/types";

export const TRADE_SIDES = ["Buy", "Sell", "Deposit", "Maturity", "Repo"] as const;
export type TradeSide = (typeof TRADE_SIDES)[number];
export const SETTLEMENT_STATUSES = ["Settled", "Pending"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export type DeskTrade = {
  id: string;
  tradeDate: string;
  settlementDate: string;
  side: TradeSide;
  assetName: string;
  securityId: string;
  counterparty: string;
  amount: number;
  currency: BookCcy;
  yieldPct: number;
  status: SettlementStatus;
};

export type CashAdj = {
  t0Subscription: number;
  t0Redemption: number;
  t1Subscription: number;
  t1Redemption: number;
};

export function defaultCashAdj(ccy: BookCcy): CashAdj {
  return ccy === "HKD"
    ? { t0Subscription: 28_000_000, t0Redemption: 12_400_000, t1Subscription: 22_500_000, t1Redemption: 15_200_000 }
    : { t0Subscription: 4_500_000, t0Redemption: 1_850_000, t1Subscription: 3_200_000, t1Redemption: 2_100_000 };
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
  return side === "Buy" || side === "Deposit" || side === "Repo";
}

export function isCashInflowSide(side: TradeSide): boolean {
  return side === "Sell" || side === "Maturity";
}
