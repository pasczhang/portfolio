"use client";

import { useApiOr } from "@/hooks/useApiOr";
import { MOCK_HOLDINGS } from "@/lib/mocks";
import type { HoldingRow } from "@/components/grid/HoldingsGrid";

type HoldingsResponse = {
  as_of: string;
  fund_code: string;
  aum_securities: number | string;
  row_count: number;
  holdings: HoldingRow[];
};

export function useHoldings() {
  const { data, source, loading, reload } = useApiOr<HoldingsResponse>("/portfolio/holdings", MOCK_HOLDINGS);
  return { data, holdings: data.holdings ?? [], source, loading, reload };
}
