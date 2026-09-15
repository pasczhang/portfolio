"use client";

import { HoldingsGrid } from "@/components/grid/HoldingsGrid";
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { useHoldings } from "@/hooks/useHoldings";
import { money } from "@/lib/format";

export default function PortfolioPage() {
  const { data, holdings, source, loading } = useHoldings();
  const { fund } = useDesk();

  return (
    <AppShell
      title="Holdings"
      subtitle={`${fund.name} · 资产代码 · TD/NCD/T-Bill · 摊余成本 / 影子估值`}
      source={source}
    >
      <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
        {data ? `${fund.code} · as of ${data.as_of} · securities ${money(data.aum_securities, fund.ccy)}` : "—"}
      </p>
      {loading ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading holdings…</p>
      ) : (
        <HoldingsGrid rows={holdings} />
      )}
    </AppShell>
  );
}
