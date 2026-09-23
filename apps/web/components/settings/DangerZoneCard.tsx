"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { ResetFundModal } from "@/components/settings/ResetFundModal";

export function DangerZoneCard() {
  const { fund } = useDesk();
  const { cashPositions, metrics } = useBook();
  const [open, setOpen] = useState(false);
  const cashNow = cashPositions.reduce((s, p) => s + p.amortizedCost, 0) || metrics.cash || 0;

  return (
    <>
      <Card className="border-red-500/50 bg-red-950/15 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-300">
              <AlertTriangle className="h-4 w-4" />
              危险区域 · Danger Zone
            </p>
            <p className="mt-1 max-w-2xl text-[12px] text-[hsl(var(--muted-foreground))]">
              将 <span className="font-mono text-red-200">{fund.code}</span>{" "}
              重置到成立状态：清空证券持仓、交易流水与估值历史，仅保留托管活期。此操作不可撤销。
            </p>
          </div>
          <Button type="button" variant="danger" onClick={() => setOpen(true)}>
            初始化基金数据 / Reset Fund
          </Button>
        </div>
      </Card>
      {open ? <ResetFundModal defaultCash={cashNow} onClose={() => setOpen(false)} onSuccess={() => setOpen(false)} /> : null}
    </>
  );
}
