import * as XLSX from "xlsx";
import { mapSfcAssetType } from "@/lib/holdings/mapAssetType";
import { uniqueHoldingId, uniquifySecurityIds } from "@/lib/holdings/rowId";
import { addDays, toIsoDate, toNumber } from "@/lib/holdings/dates";
import { isBookCash } from "@/lib/holdings/cashPosition";
import type { BookCcy, BookOrigin, BookPosition, SfcAssetType } from "@/lib/holdings/types";
import type {
  ColumnMap,
  CustodianCode,
  ParsedAssetClass,
  ParsedValuationHolding,
  ParsedValuationReport,
} from "@/lib/services/types";
import { scorePair } from "@/lib/services/reconciliation/matching";
import {
  bociResultToValuationReport,
  isBociPrudentialSheet,
  parseBociPrudentialAoa,
  parseBociPrudentialWorkbook,
} from "@/lib/holdings/bociPrudentialParser";
import { isBociUsdMmfTemplate, parseBociUsdMmf, parseWorkbookRawScan, workbookToAoa } from "@/lib/utils/valuationExcelParser";

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u3000]/g, " ")
    .replace(/[_./\\-]+/g, " ")
    .replace(/[()（）#:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FIELD_ALIASES: Record<keyof ColumnMap, string[]> = {
  securityId: ["security id", "asset code", "证券代码", "资产代码", "sec id", "instrument id", "stock code", "code"],
  isin: ["isin", "isin code"],
  name: ["security name", "description", "证券名称", "项目", "asset name", "instrument", "security description", "name"],
  assetType: ["asset type", "category", "品种", "product type", "security type", "instrument type", "asset class"],
  parValue: ["nominal", "par value", "holding qty", "持仓数量", "面值", "quantity", "face amount", "notional", "principal", "qty"],
  amortizedCost: ["amortized cost", "book value", "摊余成本", "成本价", "cost", "carrying value", "book amt", "amortised cost"],
  accrued: ["accrued interest", "应计利息", "accrued", "ai", "interest accrued"],
  marketValue: ["market value", "fair value", "市值全价", "市值", "dirty price value", "mtm", "market amt", "full market value"],
  currency: ["currency", "ccy", "币种"],
  issuer: ["issuer", "counterparty", "发行主体", "对手方", "issuer name"],
  maturity: ["maturity", "maturity date", "到期日", "legal maturity"],
};

function bestField(header: string): keyof ColumnMap | null {
  const n = norm(header);
  if (!n) return null;
  let best: { field: keyof ColumnMap; score: number } | null = null;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [keyof ColumnMap, string[]][]) {
    for (const alias of aliases) {
      let score = 0;
      if (n === alias) score = 3;
      else if (n.includes(alias) || alias.includes(n)) score = alias.length > 3 ? 2 : 1;
      if (score && (!best || score > best.score)) best = { field, score };
    }
  }
  return best && best.score >= 2 ? best.field : null;
}

function detectCustodian(fileName: string, blobs: string[]): CustodianCode {
  const t = `${fileName} ${blobs.join(" ")}`.toUpperCase();
  if (/\bHSBC\b/.test(t) || t.includes("汇丰")) return "HSBC";
  if (/\bBOCI\b/.test(t) || t.includes("中银国际") || t.includes("BANK OF CHINA INTERNATIONAL")) return "BOCI";
  if (/\bCITI\b/.test(t) || t.includes("CITIBANK") || t.includes("花旗")) return "CITI";
  if (/\bSCB\b/.test(t) || t.includes("STANDARD CHARTERED") || t.includes("渣打")) return "SCB";
  return "UNKNOWN";
}

