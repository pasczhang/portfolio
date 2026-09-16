import { num } from "@/lib/format";

export type DualCashflow = { date: string; days: number; amount: number | string; description: string };

export type DualPosition = {
  security_id: string;
  isin: string;
  name: string;
  asset_type: string;
  issuer: string;
  currency: string;
  rating: string;
  days_to_maturity: number;
  day_count: string;
  amortised_book: number | string;
  shadow_value: number | string;
  diff_amount: number | string;
  diff_bps: number | string;
  pricing_source: string;
  discount_rate: number | string;
  credit_spread: number | string;
  all_in_rate: number | string;
  level: string;
  inception_yield: number | string;
  coupon: number | string;
  face: number | string;
  cashflows: DualCashflow[];
  model_notes: string;
};

export type DualNavSnapshot = {
  as_of: string;
  fund_code: string;
  kpis: {
    accounting_nav: number | string;
    shadow_nav: number | string;
    deviation_ratio: number | string;
    deviation_pct: number | string;
    deviation_bps: number | string;
    status: string;
    units: number | string;
    accounting_aum: number | string;
    shadow_aum: number | string;
    cash: number | string;
  };
  positions: DualPosition[];
  history: { date: string; accounting_nav: number | string; shadow_nav: number | string; deviation_bps: number | string }[];
  yellow_bps: number | string;
  red_bps: number | string;
  curve_shift_bps: number;
  spread_widen_bps: number;
  vnav_trigger: boolean;
  report: Record<string, string> | null;
};

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

