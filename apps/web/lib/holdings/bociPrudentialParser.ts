/**
 * BOCI-Prudential valuation parser.
 * Full-sheet scan: every official 12-character ISIN is a security, regardless of Bond / FRNK / Liquid Assets headings.
 * Dual-row: name+ISIN+amounts, next row value date / coupon / maturity.
 */

import * as XLSX from "xlsx";
import { daysBetween, parseNamedDayMonYear, toIsoDate, toNumber } from "@/lib/holdings/dates";
import { uniqueHoldingId } from "@/lib/holdings/rowId";
import type { SfcAssetType } from "@/lib/holdings/types";
import type { ParsedAssetClass, ParsedValuationHolding, ParsedValuationReport } from "@/lib/services/types";
import type { AssetCategory, UnifiedHoldingPosition } from "@/types/holdings";

export interface BociBondHolding {
  id: string;
  securityName: string;
  isinCode: string;
  quantity: number;
  currency: string;
  avgUnitPrice: number;
  bookCost: number;
  marketPrice: number;
  marketValue: number;
  accruedInterest: number;
  totalValue: number;
  weight: number;
  unrealizedPnL: number;
  valueDate?: string;
  interestRate?: string;
  maturityDate?: string;
}

export interface BociCashItem {
  accountName: string;
  currency: string;
  amount: number;
  weight: number;
}

export interface BociAccrualItem {
  itemName: string;
  amount: number;
  weight: number;
}

export interface BociParsedResult {
  fundName: string;
  baseCurrency: string;
  asOf: string | null;
  nav: number;
  totalInvestmentsMktVal: number;
  totalBookCost: number;
  cashAndAccruals: number;
  holdings: BociBondHolding[];
  cashItems: BociCashItem[];
  accruals: BociAccrualItem[];
}

const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
const OFFICIAL_ISIN = /^(USY[A-Z0-9]{9}|US[A-Z0-9]{10}|XS[A-Z0-9]{10}|HK[A-Z0-9]{10}|[A-Z]{2}[A-Z0-9]{9}\d)$/;

type ColKey = "name" | "isin" | "qty" | "ccy" | "avgPx" | "book" | "mktPx" | "mkt" | "accrued" | "total" | "weight" | "pnl";

const JUNK_RE = /SUBTOTAL|TOTAL BOOK COST|CAUTION:|PORTFOLIO VALUATION|^SUMMARY\b/i;
const CASH_RE =
  /USD CASH AC|CASH AT BANK|CURRENT ACCOUNT|CURRENT AC\b|BANK BALANCE|DEMAND DEPOSIT|CUSTODY CASH|CUSTODY ACCOUNT|UNINVESTED CASH/i;
const ACCRUAL_RE =
  /accrued|payable|receivable|management fee|custody fee|trustee fee|expense|provision|unsettled|withholding|dividend payable/i;
const TOTAL_RE =
  /total net asset|net asset value|\bnav\b|grand total|sub total|total investments|total book|cash and accrual|total portfolio|total value of investment/i;
const TD_RE = /time deposit|term deposit|fixed deposit|定期存款|placement/i;
const REPO_RE = /\breverse repo\b|\brepos?\b|repurchase|逆回购|正回购/i;

function blob(row: unknown[]): string {
  return (row ?? []).map((c) => String(c ?? "")).join(" ");
}

function extractIsin(value: unknown): string {
  const s = String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const m = s.match(ISIN_RE);
  return m && OFFICIAL_ISIN.test(m[0]) ? m[0] : "";
}

function findIsinInRow(row: unknown[]): { isin: string; col: number } | null {
  for (let c = 0; c < (row ?? []).length; c++) {
    const isin = extractIsin(row[c]);
    if (isin) return { isin, col: c };
  }
  const whole = extractIsin(blob(row));
  return whole ? { isin: whole, col: -1 } : null;
}

