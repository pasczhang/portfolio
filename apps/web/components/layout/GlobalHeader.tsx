"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Calculator,
  LineChart,
  Moon,
  PieChart,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Wallet,
  Workflow,
  KeyRound,
  LogOut,
} from "lucide-react";
import { FUNDS, useDesk } from "@/components/layout/DeskProvider";
import { useBook } from "@/components/layout/BookProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABEL } from "@/lib/auth/users";
import { ChangePasswordModal } from "@/components/auth/ChangePasswordModal";
import { CenteredModal } from "@/components/ui/CenteredModal";
import { LocalDataNotice } from "@/components/persist/LocalDataNotice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { num } from "@/lib/format";

const TABS: {
  href: string;
  zh: string;
  en: string;
  badge?: string;
  Icon: ComponentType<{ className?: string }>;
  match?: string[];
}[] = [
  { href: "/cash", zh: "头寸计算", en: "Cash Position", badge: "T+0/T+1", Icon: Wallet },
  { href: "/analysis", zh: "持仓明细", en: "Holdings", badge: "% of NAV", Icon: PieChart, match: ["/portfolio", "/holdings"] },
  { href: "/analytics", zh: "分析看板", en: "Analytics", badge: "Stress", Icon: LineChart },
  { href: "/trading", zh: "交易记录", en: "Trade Records", badge: "Blotter", Icon: ScrollText },
  { href: "/workbench", zh: "事前试算", en: "Pre-Trade", badge: "What-if", Icon: Calculator },
  { href: "/nav", zh: "双轨估值", en: "Dual Valuation", badge: "NAV", Icon: Scale },
  { href: "/ops", zh: "运营台", en: "Ops Desk", badge: "EOD", Icon: Workflow },
  {
    href: "/compliance",
    zh: "SFC合规台",
    en: "SFC Desk",
    badge: "8.2",
    Icon: ShieldCheck,
    match: ["/reports"],
  },
  { href: "/funds", zh: "多基金总览", en: "Funds", badge: "USD/HKD", Icon: Building2 },
  { href: "/settings", zh: "系统设置", en: "Settings", badge: "Fund", Icon: Settings },
];

type AlertItem = { id: string; title: string; severity: string };

function spreadClass(bps: number) {
  const abs = Math.abs(bps);
  if (abs > 50) return "border-red-500/50 text-red-400 animate-pulse";
  if (abs >= 25) return "border-amber-500/50 text-amber-400";
  return "border-emerald-500/40 text-emerald-400";
}

function wlaClass(pct: number) {
  if (pct >= 20) return "border-emerald-500/40 text-emerald-400";
  if (pct >= 15) return "border-amber-500/50 text-amber-400";
  return "border-red-500/50 text-red-400";
}

function wamClass(days: number) {
  return days <= 60 ? "border-emerald-500/40 text-emerald-400" : "border-red-500/50 text-red-400";
}

function walClass(days: number) {
  return days <= 120 ? "border-emerald-500/40 text-emerald-400" : "border-red-500/50 text-red-400";
}

