"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateWorkspace } from "@/lib/api/workspace";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const WORKING_DAYS = ["Mon – Fri", "Mon – Sat", "Mon – Sun"];
const REMINDER_TIMES = ["08:00", "09:00", "10:00", "11:00", "12:00"];
const CURRENCIES = ["GBP (£)", "EUR (€)", "USD ($)"];
const ROUNDING_OPTIONS = ["1 minute", "5 minutes", "6 minutes", "15 minutes"];
const IDLE_STOP_OPTIONS = ["5 minutes", "15 minutes", "30 minutes", "1 hour"];
const APPROVERS = ["Tech Lead", "Project Manager", "Admin"];
const VISIBILITY_OPTIONS = ["Leads + Admins", "All members", "Admins only"];

type SelectRow = {
  kind: "select";
  id: string;
  options: readonly string[];
  defaultValue: string;
  widthClass: string;
};

type InputRow = {
  kind: "input";
  id: string;
  defaultValue: string;
  widthClass: string;
};

type SwitchRow = {
  kind: "switch";
  id: string;
  defaultOn: boolean;
};

type RowControl = SelectRow | InputRow | SwitchRow;

type SettingsRow = {
  label: string;
  description?: string;
  control: RowControl;
};

type SettingsSection = {
  title: string;
  description?: string;
  rows: SettingsRow[];
};

export const TIME_TRACKING_CONFIGURATION_SECTIONS: SettingsSection[] = [
  {
    title: "Capacity & targets",
    description: "Used for the My Time week strip and over/under-capacity flags.",
    rows: [
      {
        label: "Weekly hours target",
        description: "The 40h goal shown on timesheets",
        control: {
          kind: "input",
          id: "weeklyHoursTarget",
          defaultValue: "40 h",
          widthClass: "w-[90px]",
        },
      },
      {
        label: "Working days",
        control: {
          kind: "select",
          id: "workingDays",
          options: WORKING_DAYS,
          defaultValue: "Mon – Fri",
          widthClass: "w-[150px]",
        },
      },
      {
        label: "Daily tracking reminder",
        description: "Nudge if no timer started by",
        control: {
          kind: "select",
          id: "dailyReminder",
          options: REMINDER_TIMES,
          defaultValue: "10:00",
          widthClass: "w-[150px]",
        },
      },
    ],
  },
  {
    title: "Rounding & rules",
    rows: [
      {
        label: "Round entries to nearest",
        control: {
          kind: "select",
          id: "roundToNearest",
          options: ROUNDING_OPTIONS,
          defaultValue: "5 minutes",
          widthClass: "w-[150px]",
        },
      },
      {
        label: "Minimum entry length",
        control: {
          kind: "input",
          id: "minEntryLength",
          defaultValue: "1 min",
          widthClass: "w-[90px]",
        },
      },
      {
        label: "Auto-stop idle timers after",
        description: "Prevents forgotten running timers",
        control: {
          kind: "select",
          id: "autoStopIdle",
          options: IDLE_STOP_OPTIONS,
          defaultValue: "15 minutes",
          widthClass: "w-[150px]",
        },
      },
    ],
  },
];

export const TIME_TRACKING_APPROVALS_SECTIONS: SettingsSection[] = [
  {
    title: "Approval & visibility",
    rows: [
      {
        label: "Require weekly timesheet approval",
        control: {
          kind: "switch",
          id: "requireWeeklyApproval",
          defaultOn: true,
        },
      },
      {
        label: "Approver",
        description: "Who signs off timesheets",
        control: {
          kind: "select",
          id: "approver",
          options: APPROVERS,
          defaultValue: "Tech Lead",
          widthClass: "w-[150px]",
        },
      },
      {
        label: "Lock entries after approval",
        control: {
          kind: "switch",
          id: "lockAfterApproval",
          defaultOn: true,
        },
      },
      {
        label: "Team time visible to",
        description: "Who can see the Team Time report",
        control: {
          kind: "select",
          id: "teamTimeVisibleTo",
          options: VISIBILITY_OPTIONS,
          defaultValue: "Leads + Admins",
          widthClass: "w-[150px]",
        },
      },
    ],
  },
];

