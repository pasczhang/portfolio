import * as XLSX from "xlsx";
import { addDays, parseNamedDayMonYear, toIsoDate, toNumber } from "@/lib/holdings/dates";
import { uniqueHoldingId, uniquifySecurityIds } from "@/lib/holdings/rowId";
import type { BookPosition, SfcAssetType } from "@/lib/holdings/types";
import type { ParsedAssetClass, ParsedValuationHolding, ParsedValuationReport } from "@/lib/services/types";

const AMOUNT_FLOOR = 1000;
const JUNK_RE =
  /interest on unsettled|provision for|unrealized gain|unrealized loss|accrued expense|management fee|custody fee|total net asset|grand total|sub total|\bpos-/i;
const VALID_ISIN_RE = /^(USY[A-Z0-9]{9}|US[A-Z0-9]{10}|XS[A-Z0-9]{10}|HK[A-Z0-9]{10})$/;

/** Official 12-character ISIN (e.g. US912797TB33). */
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const CODE_TOKEN = /[A-Z0-9]{8,12}/g;

export function extractIsin(value: unknown): string | null {
  const s = String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
  const m = s.match(/[A-Z]{2}[A-Z0-9]{9}[0-9]/);
  if (!m) return null;
  return VALID_ISIN_RE.test(m[0]) || ISIN_RE.test(m[0]) ? m[0] : null;
}

export function extractSecurityCode(value: unknown): string {
  const s = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const hits = s.match(CODE_TOKEN) ?? [];
  return hits.find((h) => ISIN_RE.test(h)) ?? hits[0] ?? "";
}

function blobOf(aoa: unknown[][]): string {
  return aoa
    .slice(0, 40)
    .map((r) => (r ?? []).map((c) => String(c ?? "")).join(" "))
    .join("\n")
    .toUpperCase();
}

export function isBociUsdMmfTemplate(aoa: unknown[][], fileName = ""): boolean {
  const t = `${fileName}\n${blobOf(aoa)}`.toUpperCase();
  if (t.includes("VALUATION OF INVESTMENT")) return true;
  if (t.includes("BOC INTERNATIONAL") || t.includes("BOCI") || t.includes("PRUDENTIAL")) return true;
  return t.includes("ISIN CODE") && (t.includes("PORT CURR BOOK COST") || t.includes("BOOK COST"));
}

function isCashName(text: string): boolean {
  return /custodian demand deposit|cash at bank|\bcash\b|bank balance|demand deposit|current a\/c|current account|settlement account/i.test(
    text,
  );
}

function isJunkRow(text: string): boolean {
  return JUNK_RE.test(text);
}

function isValidAssetCode(code: string): boolean {
  const s = code.toUpperCase().replace(/\s+/g, "");
  return VALID_ISIN_RE.test(s) || (ISIN_RE.test(s) && /^(USY|US|XS|HK)/.test(s));
}

