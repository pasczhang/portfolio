"use client";

import { HoldingsGrid } from "@/components/grid/HoldingsGrid";
import { HoldingsActions } from "@/components/holdings/HoldingsActions";
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { useHoldings } from "@/hooks/useHoldings";
import { money } from "@/lib/format";

export default function PortfolioPage() {
  const { data, holdings, source } = useHoldings();
  const { fund } = useDesk();

  return (
    <AppShell
      title="Holdings"
      subtitle={`${fund.name} · 资产代码 · TD/NCD/T-Bill · 摊余成本 / 影子估值`}
      source={source}
      actions={<HoldingsActions />}
    >
      <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
        {data ? `${fund.code} · as of ${data.as_of} · securities ${money(data.aum_securities, fund.ccy)}` : "—"}
      </p>
      <HoldingsGrid rows={holdings} />
    </AppShell>
  );
}
