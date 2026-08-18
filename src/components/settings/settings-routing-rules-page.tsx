"use client";

import { ArrowRight, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RoutingRule = {
  id: string;
  index: number;
  conditionType: string;
  conditionValue: string;
  subDepartment: string;
  subDepartmentDotClassName: string;
  priority: string | null;
  enabled: boolean;
};

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

function RuleIndex({ index }: { index: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pen-surface font-sans text-[11.5px] font-medium text-pen-muted">
      {index}
    </span>
  );
}

function ConditionPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] font-semibold text-pen-foreground">
      {children}
    </span>
  );
}

function RoutingRuleRow({ rule }: { rule: RoutingRule }) {
  return (
    <div
      className={cn(
        "border-t border-[#f0f4f8] py-3.5 dark:border-[#3a3a37]",
        "flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-2.5",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-2.5">
        <RuleIndex index={rule.index} />
        <span className="shrink-0 font-sans text-[11.5px] text-pen-subtle">
          If
        </span>
        <ConditionPill>{rule.conditionType}</ConditionPill>
        <span className="font-sans text-[11.5px] text-pen-foreground">
          {rule.conditionValue}
        </span>
      </div>

      <div className="flex items-center gap-2.5 pl-7 sm:pl-0">
        <ArrowRight
          className="size-3.5 shrink-0 text-pen-subtle"
          aria-hidden
        />
        <span
          className={cn("size-2 shrink-0 rounded-[2px]", rule.subDepartmentDotClassName)}
          aria-hidden
        />
        <span className="min-w-0 truncate font-sans text-[11.5px] font-semibold text-pen-foreground">
          {rule.subDepartment}
        </span>
        <span className="min-w-0 flex-1 sm:flex-[1_0_0]" aria-hidden />
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
            aria-label={`Actions for rule ${rule.index}`}
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem className="font-sans text-xs">
              Edit rule
            </DropdownMenuItem>
            <DropdownMenuItem className="font-sans text-xs">
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem className="font-sans text-xs">
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" className="font-sans text-xs">
              Delete rule
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function SettingsRoutingRulesPage({ rules }: { rules: RoutingRule[] }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="pen-text-admin-title">
            Routing rules
          </h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
            Auto-assign incoming email tickets.
          </p>
        </div>
        <Button className="h-[34px] w-full shrink-0 gap-1.5 rounded-[7px] bg-pen-blue px-0 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 sm:w-[150px]">
          <Plus className="size-[13px]" strokeWidth={2.5} />
          Add rule
        </Button>
      </div>

      <Phase2Banner />

      <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pb-2 pt-4">
        <div className="pb-1.5">
          <h2 className="font-sans text-sm font-semibold text-pen-foreground">
            Routing rules
          </h2>
          <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">
            Applied top to bottom when an email ticket arrives. First match wins.
          </p>
        </div>

        {rules.map((rule) => (
          <RoutingRuleRow key={rule.id} rule={rule} />
        ))}

        <button
          type="button"
          className="flex h-[42px] w-full items-center gap-2 border-t border-[#f0f4f8] font-sans text-xs font-semibold text-pen-id transition-colors hover:text-pen-blue dark:border-[#3a3a37]"
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
          Add rule
        </button>
      </div>
    </div>
  );
}