export function classifyAsset(raw: string): { assetClass: ParsedAssetClass; sfc: SfcAssetType | null } {
  const n = norm(raw);
  const mapped = mapSfcAssetType(raw);
  if (/repo|逆回购|rrp/.test(n)) return { assetClass: "REPO", sfc: mapped ?? "Reverse Repo" };
  if (/\bcp\b|commercial paper|商业票据/.test(n)) return { assetClass: "CP", sfc: mapped ?? "Commercial Paper" };
  if (/\bcd\b|\bncd\b|certificate of deposit|同业存单|存单/.test(n)) return { assetClass: "CD", sfc: mapped ?? "NCD" };
  if (/deposit|定存|存款|call account|demand|cash|现金|结算备付/.test(n)) {
    return { assetClass: n.includes("cash") || n.includes("现金") ? "CASH" : "DEPOSIT", sfc: mapped ?? "Cash / Bank Deposit" };
  }
  if (/bill|bond|treasury|govt|government|外汇基金|国债|票据/.test(n)) return { assetClass: "BOND", sfc: mapped ?? "Govt Bills" };
  return { assetClass: "OTHER", sfc: mapped };
}

function looksLikeHeader(cells: string[]): ColumnMap | null {
  const map: ColumnMap = {};
  let hits = 0;
  cells.forEach((cell, i) => {
    const field = bestField(String(cell ?? ""));
    if (!field || map[field]) return;
    map[field] = String(i);
    hits += 1;
  });
  const hasId = Boolean(map.securityId || map.isin || map.name);
  const hasAmt = Boolean(map.parValue || map.amortizedCost || map.marketValue);
  return hits >= 3 && hasId && hasAmt ? map : null;
}

function cell(row: string[], key: string | undefined): string {
  if (key == null) return "";
  const i = Number(key);
  return String(row[i] ?? "").trim();
}

function asStringRows(aoa: unknown[][]): string[][] {
  return aoa.map((r) => (r ?? []).map((c) => String(c ?? "")));
}

function money(row: string[], key: string | undefined): number {
  return toNumber(cell(row, key)) ?? 0;
}

const CASH_RE = /cash balance|银行存款|结算备付金|cash at bank|uninvested cash|call account balance|托管现金/;

function extractFooter(aoa: string[][], start: number): { cash: number | null; label: string; nav: number | null; units: number | null } {
  let cash: number | null = null;
  let label = "";
  let nav: number | null = null;
  let units: number | null = null;
  for (let r = start; r < aoa.length; r++) {
    const line = (aoa[r] ?? []).map((c) => String(c ?? "")).join(" ");
    const nline = norm(line);
    if (CASH_RE.test(nline)) {
      const nums = (aoa[r] ?? []).map((c) => toNumber(c)).filter((v): v is number => v != null && Math.abs(v) > 0);
      if (nums.length) {
        cash = nums[nums.length - 1]!;
        label = line.slice(0, 80);
      }
    }
    if (/total net asset|net asset value|净资产|基金净值|total nav\b/.test(nline) && !/shadow/.test(nline) && !/% of nav|%of nav/.test(nline)) {
      const nums = (aoa[r] ?? []).map((c) => toNumber(c)).filter((v): v is number => v != null);
      if (nums.length) nav = nums[nums.length - 1]!;
    }
    if (/units outstanding|份额|total units/.test(nline)) {
      const nums = (aoa[r] ?? []).map((c) => toNumber(c)).filter((v): v is number => v != null);
      if (nums.length) units = nums[nums.length - 1]!;
    }
  }
  return { cash, label, nav, units };
}

function detectAsOf(aoa: string[][]): string | null {
  for (const row of aoa.slice(0, 12)) {
    for (const c of row) {
      const s = String(c ?? "");
      if (/as of|valuation date|估值日|报告日/i.test(s)) {
        const iso = toIsoDate(s.replace(/.*?(as of|valuation date|估值日|报告日)[:\s]*/i, "")) ?? toIsoDate(s);
        if (iso) return iso;
      }
      const iso = toIsoDate(c);
      if (iso && iso.startsWith("202")) return iso;
    }
  }
  return null;
}

