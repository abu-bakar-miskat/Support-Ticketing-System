"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPortalRoot } from "@/lib/portal-root";

const GRID_MAX = 6;
const CELL_PX = 20;
const CELL_GAP = 3;

/** Above expanded description overlay (z-10000) */
const TABLE_PANEL_Z = 10060;

export function InsertTablePopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 3, cols: 3 });
  const [header, setHeader] = useState(true);
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

  function insert(rows = hover.rows, cols = hover.cols) {
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: header })
      .run();
    setOpen(false);
  }

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Insert table"
      className="fixed w-[196px] rounded-xl border border-sts-card-border bg-sts-card p-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
      style={{ top: coords.top, left: coords.left, zIndex: TABLE_PANEL_Z }}
    >
      <p className="mb-2 font-sans text-[11px] font-semibold tracking-wide text-sts-foreground">
        Insert table
      </p>

      <div
        className="mb-2 grid w-fit"
        style={{
          gridTemplateColumns: `repeat(${GRID_MAX}, ${CELL_PX}px)`,
          gap: CELL_GAP,
        }}
        onMouseLeave={() => setHover({ rows: 3, cols: 3 })}
      >
        {Array.from({ length: GRID_MAX * GRID_MAX }, (_, i) => {
          const row = Math.floor(i / GRID_MAX) + 1;
          const col = (i % GRID_MAX) + 1;
          const active = row <= hover.rows && col <= hover.cols;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${row} by ${col} table`}
              className={cn(
                "rounded-[3px] border transition-colors",
                active
                  ? "border-sts-id bg-sts-blue-tint"
                  : "border-sts-card-border bg-sts-surface hover:border-sts-muted",
              )}
              style={{ width: CELL_PX, height: CELL_PX }}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onClick={() => insert(row, col)}
            />
          );
        })}
      </div>

      <p className="mb-2 text-center font-sans text-[11px] text-sts-muted">
        {hover.rows} × {hover.cols}
      </p>

      <label className="mb-2 flex items-center gap-2 font-sans text-[11px] text-sts-muted">
        <input
          type="checkbox"
          checked={header}
          onChange={(e) => setHeader(e.target.checked)}
          className="rounded border-sts-card-border accent-sts-id"
        />
        Header row
      </label>

      <button
        type="button"
        onClick={() => insert()}
        className="h-8 w-full rounded-lg bg-sts-blue font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 dark:text-gray-900"
      >
        Insert {hover.rows}×{hover.cols}
      </button>
    </div>
  ) : null;

  const portalRoot = getPortalRoot();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Insert table"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex size-6 items-center justify-center rounded transition-colors",
          editor.isActive("table") || open
            ? "bg-sts-blue-tint font-semibold text-sts-id"
            : "text-sts-muted hover:bg-sts-card hover:text-sts-foreground",
        )}
      >
        <Table2 className="size-3.5" />
      </button>
      {portalRoot && panel ? createPortal(panel, portalRoot) : null}
    </>
  );
}
