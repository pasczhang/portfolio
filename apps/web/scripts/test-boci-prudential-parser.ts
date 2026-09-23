import { parseBociPrudentialAoa, bociResultToValuationReport } from "../lib/holdings/bociPrudentialParser";

function taipingFixture(): unknown[][] {
  return [
    ["BOCI-Prudential Trustee Limited"],
    ["Taiping USD Money Market Fund"],
    ["VALUATION OF INVESTMENT", "Base Currency: USD", "As of 16/09/2026"],
    [],
    [
      "Security Description",
      "ISIN Code",
      "Nominal Quantity",
      "Deal CCY",
      "Avg Unit Price",
      "Port Curr Book Cost",
      "Market Price",
      "Port Curr Mkt Value",
      "Accrued Interest",
      "% Of Total",
      "Unrealized P/L",
    ],
    [
      "UNITED STATES OF AMERICA TREASURY BILL",
      "US912797TB33",
      2_600_000,
      "USD",
      99.950375,
      2_598_709.75,
      99.939815,
      2_598_435.19,
      21_140,
      8.66,
      -274.56,
    ],
    ["", "", "15/01/2026", "0.0000%", "15/04/2026"],
    [
      "BANK OF CHINA/HONG KONG",
      "HK0001151247",
      3_000_000,
      "USD",
      99.8,
      2_994_000,
      99.79,
      2_993_700,
      24_018.17,
      10.0,
      -300,
    ],
    ["", "", "01/06/2026", "3.0000%", "01/12/2026"],
    ["CASH AT BANK / Current Account", "USD", 16_900_000, 56.34],
    ["Management Fee Payable", -44_187.97, -0.15],
    ["TOTAL INVESTMENTS (MKT)", 13_043_401.57],
    ["TOTAL BOOK COST", 13_046_465.41],
    ["CASH AND ACCRUALS", 16_955_812.03],
    ["TOTAL NET ASSETS", 29_999_213.6],
  ];
}

const parsed = parseBociPrudentialAoa(taipingFixture(), "Taiping_USD_MMF.xlsx");
const ust = parsed.holdings.find((h) => h.isinCode === "US912797TB33");
const boc = parsed.holdings.find((h) => h.isinCode === "HK0001151247");

if (parsed.fundName !== "Taiping USD Money Market Fund") {
  console.error("fund name", parsed.fundName);
  process.exit(1);
}
if (parsed.baseCurrency !== "USD" || parsed.nav !== 29_999_213.6) {
  console.error("nav/ccy", parsed);
  process.exit(1);
}
if (!ust || ust.bookCost !== 2_598_709.75 || ust.avgUnitPrice !== 99.950375 || ust.accruedInterest !== 21_140) {
  console.error("UST fields", ust);
  process.exit(1);
}
if (ust.valueDate !== "2026-01-15" || ust.maturityDate !== "2026-04-15" || ust.interestRate !== "0.0000%") {
  console.error("UST dates", ust);
  process.exit(1);
}
if (Math.abs(ust.totalValue - (ust.marketValue + ust.accruedInterest)) > 0.02) {
  console.error("total value", ust.totalValue);
  process.exit(1);
}
if (!boc || boc.securityName !== "BANK OF CHINA/HONG KONG" || boc.interestRate !== "3.0000%") {
  console.error("BOC", boc);
  process.exit(1);
}
if (parsed.cashItems.length < 1 || parsed.accruals.length < 1) {
  console.error("cash/accruals", parsed.cashItems, parsed.accruals);
  process.exit(1);
}
if (Math.abs(parsed.totalInvestmentsMktVal - 13_043_401.57) > 0.02 || Math.abs(parsed.totalBookCost - 13_046_465.41) > 0.02) {
  console.error("totals", parsed.totalInvestmentsMktVal, parsed.totalBookCost);
  process.exit(1);
}

const report = bociResultToValuationReport(parsed, "Taiping_USD_MMF.xlsx");
if (report.template !== "BOCI_PRUDENTIAL" || report.holdings.length !== 2) {
  console.error("report", report);
  process.exit(1);
}
if (report.holdings[0]?.maturityDate !== "2026-04-15" || report.holdings[0]?.issueDate !== "2026-01-15") {
  console.error("iso dates", report.holdings[0]);
  process.exit(1);
}
if (new Set(report.holdings.map((h) => h.securityId)).size !== report.holdings.length) {
  console.error("duplicate ids", report.holdings.map((h) => h.securityId));
  process.exit(1);
}

