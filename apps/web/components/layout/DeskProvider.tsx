"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PRODUCT_AS_OF } from "@/constants/calendar";
import { DEFAULT_FUND_ID, FUNDS, fundById, type CurrentFund, type FundCcy } from "@/constants/funds";

export type DeskRole = "maker" | "checker";
export type { CurrentFund, FundCcy };
export { FUNDS };

type DeskState = {
  fundId: string;
  fund: CurrentFund;
  asOf: string;
  role: DeskRole;
  dark: boolean;
  setFundId: (id: string) => void;
  setAsOf: (iso: string) => void;
  setRole: (role: DeskRole) => void;
  toggleTheme: () => void;
};

const DeskContext = createContext<DeskState | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [fundId, setFundIdState] = useState(DEFAULT_FUND_ID);
  const [role, setRole] = useState<DeskRole>("maker");
  const [dark, setDark] = useState(true);
  const [asOf, setAsOfState] = useState(PRODUCT_AS_OF);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("pms-theme");
    if (storedTheme === "light") setDark(false);
    const storedFund = window.localStorage.getItem("pms-fund");
    if (storedFund) {
      const resolved = fundById(storedFund);
      setFundIdState(resolved.id);
    }
    const storedRole = window.localStorage.getItem("pms-role");
    if (storedRole === "maker" || storedRole === "checker") setRole(storedRole);
    const storedAsOf = window.localStorage.getItem("pms-asof");
    if (storedAsOf && /^\d{4}-\d{2}-\d{2}$/.test(storedAsOf)) setAsOfState(storedAsOf);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("pms-theme", dark ? "dark" : "light");
  }, [dark]);

  function setFundId(id: string) {
    const resolved = fundById(id).id;
    setFundIdState(resolved);
    window.localStorage.setItem("pms-fund", resolved);
  }

  function setDeskRole(next: DeskRole) {
    setRole(next);
    window.localStorage.setItem("pms-role", next);
  }

  function setAsOf(iso: string) {
    setAsOfState(iso);
    window.localStorage.setItem("pms-asof", iso);
  }

  const value = useMemo<DeskState>(() => {
    const fund = fundById(fundId);
    return {
      fundId,
      fund,
      asOf,
      role,
      dark,
      setFundId,
      setAsOf,
      setRole: setDeskRole,
      toggleTheme: () => setDark((v) => !v),
    };
  }, [fundId, role, dark, asOf]);

  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk() {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error("useDesk must be used within DeskProvider");
  return ctx;
}

export function useFund() {
  return useDesk().fund;
}
