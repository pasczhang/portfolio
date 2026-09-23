import { daysBetween } from "@/lib/holdings/dates";
import type { BookCcy, BookPosition, SfcAssetType } from "@/lib/holdings/types";
import { assetCategoryOf } from "@/lib/holdings/unified";

export const MANUAL_ASSET_KINDS = [
  { id: "CASH", label: "现金 (Cash & Bank)" },
  { id: "TIME_DEPOSIT", label: "定期存款 (Time Deposit)" },
  { id: "REPO", label: "质押回购 (Repo)" },
  { id: "NCD", label: "同业存单 (NCD)" },
  { id: "GOVT", label: "国债 (Govt Bills)" },
  { id: "CORP", label: "公司债 (Corporate Bond)" },
] as const;

export type ManualAssetKind = (typeof MANUAL_ASSET_KINDS)[number]["id"];

export const MANUAL_RATINGS = ["NR", "A-1+", "A-1", "P-1", "AAA", "AA+", "AA", "A"] as const;

export type ManualPositionDraft = {
  securityId?: string;
  kind: ManualAssetKind;
  assetCode: string;
  assetName: string;
  issuer: string;
  valueDate: string;
  maturityDate: string;
  couponRate: string;
  amortizedCost: string;
  fairValue: string;
  rating: string;
};

export function emptyManualDraft(asOf: string, ccy: BookCcy): ManualPositionDraft {
  return {
    kind: "NCD",
    assetCode: "",
    assetName: "",
    issuer: "",
    valueDate: asOf,
    maturityDate: asOf,
    couponRate: "0",
    amortizedCost: "",
    fairValue: "",
    rating: "NR",
  };
}

export function kindFromPosition(p: BookPosition): ManualAssetKind {
  const cat = assetCategoryOf(p);
  if (cat === "CASH") return "CASH";
  if (cat === "TIME_DEPOSIT") return "TIME_DEPOSIT";
  if (cat === "REPO") return "REPO";
  if (p.assetType === "Govt Bills") return "GOVT";
  if (p.assetType === "NCD" || p.assetType === "Commercial Paper") return "NCD";
  return "CORP";
}

export function positionToManualDraft(p: BookPosition): ManualPositionDraft {
  return {
    securityId: p.securityId,
    kind: kindFromPosition(p),
    assetCode: (p.isin && p.isin !== "—" ? p.isin : p.securityId) || "",
    assetName: p.assetName,
    issuer: p.counterparty,
    valueDate: p.issueDate,
    maturityDate: p.maturityDate,
    couponRate: String(p.couponRatePct ?? 0),
    amortizedCost: String(p.amortizedCost ?? ""),
    fairValue: String(p.shadowMtm ?? p.amortizedCost ?? ""),
    rating: p.rating || "NR",
  };
}

export function remainingDaysFrom(asOf: string, maturityDate: string): number {
  return daysBetween(asOf, maturityDate);
}

function looksLikeIsin(code: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(code);
}

function sfcOf(kind: ManualAssetKind): SfcAssetType {
  if (kind === "CASH" || kind === "TIME_DEPOSIT") return "Cash / Bank Deposit";
  if (kind === "REPO") return "Reverse Repo";
  if (kind === "GOVT") return "Govt Bills";
  if (kind === "CORP") return "NCD";
  return "NCD";
}

function cashishName(name: string, kind: ManualAssetKind): string {
  if (kind !== "CASH") return name;
  if (/cash|demand|custodian|bank balance|current account|银行存款|托管现金/i.test(name)) return name;
  return `${name} (Cash)`;
}

export function validateManualDraft(draft: ManualPositionDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.assetCode.trim()) errors.assetCode = "请填写资产代码或 ISIN";
  if (!draft.assetName.trim()) errors.assetName = "请填写资产名称";
  if (!draft.issuer.trim()) errors.issuer = "请填写发行人 / 对手方";
  if (!draft.valueDate) errors.valueDate = "请选择起息日";
  if (!draft.maturityDate) errors.maturityDate = "请选择到期日";
  const coupon = Number(draft.couponRate);
  if (!Number.isFinite(coupon) || coupon < 0) errors.couponRate = "票面利率须为 ≥ 0 的数字";
  const cost = Number(draft.amortizedCost);
  if (!Number.isFinite(cost) || !(cost > 0)) errors.amortizedCost = "摊余成本必须大于 0";
  if (draft.fairValue.trim()) {
    const fv = Number(draft.fairValue);
    if (!Number.isFinite(fv) || !(fv > 0)) errors.fairValue = "公允估值须大于 0";
  }
  return errors;
}

export function draftToBookPosition(draft: ManualPositionDraft, ccy: BookCcy, asOf: string): BookPosition {
  const code = draft.assetCode.trim().toUpperCase().replace(/\s+/g, "");
  const name = cashishName(draft.assetName.trim(), draft.kind);
  const cost = Number(draft.amortizedCost);
  const fv = draft.fairValue.trim() ? Number(draft.fairValue) : cost;
  const isin = looksLikeIsin(code) ? code : "";
  let securityId = draft.securityId?.trim() || "";
  if (!securityId) {
    if (draft.kind === "CASH") {
      securityId = /CASH-/i.test(code) ? code : `CASH-${ccy}-${code || "MANUAL"}`;
    } else {
      securityId = code || `MANUAL-${draft.kind}-${Date.now()}`;
    }
  }
  if (draft.kind === "CASH" && !/CASH-/i.test(securityId)) {
    securityId = `CASH-${ccy}-${securityId}`;
  }
  return {
    securityId,
    assetName: name,
    assetType: sfcOf(draft.kind),
    currency: ccy,
    counterparty: draft.issuer.trim(),
    isin,
    issueDate: draft.valueDate || asOf,
    maturityDate: draft.maturityDate || asOf,
    parValue: cost,
    amortizedCost: cost,
    shadowMtm: fv,
    couponRatePct: Number(draft.couponRate) || 0,
    couponType: "fixed",
    resetDate: null,
    rating: draft.rating || "NR",
    dayCount: ccy === "HKD" ? "Act/365" : "Act/360",
  };
}
