"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { buildEngineTrade, localWhatIf } from "@/lib/whatIf";
import type { PreTradeWhatIfResult, WhatIfForm, WorkbenchSnapshot } from "@/types/workbench";

const POLL_MS = 15_000;

function wsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const api = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
  return `${api.replace(/^http/i, "ws").replace(/\/$/, "")}/dashboard/ws`;
}

export function useWorkbench() {
  const [data, setData] = useState<WorkbenchSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<"ws" | "poll" | "idle">("idle");
  const [whatIf, setWhatIf] = useState<PreTradeWhatIfResult | null>(null);
  const [whatIfBusy, setWhatIfBusy] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const seq = useRef(0);
  const debounce = useRef<number | null>(null);

  const load = useCallback(async () => {
    const snap = await apiGet<WorkbenchSnapshot>("/dashboard/workbench");
    setData(snap);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLive("poll");
    void load().catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });
    const pollId = window.setInterval(() => {
      void load().catch((err: Error) => setError(err.message));
    }, POLL_MS);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        if (!cancelled) setLive("ws");
      };
      ws.onmessage = (event) => {
        if (cancelled) return;
        setData(JSON.parse(event.data) as WorkbenchSnapshot);
        setError(null);
        setLive("ws");
      };
      ws.onerror = () => {
        if (!cancelled) setLive("poll");
      };
    } catch {
      setLive("poll");
    }

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
