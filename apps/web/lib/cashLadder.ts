import { num } from "@/lib/format";

export type CashEvent = {
  event_id: string;
  value_date: string;
  adjusted_date: string;
  rolled: boolean;
  calendar: string;
  kind: string;
  direction: string;
  amount: number | string;
  signed_amount: number | string;
  currency: string;
  security_id: string;
  name: string;
  counterparty: string;
  status: string;
  bucket_sfc: string;
  bucket_chart: string;
  days: number;
  notes: string;
};

export type DailyPack = {
  date: string;
  net: number | string;
  inflow: number | string;
  outflow: number | string;
  cumulative: number | string;
  event_count: number;
  holiday_hk: boolean;
  holiday_us: boolean;
  weekend: boolean;
  deficit: boolean;
  events: CashEvent[];
};

export type TimeBucketRow = {
  bucket: string;
  inflow: number | string;
  outflow: number | string;
  net: number | string;
  cumulative: number | string;
  maturity: number | string;
  coupon: number | string;
  subscription: number | string;
  dvp: number | string;
  redemption: number | string;
  fee: number | string;
};

export type CashLadderSnapshot = {
  as_of: string;
  fund_code: string;
  currency: string;
  opening_cash: number | string;
  available_cash: number | string;
  net_7d: number | string;
  reinvestment_3d: number | string;
  deficit: boolean;
  kpis: Record<string, string>;
  events: CashEvent[];
  days: DailyPack[];
  sfc_buckets: TimeBucketRow[];
  chart_buckets: TimeBucketRow[];
  dla_wla: {
    date: string;
    cash: number | string;
    dla_pct: number | string;
    wla_pct: number | string;
    dla_ok: boolean;
    wla_ok: boolean;
  }[];
  reinvest: {
    security_id: string;
    name: string;
    counterparty: string;
    asset_class: string;
    amount: number | string;
    adjusted_date: string;
    days: number;
    suggestion: string;
    workbench_href: string;
  }[];
  calendar_month: string;
  holidays: { date: string; label: string }[];
};

export function kindTone(kind: string): string {
  if (kind === "MATURITY") return "text-emerald-400";
  if (kind === "COUPON") return "text-sky-400";
  if (kind === "DVP") return "text-amber-400";
  if (kind === "REDEMPTION" || kind === "FEE") return "text-red-400";
  return "text-slate-300";
}

export function kindDot(kind: string): string {
  if (kind === "MATURITY") return "🟢";
  if (kind === "COUPON") return "🔵";
  if (kind === "DVP") return "🟠";
  return "⚪";
}

