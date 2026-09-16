import * as XLSX from "xlsx";
import type { BookCcy } from "@/lib/holdings/types";
import { templateRowsFor } from "@/lib/holdings/samples";

export function downloadHoldingsTemplate(ccy: BookCcy, fundCode: string) {
  const aoa = templateRowsFor(ccy);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = aoa[0].map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Holdings");
  const note = XLSX.utils.aoa_to_sheet([
    ["assetType 允许值"],
    ["Cash / Bank Deposit"],
    ["Govt Bills"],
    ["NCD"],
    ["Commercial Paper"],
    ["Reverse Repo"],
    ["日期格式 YYYY-MM-DD；maturityDate 必须晚于 issueDate"],
  ]);
  XLSX.utils.book_append_sheet(wb, note, "Guide");
  XLSX.writeFile(wb, `${fundCode}_holdings_template.xlsx`);
}
