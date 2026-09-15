export type Fund = {
  id: string;
  code: string;
  name: string;
  base_ccy: string;
  wam_limit_days: number;
  wal_limit_days: number;
  status: string;
};

export type WamWalResult = {
  fund_id: string;
  wam_days: string;
  wal_days: string;
  wam_limit_days: number;
  wal_limit_days: number;
  within_limit: boolean;
};
