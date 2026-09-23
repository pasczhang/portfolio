/** Stable, globally unique row ids for parsed holdings and AG Grid. */

export function uniqueHoldingId(sheetName: string | undefined, baseId: string, index: number): string {
  const sheet = (sheetName || "POS").replace(/[^\w.-]+/g, "_") || "POS";
  const base = (baseId || `item-${index}`).replace(/\s+/g, "") || `item-${index}`;
  return `${sheet}_${base}_${index}`;
}

export function uniquifySecurityIds<T extends { securityId: string }>(rows: T[], sheetName?: string): T[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const base = row.securityId || `item-${index}`;
    let id = base.includes("_") && /_\d+$/.test(base) ? base : uniqueHoldingId(sheetName, base, index);
    while (seen.has(id)) id = `${id}x${index}`;
    seen.add(id);
    return { ...row, securityId: id } as T;
  });
}
