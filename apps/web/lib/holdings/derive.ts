import type { HoldingRow } from "@/components/grid/HoldingsGrid";
import type { CurrentFund } from "@/constants/funds";
import type { CashLadderSnapshot, DailyPack } from "@/lib/cashLadder";
import type { ComplianceDashboard } from "@/lib/desk-types";
import type { DualNavSnapshot, DualPosition } from "@/lib/dualNav";
import { residualDays } from "@/lib/holdings/metrics";
import { computeMetrics } from "@/lib/holdings/metrics";
import { wamTenorDays } from "@/lib/engine/durationCalculator";
import { assetCategoryOf } from "@/lib/holdings/unified";
import type { AssetCategory } from "@/types/holdings";
import { runCompliance, WLA_SFC_FLOOR, WLA_INTERNAL_FLOOR, DLA_FLOOR } from "@/lib/engine/complianceEngine";
import { computeValuation } from "@/lib/engine/valuationEngine";
import { productTypeOf } from "@/lib/holdings/mapAssetType";
import { addDays } from "@/lib/holdings/dates";
import type { BookPosition } from "@/lib/holdings/types";
import type { ReportSnapshot } from "@/lib/report";
import type { CashLadderRow, EnginePosition, WorkbenchSnapshot } from "@/types/workbench";

function tenorLabel(days: number): string {
  if (days <= 0) return "0D";
  if (days <= 1) return "1D";
  return `${days}D`;
}

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  CASH: "Cash",
  TIME_DEPOSIT: "Time Deposit",
  REPO: "Repo",
  BOND: "Bond",
  OTHER: "Other",
};

function displayAssetType(p: BookPosition): string {
  const cat = assetCategoryOf(p);
  if (cat === "CASH") return "Cash & Bank";
  if (cat === "TIME_DEPOSIT") return "Time Deposit";
  if (cat === "REPO") return "Repo";
  return productTypeOf(p.assetType);
}

export function resolveOfficialNav(
  report:
    | {
        nav?: number | null;
        totalNav?: number | null;
        summary?: { netAssets?: number | null; totalNav?: number | null };
      }
    | null
    | undefined,
  positions: { amortizedCost: number }[],
): number {
  const candidates = [
    Number(report?.nav),
    Number(report?.totalNav),
    Number(report?.summary?.netAssets),
    Number(report?.summary?.totalNav),
  ];
  for (const tape of candidates) {
    if (Number.isFinite(tape) && tape > 0) return tape;
  }
  const assets = positions.reduce((s, p) => s + Number(p.amortizedCost || 0), 0);
  return assets > 0 ? assets : 1;
}

export function toHoldingRows(positions: BookPosition[], asOf: string, fundNav?: number | null): HoldingRow[] {
  const aum = (fundNav && fundNav > 0 ? fundNav : positions.reduce((s, p) => s + p.amortizedCost, 0)) || 1;
  const issuerAmt: Record<string, number> = {};
  for (const p of positions) issuerAmt[p.counterparty] = (issuerAmt[p.counterparty] ?? 0) + p.amortizedCost;
  return positions.map((p, i) => {
    const days = residualDays(p, asOf);
    const wamDays = wamTenorDays(p, asOf);
    const navWeight = (p.amortizedCost / aum) * 100;
    const cat = assetCategoryOf(p);
    return {
      row_key: `${p.securityId}_${p.isin || "NA"}_${p.maturityDate}_${i}`,
      book_security_id: p.securityId,
      security_id: p.isin || p.securityId,
      instrument: p.lifecycle === "Matured" ? `${p.assetName} · 已到期` : p.assetName,
      product_type: CATEGORY_LABEL[cat],
      asset_type: displayAssetType(p),
      asset_category: cat,
      isin: p.isin || "—",
      counterparty: p.counterparty,
      value_date: p.issueDate,
      maturity_date: p.maturityDate,
      coupon_rate_pct: p.couponRatePct,
      tenor: tenorLabel(wamDays),
      tenor_days: wamDays,
      amortized_cost: p.amortizedCost,
      shadow_mtm: p.shadowMtm,
      wam_contribution: Number(((p.amortizedCost / aum) * wamDays).toFixed(2)),
      wam_days: wamDays,
      weight_pct: Number(navWeight.toFixed(2)),
      nav_weight_pct: Number(navWeight.toFixed(2)),
      issuer_weight_pct: Number(((issuerAmt[p.counterparty] / aum) * 100).toFixed(2)),
      rating: p.rating,
    };
  });
}

