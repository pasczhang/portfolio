import { cn } from "@/lib/utils";
import { num } from "@/lib/format";

export function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "PASS" || s === "INFO") return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  if (s === "WARN" || s === "WARNING" || s === "PRIVILEGED" || s === "MEDIUM")
    return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  return "text-red-400 border-red-500/30 bg-red-500/10";
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase", statusTone(status))}>
      {status}
    </span>
  );
}

export function ProgressBar({
  value,
  limit,
  invert,
}: {
  value: number | string;
  limit: number | string;
  invert?: boolean;
}) {
  const v = num(value);
  const lim = Math.max(num(limit), 0.0001);
  const pct = invert ? Math.min((v / (lim * 2)) * 100, 100) : Math.min((v / lim) * 100, 140);
  const over = invert ? v > lim : v < lim;
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-[hsl(var(--muted))]">
      <div
        className={cn("h-full rounded", over ? "bg-red-500" : v > lim * 0.9 && invert ? "bg-amber-400" : "bg-emerald-500")}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}
