import type { BookCcy, BookPosition } from "@/lib/holdings/types";
import type { DeskTrade } from "@/lib/holdings/trades";
import type { ParsedValuationReport } from "@/lib/services/types";

export const RESET_CURRENCIES = ["USD", "HKD", "CNY"] as const;
export type ResetCurrency = (typeof RESET_CURRENCIES)[number];

export type InceptionResetInput = {
  inceptionDate: string;
  cashAmount: number;
  currency: ResetCurrency;
  fundCcy: BookCcy;
  fundCode: string;
  fundName: string;
};

export function bookCcyForReset(currency: ResetCurrency, fundCcy: BookCcy): BookCcy {
  return currency === "USD" || currency === "HKD" ? currency : fundCcy;
}

export function buildInceptionCashPosition(input: InceptionResetInput): BookPosition {
  const bookCcy = bookCcyForReset(input.currency, input.fundCcy);
  const amount = Number.isFinite(input.cashAmount) ? Math.max(0, input.cashAmount) : 0;
  const labelCcy = input.currency;
  return {
    securityId: `CASH-${labelCcy}-HOLDING`,
    assetName: `${labelCcy} Cash Custody Account (托管活期)`,
    assetType: "Cash / Bank Deposit",
    currency: bookCcy,
    counterparty: "Custodian",
    isin: "",
    issueDate: input.inceptionDate,
    maturityDate: input.inceptionDate,
    parValue: amount,
    amortizedCost: amount,
    shadowMtm: amount,
    couponRatePct: 0,
    couponType: "fixed",
    resetDate: null,
    rating: "NR",
    dayCount: bookCcy === "HKD" ? "Act/365" : "Act/360",
  };
}

export function buildInceptionTrade(input: InceptionResetInput): DeskTrade {
  const bookCcy = bookCcyForReset(input.currency, input.fundCcy);
  const amount = Number.isFinite(input.cashAmount) ? Math.max(0, input.cashAmount) : 0;
  return {
    id: `TRD-${bookCcy}-INCEPT-${input.inceptionDate}`,
    tradeDate: input.inceptionDate,
    settlementDate: input.inceptionDate,
    side: "Subscription",
    assetName: "成立出资 / Capital Injection",
    securityId: `CASH-${input.currency}-HOLDING`,
    counterparty: "Transfer Agent",
    amount,
    currency: bookCcy,
    yieldPct: 0,
    status: "Settled",
    notes: `${input.fundName} inception capital injection`,
    grossAmount: amount,
  };
}

export function buildInceptionValuation(input: InceptionResetInput): ParsedValuationReport {
  const amount = Number.isFinite(input.cashAmount) ? Math.max(0, input.cashAmount) : 0;
  return {
    custodian: "BOCI",
    template: "GENERIC",
    fileName: "inception-reset",
    asOf: input.inceptionDate,
    holdings: [],
    cashBalance: amount,
    cashLabel: `${input.currency} Cash Custody Account (托管活期)`,
    nav: amount,
    units: null,
    columnMap: {},
    warnings: ["基金已重置为成立初始状态：仅托管活期，无证券持仓。"],
    rawRowCount: 0,
    bookSynced: true,
  };
}

export function confirmPhraseMatches(typed: string, fundName: string, fundCode: string): boolean {
  const t = typed.trim();
  if (!t) return false;
  if (t.toUpperCase() === "RESET") return true;
  return t === fundName || t === fundCode;
}
