"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildTicketExportUrl, type ExportFormat } from "@/lib/api/tasks";

const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: "excel", label: "Excel (.xlsx)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "csv", label: "CSV (.csv)" },
];

/** Exports the given project's tickets, reusing the admin ticket-export endpoint. */
export function ProjectExportMenu({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  function handleExport(format: ExportFormat) {
    const url = buildTicketExportUrl({ projectId: [projectId] }, format);
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="Export tickets"
        aria-label="Export tickets"
        className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-pen-card-border px-2.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:border-pen-id hover:bg-pen-surface hover:text-pen-foreground"
      >
        <Download className="size-3.5" strokeWidth={2} />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-48 rounded-xl border border-pen-card-border bg-pen-bg p-1.5 shadow-xl"
      >
        <p className="px-3 pb-1.5 pt-1 font-sans text-[11px] text-pen-subtle">
          Export this project&apos;s tickets
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
