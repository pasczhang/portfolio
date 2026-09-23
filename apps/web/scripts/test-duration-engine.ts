import { PRODUCT_AS_OF } from "../constants/calendar";
import { USD_SAMPLE_BOOK } from "../lib/holdings/samples";
import { wamTenorDays, walTenorDays, computeWamWal } from "../lib/engine/durationCalculator";
import { assetCategoryOf, computePortfolioDuration, toUnifiedHoldings } from "../lib/holdings/unified";
import { parseBociPrudentialAoa, bociResultToValuationReport } from "../lib/holdings/bociPrudentialParser";
import { adoptCustodianAsBook } from "../lib/services/parsers/valuationParser";

const asOf = PRODUCT_AS_OF;
const cash = USD_SAMPLE_BOOK.find((p) => p.securityId === "CASH-USD-CUSTODY")!;
const td = USD_SAMPLE_BOOK.find((p) => p.securityId === "CITI-USD-ON-TD")!;
const repo = USD_SAMPLE_BOOK.find((p) => p.securityId === "FED-ON-RRP")!;
const bond = USD_SAMPLE_BOOK.find((p) => p.securityId === "UST-4W-20261014")!;

if (assetCategoryOf(cash) !== "CASH") throw new Error("cash category");
if (assetCategoryOf(td) !== "TIME_DEPOSIT") throw new Error("td category");
if (assetCategoryOf(repo) !== "REPO") throw new Error("repo category");
if (assetCategoryOf(bond) !== "BOND") throw new Error("bond category");

if (wamTenorDays(cash, asOf) !== 0 || walTenorDays(cash, asOf) !== 0) {
  throw new Error(`cash tenor must be 0d, got WAM ${wamTenorDays(cash, asOf)}`);
}
if (wamTenorDays(td, asOf) < 1) throw new Error("overnight TD WAM");
if (wamTenorDays(repo, asOf) < 1) throw new Error("repo WAM");
if (wamTenorDays(bond, asOf) < 20) throw new Error("t-bill WAM");

const unified = toUnifiedHoldings(USD_SAMPLE_BOOK, asOf);
const cats = new Set(unified.map((r) => r.assetCategory));
for (const need of ["CASH", "TIME_DEPOSIT", "REPO", "BOND"] as const) {
  if (!cats.has(need)) throw new Error(`missing ${need} in unified book`);
}

const m = computePortfolioDuration(USD_SAMPLE_BOOK, asOf);
const d = computeWamWal(USD_SAMPLE_BOOK, asOf);
if (m.wamDays !== d.wamDays || m.walDays !== d.walDays) throw new Error("engine mismatch");
if (m.cashRatio <= 0 || m.depositRatio <= 0 || m.repoRatio <= 0 || m.bondRatio <= 0) {
  throw new Error(`ratios ${JSON.stringify(m)}`);
}
if (m.wamDays <= 0) throw new Error("WAM collapsed");

const aoa: unknown[][] = [
  ["VALUATION OF INVESTMENT", "TAIPING USD MMF", "", "As of 16SEP2026"],
  ["Security Description", "ISIN Code", "Nominal", "CCY", "Avg Unit", "x", "Book Cost", "x", "Mkt Price", "x", "x", "x", "Mkt Value", "x", "Accrued", "x", "% of NAV"],
  ["TIME DEPOSITS"],
  ["Citibank USD Time Deposit 17SEP2026", "", 5_000_000, "USD", 100, "", 5_000_000, "", 100, "", "", "", 5_000_000, "", 0, "", 2],
  ["17SEP2026", "", "16SEP2026", "4.72%", "17SEP2026"],
  ["REVERSE REPO"],
  ["Overnight Federal Reserve Reverse Repo", "", 3_000_000, "USD", 100, "", 3_000_000, "", 100, "", "", "", 3_000_000, "", 0, "", 1.2],
  ["16SEP2026", "", "16SEP2026", "5.30%", "17SEP2026"],
  ["LIQUID ASSETS"],
  ["USD CASH AC", "", "", "USD", "", "", 1_200_000, "", "", "", "", "", 1_200_000, "", "", "", 0.5],
];
const parsed = parseBociPrudentialAoa(aoa, "test.xlsx");
const names = parsed.holdings.map((h) => h.securityName).join(" | ");
if (!/Time Deposit/i.test(names) || !/Reverse Repo/i.test(names)) {
  throw new Error(`parser missed TD/repo: ${names} cash=${parsed.cashItems.length}`);
}
if (!parsed.cashItems.length) throw new Error("parser missed cash");
const report = bociResultToValuationReport(parsed, "test.xlsx");
const book = adoptCustodianAsBook([], "import", report, asOf, "USD");
const dur = computePortfolioDuration(book, asOf);
if (dur.depositRatio <= 0 || dur.repoRatio <= 0 || dur.cashRatio <= 0) {
  throw new Error(`adopted ratios ${JSON.stringify(dur)} ids=${book.map((p) => p.securityId)}`);
}

console.log(
  JSON.stringify(
    {
      wamDays: m.wamDays,
      walDays: m.walDays,
      cashRatio: m.cashRatio,
      bondRatio: m.bondRatio,
      depositRatio: m.depositRatio,
      repoRatio: m.repoRatio,
      cashTenor: 0,
      parserHoldings: parsed.holdings.length,
      parserCash: parsed.cashItems.length,
      adopted: book.map((p) => ({ id: p.securityId, type: p.assetType, cat: assetCategoryOf(p) })),
    },
    null,
    2,
  ),
);
console.log("DURATION_OK");
