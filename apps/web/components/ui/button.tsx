import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "ghost" | "outline" | "accent" | "danger";

const styles: Record<Variant, string> = {
  default:
    "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90",
  ghost: "bg-transparent hover:bg-[hsl(var(--muted))]",
  outline: "border border-[hsl(var(--border))] bg-transparent hover:bg-[hsl(var(--muted))]",
  accent: "bg-amber-500 text-black hover:bg-amber-400 font-semibold",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export function Button({
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium tracking-wide disabled:opacity-40",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
