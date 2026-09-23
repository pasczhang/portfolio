import { addDays, daysBetween } from "@/lib/holdings/dates";
import type { BookCcy, BookPosition } from "@/lib/holdings/types";
import type { DeskTrade, SettlementStatus, TradeSide } from "@/lib/holdings/trades";

export type TradeAssetCategory = "BOND" | "TERM_DEPOSIT" | "REPO" | "CASH";

export type BondSide = "BUY" | "SELL";
export type DepositSide = "DEPOSIT" | "WITHDRAW";
export type RepoSide = "REVERSE_REPO" | "REPO";
export type CashSide = "INFLOW" | "OUTFLOW";
export type QuoteType = "CLEAN" | "DIRTY" | "YTM";
export type CouponFreq = "ANNUAL" | "SEMI" | "QUARTERLY";
export type DayCount = "ACT/365" | "ACT/360" | "30/360" | "ACT/ACT";
export type DepositInterestRule = "AT_MATURITY" | "MONTHLY" | "QUARTERLY";

export type TradeDetails = {
  quoteType?: QuoteType;
  dirtyPrice?: number;
  couponRate?: number;
  frequency?: CouponFreq;
  dayCount?: DayCount;
  maturityDate?: string;
  valueDate?: string;
  lots?: number;
  bankName?: string;
  tenorDays?: number;
  interestRule?: DepositInterestRule;
  expectedInterest?: number;
  totalMaturityAmount?: number;
  repoCode?: string;
  termDays?: number;
  firstLegDate?: string;
  secondLegDate?: string;
  interestAmount?: number;
  matureAmount?: number;
  collateralCode?: string;
  collateralQty?: number;
  haircutPct?: number;
  fromAccount?: string;
  toAccount?: string;
  feeType?: string;
  formSide?: BondSide | DepositSide | RepoSide | CashSide;
};

export const ASSET_CATEGORY_OPTIONS: { id: TradeAssetCategory; label: string }[] = [
  { id: "BOND", label: "债券 (Bond)" },
  { id: "TERM_DEPOSIT", label: "定期存款 (Term Deposit)" },
  { id: "REPO", label: "质押式/买断式回购 (Repo)" },
  { id: "CASH", label: "现金划转 (Cash Transfer)" },
];

export const BOND_SIDES: { id: BondSide; label: string }[] = [
  { id: "BUY", label: "买入 (Buy)" },
  { id: "SELL", label: "卖出 (Sell)" },
];

export const DEPOSIT_SIDES: { id: DepositSide; label: string }[] = [
  { id: "DEPOSIT", label: "存入 (Deposit)" },
  { id: "WITHDRAW", label: "支取/到期 (Withdraw/Maturity)" },
];

export const REPO_SIDES: { id: RepoSide; label: string }[] = [
  { id: "REVERSE_REPO", label: "逆回购融出 (Reverse Repo - Lending)" },
  { id: "REPO", label: "正回购融入 (Repo - Borrowing)" },
];

export const CASH_SIDES: { id: CashSide; label: string }[] = [
  { id: "INFLOW", label: "转入 (Inflow)" },
  { id: "OUTFLOW", label: "转出 (Outflow)" },
];

export const QUOTE_TYPES: { id: QuoteType; label: string }[] = [
  { id: "CLEAN", label: "净价报价 (Clean Price)" },
  { id: "DIRTY", label: "全价报价 (Dirty Price)" },
  { id: "YTM", label: "到期收益率 (YTM %)" },
];

export const COUPON_FREQS: { id: CouponFreq; label: string }[] = [
  { id: "ANNUAL", label: "按年 Annual" },
  { id: "SEMI", label: "半年 Semi" },
  { id: "QUARTERLY", label: "季度 Quarterly" },
];

export const DAY_COUNTS: { id: DayCount; label: string }[] = [
  { id: "ACT/365", label: "ACT/365" },
  { id: "ACT/360", label: "ACT/360" },
  { id: "30/360", label: "30/360" },
  { id: "ACT/ACT", label: "ACT/ACT" },
];

export const DEPOSIT_RULES: { id: DepositInterestRule; label: string }[] = [
  { id: "AT_MATURITY", label: "到期一次还本付息" },
  { id: "MONTHLY", label: "按月结息" },
  { id: "QUARTERLY", label: "按季结息" },
];

