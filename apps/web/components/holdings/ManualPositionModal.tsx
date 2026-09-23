"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDesk } from "@/components/layout/DeskProvider";
import { useBook } from "@/components/layout/BookProvider";
import { moneyFull } from "@/lib/format";
import type { BookPosition } from "@/lib/holdings/types";
import {
  MANUAL_ASSET_KINDS,
  MANUAL_RATINGS,
  draftToBookPosition,
  emptyManualDraft,
  positionToManualDraft,
  remainingDaysFrom,
  validateManualDraft,
  type ManualPositionDraft,
} from "@/lib/holdings/manualPosition";
import { useFormDirty } from "@/lib/persist/dirty";

const selectClass =
  "h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:ring-1 focus:ring-amber-500/70";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[10px] text-red-400">{message}</p>;
}

export function ManualPositionModal({
  initial,
  onClose,
}: {
  initial?: BookPosition | null;
  onClose: () => void;
}) {
  const { fund, asOf } = useDesk();
  const { upsertManualPosition, aum } = useBook();
  const editing = Boolean(initial?.securityId);
  const [draft, setDraft] = useState<ManualPositionDraft>(() =>
    initial ? positionToManualDraft(initial) : emptyManualDraft(asOf, fund.ccy),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  useFormDirty();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remaining = useMemo(
    () => remainingDaysFrom(asOf, draft.maturityDate || asOf),
    [asOf, draft.maturityDate],
  );
  const cost = Number(draft.amortizedCost);
  const baseNav = aum - (editing ? Number(initial?.amortizedCost ?? 0) : 0);
  const previewNav = (Number.isFinite(cost) && cost > 0 ? baseNav + cost : Math.max(baseNav, 1)) || 1;
  const previewWeight =
    Number.isFinite(cost) && cost > 0 ? ((cost / previewNav) * 100).toFixed(2) : "—";

  function patch(partial: Partial<ManualPositionDraft>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  function submit() {
    const nextErrors = validateManualDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const position = draftToBookPosition(draft, fund.ccy, asOf);
    upsertManualPosition(position, initial?.securityId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <Card className="max-h-[92vh] w-full max-w-2xl overflow-auto p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">
              {editing ? "编辑持仓 · Edit Position" : "+ 手工添加持仓 · Manual Entry"}
            </h2>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {fund.code} · as of {asOf} · 写入后重算 NAV / % of NAV / WAM / WAL / DLA / WLA
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <Label>资产类别</Label>
            <select
              className={selectClass}
              value={draft.kind}
              onChange={(e) => patch({ kind: e.target.value as ManualPositionDraft["kind"] })}
            >
              {MANUAL_ASSET_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <Label>资产代码 / ISIN</Label>
            <Input
              value={draft.assetCode}
              onChange={(e) => patch({ assetCode: e.target.value.toUpperCase() })}
              placeholder="USD-CASH / TD-BOC-01 / US912797TB33"
            />
            <FieldError message={errors.assetCode} />
          </label>

          <label className="space-y-1">
            <Label>资产名称</Label>
            <Input
              value={draft.assetName}
              onChange={(e) => patch({ assetName: e.target.value })}
              placeholder="USD Time Deposit - 3M"
            />
            <FieldError message={errors.assetName} />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <Label>发行人 / 对手方</Label>
            <Input
              value={draft.issuer}
              onChange={(e) => patch({ issuer: e.target.value })}
              placeholder="Bank of China / HSBC / US Treasury"
            />
            <FieldError message={errors.issuer} />
          </label>

          <label className="space-y-1">
            <Label>起息日</Label>
            <Input type="date" value={draft.valueDate} onChange={(e) => patch({ valueDate: e.target.value })} />
            <FieldError message={errors.valueDate} />
          </label>

          <label className="space-y-1">
            <Label>到期日</Label>
            <Input
              type="date"
              value={draft.maturityDate}
              onChange={(e) => patch({ maturityDate: e.target.value })}
            />
            <p className="font-mono text-[10px] text-amber-400/90">剩余天数 {remaining}d（相对估值日 {asOf}）</p>
            <FieldError message={errors.maturityDate} />
          </label>

          <label className="space-y-1">
            <Label>票面利率 (%)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={draft.couponRate}
              onChange={(e) => patch({ couponRate: e.target.value })}
              placeholder="5.25"
            />
            <FieldError message={errors.couponRate} />
          </label>

          <label className="space-y-1">
            <Label>信用评级</Label>
            <select className={selectClass} value={draft.rating} onChange={(e) => patch({ rating: e.target.value })}>
              {MANUAL_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <Label>摊余成本 / 账面金额 ({fund.ccy})</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={draft.amortizedCost}
              onChange={(e) => {
                const v = e.target.value;
                patch({
                  amortizedCost: v,
                  fairValue: draft.fairValue === draft.amortizedCost || !draft.fairValue ? v : draft.fairValue,
                });
              }}
              placeholder="1000000"
            />
            <FieldError message={errors.amortizedCost} />
          </label>

          <label className="space-y-1">
            <Label>公允估值 / 市值 ({fund.ccy}，选填)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={draft.fairValue}
              onChange={(e) => patch({ fairValue: e.target.value })}
              placeholder="默认等于摊余成本"
            />
            <FieldError message={errors.fairValue} />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-2 font-mono text-[11px]">
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">预估 NAV</p>
            <p>{moneyFull(previewNav, fund.ccy)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">本行占比</p>
            <p>{previewWeight}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">剩余天数</p>
            <p>{remaining}d</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="accent" onClick={submit}>
            {editing ? "保存修改" : "确定添加"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