function classifyName(name: string): { assetClass: ParsedAssetClass; sfc: SfcAssetType; issuer: string; typeRaw: string } {
  const u = name.toUpperCase();
  if (isCashName(name) && !/time deposit|term deposit|fixed deposit/i.test(name)) {
    return { assetClass: "CASH", sfc: "Cash / Bank Deposit", issuer: "Custodian", typeRaw: name };
  }
  if (/TIME DEPOSIT|TERM DEPOSIT|FIXED DEPOSIT|定期存款/.test(u)) {
    return { assetClass: "DEPOSIT", sfc: "Cash / Bank Deposit", issuer: "", typeRaw: "Time Deposit" };
  }
  if (/\bREPO\b|REPURCHASE/.test(u) && !/REPORT/.test(u)) {
    return { assetClass: "REPO", sfc: "Reverse Repo", issuer: "", typeRaw: "Repo" };
  }
  if (/TREASURY BILL|TBILL|T-BILL/.test(u)) {
    return { assetClass: "BOND", sfc: "Govt Bills", issuer: "UNITED STATES OF AMERICA", typeRaw: "Treasury Bill" };
  }
  if (/\bCOMMERCIAL PAPER\b|\bCP\b/.test(u) && !/MORGAN STANLEY/.test(u)) {
    return { assetClass: "CP", sfc: "Commercial Paper", issuer: "", typeRaw: "Commercial Paper" };
  }
  if (/CHINA CONSTRUCTION BANK/.test(u)) {
    const cp = /\bCP\b|COMMERCIAL PAPER/.test(u);
    return {
      assetClass: cp ? "CP" : "CD",
      sfc: cp ? "Commercial Paper" : "NCD",
      issuer: "CHINA CONSTRUCTION BANK",
      typeRaw: cp ? "Commercial Paper" : "NCD",
    };
  }
  if (/SUMITOMO MITSU/.test(u)) {
    return { assetClass: "CD", sfc: "NCD", issuer: "SUMITOMO MITSUI TRUST BANK", typeRaw: "NCD" };
  }
  if (/PETROLIAM NASIONAL/.test(u)) {
    return { assetClass: "BOND", sfc: "NCD", issuer: "PETROLIAM NASIONAL BHD", typeRaw: "Corporate Bond" };
  }
  if (/MORGAN STANLEY/.test(u)) {
    return { assetClass: "BOND", sfc: "NCD", issuer: "MORGAN STANLEY", typeRaw: "Corporate Bond" };
  }
  return { assetClass: "BOND", sfc: "NCD", issuer: "", typeRaw: "Bond/Note" };
}

function cellDates(row: unknown[]): string[] {
  const out: string[] = [];
  for (const c of row ?? []) {
    const iso = toIsoDate(c);
    if (iso && !out.includes(iso)) out.push(iso);
  }
  return out;
}

function datesFromRow(row: unknown[]): string[] {
  const out = cellDates(row);
  const named = parseNamedDayMonYear(rowBlob(row));
  if (named && !out.includes(named)) out.push(named);
  return out;
}

function dateFromRow(row: unknown[]): string | null {
  return datesFromRow(row)[0] ?? null;
}

function isDetailDateRow(row: unknown[]): boolean {
  if (!row?.length) return false;
  if (amountsInRow(row).length) return false;
  if (extractIsin(rowBlob(row))) return false;
  return cellDates(row).length > 0;
}

function maturityFromNameOrCells(name: string, row: unknown[], next: unknown[], asOf: string | null): string {
  const named = parseNamedDayMonYear(name);
  if (named) return named;
  const detail = isDetailDateRow(next) ? cellDates(next) : [];
  return detail[detail.length - 1] ?? cellDates(row)[cellDates(row).length - 1] ?? (asOf ? addDays(asOf, 30) : "");
}

function cellMoney(value: unknown): number | null {
  if (value instanceof Date) return null;
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("%")) return null;
  if (toIsoDate(value) && /[/-]/.test(raw)) return null;
  const n = toNumber(value);
  if (n == null || !Number.isFinite(n)) return null;
  if (Math.abs(n) <= AMOUNT_FLOOR) return null;
  if (n > 20000 && n < 80000) return null;
  return n;
}

function amountsInRow(row: unknown[]): number[] {
  return (row ?? []).map((c) => cellMoney(c)).filter((n): n is number => n != null);
}

function rowBlob(row: unknown[]): string {
  return (row ?? []).map((c) => String(c ?? "")).join(" ");
}

function firstAssetName(row: unknown[]): string {
  for (const c of row ?? []) {
    if (c instanceof Date || typeof c === "number") continue;
    const s = String(c ?? "").trim();
    if (s.length > 3 && !/^[0-9.,$()\s%-]+$/.test(s)) return s;
  }
  return "";
}

