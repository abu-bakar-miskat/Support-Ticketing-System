"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type InstitutionStatus = "live" | "onboarding";

export type InstitutionRow = {
  id: string;
  name: string;
  color: string;
  domain: string;
  students: string;
  status: InstitutionStatus;
};

const STATUS_LABEL: Record<InstitutionStatus, string> = {
  live: "Live",
  onboarding: "Onboarding",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

function InfoBanner() {
  return (
    <div className="flex items-center gap-[9px] rounded-lg bg-pen-blue-tint px-3.5 py-2.5">
      <span
        className="size-[7px] shrink-0 rounded-full bg-pen-blue"
        aria-hidden
      />
      <p className="font-sans text-[11.5px] font-semibold text-pen-foreground dark:text-pen-id">
        Tenants in the PEN Group network. Each isolates its own students,
        tickets, and data.
      </p>
    </div>
  );
}

function StatusIndicator({ status }: { status: InstitutionStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "size-[7px] rounded-full",
          status === "live"
            ? "bg-pen-green"
            : "bg-[#c2410c] dark:bg-[#e0a96a]",
        )}
        aria-hidden
      />
      <span className="font-sans text-[11.5px] text-pen-muted">
        {STATUS_LABEL[status]}
      </span>
    </span>
  );
}

export function SettingsInstitutionsPage({
  institutions,
}: {
  institutions: InstitutionRow[];
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="pen-text-admin-title">
            Institutions
          </h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
            Tenants in the PEN Group network.
          </p>
        </div>
        <Button className="h-[34px] w-full shrink-0 gap-1.5 rounded-[7px] bg-pen-blue px-0 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 sm:w-[150px]">
          <Plus className="size-[13px]" strokeWidth={2.5} />
          Add institution
        </Button>
      </div>

      <InfoBanner />

      <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
              <TableHead className="h-8 w-[34%]">
                <SectionLabel>Institution</SectionLabel>
              </TableHead>
              <TableHead className="h-8 w-[28%]">
                <SectionLabel>Domain</SectionLabel>
              </TableHead>
              <TableHead className="h-8 w-[16%]">
                <SectionLabel>Students</SectionLabel>
              </TableHead>
              <TableHead className="h-8 w-[22%]">
                <SectionLabel>Status</SectionLabel>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {institutions.map((institution) => (
              <TableRow
                key={institution.id}
                className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]"
              >
                <TableCell className="py-0">
                  <div className="flex h-[52px] items-center gap-2.5">
                    <span
                      className="size-3 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: institution.color }}
                      aria-hidden
                    />
                    <span className="font-sans text-[13px] font-semibold text-pen-foreground">
                      {institution.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-0">
                  <div className="flex h-[52px] items-center">
                    <span className="font-mono text-[11.5px] text-pen-muted">
                      {institution.domain}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-0">
                  <div className="flex h-[52px] items-center">
                    <span className="font-mono text-xs font-semibold text-pen-foreground">
                      {institution.students}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-0">
                  <div className="flex h-[52px] items-center">
                    <StatusIndicator status={institution.status} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
