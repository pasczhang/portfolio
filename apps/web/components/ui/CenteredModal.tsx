"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function CenteredModal({
  children,
  onClose,
  title,
  className,
  widthClass = "max-w-md",
  bodyClassName,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  className?: string;
  widthClass?: string;
  bodyClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.origX + (e.clientX - drag.current.startX),
      y: drag.current.origY + (e.clientY - drag.current.startY),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  function onTitlePointerDown(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    drag.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/65 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-2xl",
          widthClass,
          className,
        )}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex cursor-move select-none items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5"
          onPointerDown={onTitlePointerDown}
        >
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            className="cursor-pointer rounded px-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className={cn("max-h-[min(72vh,560px)] overflow-auto p-4", bodyClassName)}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
