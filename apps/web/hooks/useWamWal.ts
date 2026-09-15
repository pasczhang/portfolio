"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { WamWalResult } from "@/types/pms";

export function useWamWal(fundId: string | null, asOf: string | null) {
  const [data, setData] = useState<WamWalResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fundId || !asOf) return;
    apiGet<WamWalResult>(`/analytics/wam-wal?fund_id=${fundId}&as_of=${asOf}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [fundId, asOf]);

  return { data, error };
}
