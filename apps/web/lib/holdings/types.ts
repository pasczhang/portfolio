export const SFC_ASSET_TYPES = [
  "Cash / Bank Deposit",
  "Govt Bills",
  "NCD",
  "Commercial Paper",
  "Reverse Repo",
] as const;

export type SfcAssetType = (typeof SFC_ASSET_TYPES)[number];
export type BookCcy = "USD" | "HKD";
export type BookOrigin = "demo" | "import";

export type BookPosition = {
  securityId: string;
  assetName: string;
  assetType: SfcAssetType;
  currency: BookCcy;
  counterparty: string;
  isin: string;
  issueDate: string;
  maturityDate: string;
  parValue: number;
  amortizedCost: number;
  shadowMtm: number;
  couponRatePct: number;
  couponType: "fixed" | "floating";
  resetDate: string | null;
  rating: string;
  dayCount: string;
  lifecycle?: "Active" | "Matured";
  bookRole?: "asset" | "liability";
  avgCostPrice?: number;
};

export type ParsedHoldingRow = {
  rowNumber: number;
  raw: Record<string, string>;
  position: Partial<BookPosition> & { assetName?: string };
  errors: string[];
  warnings: string[];
};

export type ImportPreview = {
  rows: ParsedHoldingRow[];
  valid: BookPosition[];
  errorCount: number;
  warningCount: number;
  currencyMismatches: number;
};

export type BookMetrics = {
  asOf: string;
  aum: number;
  cash: number;
  securities: number;
  officialNav: number;
  shadowNav: number;
  deviationBps: number;
  deviationPct: number;
  deviationStatus: string;
  wamDays: number;
  walDays: number;
  cashRatio: number;
  bondRatio: number;
  depositRatio: number;
  repoRatio: number;
  dlaPct: number;
  wlaPct: number;
  portfolioYieldPct: number;
  modifiedDuration: number;
  dv01: number;
  weightedYtm: number;
  leveragePct: number;
  totalAssets: number;
  nav: number;
  repoLiabilities: number;
};