export function parseValuationWorkbook(buffer: ArrayBuffer, fileName: string): ParsedValuationReport {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".csv")) {
    const structured = parseBociPrudentialWorkbook(buffer, fileName);
    if (structured && structured.holdings.length) {
      return bociResultToValuationReport(structured, fileName);
    }
    return parseWorkbookRawScan(buffer, fileName);
  }
  const aoa = workbookToAoa(buffer);
  if (isBociPrudentialSheet(aoa, fileName) || isBociUsdMmfTemplate(aoa, fileName)) {
    if (isBociPrudentialSheet(aoa, fileName)) {
      return bociResultToValuationReport(parseBociPrudentialAoa(aoa, fileName), fileName, aoa.length);
    }
    return parseBociUsdMmf(aoa, fileName);
  }
  const rows = asStringRows(aoa);
  const warnings: string[] = [];
  let headerIdx = -1;
  let columnMap: ColumnMap = {};
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const mapped = looksLikeHeader(rows[i] ?? []);
    if (mapped) {
      headerIdx = i;
      columnMap = mapped;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      custodian: detectCustodian(fileName, [rows[0]?.join(" ") ?? ""]),
      template: "GENERIC",
      fileName,
      asOf: detectAsOf(rows),
      holdings: [],
      cashBalance: null,
      cashLabel: "",
      nav: null,
      units: null,
      columnMap: {},
      warnings: ["未能识别估值表表头，请确认含 ISIN / Security Name / Par Value 等列。"],
      rawRowCount: rows.length,
    };
  }

  const holdings: ParsedValuationHolding[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const joined = norm(row.join(" "));
    if (!joined) continue;
    if (CASH_RE.test(joined) || /total|合计|小计|grand total/.test(joined)) break;
    const name = cell(row, columnMap.name);
    const isin = cell(row, columnMap.isin);
    const securityId = cell(row, columnMap.securityId) || isin || name;
    const par = money(row, columnMap.parValue);
    const book = money(row, columnMap.amortizedCost);
    const mkt = money(row, columnMap.marketValue);
    if (!securityId && par === 0 && book === 0 && mkt === 0) continue;
    const typeRaw = cell(row, columnMap.assetType);
    const { assetClass, sfc } = classifyAsset(typeRaw || name);
    const baseId = securityId || isin || name || `item-${r}`;
    holdings.push({
      rowNumber: r + 1,
      securityId: uniqueHoldingId("GENERIC", baseId, r),
      isin,
      name: name || securityId,
      assetTypeRaw: typeRaw,
      assetClass,
      sfcAssetType: sfc,
      parValue: par,
      amortizedCost: book || mkt || par,
      accruedInterest: money(row, columnMap.accrued),
      marketValue: mkt || book || par,
      currency: cell(row, columnMap.currency),
      issuer: cell(row, columnMap.issuer),
      maturityDate: toIsoDate(cell(row, columnMap.maturity)) ?? "",
      couponRatePct: 0,
      issueDate: "",
      unrealizedPnL: 0,
    });
  }

  const footer = extractFooter(rows, headerIdx + holdings.length + 1);
  if (footer.cash == null) warnings.push("未解析到底部现金结余，现金对账将仅使用持仓中的现金类资产。");
  if (!columnMap.accrued) warnings.push("未映射应计利息列，应计对账将以 0 作为托管行口径。");

  return {
    custodian: detectCustodian(fileName, [rows[0]?.join(" ") ?? ""]),
    template: "GENERIC",
    fileName,
    asOf: detectAsOf(rows),
    holdings: uniquifySecurityIds(holdings, "GENERIC"),
    cashBalance: footer.cash,
    cashLabel: footer.label || "Cash Balance",
    nav: footer.nav,
    units: footer.units,
    columnMap,
    warnings,
    rawRowCount: rows.length,
  };
}

