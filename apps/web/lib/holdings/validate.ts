import type { BookCcy, ImportPreview, ParsedHoldingRow } from "@/lib/holdings/types";
import { finalizeValidRows } from "@/lib/holdings/parseWorkbook";

export function buildImportPreview(rows: ParsedHoldingRow[], fundCcy: BookCcy): ImportPreview {
  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  const warningCount = rows.reduce((n, r) => n + r.warnings.length, 0);
  const currencyMismatches = rows.filter((r) => r.warnings.some((w) => w.includes("币种"))).length;
  return {
    rows,
    valid: finalizeValidRows(rows, fundCcy),
    errorCount,
    warningCount,
    currencyMismatches,
  };
}