export const DEPOSIT_TENORS = [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "1M", days: 30 },
  { id: "90", label: "3M", days: 90 },
  { id: "180", label: "6M", days: 180 },
  { id: "365", label: "1Y", days: 365 },
] as const;

export const REPO_TENORS = [
  { id: "1", label: "1D", days: 1 },
  { id: "7", label: "7D", days: 7 },
  { id: "14", label: "14D", days: 14 },
  { id: "30", label: "30D", days: 30 },
] as const;

export const CASH_ACCOUNTS = ["托管户 Custodian", "活期户 Demand", "证券户 Securities", "费用户 Fees"];
export const FEE_TYPES = ["调拨 Transfer", "管理费 Mgmt Fee", "托管费 Custody Fee", "其他 Other"];

export type PolymorphicDraft = {
  assetCategory: TradeAssetCategory;
  tradeDate: string;
  settleDate: string;
  counterparty: string;
  notes: string;
  status: SettlementStatus;
  bondSide: BondSide;
  depositSide: DepositSide;
  repoSide: RepoSide;
  cashSide: CashSide;
  bondCode: string;
  bondName: string;
  parValue: string;
  lots: string;
  quoteType: QuoteType;
  cleanPrice: string;
  dirtyPrice: string;
  ytmPct: string;
  accruedPer100: string;
  couponRate: string;
  frequency: CouponFreq;
  dayCount: DayCount;
  maturityDate: string;
  valueDate: string;
  commission: string;
  bankName: string;
  principal: string;
  interestRate: string;
  startDate: string;
  depositMaturity: string;
  tenorDays: string;
  interestRule: DepositInterestRule;
  repoCode: string;
  repoPrincipal: string;
  repoRate: string;
  termDays: string;
  firstLegDate: string;
  secondLegDate: string;
  collateralCode: string;
  collateralQty: string;
  haircutPct: string;
  fromAccount: string;
  toAccount: string;
  cashAmount: string;
  feeType: string;
};

export function n(v: string | number | undefined): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function yearBasis(dayCount: DayCount): number {
  if (dayCount === "ACT/360" || dayCount === "30/360") return 360;
  return 365;
}

export function defaultFormSide(category: TradeAssetCategory): Pick<
  PolymorphicDraft,
  "bondSide" | "depositSide" | "repoSide" | "cashSide"
> {
  return {
    bondSide: "BUY",
    depositSide: "DEPOSIT",
    repoSide: "REVERSE_REPO",
    cashSide: "OUTFLOW",
  };
}

export function emptyPolymorphicDraft(asOf: string): PolymorphicDraft {
  return {
    assetCategory: "BOND",
    tradeDate: asOf,
    settleDate: asOf,
    counterparty: "",
    notes: "",
    status: "Pending",
    ...defaultFormSide("BOND"),
    bondCode: "",
    bondName: "",
    parValue: "5000000",
    lots: "5000",
    quoteType: "CLEAN",
    cleanPrice: "99.50",
    dirtyPrice: "",
    ytmPct: "4.25",
    accruedPer100: "",
    couponRate: "4.25",
    frequency: "ANNUAL",
    dayCount: "ACT/365",
    maturityDate: addDays(asOf, 90),
    valueDate: asOf,
    commission: "0",
    bankName: "",
    principal: "8000000",
    interestRate: "2.35",
    startDate: asOf,
    depositMaturity: addDays(asOf, 7),
    tenorDays: "7",
    interestRule: "AT_MATURITY",
    repoCode: "R-007",
    repoPrincipal: "10000000",
    repoRate: "1.85",
    termDays: "7",
    firstLegDate: asOf,
    secondLegDate: addDays(asOf, 7),
    collateralCode: "",
    collateralQty: "",
    haircutPct: "100",
    fromAccount: CASH_ACCOUNTS[0],
    toAccount: CASH_ACCOUNTS[1],
    cashAmount: "1000000",
    feeType: FEE_TYPES[0],
  };
}