function isTapeCashLine(h: ParsedValuationHolding): boolean {
  if (h.assetClass === "DEPOSIT" || h.assetClass === "REPO" || h.assetClass === "CD" || h.assetClass === "CP" || h.assetClass === "BOND") {
    return false;
  }
  if (/time deposit|term deposit|fixed deposit|定期存款|\brepo\b/i.test(h.name)) return false;
  return (
    h.assetClass === "CASH" ||
    /cash at bank|bank balance|current account|current a\/c|demand deposit|usd cash ac|custody cash|\bcash\b/i.test(h.name)
  );
}

export function parsedHoldingsToPositions(report: ParsedValuationReport, ccy: BookCcy, asOf: string): BookPosition[] {
  const tape = report.holdings.map((h, i) => {
    const cash = isTapeCashLine(h);
    const assetType: SfcAssetType = h.sfcAssetType ?? (cash ? "Cash / Bank Deposit" : "NCD");
    const baseId = h.isin || h.securityId || (cash ? `CASH-${ccy}` : `item-${i}`);
    const id = cash ? `CASH-${ccy}-TAPE-${h.rowNumber || i}` : uniqueHoldingId("POS", baseId, h.rowNumber || i);
    const floating = /frn|float/i.test(`${h.name} ${h.assetTypeRaw}`);
    const rowCcy: BookCcy = (h.currency || "").toUpperCase() === "HKD" ? "HKD" : ccy;
    return {
      securityId: id,
      assetName: h.name || id,
      assetType,
      currency: rowCcy,
      counterparty: h.issuer || report.custodian,
      isin: h.isin,
      issueDate: h.issueDate || asOf,
      maturityDate: h.maturityDate || (h.assetClass === "REPO" ? addDays(asOf, 1) : asOf),
      parValue: h.parValue,
      amortizedCost: h.amortizedCost,
      shadowMtm: h.marketValue,
      couponRatePct: h.couponRatePct || 0,
      couponType: (floating ? "floating" : "fixed") as BookPosition["couponType"],
      resetDate: floating ? asOf : null,
      rating: "NR",
      dayCount: rowCcy === "HKD" ? "Act/365" : "Act/360",
    };
  });
  return uniquifySecurityIds(tape, "POS");
}

function custodianCashRow(ccy: BookCcy, asOf: string, amount: number, custodian: string): BookPosition {
  return {
    securityId: `CASH-${ccy}-CUSTODY`,
    assetName: "Custodian Demand Deposit",
    assetType: "Cash / Bank Deposit",
    currency: ccy,
    counterparty: custodian,
    isin: "",
    issueDate: asOf,
    maturityDate: asOf,
    parValue: amount,
    amortizedCost: amount,
    shadowMtm: amount,
    couponRatePct: 0,
    couponType: "fixed",
    resetDate: null,
    rating: "NR",
    dayCount: ccy === "HKD" ? "Act/365" : "Act/360",
  };
}

/** Full overwrite: custodian securities + footer cash become the official book. Mock holdings are discarded. */
export function adoptCustodianAsBook(
  _internal: BookPosition[],
  _origin: BookOrigin,
  report: ParsedValuationReport,
  asOf: string,
  ccy: BookCcy,
): BookPosition[] {
  const bookAsOf = report.asOf || asOf;
  const tape = parsedHoldingsToPositions(report, ccy, bookAsOf);
  if (tape.some((p) => isBookCash(p) || /CASH-/i.test(p.securityId))) return tape;
  const cashAmt = report.cashBalance;
  const cash = cashAmt != null && cashAmt !== 0 ? custodianCashRow(ccy, bookAsOf, cashAmt, report.custodian) : null;
  return cash ? [cash, ...tape] : tape;
}

export function mergeAdoptCustodian(
  internal: BookPosition[],
  report: ParsedValuationReport,
  asOf: string,
  ccy: BookCcy,
  origin: BookOrigin = "demo",
): BookPosition[] {
  return adoptCustodianAsBook(internal, origin, report, asOf, ccy);
}

export function matchKey(p: BookPosition, h: ParsedValuationHolding): boolean {
  return scorePair(p, h).score >= 52;
}