export function GlobalHeader() {
  const pathname = usePathname();
  const { fund, fundId, setFundId, asOf, role, setRole, dark, toggleTheme } = useDesk();
  const { metrics, compliance, origin } = useBook();
  const { user, logout } = useAuth();
  const router = useRouter();
  const spread = num(metrics.deviationBps);
  const wla = num(metrics.wlaPct);
  const wam = num(metrics.wamDays);
  const feedSource = origin === "import" ? "import" : "mock";
  const alerts = compliance.alerts.map((a) => ({ id: a.id, title: a.title, severity: a.severity }));
  const [openAlerts, setOpenAlerts] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const [changePw, setChangePw] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (!wrap.current?.contains(ev.target as Node)) {
        setOpenAlerts(false);
        setOpenUser(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const alertCount = alerts.length;

  return (
    <header
      ref={wrap}
      className="print:hidden sticky top-0 z-40 flex h-14 items-stretch gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md"
    >
      <Link href="/cash" className="flex shrink-0 items-center gap-2 pr-1">
        <Image
          src="/brand/balance-mark.png"
          alt="Balance Asset Management"
          width={32}
          height={32}
          className="h-8 w-8 rounded-md object-cover ring-1 ring-white/10"
          priority
        />
        <span className="hidden leading-tight xl:block">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-amber-500">Balance</span>
          <span className="block text-xs font-semibold">Fixed Income PMS</span>
        </span>
      </Link>

      <nav className="flex min-w-0 flex-1 items-stretch justify-center overflow-x-auto">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            pathname.startsWith(`${tab.href}/`) ||
            (tab.href === "/workbench" && pathname === "/") ||
            Boolean(tab.match?.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-[78px] shrink-0 flex-col items-center justify-center border-b-2 px-1.5 text-center transition-colors",
                active
                  ? "border-amber-500 bg-amber-500/15 text-amber-200 shadow-[inset_0_-2px_0_0_rgb(245,158,11)]"
                  : "border-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-1 text-[11px] font-semibold">
                <tab.Icon className="h-3 w-3" />
                {tab.zh}
                {tab.badge ? (
                  <span className="rounded bg-[hsl(var(--muted))] px-1 font-mono text-[8px] font-normal">{tab.badge}</span>
                ) : null}
              </span>
              <span className="hidden text-[8px] font-normal opacity-70 2xl:block">{tab.en}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex overflow-hidden rounded-md border border-[hsl(var(--border))]" role="group" aria-label="Fund selector">
            {FUNDS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFundId(f.id)}
                className={cn(
                  "px-2 py-1 font-mono text-[10px] font-semibold",
                  fundId === f.id ? "bg-amber-500 text-black" : "bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]",
                )}
              >
                {f.ccy} Fund
              </button>
            ))}
          </div>
          <p className="hidden max-w-[160px] truncate font-mono text-[9px] text-[hsl(var(--muted-foreground))] lg:block">
            {fund.shortName} · {asOf} · {feedSource === "import" ? "IMPORTED" : "SAMPLE"}
          </p>
        </div>

        <div className="hidden items-center gap-1 font-mono text-[10px] lg:flex">
          <span className={cn("rounded border px-1.5 py-0.5", spreadClass(spread))}>
            {metrics.deviationStatus} {spread >= 0 ? "+" : ""}
            {spread.toFixed(1)} bps
          </span>
          <span className={cn("rounded border px-1.5 py-0.5", wlaClass(num(metrics.dlaPct)))}>
            DLA {num(metrics.dlaPct).toFixed(1)}%
          </span>
          <span className={cn("rounded border px-1.5 py-0.5", wlaClass(wla))}>WLA {wla.toFixed(1)}%</span>
          <span className={cn("rounded border px-1.5 py-0.5", wamClass(wam))}>WAM {wam.toFixed(1)}d</span>
          <span className={cn("rounded border px-1.5 py-0.5", walClass(num(metrics.walDays)))}>
            WAL {num(metrics.walDays).toFixed(1)}d
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            className="relative rounded-md border border-[hsl(var(--border))] p-1.5"
            aria-label="Alert center"
            onClick={() => {
              setOpenAlerts((v) => !v);
              setOpenUser(false);
            }}
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
              {(alerts.length ? alerts : [{ id: "empty", title: "暂无未处理预警", severity: "ok" } as AlertItem]).map(
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
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2 py-1"
            onClick={() => {
              setOpenUser((v) => !v);
              setOpenAlerts(false);
            }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-semibold text-amber-300">
              {(user?.displayName || user?.username || "U").slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[120px] truncate text-[11px] sm:inline">{user?.displayName || "Desk User"}</span>
          </button>
          {openUser ? (
            <div className="absolute right-0 top-10 z-50 w-56 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[11px] shadow-lg">
              <p className="font-medium">{user?.displayName}</p>
              <p className="font-mono text-[hsl(var(--muted-foreground))]">
                {user?.username} · {user ? ROLE_LABEL[user.role] : ""}
              </p>
              <p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                {fund.code} · {fund.ccy}
              </p>
              <LocalDataNotice compact className="mt-2" />
              <Link
                href="/settings"
                className="mt-2 block rounded px-1 py-1 text-amber-400 hover:bg-[hsl(var(--muted))]"
                onClick={() => setOpenUser(false)}
              >
                系统设置 / 基金管理 →
              </Link>
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-1.5 rounded px-1 py-1 hover:bg-[hsl(var(--muted))]"
                onClick={() => {
                  setOpenUser(false);
                  setChangePw(true);
                }}
              >
                <KeyRound className="h-3.5 w-3.5" />
                修改密码
              </button>
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-1.5 rounded px-1 py-1 text-red-300 hover:bg-red-500/15"
                onClick={() => {
                  setOpenUser(false);
                  setConfirmOut(true);
                }}
              >
                <LogOut className="h-3.5 w-3.5" />
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {changePw ? <ChangePasswordModal onClose={() => setChangePw(false)} /> : null}
      {confirmOut ? (
        <CenteredModal title="退出登录" onClose={() => setConfirmOut(false)} widthClass="max-w-sm">
          <p className="text-[12px] text-[hsl(var(--muted-foreground))]">确认退出当前会话？未保存的表单将丢失。</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOut(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                logout({ reason: "manual" });
                setConfirmOut(false);
                router.replace("/login");
              }}
            >
              确认退出
            </Button>
          </div>
        </CenteredModal>
      ) : null}
    </header>
  );
}