export function resetExclusiveFields(prev: PolymorphicDraft, category: TradeAssetCategory): PolymorphicDraft {
  const base = emptyPolymorphicDraft(prev.tradeDate || prev.settleDate);
  return {
    ...base,
    assetCategory: category,
    tradeDate: prev.tradeDate,
    settleDate: prev.settleDate,
    counterparty: prev.counterparty,
    notes: prev.notes,
    status: prev.status,
  };
}

export type TradeCalc = {
  accruedPer100: number;
  cleanPrice: number;
  dirtyPrice: number;
  settlementAmount: number;
  interest: number;
  maturityProceeds: number;
  cashDelta: number;
  tenorDays: number;
};

export function computeTradeCalc(d: PolymorphicDraft): TradeCalc {
  const fee = n(d.commission);
  if (d.assetCategory === "BOND") {
    const par = n(d.parValue);
    const days = Math.max(0, daysBetween(d.valueDate || d.tradeDate, d.settleDate));
    const autoAccrued = n(d.couponRate) * (days / yearBasis(d.dayCount));
    const accruedPer100 = d.accruedPer100 === "" ? autoAccrued : n(d.accruedPer100);
    const remain = Math.max(1, daysBetween(d.settleDate, d.maturityDate));
    let clean = n(d.cleanPrice);
    let dirty = n(d.dirtyPrice);
    if (d.quoteType === "YTM") {
      const ytm = n(d.ytmPct) / 100;
      clean = 100 / (1 + ytm * (remain / yearBasis(d.dayCount)));
      dirty = clean + accruedPer100;
    } else if (d.quoteType === "DIRTY") {
      dirty = n(d.dirtyPrice);
      clean = dirty - accruedPer100;
    } else {
      clean = n(d.cleanPrice);
      dirty = clean + accruedPer100;
    }
    const settlementAmount = (dirty / 100) * par + fee;
    const cashDelta = d.bondSide === "BUY" ? -settlementAmount : settlementAmount;
    return {
      accruedPer100,
      cleanPrice: clean,
      dirtyPrice: dirty,
      settlementAmount,
      interest: (accruedPer100 / 100) * par,
      maturityProceeds: settlementAmount,
      cashDelta,
      tenorDays: remain,
    };
  }
  if (d.assetCategory === "TERM_DEPOSIT") {
    const principal = n(d.principal);
    const tenor = Math.max(0, daysBetween(d.startDate, d.depositMaturity) || n(d.tenorDays));
    const interest = principal * (n(d.interestRate) / 100) * (tenor / 365);
    const maturityProceeds = principal + interest;
    const cashDelta = d.depositSide === "DEPOSIT" ? -(principal + fee) : maturityProceeds - fee;
    return {
      accruedPer100: 0,
      cleanPrice: 100,
      dirtyPrice: 100,
      settlementAmount: Math.abs(cashDelta),
      interest,
      maturityProceeds,
      cashDelta,
      tenorDays: tenor,
    };
  }
  if (d.assetCategory === "REPO") {
    const principal = n(d.repoPrincipal);
    const tenor = Math.max(0, daysBetween(d.firstLegDate, d.secondLegDate) || n(d.termDays));
    const interest = principal * (n(d.repoRate) / 100) * (tenor / yearBasis(d.dayCount));
    const mature = principal + interest;
    const cashDelta = d.repoSide === "REVERSE_REPO" ? -(principal + fee) : principal - fee;
    return {
      accruedPer100: 0,
      cleanPrice: 100,
      dirtyPrice: 100,
      settlementAmount: principal + fee,
      interest,
      maturityProceeds: mature,
      cashDelta,
      tenorDays: tenor,
    };
  }
  const amount = n(d.cashAmount);
  const settlementAmount = amount + fee;
  const cashDelta = d.cashSide === "OUTFLOW" ? -settlementAmount : settlementAmount;
  return {
    accruedPer100: 0,
    cleanPrice: 100,
    dirtyPrice: 100,
    settlementAmount,
    interest: 0,
    maturityProceeds: settlementAmount,
    cashDelta,
    tenorDays: 0,
  };
}

