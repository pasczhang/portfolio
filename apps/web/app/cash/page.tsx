"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moneyFull, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function CashPositionPage() {
  const { fund } = useDesk();
  const { cashPosition: snap, cashAdj, applyCashAdj, source, aum } = useBook();
  const [open, setOpen] = useState(false);
  const warn = !snap.excessOk;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    applyCashAdj({
      t0Subscription: Number(fd.get("t0Subscription") || 0),
      t0Redemption: Number(fd.get("t0Redemption") || 0),
      t1Subscription: Number(fd.get("t1Subscription") || 0),
      t1Redemption: Number(fd.get("t1Redemption") || 0),
    });
    setOpen(false);
  }

  return (
    <AppShell
      title="头寸计算 · Cash Position"
      subtitle={`${fund.name} · T+0 / T+1 可用现金引擎 · NAV ${moneyFull(aum, fund.ccy)}`}
      source={source}
      actions={
        <Button variant="accent" onClick={() => setOpen(true)}>
          一键模拟录入申赎款
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="T+0 实时可用现金"
          hint="期初托管现金 + 今日到期本息 + 今日 T+0 净申购 − 今日已确认买入交收"
          value={moneyFull(snap.t0Available, fund.ccy)}
          warn={snap.t0Available < 0}
        />
        <Kpi
          label="T+1 预估可用资金"
          hint="T+0 可用 + T+1 到期资产 + T+1 预估净申购 − T+1 预定交收出款"
          value={moneyFull(snap.t1Available, fund.ccy)}
          warn={snap.t1Available < 0}
        />
        <Kpi
          label="今日净申赎"
          hint="T+0 申购划款 − 赎回出款"
          value={signedMoney(snap.netSubT0, fund.ccy)}
          warn={snap.netSubT0 < 0}
        />
        <Kpi
          label="超额流动性状态"
          hint="T+0 或 T+1 为负数则红色预警"
          value={warn ? "SHORTFALL" : "EXCESS OK"}
          warn={warn}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FlowTable title="资金流入项 · Inflows" rows={snap.inflows} ccy={fund.ccy} positive />
        <FlowTable title="资金流出项 · Outflows" rows={snap.outflows} ccy={fund.ccy} positive={false} />
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-4">
            <h2 className="mb-3 text-sm font-semibold">模拟录入申赎款</h2>
            <form className="space-y-3" onSubmit={onSubmit}>
              <Field name="t0Subscription" label={`T+0 申购 (${fund.ccy})`} defaultValue={cashAdj.t0Subscription} />
              <Field name="t0Redemption" label={`T+0 赎回 (${fund.ccy})`} defaultValue={cashAdj.t0Redemption} />
              <Field name="t1Subscription" label={`T+1 预估申购 (${fund.ccy})`} defaultValue={cashAdj.t1Subscription} />
              <Field name="t1Redemption" label={`T+1 预估赎回 (${fund.ccy})`} defaultValue={cashAdj.t1Redemption} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button type="submit" variant="accent">
                  刷新 T+0 / T+1
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <label className="block space-y-1">
      <Label>{label}</Label>
      <Input name={name} type="number" step="0.01" defaultValue={defaultValue} required />
    </label>
  );
}

function Kpi({ label, hint, value, warn }: { label: string; hint: string; value: string; warn?: boolean }) {
  return (
    <Card className={cn("p-3", warn && "border-red-500/70 bg-red-950/40")}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", warn && "text-red-300")}>{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-[hsl(var(--muted-foreground))]">{hint}</p>
    </Card>
  );
}

function FlowTable({
  title,
  rows,
  ccy,
  positive,
}: {
  title: string;
  rows: { id: string; label: string; detail: string; amount: number }[];
  ccy: "USD" | "HKD";
  positive: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs">{moneyFull(total, ccy)}</span>
      </div>
      <table className="w-full text-left text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[hsl(var(--border))]">
              <td className="px-3 py-2">
                <p>{r.label}</p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{r.detail}</p>
              </td>
              <td className={cn("px-3 py-2 text-right font-mono tabular-nums", positive ? "text-emerald-400" : "text-rose-300")}>
                {positive ? "+" : "−"}
                {moneyFull(r.amount, ccy)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
