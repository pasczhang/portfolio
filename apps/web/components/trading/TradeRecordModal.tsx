"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDesk } from "@/components/layout/DeskProvider";
import {
  SETTLEMENT_STATUSES,
  TRADE_SIDES,
  TRADE_SIDE_LABELS,
  suggestedTradeGross,
  type DeskTrade,
  type SettlementStatus,
  type TradeSide,
} from "@/lib/holdings/trades";
import { useFormDirty } from "@/lib/persist/dirty";

const selectClass =
  "h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:ring-1 focus:ring-amber-500/70";

type Draft = {
  tradeDate: string;
  settlementDate: string;
  side: TradeSide;
  assetName: string;
  securityId: string;
  isin: string;
  counterparty: string;
  amount: string;
  yieldPct: string;
  price: string;
  grossAmount: string;
  accruedInterest: string;
  commission: string;
  notes: string;
  status: SettlementStatus;
};

function toDraft(trade: DeskTrade | null, asOf: string): Draft {
  if (!trade) {
    return {
      tradeDate: asOf,
      settlementDate: asOf,
      side: "Buy",
      assetName: "",
      securityId: "",
      isin: "",
      counterparty: "",
      amount: "5000000",
      yieldPct: "4.25",
      price: "100",
      grossAmount: "",
      accruedInterest: "0",
      commission: "0",
      notes: "",
      status: "Pending",
    };
  }
  return {
    tradeDate: trade.tradeDate,
    settlementDate: trade.settlementDate,
    side: trade.side,
    assetName: trade.assetName,
    securityId: trade.securityId,
    isin: trade.isin ?? "",
    counterparty: trade.counterparty,
    amount: String(trade.amount ?? ""),
    yieldPct: String(trade.yieldPct ?? ""),
    price: trade.price != null ? String(trade.price) : "100",
    grossAmount: trade.grossAmount != null ? String(trade.grossAmount) : "",
    accruedInterest: String(trade.accruedInterest ?? 0),
    commission: String(trade.commission ?? 0),
    notes: trade.notes ?? "",
    status: trade.status,
  };
}

