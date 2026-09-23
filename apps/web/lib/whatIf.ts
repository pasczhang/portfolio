import { num } from "@/lib/format";
import { PRODUCT_AS_OF } from "@/constants/calendar";
import type { PreTradeWhatIfResult, WhatIfForm, WorkbenchSnapshot } from "@/types/workbench";

export const ASSET_OPTIONS = [
  { id: "TD" as const, label: "TD 定期存款", engine: "Deposit" },
  { id: "NCD" as const, label: "NCD 存单", engine: "CD" },
  { id: "T-Bill" as const, label: "T-Bill 国债", engine: "T-Bill" },
  { id: "Reverse Repo" as const, label: "Reverse Repo 逆回购", engine: "Repo" },
];

export const BANK_NAMES = [
  "HSBC",
  "Bank of China",
  "Standard Chartered",
  "ICBC",
  "Citi",
  "Hang Seng",
  "Bank of East Asia",
  "DBS",
];

export const SOVEREIGN_NAMES = ["US Treasury", "HKMA"];

export const TENOR_PRESETS: { id: WhatIfForm["tenorPreset"]; label: string; days: number }[] = [
  { id: "ON", label: "Overnight", days: 1 },
  { id: "7D", label: "7D", days: 7 },
  { id: "1M", label: "1M", days: 30 },
  { id: "3M", label: "3M", days: 90 },
  { id: "6M", label: "6M", days: 180 },
  { id: "1Y", label: "1Y", days: 365 },
  { id: "CUSTOM", label: "自定义到期", days: 0 },
];

export const DEFAULT_WHAT_IF: WhatIfForm = {
  securityCode: "CUSTOM_TD",
  securityName: "自定义定期存款 (Bespoke Term Deposit)",
  listed: false,
  assetClass: "TD",
  counterparty: "HSBC",
  currency: "USD",
  notional: "20000000",
  tenorPreset: "7D",
  tenorDays: "7",
  maturityDate: "2026-09-23",
  yieldPct: "4.50",
  dayCount: "Act/365",
  rating: "—",
};

const HKD_PER_USD = 7.8;

export function counterpartiesFor(asset: WhatIfForm["assetClass"]): string[] {
  return asset === "T-Bill" ? SOVEREIGN_NAMES : BANK_NAMES;
}

export function tenorDaysOf(form: WhatIfForm, asOf?: string): number {
  const asOfDate = asOf || PRODUCT_AS_OF;
  if (form.maturityDate) {
    const ms = Date.parse(form.maturityDate) - Date.parse(asOfDate);
    if (Number.isFinite(ms)) return Math.max(1, Math.round(ms / 86_400_000));
  }
  const preset = TENOR_PRESETS.find((p) => p.id === form.tenorPreset);
  if (preset && preset.days > 0) return preset.days;
  return Math.max(1, Math.round(num(form.tenorDays)));
}

export function usdNotional(form: WhatIfForm): number {
  const raw = num(form.notional.replace(/,/g, ""));
  return form.currency === "HKD" ? raw / HKD_PER_USD : raw;
}

export function buildEngineTrade(form: WhatIfForm, asOf?: string) {
  const asset = ASSET_OPTIONS.find((a) => a.id === form.assetClass);
  return {
    side: "Buy",
    notional: num(form.notional.replace(/,/g, "")),
    currency: form.currency,
    asset_class: asset?.engine ?? "Deposit",
    issuer_id: form.counterparty.toUpperCase().replace(/\s+/g, "-"),
    issuer_name: form.counterparty,
    tenor_days: tenorDaysOf(form, asOf),
    coupon_type: "Fixed",
    coupon_rate: num(form.yieldPct) / 100,
    is_sovereign: form.assetClass === "T-Bill",
  };
}

