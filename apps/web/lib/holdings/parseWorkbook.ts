import * as XLSX from "xlsx";
import { mapSfcAssetType } from "@/lib/holdings/mapAssetType";
import { toIsoDate, toNumber } from "@/lib/holdings/dates";
import type { BookCcy, BookPosition, ParsedHoldingRow } from "@/lib/holdings/types";

const HEADER_ALIASES: Record<string, keyof BookPosition | "ignore"> = {
  assetname: "assetName",
  "asset name": "assetName",
  资产名称: "assetName",
  name: "assetName",
  instrument: "assetName",
  assettype: "assetType",
  "asset type": "assetType",
  资产类型: "assetType",
  type: "assetType",
  producttype: "assetType",
  currency: "currency",
  币种: "currency",
  ccy: "currency",
  counterparty: "counterparty",
  issuer: "counterparty",
  对手方: "counterparty",
  发行主体: "counterparty",
  isin: "isin",
  securityid: "securityId",
  "security id": "securityId",
  资产代码: "securityId",
  issuedate: "issueDate",
  "issue date": "issueDate",
  valuedate: "issueDate",
  起息日: "issueDate",
  maturitydate: "maturityDate",
  "maturity date": "maturityDate",
  到期日: "maturityDate",
  parvalue: "parValue",
  "par value": "parValue",
  face: "parValue",
  面值: "parValue",
  notional: "parValue",
  amortizedcost: "amortizedCost",
  "amortized cost": "amortizedCost",
  摊余成本: "amortizedCost",
  bookvalue: "amortizedCost",
  shadowmtm: "shadowMtm",
  "shadow mtm": "shadowMtm",
  影子估值: "shadowMtm",
  couponratepct: "couponRatePct",
  coupon: "couponRatePct",
  yield: "couponRatePct",
  票面利率: "couponRatePct",
  rating: "rating",
  评级: "rating",
  daycount: "dayCount",
};

function normKey(key: string): string {
  return key.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
}

function pick(row: Record<string, unknown>, field: keyof BookPosition): unknown {
  for (const [raw, mapped] of Object.entries(row)) {
    if (HEADER_ALIASES[normKey(raw)] === field) return mapped;
  }
  return undefined;
}

function slug(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
}

export function workbookToRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
}

export function parseHoldingRecords(
  records: Record<string, unknown>[],
  fundCcy: BookCcy,
): ParsedHoldingRow[] {
  return records.map((raw, i) => {
    const rowNumber = i + 2;
    const name = String(pick(raw, "assetName") ?? "").trim();
    const typeIn = String(pick(raw, "assetType") ?? "").trim();
    const mappedType = mapSfcAssetType(typeIn);
    const ccyRaw = String(pick(raw, "currency") ?? fundCcy)
      .trim()
      .toUpperCase();
    const currency = ccyRaw === "HKD" || ccyRaw === "USD" ? (ccyRaw as BookCcy) : null;
    const issueDate = toIsoDate(pick(raw, "issueDate"));
    const maturityDate = toIsoDate(pick(raw, "maturityDate"));
    const parValue = toNumber(pick(raw, "parValue"));
    const amortizedCost = toNumber(pick(raw, "amortizedCost"));
    const shadow = toNumber(pick(raw, "shadowMtm"));
    const coupon = toNumber(pick(raw, "couponRatePct"));
    const counterparty = String(pick(raw, "counterparty") ?? "").trim();
    const isin = String(pick(raw, "isin") ?? "").trim();
    const securityId = String(pick(raw, "securityId") ?? "").trim() || `${slug(name || "POS")}-${rowNumber}`;
    const rating = String(pick(raw, "rating") ?? "").trim();
    const dayCount = String(pick(raw, "dayCount") ?? "").trim() || (currency === "HKD" ? "Act/365" : "Act/360");

    const position: ParsedHoldingRow["position"] = {
      securityId,
      assetName: name,
      assetType: mappedType ?? undefined,
      currency: currency ?? undefined,
      counterparty: counterparty || "Unknown",
      isin,
      issueDate: issueDate ?? undefined,
      maturityDate: maturityDate ?? undefined,
      parValue: parValue ?? undefined,
      amortizedCost: amortizedCost ?? undefined,
      shadowMtm: shadow ?? amortizedCost ?? undefined,
      couponRatePct: coupon ?? 0,
      couponType: "fixed",
      resetDate: null,
      rating,
      dayCount,
    };

    const errors: string[] = [];
    const warnings: string[] = [];
    if (!name) errors.push("assetName 不能为空");
    if (!typeIn) errors.push("assetType 不能为空");
    else if (!mappedType) errors.push(`无法映射 SFC 资产类型：${typeIn}`);
    if (parValue == null) errors.push("parValue 不能为空");
    if (amortizedCost == null) errors.push("amortizedCost 不能为空");
    if (!maturityDate) errors.push("maturityDate 必须为 YYYY-MM-DD");
    if (pick(raw, "issueDate") && !issueDate) errors.push("issueDate 必须为 YYYY-MM-DD");
    if (issueDate && maturityDate && maturityDate <= issueDate) errors.push("maturityDate 必须晚于 issueDate");
    if (currency && currency !== fundCcy) {
      warnings.push(`币种 ${currency} 与当前基金 ${fundCcy} 不一致`);
    }
    if (!currency) errors.push("currency 须为 USD 或 HKD");

    const textRaw: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      textRaw[k] = String(v ?? "");
    });

    return { rowNumber, raw: textRaw, position, errors, warnings };
  });
}

export function finalizeValidRows(rows: ParsedHoldingRow[], fundCcy: BookCcy): BookPosition[] {
  return rows
    .filter((r) => r.errors.length === 0)
    .map((r) => {
      const p = r.position;
      const maturityDate = p.maturityDate!;
      const issueDate = p.issueDate || maturityDate;
      return {
        securityId: p.securityId || `IMP-${r.rowNumber}`,
        assetName: p.assetName || "",
        assetType: p.assetType!,
        currency: p.currency || fundCcy,
        counterparty: p.counterparty || "Unknown",
        isin: p.isin || "",
        issueDate,
        maturityDate,
        parValue: p.parValue ?? 0,
        amortizedCost: p.amortizedCost ?? 0,
        shadowMtm: p.shadowMtm ?? p.amortizedCost ?? 0,
        couponRatePct: p.couponRatePct ?? 0,
        couponType: p.couponType ?? "fixed",
        resetDate: p.resetDate ?? null,
        rating: p.rating || "—",
        dayCount: p.dayCount || "Act/365",
      };
    });
}