export function toEnginePositions(positions: BookPosition[]): EnginePosition[] {
  return positions.map((p) => ({
    security_id: p.securityId,
    book_value: p.amortizedCost,
    coupon_type: p.couponType,
    maturity_date: p.maturityDate,
    rate_reset_date: p.resetDate,
    asset_class: productTypeOf(p.assetType),
    is_sovereign: p.assetType === "Govt Bills",
    settlement_lag_business_days: p.assetType === "Govt Bills" ? 1 : 0,
    pledged_ratio: 0,
    issuer_id: p.counterparty,
    issuer_name: p.counterparty,
    coupon_rate: p.couponRatePct / 100,
    shadow_mtm: p.shadowMtm,
  }));
}

function buildWorkbenchLadder(positions: BookPosition[], asOf: string, opening: number): CashLadderRow[] {
  const rows: CashLadderRow[] = [];
  let cash = opening;
  for (let offset = 0; offset <= 21; offset += 1) {
    const date = addDays(asOf, offset);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const principal = positions.filter((p) => p.maturityDate === date).reduce((s, p) => s + p.parValue, 0);
    const interest = weekend ? 0 : positions.reduce((s, p) => s + (p.amortizedCost * p.couponRatePct) / 100 / 365, 0);
    const sub = !weekend && [2, 9, 16].includes(offset) ? opening * 0.04 : 0;
    const red = !weekend && [3, 10].includes(offset) ? opening * 0.03 : 0;
    const net = sub - red + principal + interest;
    cash += net;
    rows.push({
      date,
      tenor: `T+${offset}`,
      subscription_inflow: sub,
      redemption_outflow: red,
      principal_maturity: principal,
      interest_income: Number(interest.toFixed(2)),
      fx_hedge_flow: 0,
      closing_cash: Number(cash.toFixed(2)),
      net_flow: Number(net.toFixed(2)),
    });
  }
  return rows;
}

export function deriveWorkbench(positions: BookPosition[], fund: CurrentFund, asOf: string): WorkbenchSnapshot {
  const m = computeMetrics(positions, asOf);
  const cashPos = positions.filter((p) => p.assetType === "Cash / Bank Deposit" || p.assetType === "Reverse Repo");
  const opening = cashPos.reduce((s, p) => s + p.amortizedCost, 0) || m.aum * 0.15;
  return {
    as_of: asOf,
    fund_code: fund.code,
    aum: m.aum,
    official_nav: m.officialNav,
    shadow_nav: m.shadowNav,
    deviation_bps: m.deviationBps,
    deviation_status: m.deviationStatus,
    wam_days: m.wamDays,
    wal_days: m.walDays,
    dla_pct: m.dlaPct,
    wla_pct: m.wlaPct,
    wam_limit: fund.wamLimitDays,
    wal_limit: fund.walLimitDays,
    dla_floor: 10,
    wla_floor: WLA_SFC_FLOOR,
    cash_ladder: buildWorkbenchLadder(positions, asOf, opening),
    positions: toEnginePositions(positions),
    cash: cashPos.map((p) => ({
      amount: p.amortizedCost,
      available_on: residualDays(p, asOf) <= 1 ? asOf : p.maturityDate,
      is_overnight_deposit: residualDays(p, asOf) <= 1,
    })),
    updated_at: `${asOf}T09:30:00+08:00`,
  };
}

