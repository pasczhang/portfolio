"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MetricHeader } from "@/components/dashboard/MetricHeader";
import { CashLadderGrid } from "@/components/dashboard/CashLadderGrid";
import { WhatIfModal } from "@/components/dashboard/WhatIfModal";
import { Toast } from "@/components/dashboard/Toast";
import { AppShell } from "@/components/layout/AppShell";
import { useDesk } from "@/components/layout/DeskProvider";
import { Button } from "@/components/ui/button";
import type { WhatIfForm } from "@/types/workbench";
import { useWorkbench } from "@/hooks/useWorkbench";
import { HoldingsActions } from "@/components/holdings/HoldingsActions";

export function Workbench() {
  const { data, source, error, live, load, whatIf, whatIfBusy, whatIfError, committing, toast, runWhatIf, commitWhatIf, setWhatIf } =
    useWorkbench();
  const { dark, fund } = useDesk();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const rollForm = useMemo<Partial<WhatIfForm> | undefined>(() => {
    if (searchParams.get("roll") !== "1") return undefined;
    const assetClass = (searchParams.get("assetClass") as WhatIfForm["assetClass"]) || "NCD";
    return {
      listed: false,
      assetClass,
      counterparty: searchParams.get("counterparty") || "Bank of China",
      notional: searchParams.get("notional") || "30000000",
      tenorPreset: (searchParams.get("tenorPreset") as WhatIfForm["tenorPreset"]) || "3M",
      securityCode: "ROLL_REINVEST",
      securityName: `${searchParams.get("counterparty") || "Bank of China"} 滚动续作`,
      currency: (searchParams.get("currency") as "USD" | "HKD") || fund.ccy,
    };
  }, [searchParams, fund.ccy]);

  useEffect(() => {
    if (rollForm) setOpen(true);
  }, [rollForm]);

  return (
    <AppShell
      title="事前试算"
      subtitle={`${fund.name} · ${fund.shortName} · ${fund.ccy} Pre-Trade Compliance`}
      source={data ? source : undefined}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <HoldingsActions />
          <span className="hidden font-mono text-[10px] text-[hsl(var(--muted-foreground))] sm:inline">{data?.updated_at}</span>
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="accent" onClick={() => setOpen(true)}>
            投资试算
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      ) : null}
      {data ? <MetricHeader data={data} live={live} fundName={fund.name} fundCode={fund.code} ccy={fund.ccy} /> : <p className="text-xs text-[hsl(var(--muted-foreground))]">Loading blotter…</p>}
      {data ? <CashLadderGrid rows={data.cash_ladder} dark={dark} /> : null}

      <WhatIfModal
        open={open}
        onClose={() => {
          setOpen(false);
          setWhatIf(null);
        }}
        busy={whatIfBusy}
        committing={committing}
        error={whatIfError}
        result={whatIf}
        asOf={data?.as_of}
        initialForm={rollForm}
        onFormChange={runWhatIf}
        onCommit={async (form) => {
          const ok = await commitWhatIf(form);
          if (ok) {
            setOpen(false);
            setWhatIf(null);
          }
          return ok;
        }}
      />
      <Toast message={toast} />
    </AppShell>
  );
}
