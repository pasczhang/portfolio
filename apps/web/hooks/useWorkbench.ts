"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGetOr, apiPost } from "@/lib/api";
import { MOCK_WORKBENCH } from "@/lib/mocks";
import { buildEngineTrade, localWhatIf } from "@/lib/whatIf";
import type { PreTradeWhatIfResult, WhatIfForm, WorkbenchSnapshot } from "@/types/workbench";

const POLL_MS = 15_000;

function canUseRealtime(): boolean {
  if (process.env.NEXT_PUBLIC_WS_URL) return true;
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function wsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const api = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
  return `${api.replace(/^http/i, "ws").replace(/\/$/, "")}/dashboard/ws`;
}

export function useWorkbench() {
  const [data, setData] = useState<WorkbenchSnapshot | null>(null);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<"ws" | "poll" | "idle">("idle");
  const [whatIf, setWhatIf] = useState<PreTradeWhatIfResult | null>(null);
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const seq = useRef(0);
  const debounce = useRef<number | null>(null);
  const sourceRef = useRef<"api" | "mock">("mock");

  const load = useCallback(async () => {
    const res = await apiGetOr<WorkbenchSnapshot>("/dashboard/workbench", MOCK_WORKBENCH);
    sourceRef.current = res.source;
    setSource(res.source);
    setData(res.data);
    setError(null);
    return res.source;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollId = 0;
    let ws: WebSocket | null = null;

    void load()
      .then((src) => {
        if (cancelled) return;
        if (src !== "api") {
          setLive("idle");
          return;
        }
        setLive("poll");
        pollId = window.setInterval(() => {
          void load();
        }, POLL_MS);

        if (!canUseRealtime()) return;
        try {
          ws = new WebSocket(wsUrl());
          ws.onopen = () => {
            if (!cancelled) setLive("ws");
          };
          ws.onmessage = (event) => {
            if (cancelled) return;
            setData(JSON.parse(event.data) as WorkbenchSnapshot);
            setError(null);
            setSource("api");
            sourceRef.current = "api";
            setLive("ws");
          };
          ws.onerror = () => {
            if (!cancelled) setLive("poll");
          };
        } catch {
          setLive("poll");
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setData(MOCK_WORKBENCH);
          setSource("mock");
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      ws?.close();
    };
  }, [load]);

  const runWhatIf = useCallback(
    async (form: WhatIfForm) => {
      const ticket = ++seq.current;
      setWhatIfBusy(true);
      setWhatIfError(null);
      if (data) setWhatIf(localWhatIf(data, form));
      if (sourceRef.current !== "api") {
        if (ticket === seq.current) setWhatIfBusy(false);
        return;
      }
      try {
        const result = await apiPost<PreTradeWhatIfResult>("/simulation/pre-trade", {
          snapshot: data
            ? { as_of: data.as_of, positions: data.positions, cash: data.cash }
            : { as_of: new Date().toISOString().slice(0, 10), positions: [], cash: [] },
          trade: buildEngineTrade(form, data?.as_of),
        });
        if (ticket === seq.current) setWhatIf(result);
      } catch (err) {
        if (ticket !== seq.current) return;
        if (!data) setWhatIfError(err instanceof Error ? err.message : "What-if failed");
      } finally {
        if (ticket === seq.current) setWhatIfBusy(false);
      }
    },
    [data],
  );

  const scheduleWhatIf = useCallback(
    (form: WhatIfForm) => {
      if (debounce.current) window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(() => {
        void runWhatIf(form);
      }, 180);
    },
    [runWhatIf],
  );

  const commitWhatIf = useCallback(
    async (form: WhatIfForm) => {
      setCommitting(true);
      setWhatIfError(null);
      if (sourceRef.current !== "api") {
        if (data) {
          const result = localWhatIf(data, form);
          setWhatIf(result);
        }
        setToast("演示模式：试算结果已计算（静态站点未连接交易引擎）");
        window.setTimeout(() => setToast(null), 4000);
        setCommitting(false);
        return true;
      }
      try {
        await apiPost("/simulation/pre-trade/commit", {
          trade: buildEngineTrade(form, data?.as_of),
          trader: "PM Desk",
        });
        await load();
        setToast("交易已写入 Trade Blotter，Holdings 已同步更新");
        window.setTimeout(() => setToast(null), 4000);
        return true;
      } catch (err) {
        setWhatIfError(err instanceof Error ? err.message : "Commit failed");
        return false;
      } finally {
        setCommitting(false);
      }
    },
    [data, load],
  );

  return {
    data,
    source,
    error,
    live,
    load,
    whatIf,
    whatIfBusy,
    whatIfError,
    committing,
    toast,
    setToast,
    runWhatIf: scheduleWhatIf,
    commitWhatIf,
    setWhatIf,
  };
}
