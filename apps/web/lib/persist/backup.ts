import { checksumPayload } from "@/lib/persist/checksum";
import type { CurrentFund } from "@/constants/funds";
import type { BackupSummary, PersistBundle, PMSBackupPayload } from "@/lib/persist/types";
import { PMS_BACKUP_KIND, PMS_SCHEMA_VERSION } from "@/lib/persist/types";
import { defaultCashAdj } from "@/lib/holdings/trades";

export function stampFileName(fundCode: string, at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}_${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `PMS_Backup_${fundCode}_${stamp}.json`;
}

export async function buildBackupPayload(opts: {
  fund: CurrentFund;
  fundId: string;
  bundle: PersistBundle;
}): Promise<PMSBackupPayload> {
  const { fund, fundId, bundle } = opts;
  const positions = bundle.holdings[fundId]?.positions ?? [];
  const transactions = bundle.trades[fundId] ?? [];
  const cashAdj = bundle.cash[fundId] ?? defaultCashAdj();
  const cashBalance = positions
    .filter((p) => /CASH/i.test(p.securityId) || p.assetType === "Cash / Bank Deposit")
    .reduce((s, p) => s + Number(p.amortizedCost || 0), 0);
  const navFromVal = Number(bundle.valuation[fundId]?.nav ?? 0);
  const navTotal = navFromVal > 0 ? navFromVal : positions.reduce((s, p) => s + Number(p.amortizedCost || 0), 0);
  const now = new Date();
  const unsigned: Omit<PMSBackupPayload, "checksum"> = {
    kind: PMS_BACKUP_KIND,
    schemaVersion: PMS_SCHEMA_VERSION,
    exportTimestamp: now.getTime(),
    exportTime: now.toISOString(),
    fundInfo: {
      id: fund.id,
      code: fund.code,
      name: fund.name,
      baseCurrency: fund.ccy,
      inceptionDate: fund.inception,
    },
    positions,
    transactions,
    cashAccounts: [
      {
        fundId,
        label: bundle.valuation[fundId]?.cashLabel || `${fund.ccy} Custody Cash`,
        currency: fund.ccy,
        balance: cashBalance,
        cashAdj,
      },
    ],
    navHistory: bundle.eodSnapshots.filter((s) => s.fundId === fundId),
    systemSettings: {
      webhookUrl: bundle.webhookUrl,
      desk: bundle.desk,
      asOf: bundle.desk?.asOf,
    },
    stores: bundle,
  };
  const checksum = await checksumPayload(unsigned);
  return { ...unsigned, checksum };
}

export function summarizeBackup(payload: PMSBackupPayload): BackupSummary {
  const nav =
    Number(payload.stores?.valuation?.[payload.fundInfo.id]?.nav ?? 0) ||
    payload.positions.reduce((s, p) => s + Number(p.amortizedCost || 0), 0);
  return {
    exportTime: payload.exportTime,
    tradeCount: payload.transactions?.length ?? 0,
    positionCount: payload.positions?.length ?? 0,
    navTotal: nav,
    fundCode: payload.fundInfo?.code ?? payload.fundInfo?.id ?? "—",
    schemaVersion: payload.schemaVersion,
  };
}

export async function parseBackupFile(text: string): Promise<{ ok: true; payload: PMSBackupPayload } | { ok: false; error: string }> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "无效的备份文件格式" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "无效的备份文件格式" };
  const obj = raw as Partial<PMSBackupPayload>;
  if (obj.kind !== PMS_BACKUP_KIND && !obj.stores && !obj.positions) {
    return { ok: false, error: "无效的备份文件格式" };
  }
  if (!obj.fundInfo || !obj.schemaVersion) {
    return { ok: false, error: "无效的备份文件格式" };
  }
  if (obj.checksum) {
    const { checksum, ...rest } = obj as PMSBackupPayload;
    const expect = await checksumPayload(rest);
    if (expect !== checksum) {
      return { ok: false, error: "备份文件校验失败（checksum 不匹配）" };
    }
  }
  return { ok: true, payload: obj as PMSBackupPayload };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatBackupClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
