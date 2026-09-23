"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeCashPosition, DLA_FLOOR, WLA_FLOOR } from "@/lib/holdings/cashPosition";
import type { CashAdj, CashSimTrade } from "@/lib/holdings/trades";
import { defaultCashAdj, SIM_ASSET_KINDS, type SimAssetKind, type SimSettle } from "@/lib/holdings/trades";
import type { TaFlow } from "@/lib/services/types";
import { moneyFull, pctFmt, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import { usePermissions } from "@/lib/auth/usePermissions";

export default function CashPositionPage() {
  const { fund, asOf } = useDesk();
  const { canWrite } = usePermissions();
  const {
    cashPosition: snap,
    cashAdj,
    simTrades,
    positions,
    source,
    aum,
    taFlows,
    applyCashPlan,
    resetCashPlan,
    removeSimTrade,
  } = useBook();
  const [open, setOpen] = useState(false);
  const warn = !snap.excessOk;
  const base = useMemo(
    () => computeCashPosition(positions, [], defaultCashAdj(), asOf, [], taFlows),
    [positions, asOf, taFlows],
  );

  return (
    <AppShell
      title="头寸计算 · Cash Position"
      subtitle={`${fund.name} · 期初现金与持仓到期轧差 · NAV ${moneyFull(aum, fund.ccy)}`}
      source={source}
      actions={
        canWrite ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetCashPlan}>
            重置头寸试算
          </Button>
          <Button variant="accent" onClick={() => setOpen(true)}>
            头寸试算 · Cash What-If
          </Button>
        </div>
        ) : undefined
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="T+0 实时可用头寸"
          hint="期初现金 + 确认净申赎 + T+0 持仓到期 − T+0 买券 + T+0 卖券 − 费用"
          value={moneyFull(snap.t0Available, fund.ccy)}
          warn={snap.t0Available < 0}
        />
        <Kpi
          label="T+1 预估可用头寸"
          hint="T+0 结余 + T+1 到期 + T+1 申赎与拟交易交收"
          value={moneyFull(snap.t1Available, fund.ccy)}
          warn={snap.t1Available < 0}
        />
        <Kpi
          label="今日净申赎"
          hint="T+0 申购 − 赎回"
          value={signedMoney(snap.netSubT0, fund.ccy)}
          warn={snap.netSubT0 < 0}
        />
        <Kpi
          label="超额流动性"
          hint={`DLA ${pctFmt(snap.dlaPct)} · WLA ${pctFmt(snap.wlaPct)}`}
          value={warn ? "SHORTFALL" : "EXCESS OK"}
          warn={warn}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2">
          <h2 className="text-sm font-semibold">资金明细流水 · Cash Ledger</h2>
          <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
            {snap.ledger.length} 条 · as of {asOf}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[hsl(var(--muted))] font-mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="px-3 py-2">类型</th>
                <th className="px-3 py-2">对手方 / 渠道</th>
                <th className="px-3 py-2">交收</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2 text-right">流入 / 流出</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {snap.ledger.map((row) => (
                <tr key={row.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2">
                    {row.type}
                    {row.simulated ? (
                      <Badge tone="watch" className="ml-1">
                        试算模拟
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">{row.counterparty}</td>
                  <td className="px-3 py-2 font-mono">{row.settle}</td>
                  <td className="px-3 py-2 font-mono">{row.status}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono tabular-nums",
                      row.direction === "in" ? "text-emerald-400" : "text-rose-300",
                    )}
                  >
                    {row.direction === "in" ? "+" : "−"}
                    {moneyFull(row.amount, fund.ccy)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.simulated && simTrades.some((t) => t.id === row.id) ? (
                      <button type="button" className="text-[hsl(var(--muted-foreground))] hover:text-red-400" onClick={() => removeSimTrade(row.id)} aria-label="删除试算">
                        <Trash2 className="inline h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open ? (
        <WhatIfModal
          fundCcy={fund.ccy}
          base={base}
          applied={snap}
          initialAdj={cashAdj}
          initialSims={simTrades}
          positions={positions}
          asOf={asOf}
          taFlows={taFlows}
          onClose={() => setOpen(false)}
          onApply={(adj, sims) => {
            applyCashPlan(adj, sims);
            setOpen(false);
          }}
          onReset={() => {
            resetCashPlan();
            setOpen(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function WhatIfModal({
  fundCcy,
  base,
  applied,
  initialAdj,
  initialSims,
  positions,
  asOf,
  taFlows,
  onClose,
  onApply,
  onReset,
}: {
  fundCcy: "USD" | "HKD";
  base: ReturnType<typeof computeCashPosition>;
  applied: ReturnType<typeof computeCashPosition>;
  initialAdj: CashAdj;
  initialSims: CashSimTrade[];
  positions: Parameters<typeof computeCashPosition>[0];
  asOf: string;
  taFlows: TaFlow[];
  onClose: () => void;
  onApply: (adj: CashAdj, sims: CashSimTrade[]) => void;
  onReset: () => void;
}) {
  const [adj, setAdj] = useState<CashAdj>({ ...defaultCashAdj(), ...initialAdj });
  const [sims, setSims] = useState<CashSimTrade[]>(initialSims);
  const draft = useMemo(
    () => computeCashPosition(positions, [], adj, asOf, sims, taFlows),
    [positions, adj, asOf, sims, taFlows],
  );

  function patch(partial: Partial<CashAdj>) {
    setAdj((prev) => ({ ...prev, ...partial }));
  }

  function addSim() {
    setSims((prev) => [
      ...prev,
      {
        id: `SIM-${Date.now()}`,
        side: "Buy",
        assetKind: "NCD",
        name: "",
        amount: 0,
        settle: "T+0",
      },
    ]);
  }

  const t0Gap = draft.t0Available;
  const guidance =
    t0Gap >= 0
      ? "头寸充裕，可安排隔夜/7D 逆回购或买入短融存单"
      : "头寸不足，需提前安排正回购融资或调整卖券规模";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4">
      <Card className="my-6 w-full max-w-4xl p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">头寸试算录入与情景模拟</h2>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Cash What-If Simulation · 持仓到期只读锁定</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="mb-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">A. 申赎款与资金流向</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Num label={`T+0 申购 (+)`} value={adj.t0Subscription} onChange={(v) => patch({ t0Subscription: v })} />
            <Num label={`T+0 赎回 (−)`} value={adj.t0Redemption} onChange={(v) => patch({ t0Redemption: v })} />
            <Num label={`T+0 杂费 (−)`} value={adj.t0Expenses} onChange={(v) => patch({ t0Expenses: v })} />
            <Num label={`T+1 申购 (+)`} value={adj.t1Subscription} onChange={(v) => patch({ t1Subscription: v })} />
            <Num label={`T+1 赎回 (−)`} value={adj.t1Redemption} onChange={(v) => patch({ t1Redemption: v })} />
            <Num label={`T+1 杂费 (−)`} value={adj.t1Expenses} onChange={(v) => patch({ t1Expenses: v })} />
          </div>
        </section>

        <section className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">B. 债券 / 存单拟交易</h3>
            <Button variant="outline" onClick={addSim}>
              <Plus className="h-3 w-3" /> 添加一笔
            </Button>
          </div>
          {sims.length === 0 ? (
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">暂无拟交易。点击添加买入或卖出。</p>
          ) : (
            <div className="space-y-2">
              {sims.map((row, i) => (
                <div key={row.id} className="grid gap-2 rounded-md border border-[hsl(var(--border))] p-2 md:grid-cols-6">
                  <select
                    className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
                    value={row.side}
                    onChange={(e) => {
                      const side = e.target.value as "Buy" | "Sell";
                      setSims((prev) => prev.map((t, j) => (j === i ? { ...t, side } : t)));
                    }}
                  >
                    <option value="Buy">买入 Buy</option>
                    <option value="Sell">卖出 Sell</option>
                  </select>
                  <select
                    className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
                    value={row.assetKind}
                    onChange={(e) => {
                      const assetKind = e.target.value as SimAssetKind;
                      setSims((prev) => prev.map((t, j) => (j === i ? { ...t, assetKind } : t)));
                    }}
                  >
                    {SIM_ASSET_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="标的名称 / 代码"
                    value={row.name}
                    onChange={(e) => setSims((prev) => prev.map((t, j) => (j === i ? { ...t, name: e.target.value } : t)))}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="成交金额"
                    value={row.amount || ""}
                    onChange={(e) =>
                      setSims((prev) => prev.map((t, j) => (j === i ? { ...t, amount: Number(e.target.value) || 0 } : t)))
                    }
                  />
                  <select
                    className="h-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
                    value={row.settle}
                    onChange={(e) => {
                      const settle = e.target.value as SimSettle;
                      setSims((prev) => prev.map((t, j) => (j === i ? { ...t, settle } : t)));
                    }}
                  >
                    <option value="T+0">T+0 今日</option>
                    <option value="T+1">T+1 明日</option>
                  </select>
                  <Button variant="ghost" onClick={() => setSims((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
            C. 持仓到期自动流入（只读）
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <MaturityBox title={`T+0 到期本息 ${moneyFull(draft.t0Maturing, fundCcy)}`} rows={draft.maturitiesT0} ccy={fundCcy} />
            <MaturityBox title={`T+1 到期本息 ${moneyFull(draft.t1Maturing, fundCcy)}`} rows={draft.maturitiesT1} ccy={fundCcy} />
          </div>
        </section>

        <section className={cn("rounded-md border p-3", draft.t0Available < 0 && "border-red-500/70 bg-red-950/30")}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">试算前 vs 试算后</h3>
          <div className="grid gap-2 text-xs md:grid-cols-3">
            <p>
              T+0 结余：
              <span className="font-mono"> {moneyFull(base.t0Available, fundCcy)}</span>
              {" → "}
              <span className={cn("font-mono font-semibold", draft.t0Available < 0 && "text-red-300")}>
                {moneyFull(draft.t0Available, fundCcy)}
              </span>
            </p>
            <p>
              T+1 预估：
              <span className="font-mono"> {moneyFull(applied.t1Available, fundCcy)}</span>
              {" → "}
              <span className="font-mono font-semibold">{moneyFull(draft.t1Available, fundCcy)}</span>
            </p>
            <p>
              DLA / WLA：
              <span className={cn("font-mono", !draft.dlaOk && "text-red-300")}>{pctFmt(draft.dlaPct)}</span>
              {" / "}
              <span className={cn("font-mono", !draft.wlaOk && "text-red-300")}>{pctFmt(draft.wlaPct)}</span>
              <span className="text-[hsl(var(--muted-foreground))]">
                {" "}
                (SFC DLA {DLA_FLOOR}% / WLA {WLA_FLOOR}%，内控 WLA 20%)
              </span>
            </p>
          </div>
          <p className="mt-2 text-[11px]">{guidance}</p>
        </section>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onReset}>
            重置 / 清空
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="accent" onClick={() => onApply(adj, sims)}>
            应用到今日头寸
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <Label>{label}</Label>
      <Input type="number" min={0} step="0.01" value={value || 0} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

function MaturityBox({
  title,
  rows,
  ccy,
}: {
  title: string;
  rows: { securityId: string; name: string; counterparty: string; amount: number }[];
  ccy: "USD" | "HKD";
}) {
  return (
    <div className="rounded-md border border-[hsl(var(--border))] p-2">
      <p className="mb-1 text-xs font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">当日无持仓到期</p>
      ) : (
        <ul className="space-y-1 text-[11px]">
          {rows.map((r, i) => (
            <li key={`${r.securityId}#${i}`} className="flex justify-between gap-2">
              <span>
                {r.name}
                <span className="text-[hsl(var(--muted-foreground))]"> · {r.counterparty}</span>
              </span>
              <span className="font-mono text-emerald-400">+{moneyFull(r.amount, ccy)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
