import type { BookOrigin, BookPosition } from "@/lib/holdings/types";
import type { CashAdj, CashSimTrade, DeskTrade } from "@/lib/holdings/trades";
import type { DailySnapshot, ParsedValuationReport, TaFlow } from "@/lib/services/types";

export const PMS_SCHEMA_VERSION = "1.0";
export const PMS_BACKUP_KIND = "BAM_PMS_BACKUP";
export const AUTO_SNAPSHOT_LIMIT = 10;

export type HoldingsStored = Record<string, { origin: BookOrigin; positions: BookPosition[] }>;
export type TradesStored = Record<string, DeskTrade[]>;
export type CashStored = Record<string, CashAdj>;
export type SimStored = Record<string, CashSimTrade[]>;
export type TaStored = Record<string, TaFlow[]>;
export type ValStored = Record<string, ParsedValuationReport>;

export type DeskPersist = {
  fundId: string;
  asOf: string;
  role: string;
  theme: "dark" | "light";
};

export type PersistBundle = {
  schemaVersion: string;
  holdings: HoldingsStored;
  trades: TradesStored;
  cash: CashStored;
  sim: SimStored;
  ta: TaStored;
  valuation: ValStored;
  eodSnapshots: DailySnapshot[];
  webhookUrl: string;
  desk: DeskPersist | null;
};

export type AutoSnapshotReason =
  | "session_open"
  | "daily_open"
  | "import_holdings"
  | "import_valuation"
  | "adopt_custodian"
  | "import_ta"
  | "inception_reset"
  | "manual"
  | "pre_restore";

export type AutoSnapshotMeta = {
  id: string;
  createdAt: string;
  reason: AutoSnapshotReason;
  fundId: string;
  fundCode: string;
  nav: number;
  positionCount: number;
  tradeCount: number;
};

export type AutoSnapshotRecord = AutoSnapshotMeta & {
  bundle: PersistBundle;
};

export type PMSBackupPayload = {
  kind: typeof PMS_BACKUP_KIND;
  schemaVersion: string;
  exportTimestamp: number;
  exportTime: string;
  checksum: string;
  fundInfo: {
    id: string;
    code: string;
    name: string;
    baseCurrency: string;
    inceptionDate: string;
  };
  positions: BookPosition[];
  transactions: DeskTrade[];
  cashAccounts: Array<{
    fundId: string;
    label: string;
    currency: string;
    balance: number;
    cashAdj: CashAdj | null;
  }>;
  navHistory: DailySnapshot[];
  systemSettings: Record<string, unknown>;
  stores: PersistBundle;
};

export type BackupSummary = {
  exportTime: string;
  tradeCount: number;
  positionCount: number;
  navTotal: number;
  fundCode: string;
  schemaVersion: string;
};

export function emptyPersistBundle(): PersistBundle {
  return {
    schemaVersion: PMS_SCHEMA_VERSION,
    holdings: {},
    trades: {},
    cash: {},
    sim: {},
    ta: {},
    valuation: {},
    eodSnapshots: [],
    webhookUrl: "",
    desk: null,
  };
}
