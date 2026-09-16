import type { HoldingRow } from "@/components/grid/HoldingsGrid";
import type {
  BlotterTrade,
  ComplianceDashboard,
  NavMonitor,
  RunoffPack,
  TenorDistribution,
  YieldCurveShock,
} from "@/lib/desk-types";
import type { CashLadderRow, WorkbenchSnapshot } from "@/types/workbench";
import { PRODUCT_AS_OF } from "@/constants/calendar";

const asOf = PRODUCT_AS_OF;

export const MOCK_HOLDINGS: { as_of: string; fund_code: string; aum_securities: number; row_count: number; holdings: HoldingRow[] } = {
  as_of: asOf,
  fund_code: "BAM-USD-MMF",
  aum_securities: 79917400,
  row_count: 6,
  holdings: [
    {
      security_id: "TD-HSBC-ON",
      instrument: "HSBC Overnight Time Deposit",
      product_type: "TD",
      counterparty: "HSBC",
      value_date: asOf,
      maturity_date: "2026-09-17",
      coupon_rate_pct: 4.1,
      tenor: "1D",
      tenor_days: 1,
      amortized_cost: 12000000,
      shadow_mtm: 12001200,
      wam_contribution: 0.15,
      wam_days: 1,
      weight_pct: 15.02,
    },
    {
      security_id: "TD-SCB-7D",
      instrument: "Standard Chartered 7D Time Deposit",
      product_type: "TD",
      counterparty: "Standard Chartered",
      value_date: "2026-09-14",
      maturity_date: "2026-09-23",
      coupon_rate_pct: 4.35,
      tenor: "7D",
      tenor_days: 7,
      amortized_cost: 8001200,
      shadow_mtm: 8000800,
      wam_contribution: 0.7,
      wam_days: 7,
      weight_pct: 10.01,
    },
    {
      security_id: "TB-HKMA-2W",
      instrument: "HKMA Exchange Fund Bill 14D",
      product_type: "T-Bill",
      counterparty: "HKMA",
      value_date: "2026-09-13",
      maturity_date: "2026-09-30",
      coupon_rate_pct: 3.9,
      tenor: "14D",
      tenor_days: 14,
      amortized_cost: 6988000,
      shadow_mtm: 6991000,
      wam_contribution: 1.22,
      wam_days: 14,
      weight_pct: 8.74,
    },
    {
      security_id: "TB-UST-4W",
      instrument: "US Treasury Bill 4W",
      product_type: "T-Bill",
      counterparty: "US Treasury",
      value_date: "2026-09-09",
      maturity_date: "2026-10-07",
      coupon_rate_pct: 4.8,
      tenor: "21D",
      tenor_days: 21,
      amortized_cost: 27940000,
      shadow_mtm: 27986000,
      wam_contribution: 7.34,
      wam_days: 21,
      weight_pct: 34.96,
    },
    {
      security_id: "NCD-ICBC-45",
      instrument: "ICBC Negotiable CD",
      product_type: "NCD",
      counterparty: "ICBC",
      value_date: "2026-09-06",
      maturity_date: "2026-10-31",
      coupon_rate_pct: 4.6,
      tenor: "45D",
      tenor_days: 45,
      amortized_cost: 9975000,
      shadow_mtm: 9962000,
      wam_contribution: 5.61,
      wam_days: 45,
      weight_pct: 12.48,
    },
    {
      security_id: "NCD-BOC-60",
      instrument: "Bank of China NCD FRN",
      product_type: "NCD",
      counterparty: "Bank of China",
      value_date: "2026-09-01",
      maturity_date: "2026-11-15",
      coupon_rate_pct: 4.4,
      tenor: "60D",
      tenor_days: 60,
      amortized_cost: 15000000,
      shadow_mtm: 15005000,
      wam_contribution: 1.31,
      wam_days: 7,
      weight_pct: 18.77,
    },
  ],
};