export function TradeRecordModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: DeskTrade | null;
  onClose: () => void;
  onSave: (trade: DeskTrade) => void;
}) {
  const { fund, asOf } = useDesk();
  const editing = Boolean(initial?.id);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial ?? null, asOf));
  const [grossDirty, setGrossDirty] = useState(() => Boolean(initial?.grossAmount));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useFormDirty();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const autoGross = useMemo(
    () =>
      suggestedTradeGross({
        amount: Number(draft.amount),
        price: draft.price === "" ? 100 : Number(draft.price),
        accruedInterest: Number(draft.accruedInterest),
        commission: Number(draft.commission),
      }),
    [draft.amount, draft.price, draft.accruedInterest, draft.commission],
  );

  const displayedGross = grossDirty ? Number(draft.grossAmount) : autoGross;

  function patch(partial: Partial<Draft>, opts?: { dirtyGross?: boolean }) {
    setDraft((d) => ({ ...d, ...partial }));
    if (opts?.dirtyGross) setGrossDirty(true);
  }

  function submit() {
    const next: Record<string, string> = {};
    if (!draft.tradeDate) next.tradeDate = "请选择交易日期";
    if (!draft.settlementDate) next.settlementDate = "请选择结算日期";
    if (!draft.assetName.trim() && !draft.securityId.trim() && !draft.isin.trim()) {
      next.assetName = "请填写资产名称、代码或 ISIN";
    }
    if (!draft.counterparty.trim()) next.counterparty = "请填写交易对手 / 托管行";
    const amount = Number(draft.amount);
    if (!(amount > 0)) next.amount = "交易数量 / 面值须大于 0";
    setErrors(next);
    if (Object.keys(next).length) return;

    const price = draft.price === "" ? undefined : Number(draft.price);
    const accrued = Number(draft.accruedInterest) || 0;
    const fee = Number(draft.commission) || 0;
    const gross = Number.isFinite(displayedGross) ? displayedGross : suggestedTradeGross({ amount, price, accruedInterest: accrued, commission: fee });

    onSave({
      id: initial?.id || `TRD-${fund.ccy}-${Date.now()}`,
      tradeDate: draft.tradeDate,
      settlementDate: draft.settlementDate,
      side: draft.side,
      assetName: draft.assetName.trim() || draft.securityId.trim() || draft.isin.trim(),
      securityId: draft.securityId.trim() || draft.isin.trim() || `MANUAL-${Date.now()}`,
      isin: draft.isin.trim() || undefined,
      counterparty: draft.counterparty.trim(),
      amount,
      currency: fund.ccy,
      yieldPct: Number(draft.yieldPct) || 0,
      price: price != null && Number.isFinite(price) ? price : undefined,
      grossAmount: Number.isFinite(gross) ? Number(gross.toFixed(2)) : undefined,
      accruedInterest: accrued,
      commission: fee,
      notes: draft.notes.trim() || undefined,
      status: draft.status,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <Card className="max-h-[92vh] w-full max-w-2xl overflow-auto p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">
              {editing ? "编辑交易记录 · Edit Trade" : "手动录入交易 · New Trade"}
            </h2>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {fund.code} · {editing ? initial?.id : "新交易写入 blotter 后刷新 T+0 可用头寸"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <Label>交易日期 Trade Date</Label>
            <Input type="date" value={draft.tradeDate} onChange={(e) => patch({ tradeDate: e.target.value })} />
            {errors.tradeDate ? <p className="text-[10px] text-red-400">{errors.tradeDate}</p> : null}
          </label>
          <label className="space-y-1">
            <Label>结算日期 Settlement Date</Label>
            <Input type="date" value={draft.settlementDate} onChange={(e) => patch({ settlementDate: e.target.value })} />
            {errors.settlementDate ? <p className="text-[10px] text-red-400">{errors.settlementDate}</p> : null}
          </label>
          <label className="space-y-1">
            <Label>交易方向 Side</Label>
            <select className={selectClass} value={draft.side} onChange={(e) => patch({ side: e.target.value as TradeSide })}>
              {TRADE_SIDES.map((s) => (
                <option key={s} value={s}>
                  {TRADE_SIDE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <Label>交收状态</Label>
            <select
              className={selectClass}
              value={draft.status}
              onChange={(e) => patch({ status: e.target.value as SettlementStatus })}
            >
              {SETTLEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <Label>资产名称 Security Name</Label>
            <Input value={draft.assetName} onChange={(e) => patch({ assetName: e.target.value })} placeholder="US Treasury Bill 4W" />
            {errors.assetName ? <p className="text-[10px] text-red-400">{errors.assetName}</p> : null}
          </label>
          <label className="space-y-1">
            <Label>资产代码 / ISIN</Label>
            <Input
              value={draft.securityId}
              onChange={(e) => patch({ securityId: e.target.value })}
              placeholder="UST-4W / US912797TB33"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <Label>ISIN（选填）</Label>
            <Input value={draft.isin} onChange={(e) => patch({ isin: e.target.value.toUpperCase() })} placeholder="US912797TB33" />
          </label>
          <label className="space-y-1">
            <Label>交易数量 / 面值 Quantity / Notional ({fund.ccy})</Label>
            <Input type="number" min={0} step="0.01" value={draft.amount} onChange={(e) => patch({ amount: e.target.value })} />
            {errors.amount ? <p className="text-[10px] text-red-400">{errors.amount}</p> : null}
          </label>
          <label className="space-y-1">
            <Label>成交净价 / 单价 Clean Price</Label>
            <Input type="number" min={0} step="0.0001" value={draft.price} onChange={(e) => patch({ price: e.target.value })} />
          </label>
          <label className="space-y-1">
            <Label>执行利率 (%)</Label>
            <Input type="number" step="0.01" value={draft.yieldPct} onChange={(e) => patch({ yieldPct: e.target.value })} />
          </label>
          <label className="space-y-1">
            <Label>应计利息 Accrued Interest</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.accruedInterest}
              onChange={(e) => patch({ accruedInterest: e.target.value })}
            />
          </label>
          <label className="space-y-1">
            <Label>交易费用 / 佣金 Commission / Fee</Label>
            <Input type="number" step="0.01" value={draft.commission} onChange={(e) => patch({ commission: e.target.value })} />
          </label>
          <label className="space-y-1">
            <Label>成交总金额 Gross / Net Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={grossDirty ? draft.grossAmount : String(Number.isFinite(autoGross) ? autoGross.toFixed(2) : "")}
              onChange={(e) => patch({ grossAmount: e.target.value }, { dirtyGross: true })}
            />
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              默认 = 面值 × 净价/100 + 应计利息 + 费用；可手动覆盖
            </p>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <Label>交易对手 / 托管行 Counterparty / Broker</Label>
            <Input
              value={draft.counterparty}
              onChange={(e) => patch({ counterparty: e.target.value })}
              placeholder="HSBC / BOCI Custody"
            />
            {errors.counterparty ? <p className="text-[10px] text-red-400">{errors.counterparty}</p> : null}
          </label>
          <label className="space-y-1 sm:col-span-2">
            <Label>备注 Notes / Remarks</Label>
            <Input value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="可选" />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="accent" onClick={submit}>
            {editing ? "保存" : "写入并刷新头寸"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
