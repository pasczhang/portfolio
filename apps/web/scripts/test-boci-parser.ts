import * as XLSX from "xlsx";
import { USD_SAMPLE_BOOK } from "../lib/holdings/samples";
import { PRODUCT_AS_OF } from "../constants/calendar";
import { remainingDays, toIsoDate } from "../lib/holdings/dates";
import { toHoldingRows } from "../lib/holdings/derive";
import { buildBociUsdMmfAoa, parseBociUsdMmf, isBociUsdMmfTemplate } from "../lib/utils/valuationExcelParser";
import { adoptCustodianAsBook, parseValuationWorkbook } from "../lib/services/parsers/valuationParser";
import { reconcileValuation } from "../lib/services/reconciliation/reconciliationEngine";
import { scorePair } from "../lib/services/reconciliation/matching";

const aoa = buildBociUsdMmfAoa(USD_SAMPLE_BOOK, PRODUCT_AS_OF, "BAM-USD-MMF");
if (!isBociUsdMmfTemplate(aoa, "BOCI_Prudential.xlsx")) {
  console.error("template not detected");
  process.exit(1);
}
const parsed = parseBociUsdMmf(aoa, "BOCI_Prudential.xlsx");
const tbill4w = parsed.holdings.find((h) => h.isin === "US912797RK29");
if (tbill4w?.maturityDate !== "2026-10-14" || tbill4w.issueDate !== "2026-09-16") {
  console.error("dual-row dates failed", tbill4w);
  process.exit(1);
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "VALUATION");
const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
const fromFile = parseValuationWorkbook(buf, "VALUATION OF INVESTMENT BOC INTERNATIONAL.xlsx");
const recon = reconcileValuation(USD_SAMPLE_BOOK, fromFile, PRODUCT_AS_OF);
const sample = parsed.holdings[0];
console.log(
  JSON.stringify(
    {
      template: fromFile.template,
      holdings: fromFile.holdings.length,
      cash: fromFile.cashBalance,
      nav: fromFile.nav,
      sample,
      status: recon.status,
      matchRatePct: recon.matchRatePct,
      breaks: recon.breaks.map((b) => ({ dim: b.dimension, key: b.key, diff: b.diff, sev: b.severity })),
    },
    null,
    2,
  ),
);
const ust = USD_SAMPLE_BOOK.find((p) => p.securityId.startsWith("UST-4W"))!;
const fuzzy = scorePair(ust, {
  rowNumber: 2,
  securityId: "TBILL-4W",
  isin: "",
  name: "UNITED STATES TREASURY BILL",
  assetTypeRaw: "T-BILL",
  assetClass: "BOND",
  sfcAssetType: "Govt Bills",
  parValue: ust.parValue,
  amortizedCost: ust.amortizedCost,
  accruedInterest: 0,
  marketValue: ust.shadowMtm,
  currency: "USD",
  issuer: "US TREASURY",
  maturityDate: ust.maturityDate,
  couponRatePct: ust.couponRatePct,
  issueDate: ust.issueDate,
  unrealizedPnL: 0,
});
const adopted = adoptCustodianAsBook(USD_SAMPLE_BOOK, "demo", fromFile, PRODUCT_AS_OF, "USD");
const reconAdopt = reconcileValuation(adopted, { ...fromFile, bookSynced: true }, PRODUCT_AS_OF);
console.log(
  JSON.stringify(
    {
      fuzzyMethod: fuzzy.method,
      fuzzyScore: fuzzy.score,
      adoptedLines: adopted.length,
      adoptedSecs: adopted.filter((p) => p.assetType !== "Cash / Bank Deposit").length,
      adoptStatus: reconAdopt.status,
      adoptMatchRatePct: reconAdopt.matchRatePct,
      adoptBreaks: reconAdopt.breaks,
    },
    null,
    2,
  ),
);
if (fuzzy.method === "NONE" || fuzzy.score < 52) process.exit(1);
if (recon.matchRatePct < 100 || recon.status === "BREAK") process.exit(1);
if (reconAdopt.status !== "MATCHED" || reconAdopt.matchRatePct < 100 || reconAdopt.breaks.length) process.exit(1);