function nav5(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

function bps1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** PV = CF / (1 + r + s)^(days/365) */
export function dcfPricingEngine(cashflow: number, days: number, rate: number, spread: number): number {
  if (cashflow <= 0) return 0;
  const t = Math.max(days, 0) / 365;
  if (t === 0) return money(cashflow);
  const base = Math.max(1 + rate + spread, 1e-6);
  return money(cashflow / base ** t);
}

export function interpolateCurve(days: number, curve: [number, number][]): number {
  const d = Math.max(days, 1);
  if (d <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    const [d0, r0] = curve[i - 1];
    const [d1, r1] = curve[i];
    if (d <= d1) return r0 + ((r1 - r0) * (d - d0)) / (d1 - d0);
  }
  return curve[curve.length - 1][1];
}

const USD_CURVE: [number, number][] = [
  [1, 0.0532],
  [7, 0.053],
  [30, 0.0528],
  [90, 0.0515],
  [180, 0.0505],
  [365, 0.0485],
];
const HKD_CURVE: [number, number][] = [
  [1, 0.0415],
  [7, 0.041],
  [30, 0.0405],
  [90, 0.0395],
  [180, 0.038],
  [365, 0.0365],
];

function statusOf(absRatio: number): "NORMAL" | "WARNING" | "BREACH" {
  if (absRatio <= 0.002) return "NORMAL";
  if (absRatio <= 0.005) return "WARNING";
  return "BREACH";
}

export function calculateShadowNAV(
  positions: DualPosition[],
  cash: number,
  asOf: string,
  curveShiftBps = 0,
  spreadWidenBps = 0,
): DualNavSnapshot {
  const priced = positions.map((p) => {
    const cf = num(p.cashflows[0]?.amount ?? p.face);
    const days = p.days_to_maturity;
    const curve = p.currency === "HKD" ? HKD_CURVE : USD_CURVE;
    const bench = interpolateCurve(days, curve) + curveShiftBps / 10000;
    const spread = num(p.credit_spread) + spreadWidenBps / 10000;
    let shadow: number;
    if (p.asset_type === "CASH") {
      shadow = num(p.amortised_book);
    } else if (p.level === "1" && curveShiftBps === 0 && spreadWidenBps === 0) {
      shadow = money(num(p.shadow_value));
    } else {
      shadow = dcfPricingEngine(cf, days, bench, spread);
    }
    const book = num(p.amortised_book);
    const diff = money(shadow - book);
    return {
      ...p,
      shadow_value: shadow,
      diff_amount: diff,
      diff_bps: book ? bps1((diff / book) * 10000) : 0,
      discount_rate: bench,
      credit_spread: spread,
      all_in_rate: bench + spread,
      model_notes:
        p.asset_type === "CASH"
          ? p.model_notes
          : curveShiftBps || spreadWidenBps
            ? `Stressed DCF PV = ${cf} / (1 + ${((bench + spread) * 100).toFixed(3)}%)^(${days}/365).`
            : p.model_notes,
    };
  });
  const cashInBook = priced.some((p) => p.asset_type === "CASH");
  const posBook = priced.reduce((s, p) => s + num(p.amortised_book), 0);
  const posShadow = priced.reduce((s, p) => s + num(p.shadow_value), 0);
  const accountingAum = money(cashInBook ? posBook : posBook + cash);
  const shadowAum = money(cashInBook ? posShadow : posShadow + cash);
  const cashBal = cashInBook ? money(priced.filter((p) => p.asset_type === "CASH").reduce((s, p) => s + num(p.shadow_value), 0)) : cash;
  const units = accountingAum;
  const accountingNav = 1;
  const shadowNav = nav5(shadowAum / units);
  const devRatio = shadowNav - accountingNav;
  const st = statusOf(Math.abs(devRatio));
  const history = Array.from({ length: 30 }, (_, i) => {
    const idx = 29 - i;
    const wave = 0.00004 * Math.sin(idx / 3.7);
    const s = nav5(shadowNav + wave);
    return {
      date: asOf,
      accounting_nav: accountingNav,
      shadow_nav: s,
      deviation_bps: bps1((s - 1) * 10000),
    };
  });
  history[history.length - 1] = {
    date: asOf,
    accounting_nav: accountingNav,
    shadow_nav: shadowNav,
    deviation_bps: bps1(devRatio * 10000),
  };
  return {
    as_of: asOf,
    fund_code: "BAM-USD-MMF",
    kpis: {
      accounting_nav: accountingNav,
      shadow_nav: shadowNav,
      deviation_ratio: devRatio,
      deviation_pct: Math.round(devRatio * 100000) / 1000,
      deviation_bps: bps1(devRatio * 10000),
      status: st,
      units,
      accounting_aum: accountingAum,
      shadow_aum: shadowAum,
      cash: cashBal,
    },
    positions: priced,
    history,
    yellow_bps: 20,
    red_bps: 50,
    curve_shift_bps: curveShiftBps,
    spread_widen_bps: spreadWidenBps,
    vnav_trigger: st === "BREACH",
    report:
      st === "BREACH"
        ? {
            title: "SFC 偏离度超标报告简表",
            fund: "BAM-USD-MMF",
            as_of: asOf,
            accounting_nav: accountingNav.toFixed(5),
            shadow_nav: shadowNav.toFixed(5),
            deviation_bps: String(bps1(devRatio * 10000)),
            action: "建议启动浮动净值（VNAV）切换预案，并按《单位信托守则》第 8.2 章向证监会报备。",
            stress: `curve +${curveShiftBps}bps / spread +${spreadWidenBps}bps`,
          }
        : null,
  };
}

export function applyStress(base: DualNavSnapshot, curveShiftBps: number, spreadWidenBps: number): DualNavSnapshot {
  if (curveShiftBps === 0 && spreadWidenBps === 0) {
    return { ...base, curve_shift_bps: 0, spread_widen_bps: 0 };
  }
  return calculateShadowNAV(base.positions, num(base.kpis.cash), base.as_of, curveShiftBps, spreadWidenBps);
}

export const MOCK_DUAL_NAV: DualNavSnapshot = {
  as_of: "2026-09-16",
  fund_code: "BAM-USD-MMF",
  kpis: {
    accounting_nav: 1,
    shadow_nav: 1.00004,
    deviation_ratio: 0.00004,
    deviation_pct: 0.004,
    deviation_bps: 0.4,
    status: "NORMAL",
    units: 102003390.98,
    accounting_aum: 102003390.98,
    shadow_aum: 102007623.19,
    cash: 8000000,
  },
  positions: [
    {
      security_id: "TB-UST-6M",
      isin: "US912797ND21",
      name: "US Treasury Bill 6M",
      asset_type: "T-Bill",
      issuer: "US Treasury",
      currency: "USD",
      rating: "SOVEREIGN",
      days_to_maturity: 360,
      day_count: "ACT/360",
      amortised_book: 56986594.01,
      shadow_value: 56952000,
      diff_amount: -34594.01,
      diff_bps: -6.1,
      pricing_source: "Bloomberg BVAL / CMP",
      discount_rate: 0.048554,
      credit_spread: 0,
      all_in_rate: 0.048554,
      level: "1",
      inception_yield: 0.0512,
      coupon: 0,
      face: 60000000,
      cashflows: [{ date: "2027-09-10", days: 360, amount: 60000000, description: "Maturity redemption" }],
      model_notes: "Level 1 BVAL clean 94.920 + accrued 0.",
    },
    {
      security_id: "NCD-BOCHK-3M",
      isin: "HK0000951234",
      name: "BOCHK 3M HKD NCD",
      asset_type: "NCD",
      issuer: "Bank of China",
      currency: "HKD",
      rating: "A-1",
      days_to_maturity: 91,
      day_count: "ACT/365",
      amortised_book: 15120000,
      shadow_value: 15045000,
      diff_amount: -75000,
      diff_bps: -5.0,
      pricing_source: "Mark-to-Model DCF · HIBOR / EFB",
      discount_rate: 0.0395,
      credit_spread: 0.0035,
      all_in_rate: 0.043,
      level: "2",
      inception_yield: 0.0485,
      coupon: 0.0485,
      face: 15000000,
      cashflows: [{ date: "2026-12-15", days: 91, amount: 15181575, description: "Maturity redemption" }],
      model_notes: "DCF vs HIBOR/EFB + A-1 30bps + 5bps liquidity",
    },
    {
      security_id: "NCD-ICBC-1M",
      isin: "XS2589631470",
      name: "ICBC Asia 1M USD CD",
      asset_type: "NCD",
      issuer: "ICBC",
      currency: "USD",
      rating: "A-1",
      days_to_maturity: 30,
      day_count: "ACT/360",
      amortised_book: 12005000,
      shadow_value: 11988000,
      diff_amount: -17000,
      diff_bps: -1.4,
      pricing_source: "Mark-to-Model DCF · SOFR / UST",
      discount_rate: 0.0528,
      credit_spread: 0.0035,
      all_in_rate: 0.0563,
      level: "2",
      inception_yield: 0.0525,
      coupon: 0.0525,
      face: 12000000,
      cashflows: [{ date: "2026-10-15", days: 30, amount: 12052500, description: "Maturity redemption" }],
      model_notes: "DCF vs SOFR + A-1 spread",
    },
    {
      security_id: "TD-HSBC-7D",
      isin: "CUSTOM_TD",
      name: "HSBC 7D USD Time Deposit",
      asset_type: "TD",
      issuer: "HSBC",
      currency: "USD",
      rating: "A-1+",
      days_to_maturity: 7,
      day_count: "ACT/365",
      amortised_book: 10008356.16,
      shadow_value: 10007100,
      diff_amount: -1256.16,
      diff_bps: -0.1,
      pricing_source: "Mark-to-Model DCF · SOFR + bank spread",
      discount_rate: 0.053,
      credit_spread: 0.0023,
      all_in_rate: 0.0553,
      level: "3",
      inception_yield: 0.0435,
      coupon: 0.0435,
      face: 10000000,
      cashflows: [{ date: "2026-09-22", days: 7, amount: 10008342, description: "Maturity redemption" }],
      model_notes: "Level 3 DCF, A-1+ 15bps + 8bps liquidity",
    },
    {
      security_id: "CASH-USD",
      isin: "CASH",
      name: "USD overnight cash",
      asset_type: "CASH",
      issuer: "Custodian",
      currency: "USD",
      rating: "SOVEREIGN",
      days_to_maturity: 0,
      day_count: "ACT/365",
      amortised_book: 8000000,
      shadow_value: 8000000,
      diff_amount: 0,
      diff_bps: 0,
      pricing_source: "Custodian cash",
      discount_rate: 0,
      credit_spread: 0,
      all_in_rate: 0,
      level: "1",
      inception_yield: 0,
      coupon: 0,
      face: 8000000,
      cashflows: [{ date: "2026-09-16", days: 0, amount: 8000000, description: "Cash at par" }],
      model_notes: "Cash at par; no discounting.",
    },
  ],
  history: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
    accounting_nav: 1,
    shadow_nav: nav5(0.9984 + 0.00005 * Math.sin(i / 4)),
    deviation_bps: bps1((-16 + Math.sin(i / 4) * 4) ),
  })),
  yellow_bps: 20,
  red_bps: 50,
  curve_shift_bps: 0,
  spread_widen_bps: 0,
  vnav_trigger: false,
  report: null,
};
