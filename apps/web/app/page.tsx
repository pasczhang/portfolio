import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

const modules = [
  { href: "/workbench", label: "事前试算 · Pre-Trade Compliance" },
  { href: "/nav", label: "双轨估值 · Dual-Track Valuation" },
  { href: "/ladder", label: "现金流日历 · Cash Ladder" },
  { href: "/reports", label: "合规与报表 · SFC Reports & Factsheet" },
];

export default function HomePage() {
  return (
    <AppShell title="Balance Fixed Income PMS" subtitle="Hong Kong public money market fund · 选择主模块进入交易台">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((item) => (
          <li key={item.href}>
            <Link
              className="block rounded-lg border border-[hsl(var(--border))] p-4 hover:border-amber-500"
              href={item.href}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
