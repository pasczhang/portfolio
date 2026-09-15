export type FundCcy = "USD" | "HKD";
export type FundStatus = "active" | "suspended";

export interface FundProfile {
  id: string;
  code: string;
  name: string;
  currency: FundCcy;
  status: FundStatus;
  wamLimit: string;
  walLimit: string;
  manager: string;
  shortName: string;
  symbol: "$" | "HK$";
  inception: string;
  isin: string;
  managerShort: string;
  wamLimitDays: number;
  walLimitDays: number;
}

/** Desk binding alias — same record as FundProfile plus `ccy`. */
export type CurrentFund = FundProfile & { ccy: FundCcy };

export const MANAGER_LEGAL = "Balance Asset Management (Hong Kong) Limited";
export const MANAGER_SHORT = "BALANCE ASSET MANAGEMENT";

export const FUND_LIST: FundProfile[] = [
  {
    id: "bam-usd-mmf",
    code: "BAM-USD-MMF",
    name: "Balance USD Money Market Fund",
    currency: "USD",
    status: "active",
    wamLimit: "WAM ≤ 60d",
    walLimit: "WAL ≤ 120d",
    manager: MANAGER_LEGAL,
    shortName: "BAM USD MMF",
    symbol: "$",
    inception: "2023-03-15",
    isin: "HK0000958888",
    managerShort: MANAGER_SHORT,
    wamLimitDays: 60,
    walLimitDays: 120,
  },
  {
    id: "bam-hkd-mmf",
    code: "BAM-HKD-MMF",
    name: "Balance HKD Money Market Fund",
    currency: "HKD",
    status: "active",
    wamLimit: "WAM ≤ 60d",
    walLimit: "WAL ≤ 120d",
    manager: MANAGER_LEGAL,
    shortName: "BAM HKD MMF",
    symbol: "HK$",
    inception: "2021-06-01",
    isin: "HK0000961012",
    managerShort: MANAGER_SHORT,
    wamLimitDays: 60,
    walLimitDays: 120,
  },
];

export const DEFAULT_FUND_ID = FUND_LIST[0].id;

const LEGACY_IDS: Record<string, string> = {
  "usd-mmf": "bam-usd-mmf",
  "hkd-mmf": "bam-hkd-mmf",
  "usd-cash": "bam-usd-mmf",
};

export function hydrateFund(profile: FundProfile): CurrentFund {
  return { ...profile, ccy: profile.currency };
}

export const FUNDS: CurrentFund[] = FUND_LIST.map(hydrateFund);

export function resolveFundId(id: string): string {
  return LEGACY_IDS[id] ?? id;
}

export function fundById(id: string): CurrentFund {
  const resolved = resolveFundId(id);
  const profile = FUND_LIST.find((f) => f.id === resolved) ?? FUND_LIST[0];
  return hydrateFund(profile);
}
