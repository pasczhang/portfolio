export type AssetCategory = "BOND" | "TIME_DEPOSIT" | "CASH" | "REPO" | "OTHER";

export interface UnifiedHoldingPosition {
  id: string;
  assetCategory: AssetCategory;
  assetCode: string;
  assetName: string;
  currency: string;
  nominalAmount: number;
  bookCost: number;
  marketValue: number;
  navRatio: number;
  valueDate?: string;
  maturityDate?: string;
  couponRate?: number;
  daysToMaturity: number;
}

export interface PortfolioDurationMetrics {
  totalAssetValue: number;
  wamDays: number;
  walDays: number;
  cashRatio: number;
  bondRatio: number;
  depositRatio: number;
  repoRatio: number;
}
