"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Baseline, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPortalRoot } from "@/lib/portal-root";

/** Above expanded description overlay (z-10000) */
const PANEL_Z = 10060;

// Mid-tone colors that stay legible on both light and dark themes
export const TEXT_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

export function TextColorPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = 196;
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - panelWidth - 8,
      );
      setCoords({ top: rect.bottom + 6, left });
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  function apply(color: string) {
    editor.chain().focus().setColor(color).run();
    setOpen(false);
  }

  function remove() {
    editor.chain().focus().unsetColor().run();
    setOpen(false);
  }

  const isActive = TEXT_COLORS.some((c) =>
    editor.isActive("textStyle", { color: c.value }),
  );

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Text color"
      className="fixed w-[196px] rounded-xl border border-pen-card-border bg-pen-card p-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
      style={{ top: coords.top, left: coords.left, zIndex: PANEL_Z }}
    >
      <p className="mb-2 font-sans text-[11px] font-semibold tracking-wide text-pen-foreground">
        Text color
      </p>
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {TEXT_COLORS.map((c) => (
          <button
            key={c.name}
            type="button"
            title={c.name}
            onClick={() => apply(c.value)}
            className={cn(
              "flex size-5 items-center justify-center rounded-md border font-sans text-[12px] font-bold transition-transform hover:scale-110",
              editor.isActive("textStyle", { color: c.value })
                ? "border-pen-id ring-1 ring-pen-id"
                : "border-pen-card-border",
            )}
            style={{ color: c.value }}
          >
            A
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={!isActive}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-pen-card-border font-sans text-[11px] text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-40"
      >
        <Ban className="size-3" /> Default color
      </button>
    </div>
  ) : null;

  const portalRoot = getPortalRoot();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Text color"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex size-6 items-center justify-center rounded transition-colors",
          isActive || open
            ? "bg-pen-blue-tint font-semibold text-pen-id"
            : "text-pen-muted hover:bg-pen-card hover:text-pen-foreground",
        )}
      >
        <Baseline className="size-3.5" />
      </button>
      {portalRoot && panel ? createPortal(panel, portalRoot) : null}
    </>
  );
}
