import { addDays } from "@/lib/holdings/dates";
import { toIsoDate, toNumber } from "@/lib/holdings/dates";
import * as XLSX from "xlsx";
import type { TaFlow, TaType } from "@/lib/services/types";

function norm(s: string): string {
  return s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function col(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const [k, v] of Object.entries(row)) {
    const n = norm(k);
    if (aliases.some((a) => n === a || n.includes(a))) return v;
  }
  return undefined;
}

function taType(raw: unknown): TaType | null {
  const s = String(raw ?? "").toUpperCase();
  if (s.includes("SUB") || s.includes("申购") || s === "S") return "SUB";
  if (s.includes("RED") || s.includes("赎回") || s === "R") return "RED";
  return null;
}

export function parseTaWorkbook(buffer: ArrayBuffer): TaFlow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return rows
    .map((row, i) => {
      const type = taType(col(row, ["type", "tran type", "transaction", "业务类型", "申赎"]));
      const amount = Math.abs(toNumber(col(row, ["amount", "gross amount", "金额", "净额"])) ?? 0);
      const tradeDate = toIsoDate(col(row, ["trade date", "dealing date", "交易日", "申请日"])) ?? "";
      const settlementDate =
        toIsoDate(col(row, ["settlement date", "value date", "交收日", "结算日"])) ?? tradeDate;
      const investor = String(col(row, ["investor code", "investor", "投资人", "account"]) ?? `INV-${i + 1}`);
      if (!type || amount <= 0) return null;
      return {
        id: `TA-${tradeDate}-${i + 1}`,
        investorCode: investor,
        type,
        amount,
        tradeDate,
        settlementDate,
        confirmed: !/pend|unconf|草稿/i.test(String(col(row, ["status", "状态"]) ?? "Confirmed")),
      } satisfies TaFlow;
    })
    .filter((x): x is TaFlow => x != null);
}

export function taSettleBuckets(flows: TaFlow[], asOf: string) {
  const t0 = asOf;
  const t1 = addDays(asOf, 1);
  const confirmed = flows.filter((f) => f.confirmed);
  const sum = (date: string, type: TaType) =>
    confirmed.filter((f) => f.settlementDate === date && f.type === type).reduce((s, f) => s + f.amount, 0);
  return {
    t0Sub: sum(t0, "SUB"),
    t0Red: sum(t0, "RED"),
    t1Sub: sum(t1, "SUB"),
    t1Red: sum(t1, "RED"),
    confirmed,
  };
}

export function downloadTaTemplate(asOf: string, fundCode: string) {
  const t1 = addDays(asOf, 1);
  const ws = XLSX.utils.json_to_sheet([
    { "Investor Code": "INV-1001", Type: "SUB", Amount: 2_500_000, "Trade Date": asOf, "Settlement Date": asOf, Status: "Confirmed" },
    { "Investor Code": "INV-2044", Type: "RED", Amount: 800_000, "Trade Date": asOf, "Settlement Date": asOf, Status: "Confirmed" },
    { "Investor Code": "INV-3302", Type: "SUB", Amount: 1_200_000, "Trade Date": asOf, "Settlement Date": t1, Status: "Confirmed" },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TA");
  XLSX.writeFile(wb, `${fundCode}_TA_${asOf}.xlsx`);
}
