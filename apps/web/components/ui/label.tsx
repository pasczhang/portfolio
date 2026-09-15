import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]", className)}
      {...props}
    />
  );
}