export function validatePolymorphicDraft(d: PolymorphicDraft): Record<string, string> {
  const err: Record<string, string> = {};
  if (!d.tradeDate) err.tradeDate = "请选择交易日期";
  if (!d.settleDate) err.settleDate = "请选择结算日期";
  if (d.assetCategory === "BOND") {
    if (!d.bondName.trim() && !d.bondCode.trim()) err.bondName = "请填写债券代码或简称";
    if (!d.counterparty.trim()) err.counterparty = "请填写交易对手";
    if (!(n(d.parValue) > 0)) err.parValue = "面值总额须大于 0";
    if (d.quoteType === "CLEAN" && !(n(d.cleanPrice) > 0)) err.cleanPrice = "净价须大于 0";
    if (d.quoteType === "DIRTY" && !(n(d.dirtyPrice) > 0)) err.dirtyPrice = "全价须大于 0";
    if (d.quoteType === "YTM" && !(n(d.ytmPct) > 0)) err.ytmPct = "收益率须大于 0";
    if (d.maturityDate && d.settleDate && d.maturityDate <= d.settleDate) err.maturityDate = "到期日必须晚于结算日";
  } else if (d.assetCategory === "TERM_DEPOSIT") {
    if (!d.bankName.trim()) err.bankName = "请填写存款银行";
    if (!(n(d.principal) > 0)) err.principal = "本金须大于 0";
    if (!(n(d.interestRate) > 0)) err.interestRate = "年化利率须大于 0";
    if (!d.startDate) err.startDate = "请选择起息日";
    if (!d.depositMaturity) err.depositMaturity = "请选择到期日";
    if (d.startDate && d.depositMaturity && d.depositMaturity <= d.startDate) err.depositMaturity = "到期日必须晚于起息日";
  } else if (d.assetCategory === "REPO") {
    if (!d.repoCode.trim()) err.repoCode = "请填写回购品种/代码";
    if (!d.counterparty.trim()) err.counterparty = "请填写交易对手";
    if (!(n(d.repoPrincipal) > 0)) err.principal = "首期结算金额须大于 0";
    if (!(n(d.repoRate) > 0)) err.repoRate = "回购利率须大于 0";
    if (d.firstLegDate && d.secondLegDate && d.secondLegDate <= d.firstLegDate) {
      err.secondLegDate = "到期结算日必须晚于首次结算日";
    }
  } else {
    if (!(n(d.cashAmount) > 0)) err.cashAmount = "划转金额须大于 0";
    if (!d.fromAccount) err.fromAccount = "请选择划出账户";
    if (!d.toAccount) err.toAccount = "请选择划入账户";
    if (d.fromAccount && d.toAccount && d.fromAccount === d.toAccount) err.toAccount = "划入账户须与划出账户不同";
  }
  return err;
}

function blotterSide(d: PolymorphicDraft): TradeSide {
  if (d.assetCategory === "BOND") return d.bondSide === "BUY" ? "Buy" : "Sell";
  if (d.assetCategory === "TERM_DEPOSIT") return d.depositSide === "DEPOSIT" ? "Deposit" : "Maturity";
  if (d.assetCategory === "REPO") return d.repoSide === "REVERSE_REPO" ? "Repo" : "Sell";
  return d.cashSide === "INFLOW" ? "Subscription" : "Redemption";
}

