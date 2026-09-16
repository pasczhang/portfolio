"use client";

import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";

export function useHoldings() {
  const { fund } = useDesk();
  const { holdings, asOf, aum, source } = useBook();
  return {
    data: {
      as_of: asOf,
      fund_code: fund.code,
      aum_securities: aum,
      row_count: holdings.length,
      holdings,
    },
    holdings,
    source,
    loading: false,
    reload: () => undefined,
  };
}