export function syntheticCustodianReport(
  positions: BookPosition[],
  asOf: string,
  fileName = "HSBC_Valuation_Demo.xlsx",
): ParsedValuationReport {
  const cashish = positions.filter((p) => p.assetType === "Cash / Bank Deposit" && /custodian|demand|CASH-/i.test(`${p.assetName}${p.securityId}`));
  const rest = positions.filter((p) => !cashish.includes(p));
  const holdings: ParsedValuationHolding[] = rest.map((p, i) => ({
    rowNumber: i + 2,
    securityId: p.securityId,
    isin: p.isin,
    name: p.assetName,
    assetTypeRaw: p.assetType,
    assetClass: p.assetType === "NCD" ? "CD" : p.assetType === "Commercial Paper" ? "CP" : p.assetType === "Reverse Repo" ? "REPO" : p.assetType === "Govt Bills" ? "BOND" : "DEPOSIT",
    sfcAssetType: p.assetType,
    parValue: p.parValue,
    amortizedCost: p.amortizedCost,
    accruedInterest: Math.max(0, p.amortizedCost - p.parValue * 0.998),
    marketValue: p.shadowMtm,
    currency: p.currency,
    issuer: p.counterparty,
    maturityDate: p.maturityDate,
    couponRatePct: p.couponRatePct,
    issueDate: p.issueDate,
    unrealizedPnL: Number((p.shadowMtm - p.amortizedCost).toFixed(2)),
  }));
  const dropped = holdings.pop();
  if (holdings[0]) holdings[0] = { ...holdings[0], parValue: holdings[0].parValue + 1 };
  const cash = cashish.reduce((s, p) => s + p.amortizedCost, 0) + 0.05;
  return {
    custodian: "HSBC",
    template: "GENERIC",
    fileName,
    asOf,
    holdings,
    cashBalance: cash,
    cashLabel: "Cash Balance / 银行存款",
    nav: positions.reduce((s, p) => s + p.amortizedCost, 0),
    units: positions.reduce((s, p) => s + p.amortizedCost, 0),
    columnMap: {
      securityId: "Security ID",
      isin: "ISIN",
      name: "Security Name",
      parValue: "Nominal",
      amortizedCost: "Amortized Cost",
      accrued: "Accrued Interest",
      marketValue: "Market Value",
    },
    warnings: dropped ? [`演示：故意漏单 ${dropped.securityId}，现金差 $0.05，面值微调 1`] : ["演示现金差 $0.05"],
    rawRowCount: holdings.length + 8,
  };
}

export function downloadCustodianTemplate(positions: BookPosition[], asOf: string, fundCode: string) {
  const cash = positions
    .filter((p) => p.assetType === "Cash / Bank Deposit" && /custodian|demand|CASH-/i.test(`${p.assetName}${p.securityId}`))
    .reduce((s, p) => s + p.amortizedCost, 0);
  const rows = positions.map((p) => ({
    "Security ID": p.securityId,
    ISIN: p.isin,
    "Security Name": p.assetName,
    "Asset Type": p.assetType,
    Nominal: p.parValue,
    "Amortized Cost": p.amortizedCost,
    "Accrued Interest": Math.max(0, Number((p.amortizedCost - p.parValue).toFixed(2))),
    "Market Value": p.shadowMtm,
    Issuer: p.counterparty,
    "Maturity Date": p.maturityDate,
    Currency: p.currency,
  }));
  const aoa = [
    [`HSBC Custody Valuation`, fundCode, `As of ${asOf}`],
    [],
    Object.keys(rows[0] ?? { "Security ID": "", ISIN: "", "Security Name": "", Nominal: 0 }),
    ...rows.map((r) => Object.values(r)),
    [],
    ["Cash Balance / 银行存款", cash],
    ["NAV", positions.reduce((s, p) => s + p.amortizedCost, 0)],
    ["Units Outstanding", positions.reduce((s, p) => s + p.amortizedCost, 0)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Valuation");
  XLSX.writeFile(wb, `${fundCode}_HSBC_valuation_${asOf}.xlsx`);
}
