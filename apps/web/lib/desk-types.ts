export type LimitCard = {
  code: string;
  title: string;
  value: number | string;
  unit: string;
  limit: number | string;
  status: string;
  detail: string;
};

export type ConcentrationRow = {
  issuer: string;
  product_hint: string;
  amount: number | string;
  weight_pct: number | string;
  limit_10: number | string;
  limit_20: number | string;
  privileged: boolean;
  status: string;
};

export type BreachAlert = {
  id: string;
  severity: string;
  rule: string;
  title: string;
  detail: string;
  as_of: string;
};

export type ComplianceDashboard = {
  as_of: string;
  fund_code: string;
  aum: number | string;
  cards: LimitCard[];
  concentration: ConcentrationRow[];
  liquidity: Record<string, number | string | boolean>;
  alerts: BreachAlert[];
};

export type TenorDistribution = {
  as_of: string;
  total: number | string;
  buckets: { bucket: string; amount: number | string; weight_pct: number | string; count: number }[];
};

export type RateShockPoint = {
  shift_bps: number;
  shadow_nav: number | string;
  official_nav: number | string;
  deviation_bps: number | string;
  mtm_nav: number | string;
};

export type YieldCurveShock = {
  as_of: string;
  official_nav: number | string;
  base_shadow_nav: number | string;
  base_deviation_bps: number | string;
  selected_shift_bps: number;
  selected: RateShockPoint;
  curve: RateShockPoint[];
};

export type RunoffPack = {
  as_of: string;
  scenarios: {
    redemption_pct: number | string;
    outflow: number | string;
    cash_before: number | string;
    cash_after: number | string;
    dla_pct_before: number | string;
    dla_pct_after: number | string;
    wla_pct_before: number | string;
    wla_pct_after: number | string;
    dla_ok: boolean;
    wla_ok: boolean;
    fire_sale: boolean;
    flags: string[];
  }[];
};

export type NavMonitor = {
  as_of: string;
  official_nav: number | string;
  shadow_nav: number | string;
  deviation_bps: number | string;
  yellow_bps: number | string;
  red_bps: number | string;
  series: { date: string; official_nav: number | string; shadow_nav: number | string; deviation_bps: number | string }[];
  collar_bars: { date: string; official_nav: number | string; shadow_nav: number | string; deviation_bps: number | string }[];
  attribution: {
    security_id: string;
    instrument: string;
    counterparty: string;
    product_type: string;
    amortized_cost: number | string;
    shadow_mtm: number | string;
    premium: number | string;
    contribution_bps: number | string;
  }[];
};

export type BlotterTrade = {
  id: string;
  trade_time: string;
  trade_type: string;
  counterparty: string;
  amount: number | string;
  rate: number | string;
  maturity_date: string;
  trader: string;
  status: string;
  security_id?: string | null;
};
