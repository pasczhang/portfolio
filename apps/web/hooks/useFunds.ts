"use client";

import { FUND_LIST, type FundProfile } from "@/constants/funds";

/** Catalog is the frontend SSOT (`constants/funds.ts`), not the /funds API demo payload. */
export function useFunds(): { funds: FundProfile[]; error: string | null } {
  return { funds: FUND_LIST, error: null };
}