function buildDefaultSwitches(sections: SettingsSection[]) {
  return Object.fromEntries(
    sections.flatMap((section) =>
    section.rows
      .filter((row) => row.control.kind === "switch")
      .map((row) => [
        row.control.id,
        (row.control as SwitchRow).defaultOn,
      ]),
    ),
  ) as Record<string, boolean>;
}

function buildDefaultSelects(sections: SettingsSection[]) {
  return Object.fromEntries(
    sections.flatMap((section) =>
    section.rows
      .filter((row) => row.control.kind === "select")
      .map((row) => [
        row.control.id,
        (row.control as SelectRow).defaultValue,
      ]),
    ),
  ) as Record<string, string>;
}

function buildDefaultInputs(sections: SettingsSection[]) {
  return Object.fromEntries(
    sections.flatMap((section) =>
    section.rows
      .filter((row) => row.control.kind === "input")
      .map((row) => [
        row.control.id,
        (row.control as InputRow).defaultValue,
      ]),
    ),
  ) as Record<string, string>;
}

function mergeKnown<T extends string | boolean>(
  defaults: Record<string, T>,
  overrides: Record<string, string | boolean> | undefined,
) {
  if (!overrides) return defaults;
  const merged = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = overrides[key];
    if (typeof value === typeof merged[key]) merged[key] = value as T;
  }
  return merged;
}

const controlFieldClass =
  "h-8 rounded-md border-pen-card-border bg-pen-bg px-[11px] font-sans text-xs text-pen-foreground shadow-none";

const switchClassName =
  "h-[22px] w-[38px] shrink-0 data-checked:bg-pen-blue data-unchecked:bg-pen-surface dark:data-unchecked:bg-pen-card-border [&_[data-slot=switch-thumb]]:size-4 [&_[data-slot=switch-thumb]]:data-checked:translate-x-[calc(100%-2px)]";

