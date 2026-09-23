"use client";

import { Badge } from "@/components/ui/badge";
import { bpsFmt, daysFmt, money, navPx, num, pctFmt } from "@/lib/format";
import type { AlertTone, WorkbenchSnapshot } from "@/types/workbench";
import { Activity } from "lucide-react";

function toneForCeiling(value: number, limit: number): AlertTone {
  if (value > limit) return "breach";
  if (value > limit * 0.9) return "watch";
  return "ok";
}

function toneForFloor(value: number, floor: number): AlertTone {
  if (value < floor) return "breach";
  if (value < floor * 1.1) return "watch";
  return "ok";
}

function deviationTone(bps: number): AlertTone {
  const abs = Math.abs(bps);
  if (abs >= 50) return "breach";
  if (abs >= 25) return "watch";
  return "ok";
}

function pip(tone: AlertTone) {
  const color =
    tone === "ok" ? "bg-emerald-400" : tone === "watch" ? "bg-amber-400" : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color} shadow-[0_0_8px_currentColor]`} />;
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: AlertTone;
}) {
  return (
    <div className="flex min-w-[132px] flex-1 flex-col gap-1 border-r border-[hsl(var(--border))] px-3 py-2 last:border-r-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
          {label}
        </span>
        {pip(tone)}
      </div>
      <div className="font-mono text-lg font-semibold leading-none tabular-nums tracking-tight">{value}</div>
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{hint}</div>
    </div>
  );
}

export function MetricHeader({
  data,
  live,
  fundName,
  fundCode,
  ccy,
}: {
  data: WorkbenchSnapshot;
  live: string;
  fundName: string;
  fundCode: string;
  ccy: "USD" | "HKD";
}) {
  const wam = num(data.wam_days);
  const wal = num(data.wal_days);
  const dla = num(data.dla_pct);
  const wla = num(data.wla_pct);
  const bps = num(data.deviation_bps);

  return (
    <section className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <Activity className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="truncate font-semibold tracking-wide">{fundName}</span>
          <span className="font-mono text-[hsl(var(--muted-foreground))]">{fundCode}</span>
          <span className="text-[hsl(var(--muted-foreground))]">as of {data.as_of}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={live === "ws" ? "ok" : "watch"}>{live === "ws" ? "LIVE WS" : "POLL 15s"}</Badge>
          <Badge tone={deviationTone(bps)}>
            COLLAR {data.deviation_status}
          </Badge>
        </div>
      </div>
      <div className="flex flex-wrap">
        <Tile label="Total AUM" value={money(data.aum, ccy)} hint={`${ccy} amortized book`} tone="ok" />
        <Tile label="Shadow NAV" value={navPx(data.shadow_nav)} hint={`Official ${navPx(data.official_nav)}`} tone={deviationTone(bps)} />
        <Tile label="偏离度" value={bpsFmt(bps)} hint="红≥50bps 黄≥25bps" tone={deviationTone(bps)} />
        <Tile label="WAM" value={daysFmt(wam)} hint="目标 ≤ 60 天" tone={toneForCeiling(wam, data.wam_limit)} />
        <Tile label="WAL" value={daysFmt(wal)} hint="目标 ≤ 120 天" tone={toneForCeiling(wal, data.wal_limit)} />
        <Tile label="DLA" value={pctFmt(dla)} hint="目标 ≥ 10%" tone={toneForFloor(dla, num(data.dla_floor))} />
        <Tile label="WLA" value={pctFmt(wla)} hint="SFC ≥ 15% · 内控 ≥ 20%" tone={toneForFloor(wla, num(data.wla_floor))} />
      </div>
    </section>
  );
}