export function deriveDualNav(positions: BookPosition[], fund: CurrentFund, asOf: string): DualNavSnapshot {
  const m = computeMetrics(positions, asOf);
  const val = computeValuation(positions, asOf);
  const valued = new Map(val.positions.map((r) => [r.securityId, r]));
  const dualPositions: DualPosition[] = positions.map((p) => {
    const days = residualDays(p, asOf);
    const row = valued.get(p.securityId);
    const book = row?.carryingValue ?? p.amortizedCost;
    const shadow = row?.shadowDirty ?? p.shadowMtm;
    const coupon = p.parValue * (p.couponRatePct / 100) * (days / 365);
    const cf = p.parValue + coupon;
    const spread = p.assetType === "Govt Bills" ? 0 : 0.0025;
    return {
      security_id: p.securityId,
      isin: p.isin || p.securityId,
      name: p.assetName,
      asset_type: productTypeOf(p.assetType),
      issuer: p.counterparty,
      currency: p.currency,
      rating: p.rating,
      days_to_maturity: days,
      day_count: p.dayCount,
      amortised_book: book,
      shadow_value: shadow,
      diff_amount: shadow - book,
      diff_bps: book ? ((shadow - book) / book) * 10_000 : 0,
      pricing_source: p.assetType === "Govt Bills" ? "BVAL / official" : "Mark-to-Model DCF",
      discount_rate: p.couponRatePct / 100,
      credit_spread: spread,
      all_in_rate: p.couponRatePct / 100 + spread,
      level: p.assetType === "Govt Bills" ? "1" : p.assetType === "NCD" ? "2" : "3",
      inception_yield: p.couponRatePct / 100,
      coupon: p.couponRatePct / 100,
      face: p.parValue,
      cashflows: [{ date: p.maturityDate, days, amount: cf, description: "Maturity redemption" }],
      model_notes: `${p.assetType} · ${p.dayCount} · accrued ${row ? row.accrued.toFixed(2) : "—"} · as of ${asOf}`,
    };
  });
  const abs = Math.abs(m.deviationPct);
  const history = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(asOf, i - 29);
    const wave = 0.00004 * Math.sin(i / 4);
    const shadow = Number((m.shadowNav + wave).toFixed(6));
    const den = Math.abs(shadow) > 1e-8 ? shadow : 1;
    const pct = ((1 - shadow) / den) * 100;
    return {
      date,
      accounting_nav: 1,
      shadow_nav: shadow,
      deviation_bps: Number((pct * 100).toFixed(1)),
    };
  });
  return {
    as_of: asOf,
    fund_code: fund.code,
    kpis: {
      accounting_nav: m.officialNav,
      shadow_nav: m.shadowNav,
      deviation_ratio: m.deviationPct / 100,
      deviation_pct: m.deviationPct,
      deviation_bps: m.deviationBps,
      status: m.deviationStatus,
      units: m.aum,
      accounting_aum: m.aum,
      shadow_aum: val.positions.reduce((s, r) => s + r.shadowDirty, 0),
      cash: m.cash,
    },
    positions: dualPositions,
    history,
    yellow_bps: 25,
    red_bps: 50,
    curve_shift_bps: 0,
    spread_widen_bps: 0,
    vnav_trigger: abs >= 0.5,
    report: abs >= 0.5 ? { fund: fund.code, as_of: asOf, action: "VNAV contingency" } : null,
  };
}

