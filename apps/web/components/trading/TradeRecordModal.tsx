"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CenteredModal } from "@/components/ui/CenteredModal";
import { useDesk } from "@/components/layout/DeskProvider";
import { useBook } from "@/components/layout/BookProvider";
import { SETTLEMENT_STATUSES, type DeskTrade, type SettlementStatus } from "@/lib/holdings/trades";
import { addDays, daysBetween } from "@/lib/holdings/dates";
import { assetCategoryOf } from "@/lib/holdings/unified";
import { moneyFull } from "@/lib/format";
import { useFormDirty } from "@/lib/persist/dirty";
import { cn } from "@/lib/utils";
import {
  ASSET_CATEGORY_OPTIONS,
  BOND_SIDES,
  CASH_ACCOUNTS,
  CASH_SIDES,
  COUPON_FREQS,
  DAY_COUNTS,
  DEPOSIT_RULES,
  DEPOSIT_SIDES,
  DEPOSIT_TENORS,
  FEE_TYPES,
  QUOTE_TYPES,
  REPO_SIDES,
  REPO_TENORS,
  applyHoldingToDraft,
  computeTradeCalc,
  deskTradeToDraft,
  draftToDeskTrade,
  n,
  resetExclusiveFields,
  validatePolymorphicDraft,
  type PolymorphicDraft,
  type TradeAssetCategory,
} from "@/lib/trading/polymorphicTrade";

