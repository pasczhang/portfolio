"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FUNDS, useDesk } from "@/components/layout/DeskProvider";
import {
  deriveCashLadder,
  deriveCompliance,
  deriveDualNav,
  deriveReport,
  deriveWorkbench,
  sampleBookFor,
  toHoldingRows,
  computeMetrics,
  computeBookSnapshot,
  computeCashPosition,
  isBookCash,
  sampleTradesFor,
  defaultCashAdj,
} from "@/lib/holdings";
import { runPortfolioEngine } from "@/lib/engine/bookMetrics";
import { replayPortfolio } from "@/lib/engine/portfolioLedger";
import type { BookOrigin, BookPosition } from "@/lib/holdings/types";
import type { CashAdj, CashSimTrade, DeskTrade } from "@/lib/holdings/trades";
import type { DailySnapshot, ParsedValuationReport, TaFlow } from "@/lib/services/types";
import { adoptCustodianAsBook } from "@/lib/services/parsers/valuationParser";
import { reconcileValuation } from "@/lib/services/reconciliation/reconciliationEngine";
import {
  buildInceptionCashPosition,
  buildInceptionTrade,
  buildInceptionValuation,
  type ResetCurrency,
} from "@/lib/holdings/inceptionReset";
import type {
  AutoSnapshotReason,
  AutoSnapshotRecord,
  CashStored,
  HoldingsStored,
  PersistBundle,
  PMSBackupPayload,
  SimStored,
  TaStored,
  TradesStored,
  ValStored,
} from "@/lib/persist/types";
import { PMS_SCHEMA_VERSION, emptyPersistBundle } from "@/lib/persist/types";
import {
  LAST_OPEN_KEY,
  cloneBundle,
  getAutoSnapshot,
  kvGet,
  kvSet,
  listAutoSnapshots,
  loadPersistBundle,
  putAutoSnapshot,
  savePersistBundle,
} from "@/lib/persist/idb";
import { clearMigratedLocalStorage, localStorageHasBookData, migrateBundle, readLocalStorageBundle } from "@/lib/persist/migrate";
import { beginPersistWrite, endPersistWrite } from "@/lib/persist/dirty";
import { buildBackupPayload, downloadJson, stampFileName } from "@/lib/persist/backup";

type BookState = {
  positions: BookPosition[];
  origin: BookOrigin;
  trades: DeskTrade[];
  tradesStore: TradesStored;
  cashAdj: CashAdj;
  simTrades: CashSimTrade[];
  holdingsStore: HoldingsStored;
  taFlows: TaFlow[];
  valuationReport: ParsedValuationReport | null;
  snapshots: DailySnapshot[];
  webhookUrl: string;
  applyImport: (incoming: BookPosition[], mode: "overwrite" | "merge") => void;
  resetDemo: () => void;
  resetFundToInception: (opts: { inceptionDate: string; cashAmount: number; currency: ResetCurrency }) => void;
  addTrade: (trade: DeskTrade) => void;
  updateTrade: (trade: DeskTrade) => void;
  removeTrade: (id: string) => void;
  applyCashAdj: (patch: Partial<CashAdj>) => void;
  applyCashPlan: (adj: CashAdj, sims: CashSimTrade[]) => void;
  resetCashPlan: () => void;
  removeSimTrade: (id: string) => void;
  applyTaImport: (flows: TaFlow[], mode: "overwrite" | "merge") => void;
  setValuationReport: (report: ParsedValuationReport | null) => void;
  adoptCustodian: () => void;
  appendSnapshot: (snap: DailySnapshot) => void;
  applyEodBook: (nextPositions: BookPosition[]) => void;
  upsertManualPosition: (position: BookPosition, previousSecurityId?: string) => void;
  removeManualPosition: (securityId: string) => void;
  setWebhookUrl: (url: string) => void;
  persistReady: boolean;
  autoSnapshots: AutoSnapshotRecord[];
  exportFullBackup: () => Promise<void>;
  restoreFromBackup: (payload: PMSBackupPayload) => Promise<void>;
  captureAutoSnapshot: (reason: AutoSnapshotReason) => Promise<void>;
  rollbackAutoSnapshot: (id: string) => Promise<void>;
  downloadAutoSnapshot: (id: string) => Promise<void>;
  refreshAutoSnapshots: () => Promise<void>;
};

