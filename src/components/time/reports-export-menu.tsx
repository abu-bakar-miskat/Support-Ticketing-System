"use client";

import { useState } from "react";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { exportReports, type ReportExportFormat } from "@/lib/api/reports";
import type { ReportsOverview, SubDepartmentTimeResponse } from "@/lib/api/reports";
import type { ExportDoc } from "@/lib/exports/report-doc";
import { buildReportsExportDoc } from "@/lib/exports/reports-export-doc";

const EXPORT_OPTIONS: { format: ReportExportFormat; label: string }[] = [
  { format: "excel", label: "Excel (.xlsx)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "csv", label: "CSV (.csv)" },
];

export function ReportsExportMenu({
  subDepartmentTime,
  overview,
  rangeLabel,
  scopeLabel,
  document,
}: {
  subDepartmentTime?: SubDepartmentTimeResponse;
  overview?: ReportsOverview;
  rangeLabel: string;
  scopeLabel?: string;
  document?: ExportDoc;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!overview || !!document;

  async function handleExport(format: ReportExportFormat) {
    setOpen(false);
    setBusy(true);
    try {
      const baseDoc = document ?? buildReportsExportDoc({ subDepartmentTime, overview, rangeLabel, scopeLabel });
      const doc = baseDoc;
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
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-sts-card-border bg-sts-foreground px-3 font-sans text-[11.5px] font-medium text-[var(--sts-card-solid)] outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-sts-blue focus-visible:ring-offset-2 hover:opacity-85 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        <span>Export</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-48 rounded-xl border border-sts-card-border bg-sts-bg p-1.5 shadow-xl"
      >
        <p className="px-3 pb-1.5 pt-1 font-sans text-[11px] text-sts-subtle">
          Export current report
        </p>
        {EXPORT_OPTIONS.map((opt) => (
          <button
            key={opt.format}
            type="button"
            onClick={() => handleExport(opt.format)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left font-sans text-[12px] text-sts-foreground transition-colors hover:bg-sts-surface"
          >
            <Download className="size-3.5 shrink-0 text-sts-subtle" />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