export function draftToDeskTrade(d: PolymorphicDraft, calc: TradeCalc, fundCcy: BookCcy, existingId?: string): DeskTrade {
  const cat = d.assetCategory;
  const name =
    cat === "BOND"
      ? d.bondName.trim() || d.bondCode.trim()
      : cat === "TERM_DEPOSIT"
        ? `${d.bankName.trim() || "Term Deposit"} ${d.tenorDays}D`
        : cat === "REPO"
          ? d.repoCode.trim()
          : `${d.feeType} ${d.cashSide === "INFLOW" ? "转入" : "转出"}`;
  const code =
    cat === "BOND"
      ? d.bondCode.trim() || d.bondName.trim()
      : cat === "TERM_DEPOSIT"
        ? `TD-${d.bankName.trim() || "BANK"}-${d.depositMaturity}`
        : cat === "REPO"
          ? d.repoCode.trim()
          : `CASH-${d.feeType}`;
  const amount =
    cat === "BOND" ? n(d.parValue) : cat === "TERM_DEPOSIT" ? n(d.principal) : cat === "REPO" ? n(d.repoPrincipal) : n(d.cashAmount);
  const yieldPct =
    cat === "BOND" ? (d.quoteType === "YTM" ? n(d.ytmPct) : n(d.couponRate)) : cat === "TERM_DEPOSIT" ? n(d.interestRate) : cat === "REPO" ? n(d.repoRate) : 0;
  const details: TradeDetails = {
    quoteType: d.quoteType,
    dirtyPrice: calc.dirtyPrice,
    couponRate: n(d.couponRate),
    frequency: d.frequency,
    dayCount: d.dayCount,
    maturityDate: cat === "BOND" ? d.maturityDate : cat === "TERM_DEPOSIT" ? d.depositMaturity : d.secondLegDate,
    valueDate: cat === "BOND" ? d.valueDate : cat === "TERM_DEPOSIT" ? d.startDate : d.firstLegDate,
    lots: n(d.lots) || undefined,
    bankName: d.bankName,
    tenorDays: calc.tenorDays,
    interestRule: d.interestRule,
    expectedInterest: calc.interest,
    totalMaturityAmount: calc.maturityProceeds,
    repoCode: d.repoCode,
    termDays: n(d.termDays) || calc.tenorDays,
    firstLegDate: d.firstLegDate,
    secondLegDate: d.secondLegDate,
    interestAmount: calc.interest,
    matureAmount: calc.maturityProceeds,
    collateralCode: d.collateralCode || undefined,
    collateralQty: n(d.collateralQty) || undefined,
    haircutPct: n(d.haircutPct) || undefined,
    fromAccount: d.fromAccount,
    toAccount: d.toAccount,
    feeType: d.feeType,
    formSide: cat === "BOND" ? d.bondSide : cat === "TERM_DEPOSIT" ? d.depositSide : cat === "REPO" ? d.repoSide : d.cashSide,
  };
  return {
    id: existingId || `TRD-${fundCcy}-${Date.now()}`,
    tradeDate: d.tradeDate,
    settlementDate: d.settleDate,
    side: blotterSide(d),
    assetName: name,
    securityId: code || `MANUAL-${Date.now()}`,
    isin: cat === "BOND" && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(d.bondCode.trim()) ? d.bondCode.trim() : undefined,
    counterparty: d.counterparty.trim() || d.bankName.trim() || "Internal",
    amount,
    currency: fundCcy,
    yieldPct,
    price: cat === "BOND" ? Number(calc.cleanPrice.toFixed(6)) : undefined,
    grossAmount: Number(calc.settlementAmount.toFixed(2)),
    accruedInterest: Number(calc.interest.toFixed(2)),
    commission: n(d.commission),
    notes: d.notes.trim() || undefined,
    status: d.status,
    assetCategory: cat,
    details: details as unknown as Record<string, unknown>,
  };
}

export function inferCategory(trade: DeskTrade): TradeAssetCategory {
  if (trade.assetCategory) return trade.assetCategory;
  if (trade.side === "Deposit" || trade.side === "Maturity") return "TERM_DEPOSIT";
  if (trade.side === "Repo") return "REPO";
  if (trade.side === "Subscription" || trade.side === "Redemption") return "CASH";
  return "BOND";
}