function zhongyinFixture(): unknown[][] {
  return [
    ["BOCI-Prudential"],
    ["Taiping USD Money Market Fund"],
    ["VALUATION OF INVESTMENT", "Base Currency: USD", "As of 16/09/2026"],
    ["Security Description", "ISIN Code", "Nominal Quantity", "Deal CCY", "Avg Unit Price", "", "Port Curr Book Cost", "", "Market Price", "", "Port Curr Mkt Value", "", "", "Accrued Interest", "", "% Of Total"],
    ["Bond"],
    ["UNITED STATES OF AMERICA TR 31MAR2026", "US912797TB33", 2_600_000, "USD", 99.95, "", 2_598_709.75, "", 99.94, "", 2_598_435.19, "", "", 0, "", 8.66],
    ["", "", "01/01/2026", "0.0000%", "31/03/2026"],
    ["UNITED STATES OF AMERICA TR 09APR2026", "US912797SL24", 2_600_000, "USD", 99.9, "", 2_597_400, "", 99.88, "", 2_596_880, "", "", 0, "", 8.66],
    ["", "", "09/01/2026", "0.0000%", "09/04/2026"],
    ["SUBTOTAL"],
    ["FRNK"],
    ["SUMITOMO MITSUI TRUST BANK", "USJ7771YLJ49", 200_000, "USD", 99.5, "", 199_000, "", 99.4, "", 198_800, "", "", 500, "", 0.66],
    ["", "", "16/03/2026", "1.3500%", "16/09/2026"],
    ["BANK OF CHINA/HONG KONG 3%", "HK0001151247", 840_000, "USD", 100, "", 840_000, "", 100, "", 840_000, "", "", 4_000, "", 2.8],
    ["", "", "28/05/2025", "3.0000%", "28/05/2026"],
    ["MORGAN STANLEY BANK NA 5.88%", "US61690U7W40", 1_000_000, "USD", 100, "", 1_000_000, "", 100.1, "", 1_001_000, "", "", 12_000, "", 3.3],
    ["", "", "30/10/2025", "5.8820%", "30/10/2026"],
    ["SUBTOTAL"],
    ["Liquid Assests"],
    ["USD CASH AC", "", "", "USD", "", "", 16_900_000],
    ["TOTAL NET ASSETS", 29_999_213.6],
  ];
}

const zy = parseBociPrudentialAoa(zhongyinFixture(), "zhongyin.xlsx");
const want = [
  ["US912797TB33", 2_600_000, 0, "2026-03-31"],
  ["US912797SL24", 2_600_000, 0, "2026-04-09"],
  ["USJ7771YLJ49", 200_000, 1.35, "2026-09-16"],
  ["HK0001151247", 840_000, 3, "2026-05-28"],
  ["US61690U7W40", 1_000_000, 5.882, "2026-10-30"],
] as const;
if (zy.holdings.length !== 5) {
  console.error("zhongyin expected 5 bonds", zy.holdings.map((h) => h.isinCode));
  process.exit(1);
}
if (zy.cashItems.some((c) => /CASH/i.test(c.accountName)) === false) {
  console.error("zhongyin cash missing", zy.cashItems);
  process.exit(1);
}
const mapped = bociResultToValuationReport(zy, "zhongyin.xlsx");
if (mapped.holdings.some((h) => /cash/i.test(h.name))) {
  console.error("cash mixed into securities", mapped.holdings);
  process.exit(1);
}

const noSection = zhongyinFixture().filter((row) => {
  const line = (row ?? []).map((c) => String(c ?? "")).join(" ");
  return !/^\s*(Bond|FRNK|SUBTOTAL|Liquid Assests)\s*$/i.test(line.trim());
});
const zyFlat = parseBociPrudentialAoa(noSection, "zhongyin-flat.xlsx");
if (zyFlat.holdings.length !== 5) {
  console.error("flat ISIN scan expected 5", zyFlat.holdings.map((h) => h.isinCode));
  process.exit(1);
}
for (const [isin, qty, cpn, mat] of want) {
  const h = mapped.holdings.find((x) => x.isin === isin);
  if (!h || h.parValue !== qty || Math.abs(h.couponRatePct - cpn) > 0.001 || h.maturityDate !== mat) {
    console.error("zhongyin row failed", isin, h);
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    {
      fundName: parsed.fundName,
      nav: parsed.nav,
      holdings: parsed.holdings.length,
      cash: parsed.cashItems[0]?.amount,
      accruals: parsed.accruals[0]?.itemName,
      ust,
    },
    null,
    2,
  ),
);
