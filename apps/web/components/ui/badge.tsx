import { cn } from "@/lib/utils";

type Tone = "ok" | "watch" | "breach" | "neutral";

const tones: Record<Tone, string> = {
  ok: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  watch: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
  breach: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
  neutral: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