export function deskTradeToDraft(trade: DeskTrade | null, asOf: string): PolymorphicDraft {
  const base = emptyPolymorphicDraft(asOf);
  if (!trade) return base;
  const cat = inferCategory(trade);
  const x = (trade.details || {}) as TradeDetails;
  const formSide = x.formSide;
  return {
    ...base,
    assetCategory: cat,
    tradeDate: trade.tradeDate,
    settleDate: trade.settlementDate,
    counterparty: trade.counterparty,
    notes: trade.notes ?? "",
    status: trade.status,
    bondSide: formSide === "SELL" || trade.side === "Sell" ? "SELL" : "BUY",
    depositSide: formSide === "WITHDRAW" || trade.side === "Maturity" ? "WITHDRAW" : "DEPOSIT",
    repoSide: formSide === "REPO" ? "REPO" : "REVERSE_REPO",
    cashSide: formSide === "INFLOW" || trade.side === "Subscription" ? "INFLOW" : "OUTFLOW",
    bondCode: trade.isin || trade.securityId,
    bondName: trade.assetName,
    parValue: String(trade.amount ?? ""),
    lots: x.lots != null ? String(x.lots) : String(Math.round((trade.amount || 0) / 1000) || ""),
    quoteType: x.quoteType || "CLEAN",
    cleanPrice: trade.price != null ? String(trade.price) : "100",
    dirtyPrice: x.dirtyPrice != null ? String(x.dirtyPrice) : "",
    ytmPct: String(trade.yieldPct ?? ""),
    accruedPer100: "",
    couponRate: String(x.couponRate ?? trade.yieldPct ?? ""),
    frequency: x.frequency || "ANNUAL",
    dayCount: x.dayCount || "ACT/365",
    maturityDate: x.maturityDate || addDays(trade.settlementDate, 90),
    valueDate: x.valueDate || trade.tradeDate,
    commission: String(trade.commission ?? 0),
    bankName: x.bankName || trade.counterparty,
    principal: String(trade.amount ?? ""),
    interestRate: String(trade.yieldPct ?? ""),
    startDate: x.valueDate || trade.settlementDate,
    depositMaturity: x.maturityDate || addDays(trade.settlementDate, 7),
    tenorDays: String(x.tenorDays ?? daysBetween(trade.settlementDate, x.maturityDate || addDays(trade.settlementDate, 7))),
    interestRule: x.interestRule || "AT_MATURITY",
    repoCode: x.repoCode || trade.securityId,
    repoPrincipal: String(trade.amount ?? ""),
    repoRate: String(trade.yieldPct ?? ""),
    termDays: String(x.termDays ?? 7),
    firstLegDate: x.firstLegDate || trade.settlementDate,
    secondLegDate: x.secondLegDate || addDays(trade.settlementDate, x.termDays ?? 7),
    collateralCode: x.collateralCode ?? "",
    collateralQty: x.collateralQty != null ? String(x.collateralQty) : "",
    haircutPct: x.haircutPct != null ? String(x.haircutPct) : "100",
    fromAccount: x.fromAccount || CASH_ACCOUNTS[0],
    toAccount: x.toAccount || CASH_ACCOUNTS[1],
    cashAmount: String(trade.amount ?? ""),
    feeType: x.feeType || FEE_TYPES[0],
  };
}

export function applyHoldingToDraft(d: PolymorphicDraft, p: BookPosition): PolymorphicDraft {
  const cat = d.assetCategory;
  const lots = p.parValue ? String(Math.round(p.parValue / 1000)) : d.lots;
  if (cat === "BOND") {
    return {
      ...d,
      bondCode: p.isin && p.isin !== "—" ? p.isin : p.securityId,
      bondName: p.assetName,
      counterparty: p.counterparty || d.counterparty,
      couponRate: String(p.couponRatePct ?? d.couponRate),
      maturityDate: p.maturityDate || d.maturityDate,
      valueDate: p.issueDate || d.valueDate,
      parValue: String(p.parValue || d.parValue),
      lots,
      dayCount: (p.dayCount as DayCount) || d.dayCount,
    };
  }
  if (cat === "TERM_DEPOSIT") {
    const tenor = Math.max(1, daysBetween(p.issueDate || d.startDate, p.maturityDate || d.depositMaturity));
    return {
      ...d,
      bankName: p.counterparty || p.assetName,
      counterparty: p.counterparty || d.counterparty,
      principal: String(p.parValue || p.amortizedCost || d.principal),
      interestRate: String(p.couponRatePct || d.interestRate),
      startDate: p.issueDate || d.startDate,
      depositMaturity: p.maturityDate || d.depositMaturity,
      tenorDays: String(tenor),
    };
  }
  if (cat === "REPO") {
    const tenor = Math.max(1, daysBetween(p.issueDate || d.firstLegDate, p.maturityDate || d.secondLegDate));
    return {
      ...d,
      repoCode: p.securityId || p.assetName,
      counterparty: p.counterparty || d.counterparty,
      repoPrincipal: String(p.parValue || p.amortizedCost || d.repoPrincipal),
      repoRate: String(p.couponRatePct || d.repoRate),
      firstLegDate: p.issueDate || d.firstLegDate,
      secondLegDate: p.maturityDate || d.secondLegDate,
      termDays: String(tenor),
    };
  }
  return {
    ...d,
    cashAmount: String(p.amortizedCost || d.cashAmount),
    counterparty: p.counterparty || d.counterparty,
  };
}
