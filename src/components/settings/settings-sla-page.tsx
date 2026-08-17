"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SlaPriority = "urgent" | "high" | "normal" | "low";

export type SlaRow = {
  priority: SlaPriority;
  label: string;
  firstResponse: string;
  resolution: string;
};

const PRIORITY_PILL: Record<SlaPriority, string> = {
  urgent: "bg-pen-red-tint text-pen-red",
  high: "bg-[#fff7ed] text-[#c2410c] dark:bg-[#3a3026] dark:text-[#e0a96a]",
  normal: "bg-pen-surface text-pen-muted",
  low: "bg-pen-surface text-pen-muted",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

function Phase2Banner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-[9px] rounded-lg border border-[#c2410c] bg-[#fff7ed] px-3.5 py-[11px] dark:border-[#e0a96a] dark:bg-[#3a3026]"
    >
      <span className="flex h-4 shrink-0 items-center justify-center rounded bg-[#c2410c] px-[5px] font-sans text-[11.5px] font-medium tracking-[0.36px] text-[#f9fbfc] dark:bg-[#e0a96a] dark:text-[#262624]">
        P2
      </span>
      <p className="font-sans text-[11.5px] font-medium text-[#c2410c] dark:text-[#e0a96a]">
        Available once the student email helpdesk (Phase 2) launches. Previewing
        planned config.
      </p>
    </div>
  );
}

function PriorityPill({
  priority,
  label,
}: {
  priority: SlaPriority;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-[9px] py-0.5 font-sans text-[11.5px] font-medium",
        PRIORITY_PILL[priority],
      )}
    >
      {label}
    </span>
  );
}

function SlaMobileList({ rows }: { rows: SlaRow[] }) {
  return (
    <div className="divide-y divide-[#f0f4f8] dark:divide-[#3a3a37] sm:hidden">
      {rows.map((row) => (
        <div key={row.priority} className="flex flex-col gap-2 py-3.5">
          <PriorityPill priority={row.priority} label={row.label} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <SectionLabel>First response</SectionLabel>
              <span className="font-mono text-xs font-semibold text-pen-foreground">
                {row.firstResponse}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <SectionLabel>Resolution</SectionLabel>
              <span className="font-mono text-xs font-semibold text-pen-foreground">
                {row.resolution}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsSlaPage({ rows }: { rows: SlaRow[] }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="min-w-0">
        <h1 className="pen-text-admin-title">
          SLA policies
        </h1>
        <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
          Response and resolution targets.
        </p>
      </div>

      <Phase2Banner />

      <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
        <div className="pb-1.5">
          <h2 className="font-sans text-sm font-semibold text-pen-foreground">
            Response & resolution targets
          </h2>
          <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">
            Time limits per priority for student-facing tickets. Breaches escalate
            to the team lead.
          </p>
        </div>

        <SlaMobileList rows={rows} />

        <div className="hidden sm:block">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-[30px] w-[34%] pt-1.5">
                  <SectionLabel>Priority</SectionLabel>
                </TableHead>
                <TableHead className="h-[30px] w-[33%] pt-1.5">
                  <SectionLabel>First response</SectionLabel>
                </TableHead>
                <TableHead className="h-[30px] w-[33%] pt-1.5">
                  <SectionLabel>Resolution</SectionLabel>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.priority}
                  className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]"
                >
                  <TableCell className="py-0">
                    <div className="flex h-[46px] items-center">
                      <PriorityPill priority={row.priority} label={row.label} />
                    </div>
                  </TableCell>
                  <TableCell className="py-0">
                    <div className="flex h-[46px] items-center">
                      <span className="font-mono text-xs font-semibold text-pen-foreground">
                        {row.firstResponse}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-0">
                    <div className="flex h-[46px] items-center">
                      <span className="font-mono text-xs font-semibold text-pen-foreground">
                        {row.resolution}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
