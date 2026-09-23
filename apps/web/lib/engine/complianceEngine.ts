import type { BookPosition } from "@/lib/holdings/types";
import { businessDaysBetween, calendarOfCcy } from "@/lib/engine/dayCount";
import { computeWamWal, walTenorDays } from "@/lib/engine/durationCalculator";

export const DLA_FLOOR = 10;
export const WLA_SFC_FLOOR = 15;
export const WLA_INTERNAL_FLOOR = 20;
export const WAM_CAP = 60;
export const WAL_CAP = 120;
export const ISSUER_LIMIT = 10;
export const BANK_GROUP_LIMIT = 20;
export const MAX_RESIDUAL = 397;

export type RuleStatus = "PASS" | "WARN" | "BREACH";

export type LiquidityResult = {
  dlaAmt: number;
  wlaAmt: number;
  dlaPct: number;
  wlaPct: number;
  dlaOk: boolean;
  wlaSfcOk: boolean;
  wlaInternalOk: boolean;
};

export type IssuerRow = {
  issuer: string;
  group: string;
  amount: number;
  weightPct: number;
  depositAmt: number;
  privileged: boolean;
  status: RuleStatus;
  hint: string;
};

export type ComplianceResult = {
  liquidity: LiquidityResult;
  wamDays: number;
  walDays: number;
  wamOk: boolean;
  walOk: boolean;
  maxResidualDays: number;
  maxResidualOk: boolean;
  issuers: IssuerRow[];
  alerts: { id: string; severity: string; rule: string; title: string; detail: string; as_of: string }[];
};

const SOVEREIGN = /treasury|hkma|federal reserve|sovereign|exchange fund/i;

const AFFILIATE: Record<string, string> = {
  HSBC: "HSBC Group",
  "Hang Seng Bank": "HSBC Group",
  "Bank of China (Hong Kong)": "BOC Group",
  BOCI: "BOC Group",
  "Bank of China": "BOC Group",
  ICBC: "ICBC Group",
  "Standard Chartered": "SCB Group",
};

function groupOf(name: string): string {
  return AFFILIATE[name] ?? name;
}

function isPrivileged(p: BookPosition): boolean {
  return p.assetType === "Govt Bills" || SOVEREIGN.test(p.counterparty) || p.rating === "SOVEREIGN";
}

export function isDailyLiquidAsset(p: BookPosition, asOf: string): boolean {
  const cal = calendarOfCcy(p.currency);
  const bd = businessDaysBetween(asOf, p.maturityDate, cal);
  if (p.assetType === "Cash / Bank Deposit" && bd <= 1) return true;
  if (p.assetType === "Reverse Repo") return true;
  if (p.assetType === "Govt Bills") return true;
  return bd <= 1;
}

export function isWeeklyLiquidAsset(p: BookPosition, asOf: string): boolean {
  if (isDailyLiquidAsset(p, asOf)) return true;
  const cal = calendarOfCcy(p.currency);
  return businessDaysBetween(asOf, p.maturityDate, cal) <= 5;
}

export function computeLiquidity(positions: BookPosition[], asOf: string): LiquidityResult {
  const aum = Math.max(positions.reduce((s, p) => s + p.amortizedCost, 0), 1);
  const dlaAmt = positions.filter((p) => isDailyLiquidAsset(p, asOf)).reduce((s, p) => s + p.amortizedCost, 0);
  const wlaAmt = positions.filter((p) => isWeeklyLiquidAsset(p, asOf)).reduce((s, p) => s + p.amortizedCost, 0);
  const dlaPct = (dlaAmt / aum) * 100;
  const wlaPct = (wlaAmt / aum) * 100;
  return {
    dlaAmt,
    wlaAmt,
    dlaPct: Number(dlaPct.toFixed(2)),
    wlaPct: Number(wlaPct.toFixed(2)),
    dlaOk: dlaPct >= DLA_FLOOR,
    wlaSfcOk: wlaPct >= WLA_SFC_FLOOR,
    wlaInternalOk: wlaPct >= WLA_INTERNAL_FLOOR,
  };
}