export const MOCK_COMPLIANCE: ComplianceDashboard = {
  as_of: asOf,
  fund_code: "BAM-USD-MMF",
  aum: 104917400,
  cards: [
    { code: "WAM", title: "WAM ≤ 60天", value: 18.4, unit: "天", limit: 60, status: "PASS", detail: "浮动利率按下次重定价；固定利率按到期日" },
    { code: "WAL", title: "WAL ≤ 120天", value: 28.9, unit: "天", limit: 120, status: "PASS", detail: "一律按法律最终到期日加权" },
    { code: "MAX_RESIDUAL", title: "单一资产最长剩余期限 ≤ 397天", value: 60, unit: "天", limit: 397, status: "PASS", detail: "持仓中最长剩余期限" },
    { code: "DLA", title: "日度流动性资产 DLA ≥ 10%", value: 35.2, unit: "%", limit: 10, status: "PASS", detail: "隔夜现金 + ON 存款" },
    { code: "WLA", title: "周度流动性资产 WLA ≥ 20%", value: 62.1, unit: "%", limit: 20, status: "PASS", detail: "含 5 个港币营业日内到期资产与 T-Bill" },
  ],
  concentration: [
    { issuer: "US Treasury", product_hint: "T-Bill", amount: 27940000, weight_pct: 26.63, limit_10: 10, limit_20: 20, privileged: true, status: "BREACH" },
    { issuer: "Bank of China", product_hint: "NCD", amount: 15000000, weight_pct: 14.3, limit_10: 10, limit_20: 20, privileged: false, status: "WARN" },
    { issuer: "HSBC", product_hint: "TD", amount: 12000000, weight_pct: 11.44, limit_10: 10, limit_20: 20, privileged: false, status: "WARN" },
    { issuer: "ICBC", product_hint: "NCD", amount: 9975000, weight_pct: 9.51, limit_10: 10, limit_20: 20, privileged: false, status: "PASS" },
    { issuer: "Standard Chartered", product_hint: "TD", amount: 8001200, weight_pct: 7.63, limit_10: 10, limit_20: 20, privileged: false, status: "PASS" },
    { issuer: "HKMA", product_hint: "T-Bill", amount: 6988000, weight_pct: 6.66, limit_10: 10, limit_20: 20, privileged: true, status: "PASS" },
  ],
  liquidity: { dla_pct: 35.2, wla_pct: 62.1, dla_floor: 10, wla_floor: 20, dla_ok: true, wla_ok: true },
  alerts: [
    {
      id: "ALT-001",
      severity: "HIGH",
      rule: "ISSUER_CONC",
      title: "US Treasury 集中度 26.63%",
      detail: "主权券突破 20% 特许限额（演示账本美债仓位偏大）",
      as_of: asOf,
    },
    {
      id: "ALT-002",
      severity: "MEDIUM",
      rule: "ISSUER_CONC",
      title: "Bank of China 集中度 14.30%",
      detail: "超过 10% 单一发行人上限；仍在 20% 特许限额内",
      as_of: asOf,
    },
    {
      id: "ALT-003",
      severity: "MEDIUM",
      rule: "ISSUER_CONC",
      title: "HSBC 集中度 11.44%",
      detail: "银行存款超过 10% 上限；仍在 20% 特许限额内",
      as_of: asOf,
    },
  ],
};

export const MOCK_TENOR: TenorDistribution = {
  as_of: asOf,
  total: 79917400,
  buckets: [
    { bucket: "0-7D", amount: 20001200, weight_pct: 25.03, count: 2 },
    { bucket: "8-30D", amount: 34928000, weight_pct: 43.71, count: 2 },
    { bucket: "31-60D", amount: 24975000, weight_pct: 31.25, count: 2 },
    { bucket: "61-90D", amount: 0, weight_pct: 0, count: 0 },
    { bucket: "90D+", amount: 0, weight_pct: 0, count: 0 },
  ],
};

export const MOCK_YIELD: YieldCurveShock = {
  as_of: asOf,
  official_nav: 1,
  base_shadow_nav: 1.0004,
  base_deviation_bps: 4.1,
  selected_shift_bps: 0,
  selected: { shift_bps: 0, shadow_nav: 1.0004, official_nav: 1, deviation_bps: 4.1, mtm_nav: 104960000 },
  curve: [
    { shift_bps: -100, shadow_nav: 1.0048, official_nav: 1, deviation_bps: 48.2, mtm_nav: 105420000 },
    { shift_bps: -50, shadow_nav: 1.0026, official_nav: 1, deviation_bps: 26.0, mtm_nav: 105190000 },
    { shift_bps: -25, shadow_nav: 1.0015, official_nav: 1, deviation_bps: 15.1, mtm_nav: 105070000 },
    { shift_bps: 0, shadow_nav: 1.0004, official_nav: 1, deviation_bps: 4.1, mtm_nav: 104960000 },
    { shift_bps: 25, shadow_nav: 0.9993, official_nav: 1, deviation_bps: 7.2, mtm_nav: 104850000 },
    { shift_bps: 50, shadow_nav: 0.9982, official_nav: 1, deviation_bps: 18.4, mtm_nav: 104730000 },
    { shift_bps: 100, shadow_nav: 0.9959, official_nav: 1, deviation_bps: 41.0, mtm_nav: 104490000 },
  ],
};