const selectClass =
  "h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs text-[hsl(var(--foreground))] outline-none focus:ring-1 focus:ring-amber-500/70";

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("space-y-1", className)}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-[10px] text-red-400">{error}</p> : null}
    </label>
  );
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
  const { positions } = useBook();
  const editing = Boolean(initial?.id);
  const [draft, setDraft] = useState<PolymorphicDraft>(() => deskTradeToDraft(initial ?? null, asOf));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accruedLocked, setAccruedLocked] = useState(false);
  const [showCollateral, setShowCollateral] = useState(Boolean(initial?.details && (initial.details as { collateralCode?: string }).collateralCode));
  useFormDirty();

  const calc = useMemo(
    () => computeTradeCalc(accruedLocked ? draft : { ...draft, accruedPer100: "" }),
    [draft, accruedLocked],
  );
  const templates = useMemo(() => {
    const want =
      draft.assetCategory === "BOND"
        ? "BOND"
        : draft.assetCategory === "TERM_DEPOSIT"
          ? "TIME_DEPOSIT"
          : draft.assetCategory === "REPO"
            ? "REPO"
            : "CASH";
    return positions.filter((p) => {
      const cat = assetCategoryOf(p);
      if (want === "BOND") return cat === "BOND" || cat === "OTHER";
      return cat === want;
    });
  }, [positions, draft.assetCategory]);

  function patch(partial: Partial<PolymorphicDraft>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  function changeCategory(next: TradeAssetCategory) {
    setDraft((d) => resetExclusiveFields(d, next));
    setErrors({});
    setAccruedLocked(false);
  }

  function submit() {
    const next = validatePolymorphicDraft(draft);
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave(draftToDeskTrade(draft, calc, fund.ccy, initial?.id));
  }

  const autoAccrued = calc.accruedPer100;
  const displayedAccrued = autoAccrued;
  const dirtyDisplay = draft.quoteType === "DIRTY" ? n(draft.dirtyPrice) : calc.dirtyPrice;
  const cleanDisplay = draft.quoteType === "CLEAN" ? n(draft.cleanPrice) : calc.cleanPrice;

  const cashHint =
    calc.cashDelta < 0
      ? `系统将从 [${fund.ccy}主账户] 扣除 ${moneyFull(Math.abs(calc.cashDelta), fund.ccy)}`
      : calc.cashDelta > 0
        ? `系统将向 [${fund.ccy}主账户] 贷记 ${moneyFull(calc.cashDelta, fund.ccy)}`
        : `无现金流变动`;

  return (
    <CenteredModal
      title={editing ? "编辑交易记录 · Edit Trade" : "手工交易录入 · Manual Trade Entry"}
      onClose={onClose}
      widthClass="max-w-5xl"
      bodyClassName="max-h-[min(82vh,740px)] p-4"
    >
      <p className="mb-3 text-[11px] text-[hsl(var(--muted-foreground))]">
        {fund.code} · {editing ? initial?.id : "按资产类别切换表单与试算"} · 估值日 {asOf}
      </p>

      <div className="grid gap-3 lg:grid-cols-[1.65fr_1fr]">
        <div className="space-y-3">
          <Card className="grid gap-3 p-3 sm:grid-cols-2">
            <Field label="资产类别 Asset Type">
              <select
                className={selectClass}
                value={draft.assetCategory}
                onChange={(e) => changeCategory(e.target.value as TradeAssetCategory)}
              >
                {ASSET_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="交易方向 Side">
              <select
                className={selectClass}
                value={
                  draft.assetCategory === "BOND"
                    ? draft.bondSide
                    : draft.assetCategory === "TERM_DEPOSIT"
                      ? draft.depositSide
                      : draft.assetCategory === "REPO"
                        ? draft.repoSide
                        : draft.cashSide
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (draft.assetCategory === "BOND") patch({ bondSide: v as PolymorphicDraft["bondSide"] });
                  else if (draft.assetCategory === "TERM_DEPOSIT") patch({ depositSide: v as PolymorphicDraft["depositSide"] });
                  else if (draft.assetCategory === "REPO") patch({ repoSide: v as PolymorphicDraft["repoSide"] });
                  else patch({ cashSide: v as PolymorphicDraft["cashSide"] });
                }}
              >
                {(draft.assetCategory === "BOND"
                  ? BOND_SIDES
                  : draft.assetCategory === "TERM_DEPOSIT"
                    ? DEPOSIT_SIDES
                    : draft.assetCategory === "REPO"
                      ? REPO_SIDES
                      : CASH_SIDES
                ).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="交易日期 Trade Date" error={errors.tradeDate}>
              <Input type="date" value={draft.tradeDate} onChange={(e) => patch({ tradeDate: e.target.value })} />
            </Field>
            <Field label="结算日期 Settlement / Value Date" error={errors.settleDate}>
              <Input type="date" value={draft.settleDate} onChange={(e) => patch({ settleDate: e.target.value })} />
              <div className="mt-1 flex gap-1">
                {(["T+0", "T+1"] as const).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={cn(
                      "rounded border px-2 py-0.5 text-[10px]",
                      (tag === "T+0" ? draft.settleDate === draft.tradeDate : draft.settleDate === addDays(draft.tradeDate, 1))
                        ? "border-amber-500 bg-amber-500/15 text-amber-300"
                        : "border-[hsl(var(--border))]",
                    )}
                    onClick={() => patch({ settleDate: tag === "T+0" ? draft.tradeDate : addDays(draft.tradeDate, 1) })}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="交易对手方 Counterparty / Broker" error={errors.counterparty} className="sm:col-span-2">
              <Input
                value={draft.counterparty}
                onChange={(e) => patch({ counterparty: e.target.value })}
                placeholder="HSBC / BOCI / US Treasury"
              />
            </Field>
            <Field label="交收状态" className="sm:col-span-2">
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
            </Field>
            {templates.length ? (
              <Field label="从持仓快速填单" className="sm:col-span-2">
                <select
                  className={selectClass}
                  defaultValue=""
                  onChange={(e) => {
                    const p = positions.find((x) => x.securityId === e.target.value);
                    if (p) setDraft((d) => applyHoldingToDraft(d, p));
                  }}
                >
                  <option value="">选择历史持仓带出代码 / 票息 / 到期日…</option>
                  {templates.map((p) => (
                    <option key={p.securityId} value={p.securityId}>
                      {p.assetName} · {p.securityId}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </Card>

          {draft.assetCategory === "BOND" ? (
            <Card className="grid gap-3 p-3 sm:grid-cols-2">
              <Field label="债券代码 ISIN / Ticker" error={errors.bondName}>
                <Input value={draft.bondCode} onChange={(e) => patch({ bondCode: e.target.value.toUpperCase() })} placeholder="US912797TB33" />
              </Field>
              <Field label="债券简称">
                <Input value={draft.bondName} onChange={(e) => patch({ bondName: e.target.value })} placeholder="US T-Bill 4W" />
              </Field>
              <Field label={`交易面值总额 Par (${fund.ccy})`} error={errors.parValue}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.parValue}
                  onChange={(e) => {
                    const parValue = e.target.value;
                    patch({ parValue, lots: String(Math.round(n(parValue) / 1000) || "") });
                  }}
                />
              </Field>
              <Field label="交易张数 Lots (面值/1000)">
                <Input
                  type="number"
                  min={0}
                  value={draft.lots}
                  onChange={(e) => {
                    const lots = e.target.value;
                    patch({ lots, parValue: String(n(lots) * 1000) });
                  }}
                />
              </Field>
              <Field label="报价类型" className="sm:col-span-2">
                <select
                  className={selectClass}
                  value={draft.quoteType}
                  onChange={(e) => patch({ quoteType: e.target.value as PolymorphicDraft["quoteType"] })}
                >
                  {QUOTE_TYPES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              {draft.quoteType === "CLEAN" ? (
                <Field label="净价 Clean Price" error={errors.cleanPrice}>
                  <Input type="number" min={0} step="0.0001" value={draft.cleanPrice} onChange={(e) => patch({ cleanPrice: e.target.value })} />
                </Field>
              ) : null}
              {draft.quoteType === "DIRTY" ? (
                <Field label="全价 Dirty Price" error={errors.dirtyPrice}>
                  <Input type="number" min={0} step="0.0001" value={draft.dirtyPrice} onChange={(e) => patch({ dirtyPrice: e.target.value })} />
                </Field>
              ) : null}
              {draft.quoteType === "YTM" ? (
                <Field label="到期收益率 YTM %" error={errors.ytmPct}>
                  <Input type="number" min={0} step="0.0001" value={draft.ytmPct} onChange={(e) => patch({ ytmPct: e.target.value })} />
                </Field>
              ) : null}
              <Field label="应计利息 / 100 面值">
                <Input
                  type="number"
                  step="0.0001"
                  value={accruedLocked ? draft.accruedPer100 : displayedAccrued.toFixed(4)}
                  onChange={(e) => {
                    setAccruedLocked(true);
                    patch({ accruedPer100: e.target.value });
                  }}
                />
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">可手改；默认按票息 × 起息日至结算日 / 计息基准</p>
              </Field>
              <Field label="票面利率 Coupon %">
                <Input type="number" min={0} step="0.0001" value={draft.couponRate} onChange={(e) => patch({ couponRate: e.target.value })} />
              </Field>
              <Field label="付息频率">
                <select
                  className={selectClass}
                  value={draft.frequency}
                  onChange={(e) => patch({ frequency: e.target.value as PolymorphicDraft["frequency"] })}
                >
                  {COUPON_FREQS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="起息日 Value Date">
                <Input type="date" value={draft.valueDate} onChange={(e) => patch({ valueDate: e.target.value })} />
              </Field>
              <Field label="到期日 Maturity" error={errors.maturityDate}>
                <Input type="date" value={draft.maturityDate} onChange={(e) => patch({ maturityDate: e.target.value })} />
              </Field>
              <Field label="计息基准 Day Count">
                <select
                  className={selectClass}
                  value={draft.dayCount}
                  onChange={(e) => patch({ dayCount: e.target.value as PolymorphicDraft["dayCount"] })}
                >
                  {DAY_COUNTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="交易税费 Commission">
                <Input type="number" min={0} step="0.01" value={draft.commission} onChange={(e) => patch({ commission: e.target.value })} />
              </Field>
              <p className="sm:col-span-2 font-mono text-[11px] text-amber-300">
                全价 {dirtyDisplay.toFixed(4)} = 净价 {cleanDisplay.toFixed(4)} + 应计 {displayedAccrued.toFixed(4)}
              </p>
            </Card>
          ) : null}

          {draft.assetCategory === "TERM_DEPOSIT" ? (
            <Card className="grid gap-3 p-3 sm:grid-cols-2">
              <Field label="存款银行 / 开户行" error={errors.bankName} className="sm:col-span-2">
                <Input value={draft.bankName} onChange={(e) => patch({ bankName: e.target.value, counterparty: e.target.value || draft.counterparty })} placeholder="BOCI / HSBC" />
              </Field>
              <Field label={`存入本金 Principal (${fund.ccy})`} error={errors.principal}>
                <Input type="number" min={0} step="0.01" value={draft.principal} onChange={(e) => patch({ principal: e.target.value })} />
              </Field>
              <Field label="年化利率 %" error={errors.interestRate}>
                <Input type="number" min={0} step="0.0001" value={draft.interestRate} onChange={(e) => patch({ interestRate: e.target.value })} />
              </Field>
              <Field label="起息日 Start Date" error={errors.startDate}>
                <Input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value;
                    const tenor = n(draft.tenorDays) || 7;
                    patch({ startDate, depositMaturity: addDays(startDate, tenor) });
                  }}
                />
              </Field>
              <Field label="到期日 Maturity" error={errors.depositMaturity}>
                <Input
                  type="date"
                  value={draft.depositMaturity}
                  onChange={(e) => {
                    const depositMaturity = e.target.value;
                    const tenorDays = String(Math.max(0, daysBetween(draft.startDate, depositMaturity)));
                    patch({ depositMaturity, tenorDays });
                  }}
                />
              </Field>
              <Field label="期限天数 Tenor" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1">
                  {DEPOSIT_TENORS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={cn(
                        "rounded border px-2 py-0.5 text-[10px]",
                        n(draft.tenorDays) === t.days ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[hsl(var(--border))]",
                      )}
                      onClick={() => patch({ tenorDays: String(t.days), depositMaturity: addDays(draft.startDate, t.days) })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  value={draft.tenorDays}
                  onChange={(e) => {
                    const tenorDays = e.target.value;
                    patch({ tenorDays, depositMaturity: addDays(draft.startDate, n(tenorDays)) });
                  }}
                />
              </Field>
              <Field label="计息规则" className="sm:col-span-2">
                <select
                  className={selectClass}
                  value={draft.interestRule}
                  onChange={(e) => patch({ interestRule: e.target.value as PolymorphicDraft["interestRule"] })}
                >
                  {DEPOSIT_RULES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </Card>
          ) : null}

          {draft.assetCategory === "REPO" ? (
            <Card className="grid gap-3 p-3 sm:grid-cols-2">
              <Field label="回购品种 / 代码" error={errors.repoCode} className="sm:col-span-2">
                <Input value={draft.repoCode} onChange={(e) => patch({ repoCode: e.target.value })} placeholder="GC001 / R-007 / 银行间质押回购" />
              </Field>
              <Field label={`首期结算金额 (${fund.ccy})`} error={errors.principal}>
                <Input type="number" min={0} step="0.01" value={draft.repoPrincipal} onChange={(e) => patch({ repoPrincipal: e.target.value })} />
              </Field>
              <Field label="回购利率 %" error={errors.repoRate}>
                <Input type="number" min={0} step="0.0001" value={draft.repoRate} onChange={(e) => patch({ repoRate: e.target.value })} />
              </Field>
              <Field label="计息基准">
                <select
                  className={selectClass}
                  value={draft.dayCount}
                  onChange={(e) => patch({ dayCount: e.target.value as PolymorphicDraft["dayCount"] })}
                >
                  {DAY_COUNTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="期限天数">
                <div className="flex flex-wrap gap-1">
                  {REPO_TENORS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={cn(
                        "rounded border px-2 py-0.5 text-[10px]",
                        n(draft.termDays) === t.days ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[hsl(var(--border))]",
                      )}
                      onClick={() =>
                        patch({
                          termDays: String(t.days),
                          secondLegDate: addDays(draft.firstLegDate, t.days),
                        })
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  value={draft.termDays}
                  onChange={(e) => {
                    const termDays = e.target.value;
                    patch({ termDays, secondLegDate: addDays(draft.firstLegDate, n(termDays)) });
                  }}
                />
              </Field>
              <Field label="首次结算日 First Leg">
                <Input
                  type="date"
                  value={draft.firstLegDate}
                  onChange={(e) => {
                    const firstLegDate = e.target.value;
                    patch({ firstLegDate, secondLegDate: addDays(firstLegDate, n(draft.termDays) || 7) });
                  }}
                />
              </Field>
              <Field label="到期结算日 Second Leg" error={errors.secondLegDate}>
                <Input
                  type="date"
                  value={draft.secondLegDate}
                  onChange={(e) => {
                    const secondLegDate = e.target.value;
                    patch({ secondLegDate, termDays: String(Math.max(0, daysBetween(draft.firstLegDate, secondLegDate))) });
                  }}
                />
              </Field>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="mb-2 inline-flex items-center gap-1 text-[11px] text-amber-300"
                  onClick={() => setShowCollateral((v) => !v)}
                >
                  {showCollateral ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  质押券清单 / 折算率（选填）
                </button>
                {showCollateral ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input placeholder="质押券代码" value={draft.collateralCode} onChange={(e) => patch({ collateralCode: e.target.value })} />
                    <Input placeholder="质押数量" type="number" value={draft.collateralQty} onChange={(e) => patch({ collateralQty: e.target.value })} />
                    <Input placeholder="折算比例 %" type="number" value={draft.haircutPct} onChange={(e) => patch({ haircutPct: e.target.value })} />
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {draft.assetCategory === "CASH" ? (
            <Card className="grid gap-3 p-3 sm:grid-cols-2">
              <Field label="划出账户" error={errors.fromAccount}>
                <select className={selectClass} value={draft.fromAccount} onChange={(e) => patch({ fromAccount: e.target.value })}>
                  {CASH_ACCOUNTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="划入账户" error={errors.toAccount}>
                <select className={selectClass} value={draft.toAccount} onChange={(e) => patch({ toAccount: e.target.value })}>
                  {CASH_ACCOUNTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`划转金额 (${fund.ccy})`} error={errors.cashAmount}>
                <Input type="number" min={0} step="0.01" value={draft.cashAmount} onChange={(e) => patch({ cashAmount: e.target.value })} />
              </Field>
              <Field label="费用类型">
                <select className={selectClass} value={draft.feeType} onChange={(e) => patch({ feeType: e.target.value })}>
                  {FEE_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="相关税费">
                <Input type="number" min={0} step="0.01" value={draft.commission} onChange={(e) => patch({ commission: e.target.value })} />
              </Field>
            </Card>
          ) : null}

          <Field label="备注 Notes">
            <Input value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="可选" />
          </Field>
        </div>

        <Card className="h-fit border-amber-500/30 bg-amber-500/5 p-4 lg:sticky lg:top-0">
          <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">交易试算与摘要</p>
          <p className="mt-3 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">结算净额 Net Settlement</p>
          <p className="font-mono text-2xl font-semibold text-amber-300">{moneyFull(calc.settlementAmount, fund.ccy)}</p>
          <p className="mt-3 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
            {draft.assetCategory === "BOND" ? "预估应计利息 Accrued" : "到期收益 / 利息 Interest"}
          </p>
          <p className="font-mono text-lg text-emerald-300">{moneyFull(calc.interest, fund.ccy)}</p>
          {draft.assetCategory === "TERM_DEPOSIT" || draft.assetCategory === "REPO" ? (
            <>
              <p className="mt-3 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">到期本息总额</p>
              <p className="font-mono text-lg">{moneyFull(calc.maturityProceeds, fund.ccy)}</p>
              <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">期限 {calc.tenorDays} 天</p>
            </>
          ) : null}
          {draft.assetCategory === "BOND" ? (
            <p className="mt-3 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
              Dirty {dirtyDisplay.toFixed(4)} · Clean {cleanDisplay.toFixed(4)} · Accrued/100 {displayedAccrued.toFixed(4)}
            </p>
          ) : null}
          <p className="mt-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[12px] leading-relaxed">
            {cashHint}
          </p>
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
    </CenteredModal>
  );
}
