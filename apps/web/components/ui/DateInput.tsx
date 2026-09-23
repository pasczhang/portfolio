"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function monthLabel(year: number, month: number) {
  return `${year}年${month + 1}月`;
}

function inRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

export function DateInput({
  className,
  value,
  onChange,
  disabled,
  min,
  max,
  id,
  name,
  autoFocus,
  onBlur,
  onFocus,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  const isoValue = typeof value === "string" ? value : "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(isoValue);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = parseIso(isoValue);
  const [cursor, setCursor] = useState(() => selected ?? new Date());

  useEffect(() => {
    setText(isoValue);
  }, [isoValue]);

  useEffect(() => {
    if (open) setCursor(selected ?? new Date());
  }, [open, isoValue]);

  function emit(next: string) {
    const event = {
      target: { value: next, name: name ?? "", id: id ?? "" },
      currentTarget: { value: next, name: name ?? "", id: id ?? "" },
    } as ChangeEvent<HTMLInputElement>;
    onChange?.(event);
  }

  function pick(iso: string) {
    if (!inRange(iso, typeof min === "string" ? min : undefined, typeof max === "string" ? max : undefined)) return;
    setText(iso);
    emit(iso);
    setOpen(false);
  }

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const mondayIndex = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayIndex);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        iso: toIso(d),
        day: d.getDate(),
        inMonth: d.getMonth() === month,
      };
    });
  }, [cursor]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const today = toIso(new Date());
  const minStr = typeof min === "string" ? min : undefined;
  const maxStr = typeof max === "string" ? max : undefined;
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  function place() {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = 280;
    const height = 320;
    const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8);
    const below = box.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 6) : below;
    setPos({ top, left, width });
  }

  function toggle() {
    if (disabled) return;
    setOpen((v) => {
      const next = !v;
      if (next) place();
      return next;
    });
  }

  function onFieldKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        place();
        setOpen(true);
      }
    }
  }

  const calendar =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="选择日期"
            className="fixed z-[240] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-[hsl(var(--card-foreground))] shadow-2xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                aria-label="上一月"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="font-mono text-xs font-semibold">{monthLabel(cursor.getFullYear(), cursor.getMonth())}</p>
              <button
                type="button"
                className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                aria-label="下一月"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
              {cells.map((cell) => {
                const selectedDay = cell.iso === isoValue;
                const isToday = cell.iso === today;
                const allowed = inRange(cell.iso, minStr, maxStr);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={!allowed}
                    onClick={() => pick(cell.iso)}
                    className={cn(
                      "h-8 rounded text-[11px]",
                      !cell.inMonth && "text-[hsl(var(--muted-foreground))]/50",
                      selectedDay && "bg-amber-500 font-semibold text-black",
                      !selectedDay && isToday && "ring-1 ring-amber-500/70",
                      !selectedDay && allowed && "hover:bg-amber-500/15 hover:text-amber-200",
                      !allowed && "cursor-not-allowed opacity-30",
                    )}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between">
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                onClick={() => {
                  setText("");
                  emit("");
                  setOpen(false);
                }}
              >
                清除
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/15"
                onClick={() => pick(today)}
              >
                今天
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        {...rest}
        id={id}
        name={name}
        autoFocus={autoFocus}
        disabled={disabled}
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const next = e.target.value.trim();
          setText(next);
          if (!next || parseIso(next)) emit(next);
        }}
        onFocus={(e) => {
          onFocus?.(e);
          if (!disabled) {
            place();
            setOpen(true);
          }
        }}
        onBlur={onBlur}
        onKeyDown={onFieldKey}
        onClick={() => {
          if (!disabled) {
            place();
            setOpen(true);
          }
        }}
        className={cn(
          "h-8 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 pr-8 font-mono text-xs text-[hsl(var(--foreground))] outline-none focus:ring-1 focus:ring-amber-500/70",
          className,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="打开日历"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-[hsl(var(--muted-foreground))] hover:text-amber-300 disabled:opacity-40"
        onClick={toggle}
      >
        <CalendarDays className="h-3.5 w-3.5" />
      </button>
      {calendar}
    </div>
  );
}