function codeFromRow(row: unknown[], index: number): { id: string; isin: string } {
  const blob = rowBlob(row).toUpperCase();
  if (/custodian demand deposit/i.test(blob) || isCashName(blob)) {
    return { id: `CASH-${index}`, isin: "" };
  }
  const hits = blob.match(CODE_TOKEN) ?? [];
  const isin = hits.find((h) => isValidAssetCode(h)) ?? "";
  return { id: isin || `POS-${index}`, isin };
}

function couponFromRow(row: unknown[]): number {
  for (const c of row ?? []) {
    const s = String(c ?? "");
    if (!s.includes("%")) continue;
    return toNumber(c) ?? 0;
  }
  return 0;
}

function asOfFromRows(rows: unknown[][]): string | null {
  for (const row of rows.slice(0, 15)) {
    const blob = rowBlob(row);
    if (!/as of|valuation date|report date/i.test(blob)) continue;
    const iso = toIsoDate(blob) ?? dateFromRow(row);
    if (iso) return iso;
  }
  for (const row of rows.slice(0, 8)) {
    const iso = dateFromRow(row);
    if (iso && !parseNamedDayMonYear(firstAssetName(row))) return iso;
  }
  return null;
}

function extractFooter(rows: unknown[][]): { cash: number | null; cashLabel: string; nav: number | null } {
  let cash: number | null = null;
  let cashLabel = "";
  let nav: number | null = null;
  for (const row of rows) {
    const u = rowBlob(row).toUpperCase();
    const nums = amountsInRow(row);
    const last = nums.length ? nums[nums.length - 1]! : toNumber(row[1]);
    if (isCashName(u) && last != null) {
      cash = last;
      cashLabel = rowBlob(row).slice(0, 80);
    }
    if (/TOTAL NET ASSETS|NET ASSET VALUE|TOTAL NAV/.test(u) && !/%/.test(u) && last != null) {
      nav = last;
    }
  }
  return { cash, cashLabel, nav };
}

function headerCostIndex(rows: unknown[][]): { par: number; book: number; mkt: number } {
  const found = { par: -1, book: -1, mkt: -1 };
  for (const row of rows.slice(0, 25)) {
    (row ?? []).forEach((c, i) => {
      const n = String(c ?? "")
        .toUpperCase()
        .replace(/\s+/g, " ");
      if (found.par < 0 && /NOMINAL|FACE|POSITION|HOLDING QTY/.test(n)) found.par = i;
      if (found.book < 0 && /BOOK COST|AMORTIZED|POSITION COST/.test(n)) found.book = i;
      if (found.mkt < 0 && /MKT VALUE|MARKET VALUE/.test(n)) found.mkt = i;
    });
  }
  return found;
}

function pickAmount(row: unknown[], idx: number, fallback: number): number {
  if (idx < 0) return fallback;
  return cellMoney(row[idx]) ?? fallback;
}

function rowToHolding(row: unknown[], index: number, next: unknown[], asOf: string | null, costCol: { par: number; book: number; mkt: number }): ParsedValuationHolding {
  const name = firstAssetName(row) || `POS-${index}`;
  const { id, isin } = codeFromRow(row, index);
  const nums = amountsInRow(row);
  const maxAmt = nums.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
  const par = pickAmount(row, costCol.par, maxAmt);
  const book = pickAmount(row, costCol.book, maxAmt);
  const mkt = pickAmount(row, costCol.mkt, maxAmt);
  const typed = classifyName(name);
  const cash = typed.assetClass === "CASH";
  const maturity = cash ? asOf ?? "" : maturityFromNameOrCells(name, row, next, asOf);
  const detail = !cash && isDetailDateRow(next) ? cellDates(next) : [];
  const issue = cash ? asOf ?? "" : detail.find((d) => d !== maturity) ?? asOf ?? "";
  return {
    rowNumber: index + 1,
    securityId: id,
    isin,
    name,
    assetTypeRaw: typed.typeRaw,
    assetClass: typed.assetClass,
    sfcAssetType: typed.sfc,
    parValue: par,
    amortizedCost: book,
    accruedInterest: 0,
    marketValue: mkt,
    currency: /HKD/i.test(rowBlob(row)) ? "HKD" : "USD",
    issuer: typed.issuer,
    maturityDate: maturity,
    couponRatePct: couponFromRow(row) || couponFromRow(next),
    issueDate: issue,
    unrealizedPnL: 0,
  };
}