export function computeIssuerConcentration(positions: BookPosition[]): IssuerRow[] {
  const aum = Math.max(positions.reduce((s, p) => s + p.amortizedCost, 0), 1);
  const map = new Map<string, IssuerRow>();
  for (const p of positions) {
    const cur = map.get(p.counterparty) ?? {
      issuer: p.counterparty,
      group: groupOf(p.counterparty),
      amount: 0,
      weightPct: 0,
      depositAmt: 0,
      privileged: true,
      status: "PASS" as RuleStatus,
      hint: p.assetType,
    };
    cur.amount += p.amortizedCost;
    if (p.assetType === "Cash / Bank Deposit") cur.depositAmt += p.amortizedCost;
    if (!isPrivileged(p)) cur.privileged = false;
    map.set(p.counterparty, cur);
  }
  const groupDep = new Map<string, number>();
  for (const row of Array.from(map.values())) {
    groupDep.set(row.group, (groupDep.get(row.group) ?? 0) + row.depositAmt);
  }
  return Array.from(map.values())
    .map((row) => {
      const weightPct = (row.amount / aum) * 100;
      const depPct = (row.depositAmt / aum) * 100;
      const grpPct = ((groupDep.get(row.group) ?? 0) / aum) * 100;
      let status: RuleStatus = "PASS";
      if (!row.privileged && weightPct > ISSUER_LIMIT) status = "BREACH";
      if (row.depositAmt > 0 && depPct > ISSUER_LIMIT) status = "BREACH";
      if (grpPct > BANK_GROUP_LIMIT) status = "BREACH";
      if (status === "PASS" && !row.privileged && weightPct > ISSUER_LIMIT * 0.8) status = "WARN";
      return { ...row, weightPct: Number(weightPct.toFixed(2)), status };
    })
    .sort((a, b) => b.amount - a.amount);
}

export function runCompliance(positions: BookPosition[], asOf: string): ComplianceResult {
  const { wamDays, walDays } = computeWamWal(positions, asOf);
  const liquidity = computeLiquidity(positions, asOf);
  const issuers = computeIssuerConcentration(positions);
  const maxResidualDays = Math.max(0, ...positions.map((p) => walTenorDays(p, asOf)));
  const alerts: ComplianceResult["alerts"] = [];
  if (wamDays > WAM_CAP) {
    alerts.push({ id: "WAM", severity: "HIGH", rule: "WAM", title: `WAM ${wamDays.toFixed(1)}d 超过 60 天`, detail: "SFC 8.2 WAM ≤ 60", as_of: asOf });
  }
  if (walDays > WAL_CAP) {
    alerts.push({ id: "WAL", severity: "HIGH", rule: "WAL", title: `WAL ${walDays.toFixed(1)}d 超过 120 天`, detail: "SFC 8.2 WAL ≤ 120", as_of: asOf });
  }
  if (!liquidity.dlaOk) {
    alerts.push({ id: "DLA", severity: "HIGH", rule: "DLA", title: `DLA ${liquidity.dlaPct.toFixed(2)}% < 10%`, detail: "现金 + 1 个工作日到期 + 政府短债", as_of: asOf });
  }
  if (!liquidity.wlaSfcOk) {
    alerts.push({ id: "WLA", severity: "HIGH", rule: "WLA", title: `WLA ${liquidity.wlaPct.toFixed(2)}% < 15% SFC`, detail: "DLA + 5 个工作日内到期", as_of: asOf });
  } else if (!liquidity.wlaInternalOk) {
    alerts.push({ id: "WLA-INT", severity: "MEDIUM", rule: "WLA", title: `WLA ${liquidity.wlaPct.toFixed(2)}% 低于内控 20%`, detail: "SFC 底线 15% 已满足", as_of: asOf });
  }
  issuers
    .filter((i) => i.status !== "PASS")
    .forEach((i, n) => {
      alerts.push({
        id: `ISS-${n}`,
        severity: i.status === "BREACH" ? "HIGH" : "MEDIUM",
        rule: "ISSUER",
        title: `${i.issuer} 集中度 ${i.weightPct}%`,
        detail: i.privileged ? "主权豁免 / 银行存款集团限额 20%" : "单一商业主体 ≤ 10% NAV",
        as_of: asOf,
      });
    });
  return {
    liquidity,
    wamDays,
    walDays,
    wamOk: wamDays <= WAM_CAP,
    walOk: walDays <= WAL_CAP,
    maxResidualDays,
    maxResidualOk: maxResidualDays <= MAX_RESIDUAL,
    issuers,
    alerts,
  };
}
