import { num } from "@/lib/format";

export type ChecklistRow = {
  metric: string;
  limit: string;
  actual: string;
  actual_num: number | string;
  status: string;
  period_min: string;
  period_max: string;
  note?: string;
};

export type ReportSnapshot = {
  as_of: string;
  period_start: string;
  fund_code: string;
  fund_name: string;
  manager?: string;
  manager_short?: string;
  isin: string;
  base_ccy: string;
  inception: string;
  morningstar: string;
  sp_rating: string;
  kpis: {
    aum: number | string;
    yield_7d: number | string;
    yield_30d: number | string;
    yield_ytd: number | string;
    wam_days: number | string;
    wal_days: number | string;
    dla_pct: number | string;
    wla_pct: number | string;
    illiquid_pct: number | string;
    accounting_nav: number | string;
    shadow_nav: number | string;
    deviation_bps: number | string;
    max_spread_bps: number | string;
    breach_count: number;
    units: number | string;
  };
  checklist: ChecklistRow[];
  exceptions: {
    id: string;
    severity: string;
    title: string;
    detail: string;
    exemption: boolean;
    approval: string;
  }[];
  top_issuers: { label: string; amount: number | string; weight_pct: number | string }[];
  allocation: { label: string; amount: number | string; weight_pct: number | string }[];
  maturity_profile: { label: string; amount: number | string; weight_pct: number | string }[];
  credit_quality: { label: string; amount: number | string; weight_pct: number | string }[];
  top_holdings: {
    rank: number;
    security_id: string;
    name: string;
    issuer: string;
    parent_group: string;
    asset_class: string;
    maturity_date: string;
    rating: string;
    weight_pct: number | string;
    amortized: number | string;
    shadow_mtm: number | string;
  }[];
  commentary: string;
  objective: string;
  disclaimer: string;
  sign_off: { officer: string; title: string; notes: string; signed_at: string; as_of: string } | null;
};