function SettingsRowControl({
  row,
  switches,
  selects,
  inputs,
  onSwitchChange,
  onSelectChange,
  onInputChange,
  onInputBlur,
}: {
  row: SettingsRow;
  switches: Record<string, boolean>;
  selects: Record<string, string>;
  inputs: Record<string, string>;
  onSwitchChange: (id: string, checked: boolean) => void;
  onSelectChange: (id: string, value: string) => void;
  onInputChange: (id: string, value: string) => void;
  onInputBlur: () => void;
}) {
  const { control } = row;

  if (control.kind === "switch") {
    return (
      <Switch
        id={control.id}
        checked={switches[control.id] ?? control.defaultOn}
        onCheckedChange={(checked) => onSwitchChange(control.id, checked)}
        className={switchClassName}
      />
    );
  }

  if (control.kind === "select") {
    return (
      <Select
        value={selects[control.id] ?? control.defaultValue}
        onValueChange={(value) => value && onSelectChange(control.id, value)}
      >
        <SelectTrigger
          className={cn(controlFieldClass, control.widthClass, "gap-1.5")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {control.options.map((option) => (
            <SelectItem
              key={option}
              value={option}
              className="font-sans text-xs"
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      id={control.id}
      value={inputs[control.id] ?? control.defaultValue}
      onChange={(event) => onInputChange(control.id, event.target.value)}
      onBlur={onInputBlur}
      className={cn(controlFieldClass, control.widthClass)}
    />
  );
}

function SettingsCard({
  title,
  description,
  rows,
  switches,
  selects,
  inputs,
  onSwitchChange,
  onSelectChange,
  onInputChange,
  onInputBlur,
}: {
  title: string;
  description?: string;
  rows: SettingsRow[];
  switches: Record<string, boolean>;
  selects: Record<string, string>;
  inputs: Record<string, string>;
  onSwitchChange: (id: string, checked: boolean) => void;
  onSelectChange: (id: string, value: string) => void;
  onInputChange: (id: string, value: string) => void;
  onInputBlur: () => void;
}) {
  return (
    <section
      className={cn(
        "w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card",
        "px-[22px] pt-4 pb-2",
      )}
    >
      <div className="flex flex-col gap-0.5 pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-pen-foreground">
          {title}
        </h2>
        {description ? (
          <p className="font-sans text-[11.5px] text-pen-muted">
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.control.id}
            className="flex flex-col gap-3 border-t border-pen-surface py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <label
                htmlFor={row.control.id}
                className="font-sans text-[12.5px] font-semibold text-pen-foreground"
              >
                {row.label}
              </label>
              {row.description ? (
                <p className="font-sans text-[11.5px] text-pen-subtle">
                  {row.description}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 self-start sm:self-center">
              <SettingsRowControl
                row={row}
                switches={switches}
                selects={selects}
                inputs={inputs}
                onSwitchChange={onSwitchChange}
                onSelectChange={onSelectChange}
                onInputChange={onInputChange}
                onInputBlur={onInputBlur}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsTimeTrackingView({
  title,
  description,
  sections,
  configKey,
  initialValues,
}: {
  title: string;
  description: string;
  sections: SettingsSection[];
  configKey: "timeTrackingConfig" | "approvalsConfig";
  initialValues?: Record<string, string | boolean>;
}) {
  const [switches, setSwitches] = useState<Record<string, boolean>>(() =>
    mergeKnown(buildDefaultSwitches(sections), initialValues),
  );
  const [selects, setSelects] = useState<Record<string, string>>(() =>
    mergeKnown(buildDefaultSelects(sections), initialValues),
  );
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    mergeKnown(buildDefaultInputs(sections), initialValues),
  );

  function persist(
    nextSwitches: Record<string, boolean>,
    nextSelects: Record<string, string>,
    nextInputs: Record<string, string>,
  ) {
    const config = { ...nextInputs, ...nextSelects, ...nextSwitches };
    void updateWorkspace({ [configKey]: config }).catch(() =>
      toast.error("Failed to save settings"),
    );
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex max-w-[920px] flex-col gap-1">
        <h1 className="pen-text-admin-title">
          {title}
        </h1>
        <p className="font-sans text-[13px] text-pen-muted">{description}</p>
      </header>

      {sections.map((section) => (
        <SettingsCard
          key={section.title}
          title={section.title}
          description={section.description}
          rows={section.rows}
          switches={switches}
          selects={selects}
          inputs={inputs}
          onSwitchChange={(id, checked) => {
            const next = { ...switches, [id]: checked };
            setSwitches(next);
            persist(next, selects, inputs);
          }}
          onSelectChange={(id, value) => {
            const next = { ...selects, [id]: value };
            setSelects(next);
            persist(switches, next, inputs);
          }}
          onInputChange={(id, value) =>
            setInputs((current) => ({ ...current, [id]: value }))
          }
          onInputBlur={() => persist(switches, selects, inputs)}
        />
      ))}
    </div>
  );
}

function withApproverOptions(
  sections: SettingsSection[],
  approverOptions: string[],
): SettingsSection[] {
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => {
      if (row.control.kind !== "select" || row.control.id !== "approver") {
        return row;
      }
      return {
        ...row,
        control: {
          ...row.control,
          options: approverOptions,
          defaultValue: approverOptions.includes(row.control.defaultValue)
            ? row.control.defaultValue
            : approverOptions[0],
        },
      };
    }),
  }));
}

export function SettingsTimeTrackingConfigurationPage({
  initialConfig,
}: {
  initialConfig?: Record<string, string | boolean>;
}) {
  return (
    <SettingsTimeTrackingView
      title="Configuration"
      description="Configure capacity targets and rounding rules for time entries."
      sections={TIME_TRACKING_CONFIGURATION_SECTIONS}
      configKey="timeTrackingConfig"
      initialValues={initialConfig}
    />
  );
}

export function SettingsTimeTrackingApprovalsPage({
  initialConfig,
  approverOptions,
}: {
  initialConfig?: Record<string, string | boolean>;
  approverOptions?: string[];
}) {
  const sections = approverOptions?.length
    ? withApproverOptions(TIME_TRACKING_APPROVALS_SECTIONS, approverOptions)
    : TIME_TRACKING_APPROVALS_SECTIONS;

  return (
    <SettingsTimeTrackingView
      title="Approvals"
      description="Set who approves timesheets and who can view team time reports."
      sections={sections}
      configKey="approvalsConfig"
      initialValues={initialConfig}
    />
  );
}
