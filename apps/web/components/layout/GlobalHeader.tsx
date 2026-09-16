"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Moon, Sun, UserRound } from "lucide-react";
import { FUNDS, useDesk } from "@/components/layout/DeskProvider";
import { useBook } from "@/components/layout/BookProvider";
import { cn } from "@/lib/utils";
import { num } from "@/lib/format";

const TABS = [
  { href: "/workbench", zh: "事前试算", en: "Pre-Trade Compliance", badge: "8.2" },
  { href: "/nav", zh: "双轨估值", en: "Dual-Track Valuation", badge: "NAV" },
  { href: "/ladder", zh: "现金流日历", en: "Cash Ladder", badge: "T+0" },
  { href: "/reports", zh: "合规与报表", en: "SFC Reports & Factsheet", badge: "A4" },
];

const MORE = [
  { href: "/portfolio", label: "Holdings" },
  { href: "/trading", label: "Trade Blotter" },
  { href: "/analytics", label: "Analytics" },
  { href: "/compliance", label: "SFC Desk" },
  { href: "/funds", label: "Funds" },
];

type AlertItem = { id: string; title: string; severity: string };

function spreadClass(bps: number) {
  const abs = Math.abs(bps);
  if (abs > 50) return "text-red-400 animate-pulse";
  if (abs >= 25) return "text-amber-400";
  return "text-emerald-400";
}

function wlaClass(pct: number) {
  return pct >= 20 ? "text-emerald-400" : "text-red-400";
}

export function GlobalHeader() {
  const pathname = usePathname();
  const { fund, fundId, setFundId, asOf, role, setRole, dark, toggleTheme } = useDesk();
  const { metrics, compliance, origin } = useBook();
  const spread = num(metrics.deviationBps);
  const wla = num(metrics.wlaPct);
  const feedSource = origin === "import" ? "import" : "mock";
  const alerts = compliance.alerts.map((a) => ({ id: a.id, title: a.title, severity: a.severity }));
  const [openAlerts, setOpenAlerts] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const [openMore, setOpenMore] = useState(false);
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (!wrap.current?.contains(ev.target as Node)) {
        setOpenAlerts(false);
        setOpenUser(false);
        setOpenMore(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const alertCount = alerts.length;

  return (
    <header
      ref={wrap}
      className="print:hidden sticky top-0 z-40 grid h-14 grid-cols-[minmax(220px,1.1fr)_auto_minmax(240px,1fr)] items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/workbench" className="flex shrink-0 items-center gap-2">
          <Image
            src="/brand/balance-mark.png"
            alt="Balance Asset Management"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md object-cover ring-1 ring-white/10"
            priority
          />
          <span className="hidden leading-tight sm:block">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-amber-500">Balance</span>
            <span className="block text-xs font-semibold">Fixed Income PMS</span>
          </span>
        </Link>
        <span className="hidden h-8 w-px bg-[hsl(var(--border))] sm:block" />
        <div className="min-w-0">
          <select
            className="h-8 max-w-full truncate rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-[11px]"
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
            aria-label="Fund selector"
          >
            {FUNDS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
            As-of {asOf}
            <span
              className={cn(
                "rounded border px-1",
                feedSource === "import"
                  ? "border-sky-500/40 text-sky-400"
                  : "border-amber-500/40 text-amber-400",
              )}
            >
              {feedSource === "import" ? "IMPORTED" : "SAMPLE"}
            </span>
            <span className="hidden lg:inline">{fund.shortName}</span>
          </p>
        </div>
      </div>

      <nav className="flex h-14 items-stretch justify-center gap-0.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || (tab.href === "/workbench" && pathname === "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex min-w-[92px] flex-col items-center justify-center border-b-2 px-2 text-center",
                active
                  ? "border-amber-500 bg-amber-500/10 text-amber-300"
                  : "border-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]",
              )}
            >
              <span className="flex items-center gap-1 text-[11px] font-medium">
                {tab.zh}
                <span className="rounded bg-[hsl(var(--muted))] px-1 font-mono text-[9px]">{tab.badge}</span>
              </span>
              <span className="hidden text-[9px] opacity-70 xl:block">{tab.en}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-end gap-2">
        <div className="hidden items-center gap-1.5 font-mono text-[10px] lg:flex">
          <span className={cn("rounded border border-[hsl(var(--border))] px-1.5 py-0.5", spreadClass(spread))}>
            Spread: {spread >= 0 ? "+" : ""}
            {spread.toFixed(1)} bps
          </span>
          <span className={cn("rounded border border-[hsl(var(--border))] px-1.5 py-0.5", wlaClass(wla))}>
            WLA: {wla.toFixed(1)}%
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-0.5 rounded-md border border-[hsl(var(--border))] px-2 py-1 text-[10px]"
            onClick={() => {
              setOpenMore((v) => !v);
              setOpenAlerts(false);
              setOpenUser(false);
            }}
          >
            更多
            <ChevronDown className="h-3 w-3" />
          </button>
          {openMore ? (
            <div className="absolute right-0 top-10 z-50 w-44 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[11px] shadow-xl">
              {MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block py-1 hover:text-amber-400"
                  onClick={() => setOpenMore(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            className="relative rounded-md border border-[hsl(var(--border))] p-1.5"
            aria-label="Alert center"
            onClick={() => setOpenAlerts((v) => !v)}
          >
            <Bell className="h-3.5 w-3.5" />
            {alertCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-red-500 px-1 text-center font-mono text-[9px] text-white">
                {alertCount}
              </span>
            ) : null}
          </button>
          {openAlerts ? (
            <div className="absolute right-0 top-10 z-50 w-72 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-xl">
              <p className="mb-1 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">未处理预警</p>
              {(alerts.length ? alerts : [{ id: "empty", title: "暂无未处理预警", severity: "ok" }]).map(
                (a) => (
                  <p key={a.id} className="border-t border-[hsl(var(--border))] py-1.5 text-[11px]">
                    {a.title}
                  </p>
                ),
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-md border border-[hsl(var(--border))] px-2 py-1 font-mono text-[10px]"
          onClick={() => setRole(role === "maker" ? "checker" : "maker")}
        >
          {role === "maker" ? "[PM - Maker]" : "[Risk - Checker]"}
        </button>
        <button type="button" className="rounded-md border border-[hsl(var(--border))] p-1.5" onClick={toggleTheme} aria-label="Toggle theme">
          {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <div className="relative">
          <button type="button" className="rounded-md border border-[hsl(var(--border))] p-1.5" onClick={() => setOpenUser((v) => !v)}>
            <UserRound className="h-3.5 w-3.5" />
          </button>
          {openUser ? (
            <div className="absolute right-0 top-10 z-50 w-52 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[11px] shadow-lg">
              <p className="font-medium">Desk User</p>
              <p className="text-[hsl(var(--muted-foreground))]">{fund.name}</p>
              <p className="mt-1 font-mono">
                {fund.code} · {fund.ccy} · session {feedSource === "import" ? "IMPORTED" : "SAMPLE"}
              </p>
              <div className="mt-2 border-t border-[hsl(var(--border))] pt-2">
                {MORE.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block py-1 hover:text-amber-400"
                    onClick={() => setOpenUser(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