export const MOCK_REPORT: ReportSnapshot = {
  as_of: "2026-09-16",
  period_start: "2026-09-01",
  fund_code: "BAM-USD-MMF",
  fund_name: "Balance USD Money Market Fund",
  manager: "Balance Asset Management (Hong Kong) Limited",
  manager_short: "BALANCE ASSET MANAGEMENT",
  isin: "HK0000958888",
  base_ccy: "USD",
  inception: "2023-03-15",
  morningstar: "★★★★",
  sp_rating: "AAAf",
  kpis: {
    aum: 104904200,
    yield_7d: 4.34,
    yield_30d: 4.52,
    yield_ytd: 4.11,
    wam_days: 16.4,
    wal_days: 26.7,
    dla_pct: 68.57,
    wla_pct: 76.19,
    illiquid_pct: 0,
    accounting_nav: 1,
    shadow_nav: 1.0004,
    deviation_bps: 4,
    max_spread_bps: 10.4,
    breach_count: 0,
    units: 104904200,
  },
  checklist: [
    { metric: "WAM", limit: "≤ 60 Days", actual: "16.4 Days", actual_num: 16.4, status: "PASS", period_min: "12.2D", period_max: "19.5D" },
    { metric: "WAL", limit: "≤ 120 Days", actual: "26.7 Days", actual_num: 26.7, status: "PASS", period_min: "20.7D", period_max: "32.2D" },
    { metric: "DLA", limit: "≥ 10%", actual: "68.57%", actual_num: 68.57, status: "PASS", period_min: "66.77%", period_max: "70.97%" },
    { metric: "WLA", limit: "≥ 20%", actual: "76.19%", actual_num: 76.19, status: "PASS", period_min: "73.99%", period_max: "77.79%", note: "申报口径 ≥20%" },
    { metric: "单一实体/母集团集中度", limit: "≤ 10%（合资格定存 ≤20%）", actual: "14.30% max", actual_num: 14.3, status: "BREACH", period_min: "13.10%", period_max: "15.10%" },
    { metric: "逆回购/衍生品杠杆", limit: "≤ 10%", actual: "4.77%", actual_num: 4.77, status: "PASS", period_min: "0.00%", period_max: "4.77%" },
    { metric: "影子偏离度 |Deviation|", limit: "≤ 50 bps", actual: "4.0 bps", actual_num: 4, status: "PASS", period_min: "-10.4 bps", period_max: "4.0 bps" },
    { metric: "非流动资产", limit: "< 10%", actual: "0.00%", actual_num: 0, status: "PASS", period_min: "0.00%", period_max: "0.00%" },
  ],
  exceptions: [
    {
      id: "EX-BOC",
      severity: "BREACH",
      title: "Bank of China Ltd 穿透集中度 14.30% 超过 10%",
      detail: "非定存主体适用 10% 单一发行人上限。",
      exemption: false,
      approval: "Pending",
    },
    {
      id: "EX-TD-20",
      severity: "WATCH",
      title: "HSBC Holdings plc 定存集中度 11.44%",
      detail: "合资格银行存款适用 20% 特许上限。已取得董事会/合规审批备案。",
      exemption: true,
      approval: "Board / Compliance file 2026-Q3-04",
    },
  ],
  top_issuers: [
    { label: "United States Treasury", amount: 27940000, weight_pct: 26.63 },
    { label: "Bank of China Ltd", amount: 15000000, weight_pct: 14.3 },
    { label: "HSBC Holdings plc", amount: 12000000, weight_pct: 11.44 },
    { label: "Industrial and Commercial Bank of China", amount: 9975000, weight_pct: 9.51 },
    { label: "Standard Chartered plc", amount: 8001200, weight_pct: 7.63 },
  ],
  allocation: [
    { label: "T-Bills", amount: 34928000, weight_pct: 33.3 },
    { label: "Cash & Equiv.", amount: 25000000, weight_pct: 23.83 },
    { label: "NCD", amount: 24975000, weight_pct: 23.81 },
    { label: "Term Deposits", amount: 20001200, weight_pct: 19.07 },
  ],
  maturity_profile: [
    { label: "Overnight", amount: 37000000, weight_pct: 35.27 },
    { label: "1-7D", amount: 8001200, weight_pct: 7.63 },
    { label: "8-30D", amount: 34928000, weight_pct: 33.3 },
    { label: "31-90D", amount: 24975000, weight_pct: 23.81 },
  ],
  credit_quality: [
    { label: "Cash & Sovereign (AAA/AA+)", amount: 59928000, weight_pct: 57.13 },
    { label: "Tier 1 (A-1+ / P-1)", amount: 20001200, weight_pct: 19.07 },
    { label: "Tier 2 (A-1)", amount: 24975000, weight_pct: 23.81 },
  ],
  top_holdings: [
    { rank: 1, security_id: "TB-UST-4W", name: "US Treasury Bill 4W", issuer: "US Treasury", parent_group: "United States Treasury", asset_class: "T-Bill", maturity_date: "2026-10-06", rating: "A-1+", weight_pct: 26.63, amortized: 27940000, shadow_mtm: 27986000 },
    { rank: 2, security_id: "NCD-BOC-60", name: "Bank of China NCD FRN", issuer: "Bank of China", parent_group: "Bank of China Ltd", asset_class: "NCD", maturity_date: "2026-11-14", rating: "A-1", weight_pct: 14.3, amortized: 15000000, shadow_mtm: 15005000 },
    { rank: 3, security_id: "TD-HSBC-ON", name: "HSBC Overnight Time Deposit", issuer: "HSBC", parent_group: "HSBC Holdings plc", asset_class: "TD", maturity_date: "2026-09-16", rating: "A-1+", weight_pct: 11.44, amortized: 12000000, shadow_mtm: 12001200 },
    { rank: 4, security_id: "NCD-ICBC-45", name: "ICBC Negotiable CD", issuer: "ICBC", parent_group: "Industrial and Commercial Bank of China", asset_class: "NCD", maturity_date: "2026-10-30", rating: "A-1", weight_pct: 9.51, amortized: 9975000, shadow_mtm: 9962000 },
    { rank: 5, security_id: "TD-SCB-7D", name: "Standard Chartered 7D Time Deposit", issuer: "Standard Chartered", parent_group: "Standard Chartered plc", asset_class: "TD", maturity_date: "2026-09-22", rating: "A-1+", weight_pct: 7.63, amortized: 8001200, shadow_mtm: 8000800 },
    { rank: 6, security_id: "TB-HKMA-2W", name: "HKMA Exchange Fund Bill 14D", issuer: "HKMA", parent_group: "Hong Kong SAR Government", asset_class: "T-Bill", maturity_date: "2026-09-29", rating: "A-1+", weight_pct: 6.66, amortized: 6988000, shadow_mtm: 6991000 },
  ],
  commentary:
    "期内美元短端利率维持高位。组合超配美债与隔夜定存以锁定 DLA，并以大型银行存单滚动补足收益。",
  objective:
    "在保持本金安全与高流动性的前提下，获取超越港币/美元短期银行存款的稳定收益。",
  disclaimer:
    "投资涉及风险，包括可能损失本金。本基金并非银行存款，不受香港存款保障计划保障。过往表现并不预示未来结果。本文件由 Balance Asset Management (Hong Kong) Limited 发行，仅供机构投资者参考，不构成要约、招揽或投资建议。© 2026 Balance Asset Management. All rights reserved.",
  sign_off: null,
};

export function reportToCsv(snap: ReportSnapshot): string {
  const lines = [
    `manager,${csvCell(snap.manager || "Balance Asset Management (Hong Kong) Limited")}`,
    `manager_short,${csvCell(snap.manager_short || "BALANCE ASSET MANAGEMENT")}`,
    `fund_code,${csvCell(snap.fund_code)}`,
    `fund_name,${csvCell(snap.fund_name)}`,
    `as_of,${csvCell(snap.as_of)}`,
    "",
    "section,item,limit,actual,status,period_min,period_max",
  ];
  for (const row of snap.checklist) {
    lines.push(["checklist", row.metric, row.limit, row.actual, row.status, row.period_min, row.period_max].map(csvCell).join(","));
  }
  lines.push("", "rank,security_id,name,issuer,parent_group,asset_class,maturity,rating,weight_pct,amortized,shadow_mtm");
  for (const h of snap.top_holdings) {
    lines.push(
      [h.rank, h.security_id, h.name, h.issuer, h.parent_group, h.asset_class, h.maturity_date, h.rating, h.weight_pct, h.amortized, h.shadow_mtm]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  }
  return `\ufeff${lines.join("\n")}`;
}

function csvCell(value: string) {
  if (value.includes(",") || value.includes('"')) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function downloadText(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const PIE_COLORS = ["#f59e0b", "#38bdf8", "#34d399", "#818cf8", "#f87171", "#94a3b8"];
export function pieData(rows: ReportSnapshot["allocation"]) {
  return rows.map((r) => ({ name: r.label, value: num(r.weight_pct) }));
}
