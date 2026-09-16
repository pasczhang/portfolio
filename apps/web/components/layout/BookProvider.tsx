"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDesk } from "@/components/layout/DeskProvider";
import {
  deriveCashLadder,
  deriveCompliance,
  deriveDualNav,
  deriveReport,
  deriveWorkbench,
  sampleBookFor,
  toHoldingRows,
  computeMetrics,
  computeCashPosition,
  sampleTradesFor,
  defaultCashAdj,
} from "@/lib/holdings";
import type { BookOrigin, BookPosition } from "@/lib/holdings/types";
import type { CashAdj, DeskTrade } from "@/lib/holdings/trades";

const HOLDINGS_KEY = "pms-holdings-v2";
const TRADES_KEY = "pms-trades-v1";
const CASH_KEY = "pms-cash-adj-v1";

type HoldingsStored = Record<string, { origin: BookOrigin; positions: BookPosition[] }>;
type TradesStored = Record<string, DeskTrade[]>;
type CashStored = Record<string, CashAdj>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

type BookState = {
  positions: BookPosition[];
  origin: BookOrigin;
  trades: DeskTrade[];
  cashAdj: CashAdj;
  applyImport: (incoming: BookPosition[], mode: "overwrite" | "merge") => void;
  resetDemo: () => void;
  addTrade: (trade: DeskTrade) => void;
  applyCashAdj: (patch: Partial<CashAdj>) => void;
};

const BookContext = createContext<BookState | null>(null);

export function BookProvider({ children }: { children: ReactNode }) {
  const { fundId, fund } = useDesk();
  const [holdingsStore, setHoldingsStore] = useState<HoldingsStored>({});
  const [tradesStore, setTradesStore] = useState<TradesStored>({});
  const [cashStore, setCashStore] = useState<CashStored>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHoldingsStore(readJson(HOLDINGS_KEY, {}));
    setTradesStore(readJson(TRADES_KEY, {}));
    setCashStore(readJson(CASH_KEY, {}));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdingsStore));
  }, [holdingsStore, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(TRADES_KEY, JSON.stringify(tradesStore));
  }, [tradesStore, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(CASH_KEY, JSON.stringify(cashStore));
  }, [cashStore, ready]);

  const entry = holdingsStore[fundId];
  const origin: BookOrigin = entry?.origin ?? "demo";
  const positions = useMemo(
    () => entry?.positions ?? sampleBookFor(fund.ccy),
    [entry, fund.ccy],
  );
  const trades = useMemo(
    () => tradesStore[fundId] ?? sampleTradesFor(fund.ccy),
    [tradesStore, fundId, fund.ccy],
  );
  const cashAdj = useMemo(
    () => cashStore[fundId] ?? defaultCashAdj(fund.ccy),
    [cashStore, fundId, fund.ccy],
  );

  const applyImport = useCallback(
    (incoming: BookPosition[], mode: "overwrite" | "merge") => {
      setHoldingsStore((prev) => {
        const current = prev[fundId]?.positions ?? sampleBookFor(fund.ccy);
        const next =
          mode === "overwrite"
            ? incoming
            : [...current.filter((row) => !incoming.some((n) => n.securityId === row.securityId)), ...incoming];
        return { ...prev, [fundId]: { origin: "import", positions: next } };
      });
    },
    [fundId, fund.ccy],
  );

  const resetDemo = useCallback(() => {
    setHoldingsStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
    setTradesStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
    setCashStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
  }, [fundId]);

  const addTrade = useCallback(
    (trade: DeskTrade) => {
      setTradesStore((prev) => {
        const current = prev[fundId] ?? sampleTradesFor(fund.ccy);
        return { ...prev, [fundId]: [trade, ...current] };
      });
    },
    [fundId, fund.ccy],
  );

  const applyCashAdj = useCallback(
    (patch: Partial<CashAdj>) => {
      setCashStore((prev) => {
        const current = prev[fundId] ?? defaultCashAdj(fund.ccy);
        return { ...prev, [fundId]: { ...current, ...patch } };
      });
    },
    [fundId, fund.ccy],
  );

  const value = useMemo<BookState>(
    () => ({ positions, origin, trades, cashAdj, applyImport, resetDemo, addTrade, applyCashAdj }),
    [positions, origin, trades, cashAdj, applyImport, resetDemo, addTrade, applyCashAdj],
  );

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook() {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error("useBook must be used within BookProvider");
  const { fund, asOf } = useDesk();
  const { positions, origin, trades, cashAdj, applyImport, resetDemo, addTrade, applyCashAdj } = ctx;
  const metrics = useMemo(() => computeMetrics(positions, asOf), [positions, asOf]);
  const holdings = useMemo(() => toHoldingRows(positions, asOf), [positions, asOf]);
  const workbench = useMemo(() => deriveWorkbench(positions, fund, asOf), [positions, fund, asOf]);
  const dualNav = useMemo(() => deriveDualNav(positions, fund, asOf), [positions, fund, asOf]);
  const cashLadder = useMemo(() => deriveCashLadder(positions, fund, asOf), [positions, fund, asOf]);
  const report = useMemo(() => deriveReport(positions, fund, asOf), [positions, fund, asOf]);
  const compliance = useMemo(() => deriveCompliance(positions, fund, asOf), [positions, fund, asOf]);
  const cashPosition = useMemo(
    () => computeCashPosition(positions, trades, cashAdj, asOf),
    [positions, trades, cashAdj, asOf],
  );
  const source = origin === "import" ? ("import" as const) : ("mock" as const);
  return {
    positions,
    origin,
    source,
    metrics,
    holdings,
    workbench,
    dualNav,
    cashLadder,
    report,
    compliance,
    trades,
    cashAdj,
    cashPosition,
    applyImport,
    resetDemo,
    addTrade,
    applyCashAdj,
    aum: metrics.aum,
    asOf,
  };
}
