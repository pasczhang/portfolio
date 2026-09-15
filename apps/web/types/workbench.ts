export type AlertTone = "ok" | "watch" | "breach";

export type CashLadderRow = {
  date: string;
  tenor: string;
  subscription_inflow: number;
  redemption_outflow: number;
  principal_maturity: number;
  interest_income: number;
  fx_hedge_flow: number;
  closing_cash: number;
  net_flow: number;
};

export type EnginePosition = {
  security_id: string;
  book_value: number | string;
  coupon_type: string;
  maturity_date: string;
  rate_reset_date?: string | null;
  asset_class: string;
  is_sovereign?: boolean;
  settlement_lag_business_days?: number;
  pledged_ratio?: number | string;
  issuer_id?: string;
  issuer_name?: string | null;
  coupon_rate?: number | string | null;
  shadow_mtm?: number | string | null;
};

export type CashLadderEntry = {
  amount: number | string;
  available_on: string;
  is_overnight_deposit?: boolean;
};

export type WorkbenchSnapshot = {
  as_of: string;
  fund_code: string;
  aum: number | string;
  official_nav: number | string;
  shadow_nav: number | string;
  deviation_bps: number | string;
  deviation_status: string;
  wam_days: number | string;
  wal_days: number | string;
  dla_pct: number | string;
  wla_pct: number | string;
  wam_limit: number;
  wal_limit: number;
  dla_floor: number | string;
  wla_floor: number | string;
  cash_ladder: CashLadderRow[];
  positions: EnginePosition[];
  cash: CashLadderEntry[];
  updated_at: string;
};

export type MetricDelta = {
  id: string;
  label: string;
  unit: string;
  before: number | string;
  after: number | string;
  delta: number | string;
  limit?: number | string | null;
  floor?: number | string | null;
  breached: boolean;
  watch: boolean;
  note?: string | null;
};

export type PreTradeWhatIfResult = {
  nav_before: number | string;
  nav_after: number | string;
  cash_after?: number | string;
  metrics: MetricDelta[];
  concentration: Array<{
    issuer_id: string;
    issuer_name: string | null;
    before_pct: number | string;
    after_pct: number | string;
    limit_pct?: number | string;
    privileged_limit_pct?: number | string;
    privileged?: boolean;
    breached: boolean;
    is_trade_issuer: boolean;
  }>;
  flags: Array<{ code: string; severity: string; message: string; clause?: string | null }>;
  decision: "PASS" | "WATCH" | "BLOCK";
  allow: boolean;
  intercept: boolean;
  gate_title?: string;
  gate_detail?: string;
};

export type WhatIfForm = {
  securityCode: string;
  securityName: string;
  listed: boolean;
  assetClass: "TD" | "NCD" | "T-Bill" | "Reverse Repo";
  counterparty: string;
  currency: "USD" | "HKD";
  notional: string;
  tenorPreset: "ON" | "7D" | "1M" | "3M" | "6M" | "1Y" | "CUSTOM";
  tenorDays: string;
  maturityDate: string;
  yieldPct: string;
  dayCount: string;
  rating: string;
};
