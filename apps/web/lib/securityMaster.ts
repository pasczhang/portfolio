import type { WhatIfForm } from "@/types/workbench";
import { TENOR_PRESETS } from "@/lib/whatIf";

export type SecurityMasterRow = {
  security_code: string;
  isin: string | null;
  name: string;
  asset_class: "TD" | "NCD" | "T-Bill" | "Reverse Repo" | string;
  issuer_id: string;
  issuer_name: string;
  currency: "USD" | "HKD" | string;
  maturity_date: string | null;
  coupon_rate_pct: number | string | null;
  day_count: string;
  rating: string;
  custom: boolean;
  days_to_maturity: number | null;
  notes?: string | null;
};

export const VALUATION_AS_OF = "2026-09-15";

export const MOCK_SECURITY_MASTER: SecurityMasterRow[] = [
  {
    security_code: "HK0000951234",
    isin: "HK0000951234",
    name: "BOCHK 3M HKD NCD",
    asset_class: "NCD",
    issuer_id: "BANK-OF-CHINA",
    issuer_name: "Bank of China",
    currency: "HKD",
    maturity_date: "2026-12-15",
    coupon_rate_pct: 4.85,
    day_count: "Act/365",
    rating: "A-1",
    custom: false,
    days_to_maturity: 91,
    notes: "BOCHK 3-month HKD negotiable CD",
  },
  {
    security_code: "US912797ND21",
    isin: "US912797ND21",
    name: "US Treasury Bill 6M",
    asset_class: "T-Bill",
    issuer_id: "US-TREASURY",
    issuer_name: "US Treasury",
    currency: "USD",
    maturity_date: "2027-03-15",
    coupon_rate_pct: 5.12,
    day_count: "Act/360",
    rating: "A-1+",
    custom: false,
    days_to_maturity: 181,
  },
  {
    security_code: "XS2589631470",
    isin: "XS2589631470",
    name: "ICBC Asia 1M USD CD",
    asset_class: "NCD",
    issuer_id: "ICBC",
    issuer_name: "ICBC",
    currency: "USD",
    maturity_date: "2026-10-15",
    coupon_rate_pct: 5.25,
    day_count: "Act/360",
    rating: "A-1",
    custom: false,
    days_to_maturity: 30,
  },
  {
    security_code: "HK0000882101",
    isin: "HK0000882101",
    name: "HSBC 7D USD Time Deposit",
    asset_class: "TD",
    issuer_id: "HSBC",
    issuer_name: "HSBC",
    currency: "USD",
    maturity_date: "2026-09-22",
    coupon_rate_pct: 4.35,
    day_count: "Act/365",
    rating: "A-1+",
    custom: false,
    days_to_maturity: 7,
  },
  {
    security_code: "HK0000773319",
    isin: "HK0000773319",
    name: "Standard Chartered ON HKD TD",
    asset_class: "TD",
    issuer_id: "STANDARD-CHARTERED",
    issuer_name: "Standard Chartered",
    currency: "HKD",
    maturity_date: "2026-09-16",
    coupon_rate_pct: 4.1,
    day_count: "Act/365",
    rating: "A-1",
    custom: false,
    days_to_maturity: 1,
  },
  {
    security_code: "HK0000664528",
    isin: "HK0000664528",
    name: "HKMA Exchange Fund Bill 3M",
    asset_class: "T-Bill",
    issuer_id: "HKMA",
    issuer_name: "HKMA",
    currency: "HKD",
    maturity_date: "2026-12-09",
    coupon_rate_pct: 3.88,
    day_count: "Act/365",
    rating: "A-1+",
    custom: false,
    days_to_maturity: 85,
  },
  {
    security_code: "XS2591048821",
    isin: "XS2591048821",
    name: "Citi 14D USD CD",
    asset_class: "NCD",
    issuer_id: "CITI",
    issuer_name: "Citi",
    currency: "USD",
    maturity_date: "2026-09-29",
    coupon_rate_pct: 4.95,
    day_count: "Act/360",
    rating: "A-1",
    custom: false,
    days_to_maturity: 14,
  },
  {
    security_code: "CUSTOM_TD",
    isin: null,
    name: "自定义定期存款 (Bespoke Term Deposit)",
    asset_class: "TD",
    issuer_id: "CUSTOM",
    issuer_name: "HSBC",
    currency: "USD",
    maturity_date: null,
    coupon_rate_pct: 4.5,
    day_count: "Act/365",
    rating: "—",
    custom: true,
    days_to_maturity: null,
  },
];

export function daysToMaturity(asOf: string, maturity: string): number {
  const ms = Date.parse(maturity) - Date.parse(asOf);
  return Math.max(1, Math.round(ms / 86_400_000));
}

export function addDays(asOf: string, days: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function filterSecurityMaster(rows: SecurityMasterRow[], query: string): SecurityMasterRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    [row.security_code, row.isin ?? "", row.name, row.issuer_name, row.asset_class, row.rating]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

export function applySecurityToForm(
  row: SecurityMasterRow,
  prev: WhatIfForm,
  asOf: string,
): WhatIfForm {
  const listed = !row.custom;
  const maturity = listed && row.maturity_date ? row.maturity_date : prev.maturityDate;
  const dtm = listed && row.maturity_date ? daysToMaturity(asOf, row.maturity_date) : Number(prev.tenorDays) || 7;
  return {
    ...prev,
    securityCode: row.security_code,
    securityName: row.name,
    listed,
    assetClass: (row.asset_class as WhatIfForm["assetClass"]) || "TD",
    counterparty: row.issuer_name,
    currency: row.currency === "HKD" ? "HKD" : "USD",
    yieldPct: row.coupon_rate_pct != null ? String(row.coupon_rate_pct) : prev.yieldPct,
    dayCount: row.day_count,
    rating: row.rating,
    maturityDate: listed ? (row.maturity_date ?? "") : prev.maturityDate || addDays(asOf, dtm),
    tenorDays: String(listed ? dtm : dtm),
    tenorPreset: listed ? "CUSTOM" : prev.tenorPreset === "CUSTOM" ? "7D" : prev.tenorPreset,
  };
}

export function applyTenorPreset(prev: WhatIfForm, preset: WhatIfForm["tenorPreset"], asOf: string): WhatIfForm {
  const found = TENOR_PRESETS.find((p) => p.id === preset);
  if (!found || preset === "CUSTOM") {
    return { ...prev, tenorPreset: preset, listed: false, securityCode: "CUSTOM_TD", securityName: "自定义定期存款 (Bespoke Term Deposit)" };
  }
  return {
    ...prev,
    listed: false,
    securityCode: prev.listed ? "CUSTOM_TD" : prev.securityCode || "CUSTOM_TD",
    securityName: prev.listed ? "自定义定期存款 (Bespoke Term Deposit)" : prev.securityName,
    tenorPreset: preset,
    tenorDays: String(found.days),
    maturityDate: addDays(asOf, found.days),
    dayCount: prev.dayCount || "Act/365",
  };
}
