"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const CALENDAR_Z = 9999;

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function validLocalDate(y: number, m: number, d: number): Date | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Accept YYYY-MM-DD, timestamps, Date, ISO datetime; empty/null → "". Never throws. */
export function coerceToIsoDate(value: unknown): string {
  try {
    if (value == null || value === "") return "";
    if (Array.isArray(value)) return coerceToIsoDate(value[0]);
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return "";
      return toIso(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? "" : toIso(d);
    }
    const raw = String(value).trim();
    if (!raw || raw === "null" || raw === "undefined" || raw === "Invalid Date") return "";
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw);
      const ms = raw.length <= 10 ? n * 1000 : n;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? "" : toIso(d);
    }
    const day = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (day) {
      const dt = validLocalDate(Number(day[1]), Number(day[2]), Number(day[3]));
      if (dt) return toIso(dt);
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return toIso(new Date(parsed));
    return "";
  } catch {
    return "";
  }
}

function inRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

function monthLabel(year: number, month: number) {
  return `${year}年${month + 1}月`;
}

function safeCursor(iso: string): Date {
  const parsed = coerceToIsoDate(iso);
  if (parsed) {
    const [y, m, d] = parsed.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
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
  type: _nativeType,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  const isoValue = coerceToIsoDate(value);
  const minStr = coerceToIsoDate(min) || undefined;
  const maxStr = coerceToIsoDate(max) || undefined;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(isoValue);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(() => safeCursor(isoValue));
  const [pos, setPos] = useState({ top: 8, left: 8, width: 280 });

  useEffect(() => {
    setText(isoValue);
  }, [isoValue]);

  useEffect(() => {
    if (open) setCursor(safeCursor(isoValue));
  }, [open, isoValue]);

  function emit(next: string) {
    const event = {
      target: { value: next, name: name ?? "", id: id ?? "" },
      currentTarget: { value: next, name: name ?? "", id: id ?? "" },
    } as ChangeEvent<HTMLInputElement>;
    onChange?.(event);
  }

  function pick(iso: string) {
    if (!inRange(iso, minStr, maxStr)) return;
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

  function openCalendar() {
    if (disabled) return;
    place();
    setOpen(true);
  }

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
    function onReposition() {
      place();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

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
      openCalendar();
    }
  }

  const today = toIso(new Date());

  const calendar =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="选择日期"
            className="fixed rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-[hsl(var(--card-foreground))] shadow-2xl"
            style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: CALENDAR_Z }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
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
                const selectedDay = Boolean(isoValue) && cell.iso === isoValue;
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
          if (!next) {
            emit("");
            return;
          }
          const iso = coerceToIsoDate(next);
          if (iso && (next === iso || /^\d{4}-\d{2}-\d{2}$/.test(next))) emit(iso);
        }}
        onFocus={(e) => {
          onFocus?.(e);
          openCalendar();
        }}
        onBlur={onBlur}
        onKeyDown={onFieldKey}
        onClick={() => openCalendar()}
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