const BookContext = createContext<BookState | null>(null);

export function BookProvider({ children }: { children: ReactNode }) {
  const { fundId, fund, asOf: deskAsOf, setAsOf, setFundId, role, dark } = useDesk();
  const [holdingsStore, setHoldingsStore] = useState<HoldingsStored>({});
  const [tradesStore, setTradesStore] = useState<TradesStored>({});
  const [cashStore, setCashStore] = useState<CashStored>({});
  const [simStore, setSimStore] = useState<SimStored>({});
  const [taStore, setTaStore] = useState<TaStored>({});
  const [valStore, setValStore] = useState<ValStored>({});
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [webhookUrl, setWebhookUrlState] = useState("");
  const [ready, setReady] = useState(false);
  const [autoSnapshots, setAutoSnapshots] = useState<AutoSnapshotRecord[]>([]);
  const storesRef = useRef({
    holdingsStore,
    tradesStore,
    cashStore,
    simStore,
    taStore,
    valStore,
    snapshots,
    webhookUrl,
    fundId,
    deskAsOf,
    role,
    dark,
  });
  storesRef.current = {
    holdingsStore,
    tradesStore,
    cashStore,
    simStore,
    taStore,
    valStore,
    snapshots,
    webhookUrl,
    fundId,
    deskAsOf,
    role,
    dark,
  };

  const applyBundle = useCallback(
    (bundle: PersistBundle) => {
      const m = migrateBundle(bundle);
      setHoldingsStore(m.holdings);
      setTradesStore(m.trades);
      setCashStore(m.cash);
      setSimStore(m.sim);
      setTaStore(m.ta);
      setValStore(m.valuation);
      setSnapshots(m.eodSnapshots);
      setWebhookUrlState(m.webhookUrl);
      if (m.desk?.asOf) setAsOf(m.desk.asOf);
      if (m.desk?.fundId) setFundId(m.desk.fundId);
    },
    [setAsOf, setFundId],
  );

  const currentBundle = useCallback((): PersistBundle => {
    const s = storesRef.current;
    return {
      schemaVersion: PMS_SCHEMA_VERSION,
      holdings: s.holdingsStore,
      trades: s.tradesStore,
      cash: s.cashStore,
      sim: s.simStore,
      ta: s.taStore,
      valuation: s.valStore,
      eodSnapshots: s.snapshots,
      webhookUrl: s.webhookUrl,
      desk: {
        fundId: s.fundId,
        asOf: s.deskAsOf,
        role: s.role,
        theme: s.dark ? "dark" : "light",
      },
    };
  }, []);

  const refreshAutoSnapshots = useCallback(async () => {
    setAutoSnapshots(await listAutoSnapshots());
  }, []);

  const captureAutoSnapshot = useCallback(
    async (reason: AutoSnapshotReason, bundleOverride?: PersistBundle) => {
      const bundle = cloneBundle(bundleOverride ?? currentBundle());
      const positions = bundle.holdings[fundId]?.positions ?? [];
      const navTape = Number(bundle.valuation[fundId]?.nav ?? 0);
      const nav = navTape > 0 ? navTape : positions.reduce((sum, p) => sum + Number(p.amortizedCost || 0), 0);
      const record: AutoSnapshotRecord = {
        id: `SNAP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        reason,
        fundId,
        fundCode: fund.code,
        nav,
        positionCount: positions.length,
        tradeCount: (bundle.trades[fundId] ?? []).length,
        bundle,
      };
      beginPersistWrite();
      try {
        await putAutoSnapshot(record);
        await refreshAutoSnapshots();
      } finally {
        endPersistWrite();
      }
    },
    [currentBundle, fund.code, fundId, refreshAutoSnapshots],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let bundle = await loadPersistBundle();
        if (!bundle && localStorageHasBookData()) {
          bundle = readLocalStorageBundle();
          beginPersistWrite();
          try {
            await savePersistBundle(migrateBundle(bundle));
            clearMigratedLocalStorage();
          } finally {
            endPersistWrite();
          }
        }
        if (cancelled) return;
        const loaded = bundle ? migrateBundle(bundle) : emptyPersistBundle();
        if (bundle) applyBundle(bundle);
        await refreshAutoSnapshots();
        const today = new Date().toISOString().slice(0, 10);
        const lastOpen = (await kvGet<string>(LAST_OPEN_KEY)) ?? "";
        const sessionKey = "pms-session-snap";
        const already = typeof window !== "undefined" && window.sessionStorage.getItem(sessionKey);
        if (lastOpen !== today) {
          await kvSet(LAST_OPEN_KEY, today);
          if (!cancelled) await captureAutoSnapshot("daily_open", loaded);
        } else if (!already) {
          if (!cancelled) await captureAutoSnapshot("session_open", loaded);
        }
        window.sessionStorage.setItem(sessionKey, "1");
      } catch {
        if (!cancelled && localStorageHasBookData()) applyBundle(readLocalStorageBundle());
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per session
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      beginPersistWrite();
      savePersistBundle(currentBundle())
        .catch(() => undefined)
        .finally(() => endPersistWrite());
    }, 280);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    holdingsStore,
    tradesStore,
    cashStore,
    simStore,
    taStore,
    valStore,
    snapshots,
    webhookUrl,
    fundId,
    deskAsOf,
    role,
    dark,
    currentBundle,
  ]);

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
    () => cashStore[fundId] ?? defaultCashAdj(),
    [cashStore, fundId],
  );
  const simTrades = useMemo(() => simStore[fundId] ?? [], [simStore, fundId]);
  const taFlows = useMemo(() => taStore[fundId] ?? [], [taStore, fundId]);
  const valuationReport = valStore[fundId] ?? null;

  const applyImport = useCallback(
    (incoming: BookPosition[], mode: "overwrite" | "merge") => {
      void captureAutoSnapshot("import_holdings");
      setHoldingsStore((prev) => {
        const current = prev[fundId]?.positions ?? sampleBookFor(fund.ccy);
        const next =
          mode === "overwrite"
            ? incoming
            : [...current.filter((row) => !incoming.some((n) => n.securityId === row.securityId)), ...incoming];
        return { ...prev, [fundId]: { origin: "import", positions: next } };
      });
    },
    [fundId, fund.ccy, captureAutoSnapshot],
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
    setSimStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
    setTaStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
    setValStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
  }, [fundId]);

  const resetFundToInception = useCallback(
    (opts: { inceptionDate: string; cashAmount: number; currency: ResetCurrency }) => {
      void captureAutoSnapshot("inception_reset");
      const input = {
        inceptionDate: opts.inceptionDate,
        cashAmount: opts.cashAmount,
        currency: opts.currency,
        fundCcy: fund.ccy,
        fundCode: fund.code,
        fundName: fund.name,
      };
      const cashRow = buildInceptionCashPosition(input);
      const injection = buildInceptionTrade(input);
      const report = buildInceptionValuation(input);
      setHoldingsStore((prev) => ({ ...prev, [fundId]: { origin: "import" as const, positions: [cashRow] } }));
      setTradesStore((prev) => ({ ...prev, [fundId]: [injection] }));
      setCashStore((prev) => {
        const copy = { ...prev };
        delete copy[fundId];
        return copy;
      });
      setSimStore((prev) => {
        const copy = { ...prev };
        delete copy[fundId];
        return copy;
      });
      setTaStore((prev) => {
        const copy = { ...prev };
        delete copy[fundId];
        return copy;
      });
      setValStore((prev) => ({ ...prev, [fundId]: report }));
      setSnapshots((prev) => prev.filter((s) => s.fundId !== fundId));
    },
    [fundId, fund.ccy, fund.code, fund.name, captureAutoSnapshot],
  );

  const addTrade = useCallback(
    (trade: DeskTrade) => {
      setTradesStore((prev) => {
        const current = prev[fundId] ?? sampleTradesFor(fund.ccy);
        return { ...prev, [fundId]: [trade, ...current] };
      });
    },
    [fundId, fund.ccy],
  );

  const updateTrade = useCallback(
    (trade: DeskTrade) => {
      setTradesStore((prev) => {
        const current = prev[fundId] ?? sampleTradesFor(fund.ccy);
        const idx = current.findIndex((t) => t.id === trade.id);
        const next = idx >= 0 ? current.map((t) => (t.id === trade.id ? { ...t, ...trade } : t)) : [trade, ...current];
        return { ...prev, [fundId]: next };
      });
    },
    [fundId, fund.ccy],
  );

  const removeTrade = useCallback(
    (id: string) => {
      setTradesStore((prev) => {
        const current = prev[fundId] ?? sampleTradesFor(fund.ccy);
        return { ...prev, [fundId]: current.filter((t) => t.id !== id) };
      });
    },
    [fundId, fund.ccy],
  );

  const applyCashAdj = useCallback(
    (patch: Partial<CashAdj>) => {
      setCashStore((prev) => {
        const current = prev[fundId] ?? defaultCashAdj();
        return { ...prev, [fundId]: { ...current, ...patch } };
      });
    },
    [fundId],
  );

  const applyCashPlan = useCallback(
    (adj: CashAdj, sims: CashSimTrade[]) => {
      setCashStore((prev) => ({ ...prev, [fundId]: adj }));
      setSimStore((prev) => ({ ...prev, [fundId]: sims }));
    },
    [fundId],
  );

  const resetCashPlan = useCallback(() => {
    setCashStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
    setSimStore((prev) => {
      const copy = { ...prev };
      delete copy[fundId];
      return copy;
    });
  }, [fundId]);

  const removeSimTrade = useCallback(
    (id: string) => {
      setSimStore((prev) => {
        const current = prev[fundId] ?? [];
        return { ...prev, [fundId]: current.filter((t) => t.id !== id) };
      });
    },
    [fundId],
  );

  const applyTaImport = useCallback(
    (flows: TaFlow[], mode: "overwrite" | "merge") => {
      void captureAutoSnapshot("import_ta");
      setTaStore((prev) => {
        const current = prev[fundId] ?? [];
        const next = mode === "overwrite" ? flows : [...current, ...flows];
        return { ...prev, [fundId]: next };
      });
    },
    [fundId, captureAutoSnapshot],
  );

  const setValuationReport = useCallback(
    (report: ParsedValuationReport | null) => {
      if (report) void captureAutoSnapshot("import_valuation");
      setValStore((prev) => {
        if (!report) {
          const copy = { ...prev };
          delete copy[fundId];
          return copy;
        }
        return { ...prev, [fundId]: report };
      });
    },
    [fundId, captureAutoSnapshot],
  );

  const adoptCustodian = useCallback(() => {
    const report = valStore[fundId];
    if (!report) return;
    void captureAutoSnapshot("adopt_custodian");
    const bookAsOf = report.asOf || deskAsOf;
    const nextPositions = adoptCustodianAsBook([], "demo", report, bookAsOf, fund.ccy);
    if (report.asOf) setAsOf(report.asOf);
    setHoldingsStore((prev) => ({
      ...prev,
      [fundId]: { origin: "import", positions: nextPositions },
    }));
    setValStore((prev) => ({
      ...prev,
      [fundId]: {
        ...report,
        bookSynced: true,
        nav: report.nav && report.nav > 0 ? report.nav : nextPositions.reduce((s, p) => s + p.amortizedCost, 0),
        warnings: ["已一键采纳托管行数据：内部持仓已全量覆盖为估值表资产，指标已重算。"],
      },
    }));
  }, [fundId, fund.ccy, valStore, deskAsOf, setAsOf, captureAutoSnapshot]);

  const appendSnapshot = useCallback((snap: DailySnapshot) => {
    setSnapshots((prev) => [snap, ...prev.filter((s) => s.id !== snap.id)].slice(0, 90));
  }, []);

  const applyEodBook = useCallback(
    (nextPositions: BookPosition[]) => {
      setHoldingsStore((prev) => ({ ...prev, [fundId]: { origin: prev[fundId]?.origin ?? "import", positions: nextPositions } }));
    },
    [fundId],
  );

  const upsertManualPosition = useCallback(
    (position: BookPosition, previousSecurityId?: string) => {
      setHoldingsStore((prev) => {
        const current = prev[fundId]?.positions ?? sampleBookFor(fund.ccy);
        const key = previousSecurityId || position.securityId;
        const idx = current.findIndex((p) => p.securityId === key);
        let next: BookPosition[];
        if (idx >= 0) {
          next = current.map((p, i) => (i === idx ? position : p));
        } else if (current.some((p) => p.securityId === position.securityId)) {
          next = current.map((p) => (p.securityId === position.securityId ? position : p));
        } else {
          next = [...current, position];
        }
        return { ...prev, [fundId]: { origin: "import", positions: next } };
      });
    },
    [fundId, fund.ccy],
  );

  const removeManualPosition = useCallback(
    (securityId: string) => {
      setHoldingsStore((prev) => {
        const current = prev[fundId]?.positions ?? sampleBookFor(fund.ccy);
        return {
          ...prev,
          [fundId]: { origin: "import", positions: current.filter((p) => p.securityId !== securityId) },
        };
      });
    },
    [fundId, fund.ccy],
  );

  const setWebhookUrl = useCallback((url: string) => {
    setWebhookUrlState(url);
  }, []);

  const exportFullBackup = useCallback(async () => {
    const payload = await buildBackupPayload({ fund, fundId, bundle: currentBundle() });
    downloadJson(stampFileName(fund.code), payload);
  }, [currentBundle, fund, fundId]);

  const restoreFromBackup = useCallback(
    async (payload: PMSBackupPayload) => {
      await captureAutoSnapshot("pre_restore");
      if (payload.stores) {
        applyBundle(payload.stores);
        return;
      }
      applyBundle({
        schemaVersion: PMS_SCHEMA_VERSION,
        holdings: { [fundId]: { origin: "import", positions: payload.positions ?? [] } },
        trades: { [fundId]: payload.transactions ?? [] },
        cash: {},
        sim: {},
        ta: {},
        valuation: {},
        eodSnapshots: payload.navHistory ?? [],
        webhookUrl: String(payload.systemSettings?.webhookUrl ?? ""),
        desk: null,
      });
    },
    [applyBundle, captureAutoSnapshot, fundId],
  );

  const rollbackAutoSnapshot = useCallback(
    async (id: string) => {
      const rec = await getAutoSnapshot(id);
      if (!rec) throw new Error("snapshot missing");
      await captureAutoSnapshot("pre_restore");
      applyBundle(rec.bundle);
    },
    [applyBundle, captureAutoSnapshot],
  );

  const downloadAutoSnapshot = useCallback(
    async (id: string) => {
      const rec = await getAutoSnapshot(id);
      if (!rec) throw new Error("snapshot missing");
      const payload = await buildBackupPayload({ fund, fundId, bundle: rec.bundle });
      downloadJson(stampFileName(rec.fundCode || fund.code, new Date(rec.createdAt)), payload);
    },
    [fund, fundId],
  );

  const value = useMemo<BookState>(
    () => ({
      positions,
      origin,
      trades,
      tradesStore,
      cashAdj,
      simTrades,
      holdingsStore,
      taFlows,
      valuationReport,
      snapshots,
      webhookUrl,
      applyImport,
      resetDemo,
      resetFundToInception,
      addTrade,
      updateTrade,
      removeTrade,
      applyCashAdj,
      applyCashPlan,
      resetCashPlan,
      removeSimTrade,
      applyTaImport,
      setValuationReport,
      adoptCustodian,
      appendSnapshot,
      applyEodBook,
      upsertManualPosition,
      removeManualPosition,
      setWebhookUrl,
      persistReady: ready,
      autoSnapshots,
      exportFullBackup,
      restoreFromBackup,
      captureAutoSnapshot,
      rollbackAutoSnapshot,
      downloadAutoSnapshot,
      refreshAutoSnapshots,
    }),
    [
      positions,
      origin,
      trades,
      tradesStore,
      cashAdj,
      simTrades,
      holdingsStore,
      taFlows,
      valuationReport,
      snapshots,
      webhookUrl,
      applyImport,
      resetDemo,
      resetFundToInception,
      addTrade,
      updateTrade,
      removeTrade,
      applyCashAdj,
      applyCashPlan,
      resetCashPlan,
      removeSimTrade,
      applyTaImport,
      setValuationReport,
      adoptCustodian,
      appendSnapshot,
      applyEodBook,
      upsertManualPosition,
      removeManualPosition,
      setWebhookUrl,
      autoSnapshots,
      exportFullBackup,
      restoreFromBackup,
      captureAutoSnapshot,
      rollbackAutoSnapshot,
      downloadAutoSnapshot,
      refreshAutoSnapshots,
      ready,
    ],
  );

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook() {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error("useBook must be used within BookProvider");
  const { fund, asOf } = useDesk();
  const { positions, origin, trades, tradesStore, cashAdj, simTrades, holdingsStore, taFlows, valuationReport, snapshots, webhookUrl, applyImport, resetDemo, resetFundToInception, addTrade, updateTrade, removeTrade, applyCashAdj, applyCashPlan, resetCashPlan, removeSimTrade, applyTaImport, setValuationReport, adoptCustodian, appendSnapshot, applyEodBook, upsertManualPosition, removeManualPosition, setWebhookUrl, persistReady, autoSnapshots, exportFullBackup, restoreFromBackup, captureAutoSnapshot, rollbackAutoSnapshot, downloadAutoSnapshot, refreshAutoSnapshots } = ctx;
  const ledger = useMemo(
    () => replayPortfolio({ opening: positions, trades, asOf, ccy: fund.ccy }),
    [positions, trades, asOf, fund.ccy],
  );
  const displayBook = ledger.positions;
  const engine = useMemo(() => runPortfolioEngine(displayBook, asOf), [displayBook, asOf]);
  const snapshot = useMemo(() => computeBookSnapshot(displayBook, asOf), [displayBook, asOf]);
  const metrics = engine.metrics;
  const cashPositions = useMemo(() => displayBook.filter((p) => isBookCash(p)), [displayBook]);
  const holdings = useMemo(
    () => toHoldingRows(displayBook, asOf, ledger.risk.nav),
    [displayBook, asOf, ledger.risk.nav],
  );
  const workbench = useMemo(() => deriveWorkbench(displayBook, fund, asOf), [displayBook, fund, asOf]);
  const dualNav = useMemo(() => deriveDualNav(displayBook, fund, asOf), [displayBook, fund, asOf]);
  const cashLadder = useMemo(() => deriveCashLadder(displayBook, fund, asOf), [displayBook, fund, asOf]);
  const report = useMemo(() => deriveReport(displayBook, fund, asOf), [displayBook, fund, asOf]);
  const compliance = useMemo(() => deriveCompliance(displayBook, fund, asOf), [displayBook, fund, asOf]);
  const cashPosition = useMemo(
    () => computeCashPosition(displayBook, ledger.overlayTrades, cashAdj, asOf, simTrades, taFlows),
    [displayBook, ledger.overlayTrades, cashAdj, asOf, simTrades, taFlows],
  );
  const reconciliation = useMemo(
    () => (valuationReport ? reconcileValuation(positions, valuationReport, asOf) : null),
    [valuationReport, positions, asOf],
  );
  const source = origin === "import" ? ("import" as const) : ("mock" as const);
  const fundSnapshots = useMemo(
    () =>
      FUNDS.map((f) => {
        const stored = holdingsStore[f.id];
        const opening = stored?.positions ?? sampleBookFor(f.ccy);
        const bookTrades = tradesStore[f.id] ?? sampleTradesFor(f.ccy);
        const book = replayPortfolio({ opening, trades: bookTrades, asOf, ccy: f.ccy }).positions;
        return {
          fund: f,
          origin: stored?.origin ?? ("demo" as const),
          metrics: computeMetrics(book, asOf),
        };
      }),
    [holdingsStore, tradesStore, asOf],
  );
  return {
    positions: displayBook,
    origin,
    source,
    metrics,
    snapshot,
    engine,
    fundSnapshots,
    holdings,
    cashPositions,
    workbench,
    dualNav,
    cashLadder,
    report,
    compliance,
    trades,
    cashAdj,
    simTrades,
    cashPosition,
    taFlows,
    valuationReport,
    reconciliation,
    snapshots,
    webhookUrl,
    applyImport,
    resetDemo,
    resetFundToInception,
    addTrade,
    updateTrade,
    removeTrade,
    applyCashAdj,
    applyCashPlan,
    resetCashPlan,
    removeSimTrade,
    applyTaImport,
    setValuationReport,
    adoptCustodian,
    appendSnapshot,
    applyEodBook,
    upsertManualPosition,
    removeManualPosition,
    setWebhookUrl,
    persistReady,
    autoSnapshots,
    exportFullBackup,
    restoreFromBackup,
    captureAutoSnapshot,
    rollbackAutoSnapshot,
    downloadAutoSnapshot,
    refreshAutoSnapshots,
    ledger,
    realizedPnl: ledger.realizedPnl,
    riskMetrics: ledger.risk,
    aum: metrics.nav || metrics.aum,
    asOf,
  };
}