/** Raw row scan: any row with a number > 1000 and no summary keyword is a holding. */
export function scanRowsForHoldings(
  rows: unknown[][],
  opts?: { logPrefix?: string; logFirst30?: boolean; sheetName?: string },
): ParsedValuationHolding[] {
  const parsedAssets: ParsedValuationHolding[] = [];
  const asOf = asOfFromRows(rows);
  const costCol = headerCostIndex(rows);
  const logFirst30 = opts?.logFirst30 !== false;
  const sheetName = opts?.sheetName || "POS";
  rows.forEach((row, index) => {
    if (logFirst30 && index < 30) {
      console.log(`Row ${index}:`, row);
    }
    const blob = rowBlob(row);
    const nums = amountsInRow(row);
    if (!nums.length) return;
    if (isJunkRow(blob) || isJunkRow(firstAssetName(row))) return;
    const holding = rowToHolding(row, index, rows[index + 1] ?? [], asOf, costCol);
    const keepCash = isCashName(holding.name) || holding.assetClass === "CASH";
    const keepTd = holding.assetClass === "DEPOSIT" || /time deposit|term deposit|fixed deposit|定期存款/i.test(holding.name);
    const keepRepo = holding.assetClass === "REPO" || (/\brepo\b/i.test(holding.name) && !/report/i.test(holding.name));
    const keepIsin = isValidAssetCode(holding.isin);
    if (!keepCash && !keepTd && !keepRepo && !keepIsin) return;
    holding.securityId = uniqueHoldingId(sheetName, holding.isin || holding.securityId || `item-${index}`, index);
    parsedAssets.push(holding);
  });
  return uniquifySecurityIds(parsedAssets, sheetName);
}

export function parseBociUsdMmf(aoa: unknown[][], fileName: string): ParsedValuationReport {
  console.log(`=== Raw scan ${fileName} ===`);
  const parsedAssets = scanRowsForHoldings(aoa, { sheetName: "VALUATION" });
  const footer = extractFooter(aoa);
  console.log("=== 全量解析完成，共提取资产数 ===", parsedAssets.length, parsedAssets);
  return {
    custodian: "BOCI",
    template: "BOCI_USD_MMF",
    fileName,
    asOf: asOfFromRows(aoa),
    holdings: uniquifySecurityIds(parsedAssets, "VALUATION"),
    cashBalance: footer.cash,
    cashLabel: footer.cashLabel || "CASH AT BANK",
    nav: footer.nav,
    units: null,
    columnMap: {
      name: "INVESTMENT",
      isin: "ISIN CODE",
      parValue: "NOMINAL",
      amortizedCost: "BOOK COST",
      marketValue: "MARKET VALUE",
    },
    warnings: [`扫描 ${aoa.length} 行，提取 ${parsedAssets.length} 笔。`],
    rawRowCount: aoa.length,
  };
}