export function localWhatIf(data: WorkbenchSnapshot, form: WhatIfForm): PreTradeWhatIfResult {
  const notional = usdNotional(form);
  const tenor = tenorDaysOf(form, data.as_of);
  const nav = Math.max(num(data.aum), 1);
  const positions = data.positions ?? [];
  const sec = positions.reduce((s, p) => s + num(p.book_value), 0);
  const cash = (data.cash ?? []).reduce((s, c) => s + num(c.amount), 0);
  const wamB = num(data.wam_days);
  const walB = num(data.wal_days);
  const dlaB = num(data.dla_pct);
  const wlaB = num(data.wla_pct);
  const yieldB =
    positions.reduce((s, p) => s + num(p.book_value) * num(p.coupon_rate), 0) / nav * 100;
  const wamA = (wamB * sec + tenor * notional) / Math.max(sec + notional, 1);
  const walA = (walB * sec + tenor * notional) / Math.max(sec + notional, 1);
  const issuerB =
    positions
      .filter((p) => (p.issuer_name || p.issuer_id || "").toLowerCase() === form.counterparty.toLowerCase())
      .reduce((s, p) => s + num(p.book_value), 0) / nav * 100;
  const issuerA = (issuerB / 100 * nav + notional) / nav * 100;
  const cashAfter = cash - notional;
  const dlaA = Math.max(0, (dlaB / 100 * nav - (tenor > 1 ? notional : 0)) / nav * 100);
  const wlaA = Math.max(0, (wlaB / 100 * nav - (tenor > 5 ? notional : 0)) / nav * 100);
  const yieldA = (yieldB / 100 * nav + notional * (num(form.yieldPct) / 100)) / nav * 100;
  const sovereign = form.assetClass === "T-Bill";
  const issuerCap = sovereign ? 20 : 10;
  const flags: PreTradeWhatIfResult["flags"] = [];
  const push = (code: string, severity: string, message: string) => flags.push({ code, severity, message });
  if (tenor > 397 && !sovereign) push("MATURITY_397", "BLOCK", `SFC 8.2: residual maturity ${tenor}D exceeds 397D single-asset limit`);
  if (wamA > 60) push("WAM_60", "BLOCK", `SFC 8.2(f): WAM ${wamA.toFixed(1)}D exceeds 60D limit`);
  else if (wamA > 55) push("WAM_WATCH", "WATCH", `SFC 8.2(f): WAM ${wamA.toFixed(1)}D approaching 60D cap`);
  if (walA > 120) push("WAL_120", "BLOCK", `SFC 8.2(g): WAL ${walA.toFixed(1)}D exceeds 120D limit`);
  if (!sovereign && issuerA > 20) push("ISSUER_20PCT", "BLOCK", `SFC 8.2: issuer exposure ${issuerA.toFixed(2)}% exceeds 20% privileged cap`);
  else if (!sovereign && issuerA > 10) push("ISSUER_10PCT", "BLOCK", `SFC 8.2: issuer exposure ${issuerA.toFixed(2)}% exceeds 10% single-issuer limit (privileged cap 20%)`);
  if (dlaA < 10) push("DLA_10PCT", "BLOCK", `SFC 8.2: DLA ${dlaA.toFixed(2)}% below 10% daily liquidity floor`);
  if (wlaA < 15) push("WLA_15PCT", "BLOCK", `SFC 8.2: WLA ${wlaA.toFixed(2)}% below 15% weekly liquidity floor`);
  else if (wlaA < 20) push("WLA_20PCT", "WATCH", `Internal WLA ${wlaA.toFixed(2)}% below 20% control line`);
  if (cashAfter < 0) push("CASH_SHORTFALL", "BLOCK", `Cash shortfall vs notional`);
  const intercept = flags.some((f) => f.severity === "BLOCK");
  const watch = flags.some((f) => f.severity === "WATCH");
  const metric = (
    id: string,
    label: string,
    unit: string,
    before: number,
    after: number,
    extra: Partial<PreTradeWhatIfResult["metrics"][number]> = {},
  ) => ({
    id,
    label,
    unit,
    before,
    after,
    delta: after - before,
    breached: Boolean(extra.breached),
    watch: Boolean(extra.watch),
    ...extra,
  });
  return {
    nav_before: nav,
    nav_after: nav,
    cash_after: Math.max(cashAfter, 0),
    metrics: [
      metric("aum", "Total AUM", "usd", nav, nav),
      metric("wam", "WAM", "days", wamB, wamA, { limit: 60, breached: wamA > 60, watch: wamA > 55 && wamA <= 60 }),
      metric("wal", "WAL", "days", walB, walA, { limit: 120, breached: walA > 120 }),
      metric("issuer", `Issuer ${form.counterparty}`, "pct", issuerB, issuerA, {
        limit: issuerCap,
        breached: issuerA > issuerCap,
        watch: !sovereign && issuerA > 8 && issuerA <= 10,
        note: "10% standard / 20% privileged",
      }),
      metric("dla", "DLA", "pct", dlaB, dlaA, { floor: 10, breached: dlaA < 10 }),
      metric("wla", "WLA", "pct", wlaB, wlaA, { floor: 15, breached: wlaA < 15, watch: wlaA >= 15 && wlaA < 20 }),
      metric("yield", "Portfolio Yield", "pct", yieldB, yieldA),
    ],
    concentration: [
      {
        issuer_id: form.counterparty,
        issuer_name: form.counterparty,
        before_pct: issuerB / 100,
        after_pct: issuerA / 100,
        breached: issuerA > issuerCap,
        is_trade_issuer: true,
      },
    ],
    flags,
    decision: intercept ? "BLOCK" : watch ? "WATCH" : "PASS",
    allow: !intercept,
    intercept,
    gate_title: intercept
      ? "SFC 违规阻断（BREACH DETECTED）"
      : watch
        ? "接近预警（WARNING）"
        : "合规通过（PRE-TRADE PASS）",
    gate_detail: intercept ? "拟投交易触发 SFC 8.2 硬性限额，禁止提交。" : "",
  };
}
