"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export function useLivePositions(fundId: string | null) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fundId) return;
    apiGet<Record<string, unknown>>(`/positions/live/${fundId}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [fundId]);

  return { data, error };
}