/** Walk every worksheet; holdings = rows with amount > 1000 and no summary keyword. */
export function parseWorkbookRawScan(buffer: ArrayBuffer, fileName: string): ParsedValuationReport {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const parsedAssets: ParsedValuationHolding[] = [];
  let rawRowCount = 0;
  let footer = { cash: null as number | null, cashLabel: "", nav: null as number | null };
  let asOf: string | null = null;
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    rawRowCount += rows.length;
    console.log(`=== Sheet: ${sheetName} 行数: ${rows.length} ===`);
    if (!asOf) asOf = asOfFromRows(rows);
    const part = scanRowsForHoldings(rows, { sheetName });
    parsedAssets.push(...part);
    const f = extractFooter(rows);
    if (f.cash != null) footer = f;
    else if (f.nav != null && footer.nav == null) footer = { ...footer, nav: f.nav };
  }
  console.log("=== 全量解析完成，共提取资产数 ===", parsedAssets.length, parsedAssets);
  const looksBoci = isBociUsdMmfTemplate(
    parsedAssets.map((h) => [h.name, h.isin]),
    fileName,
  );
  return {
    custodian: looksBoci || /boci|prudential|valuation of investment/i.test(fileName) ? "BOCI" : "UNKNOWN",
    template: "BOCI_USD_MMF",
    fileName,
    asOf,
    holdings: uniquifySecurityIds(parsedAssets),
    cashBalance: footer.cash,
    cashLabel: footer.cashLabel || "CASH AT BANK",
    nav: footer.nav,
    units: null,
    columnMap: {
      name: "INVESTMENT",
      isin: "ISIN CODE",
      parValue: "NOMINAL",
      amortizedCost: "BOOK COST",
      marketValue: "MARKET VALUE",
    },
    warnings: [`全表扫描 ${rawRowCount} 行 / ${wb.SheetNames.length} 个 Sheet，提取 ${parsedAssets.length} 笔。`],
    rawRowCount,
  };
}

export function workbookToAoa(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

export function formatDmy(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function buildBociUsdMmfAoa(positions: BookPosition[], asOf: string, fundCode: string): unknown[][] {
  const cash = positions
    .filter((p) => p.assetType === "Cash / Bank Deposit" && /custodian|demand|CASH-/i.test(`${p.assetName}${p.securityId}`))
    .reduce((s, p) => s + p.amortizedCost, 0);
  const tape = positions.filter(
    (p) => !(p.assetType === "Cash / Bank Deposit" && /custodian|demand|CASH-/i.test(`${p.assetName}${p.securityId}`)),
  );
  const rows: unknown[][] = [
    ["BOC INTERNATIONAL (PRUDENTIAL)"],
    ["VALUATION OF INVESTMENT", fundCode, `As of ${formatDmy(asOf)}`],
    [],
    [
      "INVESTMENT",
      "ISIN CODE",
      "NOMINAL",
      "PORT CURR",
      "",
      "",
      "PORT CURR BOOK COST",
      "",
      "",
      "PORT CURR MKT VALUE",
      "",
      "",
      "UNREALIZED P/L",
    ],
  ];
  for (const p of tape) {
    const isin = extractIsin(p.isin) ?? extractIsin(p.securityId) ?? p.isin ?? p.securityId;
    const pnl = Number((p.shadowMtm - p.amortizedCost).toFixed(2));
    rows.push([p.assetName, isin, p.parValue, p.currency, "", "", p.amortizedCost, "", "", p.shadowMtm, "", "", pnl]);
    rows.push(["", "", formatDmy(p.issueDate), p.couponRatePct ? `${p.couponRatePct.toFixed(4)}%` : "", formatDmy(p.maturityDate)]);
  }
  const bookNav = positions.reduce((s, p) => s + p.amortizedCost, 0);
  rows.push([]);
  rows.push(["CASH AT BANK", cash]);
  rows.push(["CURRENT ACCOUNT", cash]);
  rows.push(["TOTAL NET ASSETS", bookNav]);
  rows.push(["TOTAL PORTFOLIO", bookNav]);
  return rows;
}

export function downloadBociValuationTemplate(positions: BookPosition[], asOf: string, fundCode: string) {
  const aoa = buildBociUsdMmfAoa(positions, asOf, fundCode);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "VALUATION");
  XLSX.writeFile(wb, `${fundCode}_BOCI_Prudential_valuation_${asOf}.xlsx`);
}
