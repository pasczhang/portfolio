import type { BookCcy, BookPosition, SfcAssetType } from "@/lib/holdings/types";
import type { BookMetrics } from "@/lib/holdings/types";

export type CustodianCode = "HSBC" | "BOCI" | "CITI" | "SCB" | "UNKNOWN";

export type ParsedAssetClass = "CD" | "CP" | "REPO" | "DEPOSIT" | "BOND" | "CASH" | "OTHER";

export type ParsedValuationHolding = {
  rowNumber: number;
  securityId: string;
  isin: string;
  name: string;
  assetTypeRaw: string;
  assetClass: ParsedAssetClass;
  sfcAssetType: SfcAssetType | null;
  parValue: number;
  amortizedCost: number;
  accruedInterest: number;
  marketValue: number;
  currency: string;
  issuer: string;
  maturityDate: string;
  couponRatePct: number;
  issueDate: string;
  unrealizedPnL: number;
};

export type ColumnMap = Partial<
  Record<
    "securityId" | "isin" | "name" | "assetType" | "parValue" | "amortizedCost" | "accrued" | "marketValue" | "currency" | "issuer" | "maturity",
    string
  >
>;

export type ValuationTemplate = "BOCI_USD_MMF" | "BOCI_PRUDENTIAL" | "GENERIC";

export type ParsedValuationReport = {
  custodian: CustodianCode;
  template: ValuationTemplate;
  fileName: string;
  asOf: string | null;
  holdings: ParsedValuationHolding[];
  cashBalance: number | null;
  cashLabel: string;
  nav: number | null;
  units: number | null;
  columnMap: ColumnMap;
  warnings: string[];
  rawRowCount: number;
  /** Set after 一键采纳：内部账本已与本表对齐，对账直接 MATCHED。 */
  bookSynced?: boolean;
};

export type ReconDimension = "CASH" | "PAR" | "ACCRUED" | "NAV" | "MISSING" | "EXTRA";
export type ReconSeverity = "MATCHED" | "PERFECT_MATCH" | "WARNING" | "BREAK";

export type ReconBreak = {
  id: string;
  dimension: ReconDimension;
  key: string;
  label: string;
  internal: number;
  custodian: number;
  diff: number;
  reason: string;
  severity: "WARNING" | "BREAK";
};

export type ReconciliationResult = {
  asOf: string;
  status: ReconSeverity;
  matchRatePct: number;
  compared: number;
  breaks: ReconBreak[];
  cashInternal: number;
  cashCustodian: number | null;
  parInternal: number;
  parCustodian: number;
  accruedInternal: number;
  accruedCustodian: number;
  navInternal: number;
  navCustodian: number | null;
  unitsInternal: number;
  yieldPer10k: number;
};

export type TaType = "SUB" | "RED";

export type TaFlow = {
  id: string;
  investorCode: string;
  type: TaType;
  amount: number;
  tradeDate: string;
  settlementDate: string;
  confirmed: boolean;
};

export type BenchmarkTenor = "ON" | "1M" | "3M";
export type BenchmarkIndex = "SOFR" | "HIBOR" | "SHIBOR";

export type BenchmarkFixing = {
  index: BenchmarkIndex;
  tenor: BenchmarkTenor;
  date: string;
  ratePct: number;
  source: string;
};

export type DailySnapshot = {
  id: string;
  fundId: string;
  asOf: string;
  createdAt: string;
  metrics: BookMetrics;
  reconStatus: ReconSeverity | "SKIPPED";
  breakCount: number;
  notes: string;
};

export type EodStepId = "recon" | "engine" | "archive" | "roll";

export type EodStepLog = {
  id: EodStepId;
  title: string;
  status: "pending" | "running" | "ok" | "blocked" | "skipped";
  detail: string;
};

export type EodRunResult = {
  ok: boolean;
  blocked: boolean;
  steps: EodStepLog[];
  snapshot: DailySnapshot | null;
  nextAsOf: string;
  nextPositions: BookPosition[];
  webhookPayload: OpsWebhookPayload;
};

export type OpsWebhookPayload = {
  title: string;
  fund: string;
  asOf: string;
  nav: number;
  yield7d: number;
  wamDays: number;
  walDays: number;
  deviationPct: number;
  deviationStatus: string;
  dlaPct: number;
  wlaPct: number;
  breakCount: number;
  reconStatus: string;
  breaksSummary: string;
  ccy: BookCcy;
};
