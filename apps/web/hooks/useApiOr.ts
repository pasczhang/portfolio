"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGetOr } from "@/lib/api";

export function useApiOr<T>(path: string, fallback: T, reloadKey = 0) {
  const [data, setData] = useState<T>(fallback);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void apiGetOr<T>(path, fallback).then((res) => {
      setData(res.data);
      setSource(res.source);
      setLoading(false);
    });
  }, [path, fallback, reloadKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, source, loading, reload: load };
}