export function deriveCashLadder(positions: BookPosition[], fund: CurrentFund, asOf: string): CashLadderSnapshot {
  const m = computeMetrics(positions, asOf);
  const opening = m.cash || m.aum * 0.12;
  const month = asOf.slice(0, 7);
  const events = positions
    .filter((p) => p.maturityDate >= asOf)
    .map((p) => {
      const days = residualDays(p, asOf);
      return {
        event_id: `MAT-${p.securityId}`,
        value_date: p.maturityDate,
        adjusted_date: p.maturityDate,
        rolled: false,
        calendar: fund.ccy === "HKD" ? "HK" : "US",
        kind: "MATURITY",
        direction: "IN",
        amount: p.parValue,
        signed_amount: p.parValue,
        currency: p.currency,
        security_id: p.securityId,
        name: p.assetName,
        counterparty: p.counterparty,
        status: "FORECAST",
        bucket_sfc: days <= 1 ? "ON / T+0" : days <= 7 ? "2-7D / 1W" : "8-30D / 1M",
        bucket_chart: days <= 1 ? "Today" : days === 1 ? "T+1" : "1W",
        days,
        notes: `${p.assetType} maturity`,
      };
    });
  const days: DailyPack[] = [];
  let cumulative = opening;
  for (let offset = 0; offset < 31; offset += 1) {
    const date = addDays(asOf, offset);
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = wd === 0 || wd === 6;
    const dayEvents = events.filter((e) => e.adjusted_date === date);
    const inflow = dayEvents.reduce((s, e) => s + Number(e.amount), 0);
    cumulative += inflow;
    days.push({
      date,
      net: inflow,
      inflow,
      outflow: 0,
      cumulative,
      event_count: dayEvents.length,
      holiday_hk: false,
      holiday_us: false,
      weekend,
      deficit: cumulative < 0,
      events: dayEvents,
    });
  }
  const net7 = days.slice(0, 8).reduce((s, d) => s + Number(d.net), 0);
  const reinvest = events
    .filter((e) => e.days <= 3)
    .map((e) => ({
      security_id: e.security_id,
      name: e.name,
      counterparty: e.counterparty,
      asset_class: "TD",
      amount: e.amount,
      adjusted_date: e.adjusted_date,
      days: e.days,
      suggestion: "滚动续作隔夜或 7D 定存",
      workbench_href: `/workbench?roll=1&counterparty=${encodeURIComponent(e.counterparty)}&notional=${e.amount}&tenorPreset=7D`,
    }));
  return {
    as_of: asOf,
    fund_code: fund.code,
    currency: fund.ccy,
    opening_cash: opening,
    available_cash: opening,
    net_7d: net7,
    reinvestment_3d: reinvest.reduce((s, r) => s + Number(r.amount), 0),
    deficit: days.some((d) => d.deficit),
    kpis: { dla_status: m.dlaPct >= 10 ? "PASS" : "BREACH", gap_status: "OK" },
    events,
    days,
    sfc_buckets: [
      { bucket: "ON / T+0", inflow: events.filter((e) => e.days <= 1).reduce((s, e) => s + Number(e.amount), 0), outflow: 0, net: 0, cumulative: opening, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
      { bucket: "2-7D / 1W", inflow: events.filter((e) => e.days > 1 && e.days <= 7).reduce((s, e) => s + Number(e.amount), 0), outflow: 0, net: 0, cumulative: opening, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
      { bucket: "8-30D / 1M", inflow: events.filter((e) => e.days > 7 && e.days <= 30).reduce((s, e) => s + Number(e.amount), 0), outflow: 0, net: 0, cumulative: opening, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
      { bucket: "31-90D / 3M", inflow: events.filter((e) => e.days > 30 && e.days <= 90).reduce((s, e) => s + Number(e.amount), 0), outflow: 0, net: 0, cumulative: opening, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    ].map((b) => ({ ...b, net: Number(b.inflow) - Number(b.outflow), maturity: b.inflow })),
    chart_buckets: days.slice(0, 10).map((d, i) => ({
      bucket: i === 0 ? "Today" : `T+${i}`,
      inflow: d.inflow,
      outflow: 0,
      net: d.net,
      cumulative: d.cumulative,
      maturity: d.inflow,
      coupon: 0,
      subscription: 0,
      dvp: 0,
      redemption: 0,
      fee: 0,
    })),
    dla_wla: days.slice(0, 8).map((d) => ({
      date: d.date,
      cash: d.cumulative,
      dla_pct: m.dlaPct,
      wla_pct: m.wlaPct,
      dla_ok: m.dlaPct >= DLA_FLOOR,
      wla_ok: m.wlaPct >= WLA_SFC_FLOOR,
    })),
    reinvest,
    calendar_month: month,
    holidays: [],
  };
}

export function deriveReport(positions: BookPosition[], fund: CurrentFund, asOf: string): ReportSnapshot {
  const m = computeMetrics(positions, asOf);
  const aum = m.aum;
  const byIssuer = new Map<string, number>();
  const byType = new Map<string, number>();
  positions.forEach((p) => {
    byIssuer.set(p.counterparty, (byIssuer.get(p.counterparty) ?? 0) + p.amortizedCost);
    byType.set(p.assetType, (byType.get(p.assetType) ?? 0) + p.amortizedCost);
  });
  const topIssuers = Array.from(byIssuer.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, amount]) => ({ label, amount, weight_pct: Number(((amount / aum) * 100).toFixed(2)) }));
  const maxIssuer = topIssuers[0];
  const depositNames = new Set(positions.filter((p) => p.assetType === "Cash / Bank Deposit").map((p) => p.counterparty));
  const privileged = maxIssuer ? depositNames.has(maxIssuer.label) : false;
  const concBreach = maxIssuer ? (privileged ? maxIssuer.weight_pct > 20 : maxIssuer.weight_pct > 10) : false;
  const allocation = Array.from(byType.entries()).map(([label, amount]) => ({
    label,
    amount,
    weight_pct: Number(((amount / aum) * 100).toFixed(2)),
  }));
  const buckets = [
    { label: "Overnight", test: (d: number) => d <= 1 },
    { label: "1-7D", test: (d: number) => d > 1 && d <= 7 },
    { label: "8-30D", test: (d: number) => d > 7 && d <= 30 },
    { label: "31-90D", test: (d: number) => d > 30 && d <= 90 },
    { label: "90D+", test: (d: number) => d > 90 },
  ];
  const maturity_profile = buckets.map((b) => {
    const amount = positions.filter((p) => b.test(residualDays(p, asOf))).reduce((s, p) => s + p.amortizedCost, 0);
    return { label: b.label, amount, weight_pct: Number(((amount / aum) * 100).toFixed(2)) };
  });
  const top_holdings = [...positions]
    .sort((a, b) => b.amortizedCost - a.amortizedCost)
    .slice(0, 8)
    .map((p, i) => ({
      rank: i + 1,
      security_id: p.securityId,
      name: p.assetName,
      issuer: p.counterparty,
      parent_group: p.counterparty,
      asset_class: productTypeOf(p.assetType),
      maturity_date: p.maturityDate,
      rating: p.rating,
      weight_pct: Number(((p.amortizedCost / aum) * 100).toFixed(2)),
      amortized: p.amortizedCost,
      shadow_mtm: p.shadowMtm,
    }));
  const chk = (ok: boolean) => (ok ? "PASS" : "BREACH");
  return {
    as_of: asOf,
    period_start: `${asOf.slice(0, 8)}01`,
    fund_code: fund.code,
    fund_name: fund.name,
    manager: fund.manager,
    manager_short: fund.managerShort,
    isin: fund.isin,
    base_ccy: fund.ccy,
    inception: fund.inception,
    morningstar: "★★★★",
    sp_rating: "AAAf",
    kpis: {
      aum,
      yield_7d: m.portfolioYieldPct,
      yield_30d: m.portfolioYieldPct + 0.12,
      yield_ytd: Math.max(m.portfolioYieldPct - 0.2, 0),
      wam_days: m.wamDays,
      wal_days: m.walDays,
      dla_pct: m.dlaPct,
      wla_pct: m.wlaPct,
      illiquid_pct: 0,
      accounting_nav: m.officialNav,
      shadow_nav: m.shadowNav,
      deviation_bps: m.deviationBps,
      max_spread_bps: Math.max(Math.abs(m.deviationBps) + 4, 8),
      breach_count: concBreach || m.wamDays > 60 || m.dlaPct < 10 ? 1 : 0,
      units: aum,
    },
    checklist: [
      { metric: "WAM", limit: "≤ 60 Days", actual: `${m.wamDays.toFixed(1)} Days`, actual_num: m.wamDays, status: chk(m.wamDays <= 60), period_min: `${(m.wamDays - 3).toFixed(1)}D`, period_max: `${(m.wamDays + 2).toFixed(1)}D` },
      { metric: "WAL", limit: "≤ 120 Days", actual: `${m.walDays.toFixed(1)} Days`, actual_num: m.walDays, status: chk(m.walDays <= 120), period_min: `${(m.walDays - 4).toFixed(1)}D`, period_max: `${(m.walDays + 3).toFixed(1)}D` },
      { metric: "DLA", limit: "≥ 10%", actual: `${m.dlaPct.toFixed(2)}%`, actual_num: m.dlaPct, status: chk(m.dlaPct >= 10), period_min: `${(m.dlaPct - 1).toFixed(2)}%`, period_max: `${(m.dlaPct + 1).toFixed(2)}%` },
      { metric: "WLA", limit: "≥ 15% SFC（内控 20%）", actual: `${m.wlaPct.toFixed(2)}%`, actual_num: m.wlaPct, status: chk(m.wlaPct >= WLA_SFC_FLOOR), period_min: `${(m.wlaPct - 1).toFixed(2)}%`, period_max: `${(m.wlaPct + 1).toFixed(2)}%` },
      {
        metric: "单一实体/母集团集中度",
        limit: "≤ 10%（合资格定存 ≤20%）",
        actual: maxIssuer ? `${maxIssuer.weight_pct.toFixed(2)}% max` : "—",
        actual_num: maxIssuer?.weight_pct ?? 0,
        status: concBreach ? "BREACH" : "PASS",
        period_min: "—",
        period_max: "—",
      },
      { metric: "影子偏离度 |Deviation|", limit: "≤ 0.50% (50 bps)", actual: `${m.deviationPct.toFixed(4)}% / ${m.deviationBps.toFixed(1)} bps`, actual_num: m.deviationBps, status: chk(Math.abs(m.deviationPct) < 0.5), period_min: "—", period_max: "—" },
      { metric: "非流动资产", limit: "< 10%", actual: "0.00%", actual_num: 0, status: "PASS", period_min: "0.00%", period_max: "0.00%" },
    ],
    exceptions: concBreach && maxIssuer
      ? [
          {
            id: "EX-CONC",
            severity: "BREACH",
            title: `${maxIssuer.label} 集中度 ${maxIssuer.weight_pct.toFixed(2)}%`,
            detail: privileged ? "合资格银行存款适用 20% 特许上限。" : "非定存主体适用 10% 单一发行人上限。",
            exemption: privileged,
            approval: privileged ? "Board file" : "Pending",
          },
        ]
      : [],
    top_issuers: topIssuers,
    allocation,
    maturity_profile,
    credit_quality: [
      { label: "Govt / Sovereign", amount: positions.filter((p) => p.assetType === "Govt Bills").reduce((s, p) => s + p.amortizedCost, 0), weight_pct: 0 },
      { label: "Bank / NCD / TD", amount: positions.filter((p) => p.assetType !== "Govt Bills").reduce((s, p) => s + p.amortizedCost, 0), weight_pct: 0 },
    ].map((r) => ({ ...r, weight_pct: Number(((Number(r.amount) / aum) * 100).toFixed(2)) })),
    top_holdings,
    commentary: `${fund.name} 估值日 ${asOf}。WAM ${m.wamDays.toFixed(1)} 天，DLA ${m.dlaPct.toFixed(1)}%，影子偏离 ${m.deviationBps.toFixed(1)} bps。`,
    objective: "在保持本金安全与高流动性的前提下，获取超越短期银行存款的稳定收益。",
    disclaimer: fund.manager,
    sign_off: null,
  };
}

export function deriveCompliance(positions: BookPosition[], fund: CurrentFund, asOf: string): ComplianceDashboard {
  const m = computeMetrics(positions, asOf);
  const eng = runCompliance(positions, asOf);
  const concentration = eng.issuers.map((i) => ({
    issuer: i.issuer,
    product_hint: i.hint,
    amount: i.amount,
    weight_pct: i.weightPct,
    limit_10: 10,
    limit_20: 20,
    privileged: i.privileged,
    status: i.status,
  }));
  return {
    as_of: asOf,
    fund_code: fund.code,
    aum: m.aum,
    cards: [
      { code: "WAM", title: "WAM ≤ 60天", value: eng.wamDays, unit: "天", limit: 60, status: eng.wamOk ? "PASS" : "BREACH", detail: "浮动利率按下次重定价；固定利率按到期日（市值加权）" },
      { code: "WAL", title: "WAL ≤ 120天", value: eng.walDays, unit: "天", limit: 120, status: eng.walOk ? "PASS" : "BREACH", detail: "一律按法律最终到期日加权" },
      { code: "MAX_RESIDUAL", title: "单一资产最长剩余期限 ≤ 397天", value: eng.maxResidualDays, unit: "天", limit: 397, status: eng.maxResidualOk ? "PASS" : "BREACH", detail: "持仓中最长法律剩余期限" },
      { code: "DLA", title: "日度流动性资产 DLA ≥ 10%", value: eng.liquidity.dlaPct, unit: "%", limit: DLA_FLOOR, status: eng.liquidity.dlaOk ? "PASS" : "BREACH", detail: "现金 + 1 个工作日内到期 + 政府短期债券" },
      {
        code: "WLA",
        title: `周度流动性资产 WLA ≥ ${WLA_SFC_FLOOR}%`,
        value: eng.liquidity.wlaPct,
        unit: "%",
        limit: WLA_SFC_FLOOR,
        status: eng.liquidity.wlaSfcOk ? (eng.liquidity.wlaInternalOk ? "PASS" : "WARN") : "BREACH",
        detail: `DLA + 5 个工作日内到期；SFC ${WLA_SFC_FLOOR}% / 内控 ${WLA_INTERNAL_FLOOR}%`,
      },
    ],
    concentration,
    liquidity: {
      dla_pct: eng.liquidity.dlaPct,
      wla_pct: eng.liquidity.wlaPct,
      dla_floor: DLA_FLOOR,
      wla_floor: WLA_SFC_FLOOR,
      wla_internal: WLA_INTERNAL_FLOOR,
      dla_ok: eng.liquidity.dlaOk,
      wla_ok: eng.liquidity.wlaSfcOk,
    },
    alerts: eng.alerts,
  };
}