export const MOCK_RUNOFF: RunoffPack = {
  as_of: asOf,
  scenarios: [
    {
      redemption_pct: 10,
      outflow: 10491740,
      cash_before: 25000000,
      cash_after: 14508260,
      dla_pct_before: 35.2,
      dla_pct_after: 28.4,
      wla_pct_before: 62.1,
      wla_pct_after: 58.0,
      dla_ok: true,
      wla_ok: true,
      fire_sale: false,
      flags: [],
    },
    {
      redemption_pct: 20,
      outflow: 20983480,
      cash_before: 25000000,
      cash_after: 4016520,
      dla_pct_before: 35.2,
      dla_pct_after: 16.1,
      wla_pct_before: 62.1,
      wla_pct_after: 49.2,
      dla_ok: true,
      wla_ok: true,
      fire_sale: false,
      flags: [],
    },
    {
      redemption_pct: 30,
      outflow: 31475220,
      cash_before: 25000000,
      cash_after: 1200000,
      dla_pct_before: 35.2,
      dla_pct_after: 8.4,
      wla_pct_before: 62.1,
      wla_pct_after: 22.6,
      dla_ok: false,
      wla_ok: true,
      fire_sale: true,
      flags: ["FIRE_SALE", "DLA_BREACH"],
    },
  ],
};

function navSeries(): NavMonitor["series"] {
  const out: NavMonitor["series"] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(2026, 8, 16));
    d.setUTCDate(d.getUTCDate() - i);
    const wave = 0.00008 * Math.sin(i / 4.2);
    const shadow = Number((1.0004 + wave - 0.00003 * ((i % 5) - 2)).toFixed(4));
    out.push({
      date: d.toISOString().slice(0, 10),
      official_nav: 1,
      shadow_nav: i === 0 ? 1.0004 : shadow,
      deviation_bps: Number((((i === 0 ? 1.0004 : shadow) - 1) * 10000).toFixed(2)),
    });
  }
  return out;
}

const series = navSeries();

export const MOCK_NAV: NavMonitor = {
  as_of: asOf,
  official_nav: 1,
  shadow_nav: 1.0004,
  deviation_bps: 4.0,
  yellow_bps: 20,
  red_bps: 50,
  series,
  collar_bars: series.slice(-14),
  attribution: [
    { security_id: "TB-UST-4W", instrument: "US Treasury Bill 4W", counterparty: "US Treasury", product_type: "T-Bill", amortized_cost: 27940000, shadow_mtm: 27986000, premium: 46000, contribution_bps: 4.38 },
    { security_id: "NCD-ICBC-45", instrument: "ICBC Negotiable CD", counterparty: "ICBC", product_type: "NCD", amortized_cost: 9975000, shadow_mtm: 9962000, premium: -13000, contribution_bps: -1.24 },
    { security_id: "NCD-BOC-60", instrument: "Bank of China NCD FRN", counterparty: "Bank of China", product_type: "NCD", amortized_cost: 15000000, shadow_mtm: 15005000, premium: 5000, contribution_bps: 0.48 },
    { security_id: "TB-HKMA-2W", instrument: "HKMA Exchange Fund Bill 14D", counterparty: "HKMA", product_type: "T-Bill", amortized_cost: 6988000, shadow_mtm: 6991000, premium: 3000, contribution_bps: 0.29 },
    { security_id: "TD-HSBC-ON", instrument: "HSBC Overnight Time Deposit", counterparty: "HSBC", product_type: "TD", amortized_cost: 12000000, shadow_mtm: 12001200, premium: 1200, contribution_bps: 0.11 },
    { security_id: "TD-SCB-7D", instrument: "Standard Chartered 7D Time Deposit", counterparty: "Standard Chartered", product_type: "TD", amortized_cost: 8001200, shadow_mtm: 8000800, premium: -400, contribution_bps: -0.04 },
  ],
};

