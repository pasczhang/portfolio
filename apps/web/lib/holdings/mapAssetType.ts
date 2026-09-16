import { SFC_ASSET_TYPES, type SfcAssetType } from "@/lib/holdings/types";

const ALIASES: Record<string, SfcAssetType> = {
  "cash / bank deposit": "Cash / Bank Deposit",
  cash: "Cash / Bank Deposit",
  "bank deposit": "Cash / Bank Deposit",
  deposit: "Cash / Bank Deposit",
  td: "Cash / Bank Deposit",
  "term deposit": "Cash / Bank Deposit",
  "time deposit": "Cash / Bank Deposit",
  overnight: "Cash / Bank Deposit",
  "govt bills": "Govt Bills",
  "govt bill": "Govt Bills",
  government: "Govt Bills",
  "t-bill": "Govt Bills",
  tbill: "Govt Bills",
  "t bill": "Govt Bills",
  ust: "Govt Bills",
  efb: "Govt Bills",
  "exchange fund bill": "Govt Bills",
  "exchange fund bills": "Govt Bills",
  ncd: "NCD",
  cd: "NCD",
  "negotiable cd": "NCD",
  "negotiable certificate of deposit": "NCD",
  "commercial paper": "Commercial Paper",
  cp: "Commercial Paper",
  "reverse repo": "Reverse Repo",
  repo: "Reverse Repo",
  rr: "Reverse Repo",
  "fed repo": "Reverse Repo",
};

export function mapSfcAssetType(value: string): SfcAssetType | null {
  const key = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!key) return null;
  if ((SFC_ASSET_TYPES as readonly string[]).includes(value.trim())) return value.trim() as SfcAssetType;
  return ALIASES[key] ?? null;
}

export function productTypeOf(assetType: SfcAssetType): string {
  if (assetType === "Govt Bills") return "T-Bill";
  if (assetType === "NCD") return "NCD";
  if (assetType === "Commercial Paper") return "CP";
  if (assetType === "Reverse Repo") return "Repo";
  return "TD";
}