function messyFifteenAoa(): unknown[][] {
  return [
    ["BOC INTERNATIONAL (PRUDENTIAL)"],
    ["VALUATION OF INVESTMENT", "BAM-USD-MMF", "As of 16/09/2026"],
    [],
    ["INVESTMENT", "ISIN CODE", "NOMINAL", "PORT CURR", "", "", "PORT CURR BOOK COST", "", "", "PORT CURR MKT VALUE"],
    ["UNITED STATES TREASURY BILL 31MAR2026", "US912797RK29", 42_000_000, "USD", "", "", 41_842_600, "", "", 41_851_200],
    ["Interest on unsettled trades", "POS-99", 5_000_000, "USD", "", "", 5_000_000],
    ["Unrealized Gain / Loss", "", 1_200_000, "USD", "", "", 1_200_000],
    ["CHINA CONSTRUCTION BANK NCD 09APR2026", "XS2811048821", 18_200_000, "USD", "", "", 18_164_800, "", "", 18_159_200],
    ["SUMITOMO MITSU TRUST 15OCT2026", "XS2819984410", 16_000_000, "USD", "", "", 15_962_400, "", "", 15_955_800],
    ["PETROLIAM NASIONAL NOTE 28MAY2026", "USY6883YAA11", 3_500_000, "USD", "", "", 3_490_000, "", "", 3_488_000],
    ["MORGAN STANLEY CP 30OCT2026", "US46625HJPM8", 6_200_000, "USD", "", "", 6_178_600, "", "", 6_176_900],
    ["CASH AT BANK / Custodian Demand Deposit", 2_250_000],
    ["TOTAL NET ASSETS", 87_888_400],
    ["GRAND TOTAL", 87_888_400],
  ];
}

const messy = parseBociUsdMmf(messyFifteenAoa(), "BOCI_15_names.xlsx");
const messySecs = messy.holdings.filter((h) => h.assetClass !== "CASH");
const tbillRow = messySecs.find((h) => /TREASURY/.test(h.name));
const junkKept = messy.holdings.some((h) => /unsettled|unrealized|provision for|accrued expense|management fee|custody fee/i.test(h.name) || /^POS-/i.test(h.securityId));
if (junkKept) {
  console.error("junk rows were kept");
  process.exit(1);
}
if (tbillRow?.maturityDate !== "2026-03-31" || tbillRow.issuer !== "UNITED STATES OF AMERICA") {
  console.error("treasury date/issuer failed", tbillRow);
  process.exit(1);
}
if (messy.nav !== 87_888_400) {
  console.error("NAV footer failed", messy.nav);
  process.exit(1);
}
if (messySecs.length < 5) {
  console.error(`expected >=5 real ISINs, got ${messySecs.length}`);
  process.exit(1);
}
const expectIssuer = [
  [/CHINA CONSTRUCTION BANK/, "CHINA CONSTRUCTION BANK", "2026-04-09", "NCD"],
  [/SUMITOMO MITSU/, "SUMITOMO MITSUI TRUST BANK", "2026-10-15", "NCD"],
  [/PETROLIAM NASIONAL/, "PETROLIAM NASIONAL BHD", "2026-05-28", "Corporate Bond"],
  [/MORGAN STANLEY/, "MORGAN STANLEY", "2026-10-30", "Corporate Bond"],
] as const;
for (const [re, issuer, maturity, typeRaw] of expectIssuer) {
  const row = messySecs.find((h) => re.test(h.name));
  if (row?.issuer !== issuer || row.maturityDate !== maturity || row.assetTypeRaw !== typeRaw) {
    console.error("issuer/type/date failed", re, row);
    process.exit(1);
  }
}
const serialIso = toIsoDate(46081);
if (serialIso && serialIso.slice(0, 4) === "1966") {
  console.error("excel serial misparsed as 1966", serialIso);
  process.exit(1);
}
if (remainingDays("2026-09-16", "2026-10-15") !== 29) {
  console.error("remaining days failed", remainingDays("2026-09-16", "2026-10-15"));
  process.exit(1);
}
const book = adoptCustodianAsBook([], "import", messy, messy.asOf ?? "2026-09-16", "USD");
const navRows = toHoldingRows(book, messy.asOf ?? "2026-09-16", messy.nav);
const navSum = navRows.reduce((s, r) => s + Number(r.nav_weight_pct ?? 0), 0);
if (Math.abs(navSum - 100) > 0.2) {
  console.error("% of NAV sum failed", navSum, messy.nav, navRows);
  process.exit(1);
}
