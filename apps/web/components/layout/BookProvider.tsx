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
} from "@/lib/holdings";
import type { BookOrigin, BookPosition } from "@/lib/holdings/types";

const STORAGE_KEY = "pms-holdings-v1";

type Stored = Record<string, { origin: BookOrigin; positions: BookPosition[] }>;

function readStore(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

type BookState = {
  positions: BookPosition[];
  origin: BookOrigin;
  applyImport: (incoming: BookPosition[], mode: "overwrite" | "merge") => void;
  resetDemo: () => void;
};

const BookContext = createContext<BookState | null>(null);

export function BookProvider({ children }: { children: ReactNode }) {
  const { fundId, fund } = useDesk();
  const [store, setStore] = useState<Stored>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStore(readStore());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store, ready]);

  const entry = store[fundId];
  const origin: BookOrigin = entry?.origin ?? "demo";
  const positions = useMemo(
    () => entry?.positions ?? sampleBookFor(fund.ccy),
    [entry, fund.ccy],
  );

  const applyImport = useCallback(
    (incoming: BookPosition[], mode: "overwrite" | "merge") => {
      setStore((prev) => {
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
    setStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
  }, [fundId]);

  const value = useMemo<BookState>(
    () => ({ positions, origin, applyImport, resetDemo }),
    [positions, origin, applyImport, resetDemo],
  );

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook() {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error("useBook must be used within BookProvider");
  const { fund, asOf } = useDesk();
  const { positions, origin, applyImport, resetDemo } = ctx;
  const metrics = useMemo(() => computeMetrics(positions, asOf), [positions, asOf]);
  const holdings = useMemo(() => toHoldingRows(positions, asOf), [positions, asOf]);
  const workbench = useMemo(() => deriveWorkbench(positions, fund, asOf), [positions, fund, asOf]);
  const dualNav = useMemo(() => deriveDualNav(positions, fund, asOf), [positions, fund, asOf]);
  const cashLadder = useMemo(() => deriveCashLadder(positions, fund, asOf), [positions, fund, asOf]);
  const report = useMemo(() => deriveReport(positions, fund, asOf), [positions, fund, asOf]);
  const compliance = useMemo(() => deriveCompliance(positions, fund, asOf), [positions, fund, asOf]);
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
    applyImport,
    resetDemo,
    aum: metrics.aum,
    asOf,
  };
}
