import type { PersistBundle } from "@/lib/persist/types";
import { emptyPersistBundle, PMS_SCHEMA_VERSION } from "@/lib/persist/types";

export const LS_HOLDINGS = "pms-holdings-v2";
export const LS_TRADES = "pms-trades-v1";
export const LS_CASH = "pms-cash-adj-v2";
export const LS_SIM = "pms-cash-sim-v1";
export const LS_TA = "pms-ta-v1";
export const LS_SNAP = "pms-daily-snapshots-v1";
export const LS_VAL = "pms-custodian-val-v1";
export const LS_HOOK = "pms-ops-webhook";

function readLs<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readLocalStorageBundle(): PersistBundle {
  if (typeof window === "undefined") return emptyPersistBundle();
  return {
    schemaVersion: PMS_SCHEMA_VERSION,
    holdings: readLs(LS_HOLDINGS, {}),
    trades: readLs(LS_TRADES, {}),
    cash: readLs(LS_CASH, {}),
    sim: readLs(LS_SIM, {}),
    ta: readLs(LS_TA, {}),
    valuation: readLs(LS_VAL, {}),
    eodSnapshots: readLs(LS_SNAP, []),
    webhookUrl: window.localStorage.getItem(LS_HOOK) ?? "",
    desk: {
      fundId: window.localStorage.getItem("pms-fund") ?? "",
      asOf: window.localStorage.getItem("pms-asof") ?? "",
      role: window.localStorage.getItem("pms-role") ?? "maker",
      theme: window.localStorage.getItem("pms-theme") === "light" ? "light" : "dark",
    },
  };
}

export function localStorageHasBookData(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.localStorage.getItem(LS_HOLDINGS) ||
      window.localStorage.getItem(LS_TRADES) ||
      window.localStorage.getItem(LS_VAL),
  );
}

/** After a successful IDB migrate, drop bulky book keys so the 5MB quota is freed. */
export function clearMigratedLocalStorage(): void {
  if (typeof window === "undefined") return;
  [LS_HOLDINGS, LS_TRADES, LS_CASH, LS_SIM, LS_TA, LS_SNAP, LS_VAL].forEach((k) => window.localStorage.removeItem(k));
}

export function migrateBundle(bundle: PersistBundle): PersistBundle {
  const next = { ...emptyPersistBundle(), ...bundle, schemaVersion: PMS_SCHEMA_VERSION };
  next.holdings = bundle.holdings ?? {};
  next.trades = bundle.trades ?? {};
  next.cash = bundle.cash ?? {};
  next.sim = bundle.sim ?? {};
  next.ta = bundle.ta ?? {};
  next.valuation = bundle.valuation ?? {};
  next.eodSnapshots = Array.isArray(bundle.eodSnapshots) ? bundle.eodSnapshots : [];
  next.webhookUrl = bundle.webhookUrl ?? "";
  next.desk = bundle.desk ?? null;
  return next;
}
