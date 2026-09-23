"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBook } from "@/components/layout/BookProvider";
import { useDesk } from "@/components/layout/DeskProvider";
import {
  RESET_CURRENCIES,
  confirmPhraseMatches,
  type ResetCurrency,
} from "@/lib/holdings/inceptionReset";
import { useFormDirty } from "@/lib/persist/dirty";

const selectClass =
  "h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:ring-1 focus:ring-amber-500/70";

export function ResetFundModal({
  defaultCash,
  onClose,
  onSuccess,
}: {
  defaultCash: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { fund, setAsOf } = useDesk();
  const { resetFundToInception } = useBook();
  const [inceptionDate, setInceptionDate] = useState(fund.inception || new Date().toISOString().slice(0, 10));
  const [cashAmount, setCashAmount] = useState(String(Math.max(0, defaultCash)));
  const [currency, setCurrency] = useState<ResetCurrency>(fund.ccy);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useFormDirty();

  const confirmed = useMemo(
    () => confirmPhraseMatches(confirmText, fund.name, fund.code),
    [confirmText, fund.name, fund.code],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    if (!confirmed || busy) return;
    const amount = Number(cashAmount);
    if (!inceptionDate) {
      setError("请选择成立日期");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError("初始托管活期金额须为不小于 0 的数字");
      return;
    }
    setBusy(true);
    setError("");
    try {
      window.sessionStorage.setItem("pms-flash", "基金已成功重置为成立初始状态");
      resetFundToInception({
        inceptionDate,
        cashAmount: amount,
        currency,
      });
      setAsOf(inceptionDate);
      onSuccess();
      window.location.assign("/holdings");
    } catch {
      setError("重置失败，请重试");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="max-h-[92vh] w-full max-w-lg overflow-auto border-red-500/40 p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-red-300">初始化基金数据 · Reset Fund</h2>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              {fund.code} · {fund.name}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-2 rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-[12px] text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            此操作将永久清空当前基金的所有持仓明细、交易流水和估值历史，并将资产重置为托管活期存款，操作不可撤销！
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <Label>成立日期 Inception Date</Label>
            <Input type="date" value={inceptionDate} onChange={(e) => setInceptionDate(e.target.value)} />
          </label>
          <label className="space-y-1">
            <Label>初始托管活期金额</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <Label>币种 Currency</Label>
            <select className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value as ResetCurrency)}>
              {RESET_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {currency === "CNY" ? (
              <p className="text-[10px] text-amber-300">
                本 PMS 份额账本为 {fund.ccy}；CNY 仅写入活期名称，账面币种仍记为 {fund.ccy}。
              </p>
            ) : null}
          </label>
        </div>

        <label className="mt-3 block space-y-1">
          <Label>请输入基金名称或 RESET 以确认</Label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={`${fund.name}  /  ${fund.code}  /  RESET`}
            autoComplete="off"
          />
        </label>
        {error ? <p className="mt-2 text-[11px] text-red-400">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="button" variant="danger" disabled={!confirmed || busy} onClick={submit}>
            {busy ? "正在重置…" : "确认重置为成立状态"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