function convertDateFormat(dStr: string): string {
  const named = parseNamedDayMonYear(dStr);
  if (named) return named;
  const iso = toIsoDate(dStr);
  if (iso) return iso;
  if (!dStr || !dStr.includes("/")) return dStr;
  const parts = dStr.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]!.padStart(2, "0")}-${parts[0]!.padStart(2, "0")}`;
  }
  return dStr;
}

function pickNum(row: unknown[], mapped: number | undefined, fallbacks: number[]): number {
  const read = (i: number | undefined): number | null => {
    if (i == null || i < 0) return null;
    const cell = row[i];
    if (cell == null || cell === "") return null;
    return toNumber(cell);
  };
  const primary = read(mapped);
  if (primary != null) return primary;
  for (const i of fallbacks) {
    const v = read(i);
    if (v != null) return v;
  }
  return 0;
}

function text(row: unknown[], idx: number | undefined): string {
  if (idx == null || idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function headerField(cell: string): ColKey | "mktOrTotal" | null {
  const n = cell.toUpperCase().replace(/\s+/g, " ").trim();
  if (!n) return null;
  if (/ISIN/.test(n)) return "isin";
  if (/AVG UNIT|AVERAGE UNIT|UNIT COST|AVG PRICE|AVERAGE COST/.test(n)) return "avgPx";
  if (/MARKET PRICE|MKT PRICE/.test(n)) return "mktPx";
  if (/BOOK COST|AMORTI[SZ]ED/.test(n)) return "book";
  if (/ACCRUED/.test(n)) return "accrued";
  if (/% OF TOTAL|% OF NAV|WEIGHT/.test(n)) return "weight";
  if (/UNREALI[SZ]ED/.test(n)) return "pnl";
  if (/NOMINAL|QUANTITY|FACE AMOUNT|HOLDING QTY/.test(n)) return "qty";
  if (/DEAL CCY|^CCY$|CURRENCY|PORT CURR$/.test(n) && !/BOOK|MKT|COST|VALUE|PRICE/.test(n)) return "ccy";
  if (/MKT VALUE|MARKET VALUE|TOTAL VALUE/.test(n)) return "mktOrTotal";
  if (/INVESTMENT|SECURITY NAME|DESCRIPTION|^SECURITY$|^NAME$/.test(n)) return "name";
  return null;
}

function findHeader(rows: unknown[][]): { index: number; col: Partial<Record<ColKey, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i] ?? [];
    const line = blob(row).toUpperCase();
    if (!/ISIN/.test(line)) continue;
    if (!/BOOK COST|MKT VALUE|MARKET VALUE|NOMINAL/.test(line)) continue;
    const col: Partial<Record<ColKey, number>> = {};
    row.forEach((c, idx) => {
      const field = headerField(String(c ?? ""));
      if (!field) return;
      if (field === "mktOrTotal") {
        if (col.mkt == null) col.mkt = idx;
        else if (col.total == null) col.total = idx;
        return;
      }
      if (col[field] == null) col[field] = idx;
    });
    if (col.isin != null || col.name != null) {
      if (col.name == null) col.name = 0;
      return { index: i, col };
    }
  }
  return null;
}

function couponLabel(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  if (!s.includes("%")) return undefined;
  return s;
}

function isDetailRow(row: unknown[]): boolean {
  if (findIsinInRow(row)) return false;
  if (TOTAL_RE.test(blob(row)) || JUNK_RE.test(blob(row))) return false;
  let dates = 0;
  let coupon = false;
  for (const c of row ?? []) {
    if (toIsoDate(c)) dates += 1;
    if (couponLabel(c)) coupon = true;
  }
  return dates >= 1 || coupon;
}

function attachDetail(holding: BociBondHolding, row: unknown[]) {
  const dates: string[] = [];
  let coupon: string | undefined;
  for (const c of row ?? []) {
    const iso = toIsoDate(c) || convertDateFormat(String(c ?? "").trim());
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !dates.includes(iso)) dates.push(iso);
    if (!coupon) coupon = couponLabel(c);
  }
  const named = parseNamedDayMonYear(holding.securityName);
  if (dates[0]) holding.valueDate = dates[0];
  holding.maturityDate = named || dates[dates.length - 1] || holding.maturityDate;
  if (coupon) holding.interestRate = coupon;
}

function firstLabel(row: unknown[]): string {
  for (const c of row ?? []) {
    if (c instanceof Date || typeof c === "number") continue;
    const s = String(c ?? "").trim();
    if (s.length > 2 && !/^[0-9.,$()\s%-]+$/.test(s) && !extractIsin(s)) return s;
  }
  return blob(row).trim();
}

function lastAmount(row: unknown[]): number {
  const nums = (row ?? []).map((c) => toNumber(c)).filter((n): n is number => n != null && Math.abs(n) >= 0.01);
  if (!nums.length) return 0;
  const last = nums[nums.length - 1]!;
  const maxAbs = nums.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  if (Math.abs(last) <= 100 && Math.abs(maxAbs) > 100) return maxAbs;
  return last;
}

function cashAmount(row: unknown[]): number {
  const nums = (row ?? [])
    .map((c) => toNumber(c))
    .filter((n): n is number => n != null && Math.abs(n) > 100);
  if (!nums.length) return 0;
  return nums.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
}

function isBareSectionLabel(name: string): boolean {
  return /^(time deposits?|fixed deposits?|term deposits?|placements?|reverse repos?|repos?|liquid ass?ets|bond|frnk)$/i.test(name.trim());
}

function looksLikeReportLine(line: string): boolean {
  return /REPORT DATE|REPORTING|REPORTED/i.test(line);
}

function buildNonIsinHolding(
  row: unknown[],
  next: unknown[],
  index: number,
  col: Partial<Record<ColKey, number>>,
  sheetName: string,
  fallbackCcy: string,
): { holding: BociBondHolding; consumedDetail: boolean } | null {
  const name = text(row, col.name) || firstLabel(row);
  if (!name || isBareSectionLabel(name)) return null;
  const bookCost = pickNum(row, col.book, [6, 5, 7]) || cashAmount(row) || lastAmount(row);
  if (bookCost <= 100) return null;
  const marketValue = pickNum(row, col.mkt, [12, 10, 8, 7]) || bookCost;
  const accruedInterest = pickNum(row, col.accrued, [14, 8]);
  const quantity = pickNum(row, col.qty, [2]) || bookCost;
  const holding: BociBondHolding = {
    id: uniqueHoldingId(sheetName, name.replace(/\s+/g, "").slice(0, 24) || "MM", index),
    securityName: name,
    isinCode: "",
    quantity,
    currency: rowCcy(row, col, fallbackCcy),
    avgUnitPrice: pickNum(row, col.avgPx, [4]),
    bookCost,
    marketPrice: pickNum(row, col.mktPx, [8]),
    marketValue,
    accruedInterest,
    totalValue: Number((marketValue + accruedInterest).toFixed(2)),
    weight: pickNum(row, col.weight, [16, 9]) || lastWeight(row),
    unrealizedPnL: Number((marketValue - bookCost).toFixed(2)),
    maturityDate: parseNamedDayMonYear(name) ?? undefined,
  };
  let consumedDetail = false;
  if (!findIsinInRow(next) && isDetailRow(next)) {
    attachDetail(holding, next);
    consumedDetail = true;
  }
  return { holding, consumedDetail };
}

function lastWeight(row: unknown[]): number {
  for (let i = (row ?? []).length - 1; i >= 0; i--) {
    const raw = String(row[i] ?? "").trim();
    const n = toNumber(row[i]);
    if (n == null) continue;
    if (raw.includes("%") && Math.abs(n) <= 100) return n;
    if (Math.abs(n) > 0 && Math.abs(n) <= 100 && n !== lastAmount(row)) return n;
  }
  return 0;
}

function detectFundName(rows: unknown[][]): string {
  for (const row of rows.slice(0, 12)) {
    const line = blob(row);
    if (/money market fund|mmf/i.test(line)) return line.replace(/\s+/g, " ").trim().slice(0, 120);
    if (/taiping/i.test(line)) return line.replace(/\s+/g, " ").trim().slice(0, 120);
  }
  return "BOCI-Prudential Valuation";
}

function detectCcy(rows: unknown[][], holdings: BociBondHolding[]): string {
  for (const row of rows.slice(0, 15)) {
    const m = blob(row).match(/base currency[:\s]*([A-Z]{3})/i);
    if (m) return m[1]!.toUpperCase();
  }
  return holdings[0]?.currency || "USD";
}

function detectAsOf(rows: unknown[][], fallback: string | null = null): string | null {
  for (const row of rows.slice(0, 15)) {
    const line = blob(row);
    if (/as of|as at|valuation date|report date|valuation/i.test(line)) {
      const iso = toIsoDate(line);
      if (iso) return iso;
      const dmy = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (dmy) {
        const converted = convertDateFormat(dmy[1]!);
        if (/^\d{4}-\d{2}-\d{2}$/.test(converted)) return converted;
      }
    }
    const iso = toIsoDate(line);
    if (iso) return iso;
  }
  return fallback;
}

function rowCcy(row: unknown[], col: Partial<Record<ColKey, number>>, fallback: string): string {
  const raw = (text(row, col.ccy) || String(row[3] ?? "")).toUpperCase();
  const m = raw.match(/USD|HKD|CNY|EUR/);
  return m ? m[0] : fallback;
}

function calculateDays(startDate: string, endDate?: string): number {
  if (!endDate) return 0;
  return Math.max(0, daysBetween(startDate, endDate));
}

export function isBociPrudentialSheet(rows: unknown[][], fileName = ""): boolean {
  const head = `${fileName}\n${rows
    .slice(0, 25)
    .map((r) => blob(r))
    .join("\n")}`.toUpperCase();
  if (!/ISIN/.test(head)) return false;
  if (/BOCI|PRUDENTIAL|VALUATION OF INVESTMENT|PORT CURR BOOK COST|TAIPING/.test(head)) return true;
  return /BOOK COST/.test(head) && /NOMINAL|MKT VALUE|MARKET VALUE/.test(head);
}

function scanSheet(rows: unknown[][], fileName = "", sheetName = "VALUATION"): BociParsedResult {
  const header = findHeader(rows);
  const col = header?.col ?? {};
  const holdings: BociBondHolding[] = [];
  const cashItems: BociCashItem[] = [];
  const accruals: BociAccrualItem[] = [];
  let nav = 0;
  let totalInvestmentsMktVal = 0;
  let totalBookCost = 0;
  let cashAndAccruals = 0;
  const seenIsin = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const fullRowStr = blob(row);
    if (!fullRowStr.trim()) continue;

    const hit = findIsinInRow(row);

    if (!hit && (JUNK_RE.test(fullRowStr) || TOTAL_RE.test(fullRowStr))) {
      if (TOTAL_RE.test(fullRowStr)) {
        const amt = lastAmount(row);
        const u = fullRowStr.toUpperCase();
        if (/TOTAL NET ASSET|NET ASSET VALUE|TOTAL NAV/.test(u) && !/SHADOW/.test(u) && !/%/.test(u)) nav = amt;
        else if (/TOTAL INVESTMENT|TOTAL VALUE OF INVESTMENT|TOTAL MKT/.test(u)) totalInvestmentsMktVal = amt;
        else if (/TOTAL BOOK/.test(u)) totalBookCost = amt;
        else if (/CASH AND ACCRUAL/.test(u)) cashAndAccruals = amt;
      }
      continue;
    }

    if (hit) {
      if (seenIsin.has(hit.isin)) continue;
      seenIsin.add(hit.isin);
      const name = text(row, col.name) || firstLabel(row) || "Unknown Security";
      const qtyCol = hit.col >= 0 ? hit.col + 1 : 2;
      const quantity = pickNum(row, col.qty, [qtyCol, 2]);
      const avgUnitPrice = pickNum(row, col.avgPx, [4, 5]);
      const bookCost = pickNum(row, col.book, [6, 5, 7]);
      const marketPrice = pickNum(row, col.mktPx, [8, 6]);
      const marketValue = pickNum(row, col.mkt, [12, 10, 8, 7]) || bookCost;
      const accruedInterest = pickNum(row, col.accrued, [14, 13, 8]);
      const weight = pickNum(row, col.weight, [16, 15, 9]) || lastWeight(row);
      const holding: BociBondHolding = {
        id: uniqueHoldingId(sheetName, hit.isin, i),
        securityName: name,
        isinCode: hit.isin,
        quantity,
        currency: rowCcy(row, col, "USD"),
        avgUnitPrice: avgUnitPrice || (quantity ? (bookCost / quantity) * 100 : 0),
        bookCost,
        marketPrice: marketPrice || (quantity ? (marketValue / quantity) * 100 : 0),
        marketValue,
        accruedInterest,
        totalValue: Number((marketValue + accruedInterest).toFixed(2)),
        weight,
        unrealizedPnL: pickNum(row, col.pnl, []) || Number((marketValue - bookCost).toFixed(2)),
        maturityDate: parseNamedDayMonYear(name) ?? undefined,
      };
      const next = rows[i + 1] ?? [];
      if (!findIsinInRow(next) && isDetailRow(next)) {
        attachDetail(holding, next);
        i += 1;
      }
      holdings.push(holding);
      continue;
    }

    if (CASH_RE.test(fullRowStr) && !TD_RE.test(fullRowStr) && !REPO_RE.test(fullRowStr)) {
      const amount = Math.abs(cashAmount(row) || lastAmount(row));
      if (amount > 100) {
        cashItems.push({
          accountName: firstLabel(row) || "USD CASH AC",
          currency: detectCcy(rows, holdings),
          amount,
          weight: lastWeight(row),
        });
      }
      continue;
    }

    if ((TD_RE.test(fullRowStr) || (REPO_RE.test(fullRowStr) && !looksLikeReportLine(fullRowStr))) && !ACCRUAL_RE.test(fullRowStr)) {
      const built = buildNonIsinHolding(row, rows[i + 1] ?? [], i, col, sheetName, detectCcy(rows, holdings));
      if (built) {
        holdings.push(built.holding);
        if (built.consumedDetail) i += 1;
      }
      continue;
    }

    if (ACCRUAL_RE.test(fullRowStr)) {
      const amt = lastAmount(row);
      if (amt) accruals.push({ itemName: firstLabel(row) || "Accrual", amount: amt, weight: lastWeight(row) });
    }
  }

  if (!nav && (totalInvestmentsMktVal || cashAndAccruals)) {
    nav = Number(
      (
        totalInvestmentsMktVal +
        (cashAndAccruals || cashItems.reduce((s, c) => s + c.amount, 0) + accruals.reduce((s, a) => s + a.amount, 0))
      ).toFixed(2),
    );
  }
  const cashDedup: BociCashItem[] = [];
  for (const it of cashItems) {
    if (cashDedup.some((x) => Math.abs(x.amount - it.amount) < 0.02)) continue;
    cashDedup.push(it);
  }
  if (!cashAndAccruals) {
    cashAndAccruals = Number((cashDedup.reduce((s, c) => s + c.amount, 0) + accruals.reduce((s, a) => s + a.amount, 0)).toFixed(2));
  }
  if (!totalBookCost) totalBookCost = Number(holdings.reduce((s, h) => s + h.bookCost, 0).toFixed(2));
  if (!totalInvestmentsMktVal) totalInvestmentsMktVal = Number(holdings.reduce((s, h) => s + h.marketValue, 0).toFixed(2));
  if (nav > 0) {
    for (const h of holdings) {
      if (!h.weight) h.weight = Number(((h.bookCost / nav) * 100).toFixed(4));
    }
  }

  return {
    fundName: detectFundName(rows),
    baseCurrency: detectCcy(rows, holdings),
    asOf: detectAsOf(rows, null),
    nav,
    totalInvestmentsMktVal,
    totalBookCost,
    cashAndAccruals,
    holdings,
    cashItems: cashDedup,
    accruals,
  };
}

export function parseBociPrudentialAoa(rows: unknown[][], fileName = "", sheetName = "VALUATION"): BociParsedResult {
  return scanSheet(rows, fileName, sheetName);
}

function classify(name: string): { assetClass: ParsedAssetClass; sfc: SfcAssetType; issuer: string; typeRaw: string; category: AssetCategory } {
  const u = name.toUpperCase();
  if (/\bREPO\b|REPURCHASE|逆回购|正回购/.test(u)) {
    return { assetClass: "REPO", sfc: "Reverse Repo", issuer: "", typeRaw: "Repo", category: "REPO" };
  }
  if (/TIME DEPOSIT|TERM DEPOSIT|FIXED DEPOSIT|定期存款|PLACEMENT/.test(u)) {
    return { assetClass: "DEPOSIT", sfc: "Cash / Bank Deposit", issuer: "", typeRaw: "Time Deposit", category: "TIME_DEPOSIT" };
  }
  if (/TREASURY BILL|TBILL|T-BILL|UNITED STATES OF AMERICA TR/.test(u)) {
    return { assetClass: "BOND", sfc: "Govt Bills", issuer: "UNITED STATES OF AMERICA", typeRaw: "Treasury Bill", category: "BOND" };
  }
  if (/EXCHANGE FUND BILL|HKMA/.test(u)) {
    return { assetClass: "BOND", sfc: "Govt Bills", issuer: "HKMA", typeRaw: "EFB", category: "BOND" };
  }
  if (/\bCP\b|COMMERCIAL PAPER/.test(u)) {
    return { assetClass: "CP", sfc: "Commercial Paper", issuer: "", typeRaw: "Commercial Paper", category: "BOND" };
  }
  if (/\bNCD\b|\bCD\b|CERTIFICATE OF DEPOSIT/.test(u)) {
    return { assetClass: "CD", sfc: "NCD", issuer: "", typeRaw: "NCD", category: "BOND" };
  }
  if (/SUMITOMO MITSU/.test(u)) {
    return { assetClass: "CD", sfc: "NCD", issuer: "SUMITOMO MITSUI TRUST BANK", typeRaw: "NCD", category: "BOND" };
  }
  if (/MORGAN STANLEY/.test(u)) {
    return { assetClass: "BOND", sfc: "NCD", issuer: "MORGAN STANLEY", typeRaw: "Corporate Bond", category: "BOND" };
  }
  if (/BANK OF CHINA/.test(u)) {
    return { assetClass: "CD", sfc: "NCD", issuer: "BANK OF CHINA", typeRaw: "NCD", category: "BOND" };
  }
  return { assetClass: "BOND", sfc: "NCD", issuer: "", typeRaw: "Bond/Note", category: "BOND" };
}

function couponPct(label?: string): number {
  if (!label) return 0;
  return toNumber(label) ?? 0;
}

export function parseBociPrudentialFullAssets(
  sheet: XLSX.WorkSheet,
  defaultValDate = "2026-09-16",
): { positions: UnifiedHoldingPosition[]; valuationDate: string; result: BociParsedResult } {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  const result = scanSheet(rows);
  const valuationDate = result.asOf || detectAsOf(rows, defaultValDate) || defaultValDate;
  const den = result.nav > 0 ? result.nav : 1;
  const positions: UnifiedHoldingPosition[] = [
    ...result.holdings.map((h) => {
      const typed = classify(h.securityName);
      const marketValue = h.totalValue || Number((h.marketValue + (h.accruedInterest || 0)).toFixed(2));
      const mat = toIsoDate(h.maturityDate ?? "") ?? h.maturityDate ?? "";
      return {
        id: h.id,
        assetCategory: typed.category,
        assetCode: h.isinCode || h.id,
        assetName: h.securityName,
        currency: h.currency || result.baseCurrency,
        nominalAmount: h.quantity,
        bookCost: h.bookCost,
        marketValue,
        navRatio: h.weight || Number(((h.bookCost / den) * 100).toFixed(4)),
        valueDate: toIsoDate(h.valueDate ?? "") ?? undefined,
        maturityDate: mat || undefined,
        couponRate: couponPct(h.interestRate),
        daysToMaturity: calculateDays(valuationDate, mat),
      };
    }),
    ...result.cashItems.map((c, i) => ({
      id: `CASH_${c.currency}_${i}`,
      assetCategory: "CASH" as const,
      assetCode: `CASH-${c.currency}`,
      assetName: c.accountName,
      currency: c.currency,
      nominalAmount: c.amount,
      bookCost: c.amount,
      marketValue: c.amount,
      navRatio: c.weight || Number(((c.amount / den) * 100).toFixed(4)),
      valueDate: valuationDate,
      maturityDate: valuationDate,
      daysToMaturity: 0,
    })),
  ];
  return { positions, valuationDate, result };
}

export function bociResultToValuationReport(result: BociParsedResult, fileName: string, rawRowCount = 0): ParsedValuationReport {
  const cash = result.cashItems.reduce((s, c) => s + c.amount, 0);
  const holdings: ParsedValuationHolding[] = result.holdings.map((h, i) => {
    const typed = classify(h.securityName);
    return {
      rowNumber: i + 1,
      securityId: h.id,
      isin: h.isinCode,
      name: h.securityName,
      assetTypeRaw: typed.typeRaw,
      assetClass: typed.assetClass,
      sfcAssetType: typed.sfc,
      parValue: h.quantity,
      amortizedCost: h.bookCost,
      accruedInterest: h.accruedInterest,
      marketValue: h.totalValue || Number((h.marketValue + (h.accruedInterest || 0)).toFixed(2)),
      currency: h.currency || result.baseCurrency,
      issuer: typed.issuer,
      maturityDate: toIsoDate(h.maturityDate ?? "") ?? "",
      couponRatePct: couponPct(h.interestRate),
      issueDate: toIsoDate(h.valueDate ?? "") ?? result.asOf ?? "",
      unrealizedPnL: h.unrealizedPnL,
    };
  });
  return {
    custodian: "BOCI",
    template: "BOCI_PRUDENTIAL",
    fileName,
    asOf: result.asOf,
    holdings,
    cashBalance: result.cashItems.length ? cash : result.cashAndAccruals || null,
    cashLabel: result.cashItems[0]?.accountName || "CASH AT BANK",
    nav: result.nav || null,
    units: null,
    columnMap: {
      name: "Security Description",
      isin: "ISIN Code",
      parValue: "Nominal Quantity",
      amortizedCost: "Port Curr Book Cost",
      marketValue: "Port Curr Mkt Value",
      accrued: "Accrued Interest",
    },
    warnings: [
      `BOCI-Prudential ${result.fundName}：ISIN 穿透 ${holdings.length} 笔，现金 ${result.cashItems.length} 笔，往来 ${result.accruals.length} 笔。`,
    ],
    rawRowCount,
  };
}

export function parseBociPrudentialValuation(rows: unknown[][]) {
  const result = parseBociPrudentialAoa(rows);
  return {
    holdings: result.holdings,
    cashAccounts: result.cashItems,
    nav: result.nav,
    fundName: result.fundName,
  };
}

export function parseBociPrudentialWorkbook(buffer: ArrayBuffer, fileName: string): BociParsedResult | null {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    if (!isBociPrudentialSheet(rows, fileName)) continue;
    return parseBociPrudentialAoa(rows, fileName, sheetName);
  }
  return null;
}
