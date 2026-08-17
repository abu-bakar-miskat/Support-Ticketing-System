"use client";

import { useState } from "react";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { exportReports, type ReportExportFormat } from "@/lib/api/reports";
import type { ReportsOverview, TeamTimeResponse } from "@/lib/api/reports";
import { buildReportsExportDoc } from "@/lib/exports/reports-export-doc";

const EXPORT_OPTIONS: { format: ReportExportFormat; label: string }[] = [
  { format: "excel", label: "Excel (.xlsx)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "csv", label: "CSV (.csv)" },
];

export function ReportsExportMenu({
  teamTime,
  overview,
  rangeLabel,
  scopeLabel,
}: {
  teamTime?: TeamTimeResponse;
  overview?: ReportsOverview;
  rangeLabel: string;
  scopeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!teamTime || !!overview;

  async function handleExport(format: ReportExportFormat) {
    setOpen(false);
    setBusy(true);
    try {
      const doc = buildReportsExportDoc({ teamTime, overview, rangeLabel, scopeLabel });
      if (doc.sheets.length === 0) {
        toast.error("Nothing to export yet");
        return;
      }
      await exportReports(doc, format, "reports");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={!ready || busy}
        title="Export reports"
        className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-card px-3 font-sans text-[11.5px] font-semibold text-pen-foreground outline-none transition-colors hover:bg-pen-bg disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        <span>Export</span>
        <ChevronDown className="size-3 shrink-0 text-pen-subtle" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-48 rounded-xl border border-pen-card-border bg-pen-bg p-1.5 shadow-xl"
      >
        <p className="px-3 pb-1.5 pt-1 font-sans text-[11px] text-pen-subtle">
          Export current report
        </p>
        {EXPORT_OPTIONS.map((opt) => (
          <button
            key={opt.format}
            type="button"
            onClick={() => handleExport(opt.format)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left font-sans text-[12px] text-pen-foreground transition-colors hover:bg-pen-surface"
          >
            <Download className="size-3.5 shrink-0 text-pen-subtle" />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
