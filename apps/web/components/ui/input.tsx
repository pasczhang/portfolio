"use client";

import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";
import { DateInput } from "@/components/ui/DateInput";

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  if (type === "date") {
    return <DateInput className={className} {...props} />;
  }
  return (
    <input
      type={type}
      className={cn(
        "h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 font-mono text-xs text-[hsl(var(--foreground))] outline-none focus:ring-1 focus:ring-amber-500/70",
        className,
      )}
      {...props}
    />
  );
}