export const MOCK_CASH_LADDER: CashLadderSnapshot = {
  as_of: "2026-09-15",
  fund_code: "BAM-USD-MMF",
  currency: "USD",
  opening_cash: 15200000,
  available_cash: 15200000,
  net_7d: -5880397.26,
  reinvestment_3d: 60002695.89,
  deficit: true,
  kpis: { dla_status: "WATCH", gap_status: "DEFICIT" },
  events: [],
  days: [
    {
      date: "2026-09-15",
      net: 0,
      inflow: 0,
      outflow: 0,
      cumulative: 15200000,
      event_count: 0,
      holiday_hk: false,
      holiday_us: false,
      weekend: false,
      deficit: false,
      events: [],
    },
    {
      date: "2026-09-16",
      net: 42002695.89,
      inflow: 42002695.89,
      outflow: 0,
      cumulative: 57202695.89,
      event_count: 2,
      holiday_hk: false,
      holiday_us: false,
      weekend: false,
      deficit: false,
      events: [],
    },
    {
      date: "2026-09-17",
      net: -64000000,
      inflow: 18000000,
      outflow: 82000000,
      cumulative: -6797304.11,
      event_count: 3,
      holiday_hk: false,
      holiday_us: false,
      weekend: false,
      deficit: true,
      events: [],
    },
  ],
  sfc_buckets: [
    { bucket: "ON / T+0", inflow: 0, outflow: 0, net: 0, cumulative: 15200000, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "1D / T+1", inflow: 42000000, outflow: 0, net: 42000000, cumulative: 57200000, maturity: 42000000, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "2-7D / 1W", inflow: 26100000, outflow: 82000000, net: -55900000, cumulative: 1300000, maturity: 26000000, coupon: 115000, subscription: 8000000, dvp: 42000000, redemption: 40000000, fee: 0 },
    { bucket: "8-30D / 1M", inflow: 7160000, outflow: 185000, net: 6975000, cumulative: 8275000, maturity: 7000000, coupon: 164384, subscription: 0, dvp: 0, redemption: 0, fee: 185000 },
    { bucket: "31-90D / 3M", inflow: 25000000, outflow: 0, net: 25000000, cumulative: 33275000, maturity: 25000000, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "91-180D / 6M", inflow: 0, outflow: 0, net: 0, cumulative: 33275000, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: ">180D / 1Y", inflow: 0, outflow: 0, net: 0, cumulative: 33275000, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
  ],
  chart_buckets: [
    { bucket: "Today", inflow: 0, outflow: 0, net: 0, cumulative: 15200000, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "T+1", inflow: 42002695.89, outflow: 0, net: 42002695.89, cumulative: 57202695.89, maturity: 42002695.89, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "T+2", inflow: 18000000, outflow: 82000000, net: -64000000, cumulative: -6797304.11, maturity: 18000000, coupon: 0, subscription: 0, dvp: 42000000, redemption: 40000000, fee: 0 },
    { bucket: "T+3", inflow: 115000, outflow: 0, net: 115000, cumulative: -6682304.11, maturity: 0, coupon: 115000, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "1W", inflow: 16001906.85, outflow: 0, net: 16001906.85, cumulative: 9319602.74, maturity: 8001906.85, coupon: 0, subscription: 8000000, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "2W", inflow: 7164384, outflow: 0, net: 7164384, cumulative: 16483986.74, maturity: 7000000, coupon: 164384, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "1M", inflow: 28000000, outflow: 185000, net: 27815000, cumulative: 44298986.74, maturity: 28000000, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 185000 },
    { bucket: "2M", inflow: 25000000, outflow: 0, net: 25000000, cumulative: 69298986.74, maturity: 25000000, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "3M", inflow: 0, outflow: 0, net: 0, cumulative: 69298986.74, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
    { bucket: "6M+", inflow: 0, outflow: 0, net: 0, cumulative: 69298986.74, maturity: 0, coupon: 0, subscription: 0, dvp: 0, redemption: 0, fee: 0 },
  ],
  dla_wla: [
    { date: "2026-09-15", cash: 15200000, dla_pct: 47.67, wla_pct: 69.34, dla_ok: true, wla_ok: true },
    { date: "2026-09-16", cash: 57202695.89, dla_pct: 97.67, wla_pct: 104.34, dla_ok: true, wla_ok: true },
    { date: "2026-09-17", cash: -6797304.11, dla_pct: 9.34, wla_pct: 16.0, dla_ok: false, wla_ok: false },
  ],
  reinvest: [
    {
      security_id: "NCD-BOCHK-ROLL",
      name: "BOCHK 3M HKD NCD (rolling)",
      counterparty: "Bank of China",
      asset_class: "NCD",
      amount: 30000000,
      adjusted_date: "2026-09-16",
      days: 1,
      suggestion: "Bank of China 30m NCD 明日到期，建议续作 3M 以维持 WAM 达标",
      workbench_href: "/workbench?roll=1&assetClass=NCD&counterparty=Bank of China&notional=30000000&tenorPreset=3M",
    },
  ],
  calendar_month: "2026-09",
  holidays: [
    { date: "2026-09-25", label: "HK" },
    { date: "2026-10-01", label: "HK" },
  ],
};

export function monthGrid(month: string, packs: DailyPack[]) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (first.getUTCDay() + 6) % 7;
  const byDate = new Map(packs.map((p) => [p.date, p]));
  const cells: ({ day: number; iso: string; pack?: DailyPack } | null)[] = [];
  for (let i = 0; i < pad; i += 1) cells.push(null);
  for (let d = 1; d <= last; d += 1) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso, pack: byDate.get(iso) });
  }
  return cells;
}

export function chartRows(buckets: TimeBucketRow[]) {
  return buckets.map((b) => ({
    bucket: b.bucket,
    maturity: num(b.maturity) / 1e6,
    coupon: num(b.coupon) / 1e6,
    subscription: num(b.subscription) / 1e6,
    dvp: -num(b.dvp) / 1e6,
    redemption: -num(b.redemption) / 1e6,
    fee: -num(b.fee) / 1e6,
    cumulative: num(b.cumulative) / 1e6,
  }));
}