export const MOCK_TRADES: BlotterTrade[] = [
  { id: "TRD-1007", trade_time: "2026-09-16T14:15:00Z", trade_type: "SELL", counterparty: "ICBC", amount: 2000000, rate: 0.045, maturity_date: "2026-10-16", trader: "Ken Wong", status: "BOOKED" },
  { id: "TRD-1006", trade_time: "2026-09-15T13:15:00Z", trade_type: "REPO", counterparty: "SCB", amount: 5000000, rate: 0.038, maturity_date: "2026-09-17", trader: "Priya Shah", status: "BOOKED" },
  { id: "TRD-1005", trade_time: "2026-09-13T12:15:00Z", trade_type: "BUY", counterparty: "HKMA", amount: 7000000, rate: 0.039, maturity_date: "2026-09-30", trader: "Priya Shah", status: "SETTLED" },
  { id: "TRD-1004", trade_time: "2026-09-09T11:15:00Z", trade_type: "BUY", counterparty: "US Treasury", amount: 28000000, rate: 0.048, maturity_date: "2026-10-07", trader: "Amy Chen", status: "SETTLED" },
  { id: "TRD-1003", trade_time: "2026-09-06T10:15:00Z", trade_type: "BUY", counterparty: "ICBC", amount: 10000000, rate: 0.046, maturity_date: "2026-10-31", trader: "Ken Wong", status: "SETTLED" },
  { id: "TRD-1002", trade_time: "2026-09-01T09:15:00Z", trade_type: "BUY", counterparty: "Bank of China", amount: 15000000, rate: 0.044, maturity_date: "2026-11-15", trader: "Ken Wong", status: "SETTLED" },
  { id: "TRD-1001", trade_time: "2026-09-14T10:15:00Z", trade_type: "DEPOSIT", counterparty: "Standard Chartered", amount: 8000000, rate: 0.0435, maturity_date: "2026-09-23", trader: "Amy Chen", status: "SETTLED" },
  { id: "TRD-1000", trade_time: "2026-09-16T09:15:00Z", trade_type: "BUY", counterparty: "HSBC", amount: 12000000, rate: 0.041, maturity_date: "2026-09-17", trader: "Amy Chen", status: "BOOKED" },
];

function mockCashLadder(start: string): CashLadderRow[] {
  const rows: CashLadderRow[] = [];
  let cash = 25_000_000;
  const flows: Record<number, { sub: number; red: number; prin: number; fx: number }> = {
    2: { sub: 2_500_000, red: 0, prin: 0, fx: 0 },
    3: { sub: 0, red: 1_800_000, prin: 0, fx: 0 },
    4: { sub: 0, red: 0, prin: 12_000_000, fx: 0 },
    5: { sub: 0, red: 0, prin: 0, fx: -350_000 },
    7: { sub: 0, red: 0, prin: 8_001_200, fx: 0 },
    9: { sub: 2_500_000, red: 0, prin: 0, fx: 0 },
    14: { sub: 0, red: 0, prin: 6_988_000, fx: 0 },
  };
  for (let offset = 0; offset <= 21; offset += 1) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    const f = flows[offset] ?? { sub: 0, red: 0, prin: 0, fx: 0 };
    const interest = offset % 7 === 6 || offset % 7 === 0 ? 0 : 9_800;
    const net = f.sub - f.red + f.prin + interest + f.fx;
    cash += net;
    rows.push({
      date: d.toISOString().slice(0, 10),
      tenor: `T+${offset}`,
      subscription_inflow: f.sub,
      redemption_outflow: f.red,
      principal_maturity: f.prin,
      interest_income: interest,
      fx_hedge_flow: f.fx,
      closing_cash: cash,
      net_flow: net,
    });
  }
  return rows;
}

export const MOCK_WORKBENCH: WorkbenchSnapshot = {
  as_of: asOf,
  fund_code: "BAM-USD-MMF",
  aum: 104_917_400,
  official_nav: 1,
  shadow_nav: 1.0004,
  deviation_bps: 4.1,
  deviation_status: "OK",
  wam_days: 18.4,
  wal_days: 28.9,
  dla_pct: 35.2,
  wla_pct: 62.1,
  wam_limit: 60,
  wal_limit: 120,
  dla_floor: 10,
  wla_floor: 20,
  cash_ladder: mockCashLadder(asOf),
  positions: MOCK_HOLDINGS.holdings.map((h) => ({
    security_id: h.security_id,
    book_value: h.amortized_cost,
    coupon_type: h.product_type === "NCD" && h.security_id.includes("FRN") ? "floating" : "fixed",
    maturity_date: h.maturity_date,
    rate_reset_date: h.security_id.includes("FRN") ? "2026-09-23" : null,
    asset_class: h.product_type,
    is_sovereign: h.counterparty === "US Treasury" || h.counterparty === "HKMA",
    settlement_lag_business_days: 0,
    pledged_ratio: 0,
    issuer_id: h.counterparty,
    issuer_name: h.counterparty,
    coupon_rate: Number(h.coupon_rate_pct) / 100,
    shadow_mtm: h.shadow_mtm,
  })),
  cash: [{ amount: 25_000_000, available_on: asOf, is_overnight_deposit: true }],
  updated_at: `${asOf}T09:30:00+08:00`,
};
