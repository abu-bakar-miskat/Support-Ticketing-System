"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, Info, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type NotionProperty = { id: string; name: string; type: string };
type NotionDatabase = { id: string; title: string; properties: NotionProperty[] };
type SubDepartmentOption = { id: string; name: string };
type ImportResult = {
  projectsCreated: number;
  projectsSkipped: number;
  ticketsCreated: number;
  ticketsSkipped: number;
  errors: string[];
};

// ── Primitives ────────────────────────────────────────────────────────────────

function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      className="bg-pen-bg"
    />
  );
}

function FieldRow({
  label,
  required,
  value,
  onChange,
  properties,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  properties: NotionProperty[];
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-3">
      <span className="font-sans text-[12.5px] text-pen-foreground">
        {label}
        {required && <span className="ml-0.5 text-pen-red">*</span>}
      </span>
      <NativeSelect
        value={value}
        onChange={onChange}
        options={properties.map((p) => ({ value: p.name, label: `${p.name} (${p.type})` }))}
        placeholder="— skip —"
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

// ── Step bar ──────────────────────────────────────────────────────────────────

const STEPS = ["Connect", "Configure", "Import"] as const;

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-[22px] items-center justify-center rounded-full font-sans text-[11px] font-semibold transition-colors",
                done && "bg-pen-green text-white",
                active && "bg-pen-blue text-white",
                !done && !active && "bg-pen-surface text-pen-muted",
              )}
            >
              {done ? <CheckCircle2 className="size-3" strokeWidth={2.5} /> : n}
            </div>
            <span
              className={cn(
                "font-sans text-[12.5px]",
                active ? "font-semibold text-pen-foreground" : "text-pen-muted",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight className="size-3.5 text-pen-subtle" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SettingsNotionImportPage({ subDepartments }: { subDepartments: SubDepartmentOption[] }) {
  const [step, setStep] = useState(1);

  // Step 1
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);

  // Step 2
  const [projectsDbId, setProjectsDbId] = useState("");
  const [tasksDbId, setTasksDbId] = useState("");
  const [subDepartmentId, setSubDepartmentId] = useState("");
  const [projectNameProp, setProjectNameProp] = useState("");
  const [projectStatusProp, setProjectStatusProp] = useState("");
  const [projectDescriptionProp, setProjectDescriptionProp] = useState("");
  const [taskTitleProp, setTaskTitleProp] = useState("");
  const [taskStatusProp, setTaskStatusProp] = useState("");
  const [taskPriorityProp, setTaskPriorityProp] = useState("");
  const [taskTypeProp, setTaskTypeProp] = useState("");
  const [taskAssigneeProp, setTaskAssigneeProp] = useState("");
  const [taskDueDateProp, setTaskDueDateProp] = useState("");
  const [taskStartDateProp, setTaskStartDateProp] = useState("");
  const [taskProjectRelationProp, setTaskProjectRelationProp] = useState("");

  // Step 3
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");

  const projectsDb = databases.find((d) => d.id === projectsDbId);
  const tasksDb = databases.find((d) => d.id === tasksDbId);

  async function handleConnect() {
    setConnecting(true);
    setConnectError("");
    try {
      const res = await fetch("/api/settings/notion/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setConnectError(data.error ?? "Connection failed"); return; }
      if (!data.databases?.length) {
        setConnectError("No databases found. Make sure you shared your databases with the integration.");
        return;
      }
      setDatabases(data.databases);
      setStep(2);
    } catch {
      setConnectError("Network error — is the server running?");
    } finally {
      setConnecting(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/settings/notion/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          mapping: {
            projectsDatabaseId: projectsDbId,
            tasksDatabaseId: tasksDbId,
            subDepartmentId,
            projectNameProp,
            projectStatusProp: projectStatusProp || undefined,
            projectDescriptionProp: projectDescriptionProp || undefined,
            taskTitleProp,
            taskStatusProp: taskStatusProp || undefined,
            taskPriorityProp: taskPriorityProp || undefined,
            taskTypeProp: taskTypeProp || undefined,
            taskAssigneeProp: taskAssigneeProp || undefined,
            taskDueDateProp: taskDueDateProp || undefined,
            taskStartDateProp: taskStartDateProp || undefined,
            taskProjectRelationProp: taskProjectRelationProp || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error ?? "Import failed"); return; }
      setResult(data);
    } catch {
      setImportError("Network error during import");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      {/* Header */}
      <div>
        <h1 className="pen-text-admin-title">
          Import from Notion
        </h1>
        <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
          One-time import of projects and tickets from a Notion workspace.
        </p>
      </div>

      <StepBar current={step} />

      {/* ── Step 1: Connect ────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="flex flex-col gap-4 rounded-[10px] border border-pen-card-border bg-pen-card p-5 sm:max-w-xl">
          <div className="flex items-start gap-2.5 rounded-[8px] bg-pen-surface px-3.5 py-2.5">
            <Info className="mt-px size-3.5 shrink-0 text-pen-muted" strokeWidth={2} />
            <p className="font-sans text-[11.5px] leading-snug text-pen-muted">
              Create an internal integration at{" "}
              <span className="font-medium text-pen-foreground">notion.so/my-integrations</span>,
              copy the token, then open each database in Notion and share it with the integration via{" "}
              <span className="font-medium text-pen-foreground">··· → Connections</span>.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-medium text-pen-foreground">
              Integration token
            </label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="secret_… or ntn_…"
              className="h-9 font-mono text-[13px]"
              onKeyDown={(e) => e.key === "Enter" && token && !connecting && handleConnect()}
            />
          </div>

          {connectError && (
            <p className="font-sans text-[12px] text-pen-red">{connectError}</p>
          )}

          <Button
            onClick={handleConnect}
            disabled={!token || connecting}
            className="w-fit gap-1.5 bg-pen-blue font-sans text-[12.5px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
          >
            {connecting && <Loader2 className="size-3.5 animate-spin" />}
            {connecting ? "Connecting…" : "Connect to Notion"}
          </Button>
        </div>
      )}

      {/* ── Step 2: Configure ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          {/* Databases & team */}
          <div className="flex flex-col gap-4 rounded-[10px] border border-pen-card-border bg-pen-card p-5">
            <SectionLabel>Databases</SectionLabel>
            <p className="font-sans text-[12.5px] text-pen-muted">
              Found{" "}
              <span className="font-medium text-pen-foreground">{databases.length}</span>{" "}
              database{databases.length !== 1 ? "s" : ""}. Map them to PEN concepts below.
            </p>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-[160px_1fr] items-center gap-3">
                <span className="font-sans text-[12.5px] text-pen-foreground">
                  Projects database <span className="text-pen-red">*</span>
                </span>
                <NativeSelect
                  value={projectsDbId}
                  onChange={(v) => {
                    setProjectsDbId(v);
                    const db = databases.find((d) => d.id === v);
                    const titleProp = db?.properties.find((p) => p.type === "title");
                    if (titleProp) setProjectNameProp(titleProp.name);
                  }}
                  options={databases.map((d) => ({ value: d.id, label: d.title }))}
                  placeholder="Select database…"
                />
              </div>

              <div className="grid grid-cols-[160px_1fr] items-center gap-3">
                <span className="font-sans text-[12.5px] text-pen-foreground">
                  Tasks database <span className="text-pen-red">*</span>
                </span>
                <NativeSelect
                  value={tasksDbId}
                  onChange={(v) => {
                    setTasksDbId(v);
                    const db = databases.find((d) => d.id === v);
                    const titleProp = db?.properties.find((p) => p.type === "title");
                    if (titleProp) setTaskTitleProp(titleProp.name);
                  }}
                  options={databases.map((d) => ({ value: d.id, label: d.title }))}
                  placeholder="Select database…"
                />
              </div>

              <div className="grid grid-cols-[160px_1fr] items-center gap-3">
                <span className="font-sans text-[12.5px] text-pen-foreground">
                  Assign to team <span className="text-pen-red">*</span>
                </span>
                <NativeSelect
                  value={subDepartmentId}
                  onChange={setSubDepartmentId}
                  options={subDepartments.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Select team…"
                />
              </div>
            </div>
          </div>

          {/* Project fields */}
          {projectsDb && (
            <div className="flex flex-col gap-3 rounded-[10px] border border-pen-card-border bg-pen-card p-5">
              <SectionLabel>Project fields — {projectsDb.title}</SectionLabel>
              <FieldRow
                label="Name"
                required
                value={projectNameProp}
                onChange={setProjectNameProp}
                properties={projectsDb.properties.filter((p) => ["title", "rich_text"].includes(p.type))}
              />
              <FieldRow
                label="Status"
                value={projectStatusProp}
                onChange={setProjectStatusProp}
                properties={projectsDb.properties.filter((p) => ["select", "status"].includes(p.type))}
              />
              <FieldRow
                label="Description"
                value={projectDescriptionProp}
                onChange={setProjectDescriptionProp}
                properties={projectsDb.properties.filter((p) => ["rich_text", "title"].includes(p.type))}
              />
            </div>
          )}

          {/* Task fields */}
          {tasksDb && (
            <div className="flex flex-col gap-3 rounded-[10px] border border-pen-card-border bg-pen-card p-5">
              <SectionLabel>Task fields — {tasksDb.title}</SectionLabel>
              <FieldRow label="Title" required value={taskTitleProp} onChange={setTaskTitleProp}
                properties={tasksDb.properties.filter((p) => ["title", "rich_text"].includes(p.type))} />
              <FieldRow label="Status" value={taskStatusProp} onChange={setTaskStatusProp}
                properties={tasksDb.properties.filter((p) => ["select", "status"].includes(p.type))} />
              <FieldRow label="Priority" value={taskPriorityProp} onChange={setTaskPriorityProp}
                properties={tasksDb.properties.filter((p) => ["select", "status"].includes(p.type))} />
              <FieldRow label="Type" value={taskTypeProp} onChange={setTaskTypeProp}
                properties={tasksDb.properties.filter((p) => ["select", "status"].includes(p.type))} />
              <FieldRow label="Assignee" value={taskAssigneeProp} onChange={setTaskAssigneeProp}
                properties={tasksDb.properties.filter((p) => p.type === "people")} />
              <FieldRow label="Due date" value={taskDueDateProp} onChange={setTaskDueDateProp}
                properties={tasksDb.properties.filter((p) => p.type === "date")} />
              <FieldRow label="Start date" value={taskStartDateProp} onChange={setTaskStartDateProp}
                properties={tasksDb.properties.filter((p) => p.type === "date")} />
              <FieldRow label="Project (relation)" value={taskProjectRelationProp} onChange={setTaskProjectRelationProp}
                properties={tasksDb.properties.filter((p) => p.type === "relation")} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="border-pen-card-border font-sans text-[12.5px]"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!projectsDbId || !tasksDbId || !subDepartmentId || !projectNameProp || !taskTitleProp}
              className="gap-1.5 bg-pen-blue font-sans text-[12.5px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Import ─────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-col gap-4 rounded-[10px] border border-pen-card-border bg-pen-card p-5 sm:max-w-xl">
          {!result && !importing && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="font-sans text-[13px] font-semibold text-pen-foreground">
                  Ready to import
                </p>
                <p className="font-sans text-[12.5px] leading-relaxed text-pen-muted">
                  Projects from{" "}
                  <span className="font-medium text-pen-foreground">{projectsDb?.title}</span> and
                  tasks from{" "}
                  <span className="font-medium text-pen-foreground">{tasksDb?.title}</span> will be
                  imported. Records are tracked by Notion page ID — re-running is safe.
                </p>
              </div>

              {importError && (
                <p className="font-sans text-[12px] text-pen-red">{importError}</p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="border-pen-card-border font-sans text-[12.5px]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  className="gap-1.5 bg-pen-blue font-sans text-[12.5px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
                >
                  Start import
                </Button>
              </div>
            </div>
          )}

          {importing && (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="size-4 animate-spin text-pen-blue" />
              <span className="font-sans text-[13px] text-pen-muted">
                Importing from Notion… this may take a moment.
              </span>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-pen-green" />
                <span className="font-sans text-[13px] font-semibold text-pen-foreground">
                  Import complete
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Projects created", value: result.projectsCreated },
                  { label: "Projects skipped", value: result.projectsSkipped },
                  { label: "Tickets created", value: result.ticketsCreated },
                  { label: "Tickets skipped", value: result.ticketsSkipped },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col gap-0.5 rounded-[8px] bg-pen-surface p-3">
                    <span className="font-sans text-[22px] font-bold tabular-nums text-pen-foreground">
                      {s.value}
                    </span>
                    <span className="font-sans text-[11px] text-pen-muted">{s.label}</span>
                  </div>
                ))}
              </div>

              {result.errors.length > 0 && (
                <div className="flex flex-col gap-2 rounded-[8px] border border-pen-card-border bg-pen-surface px-3.5 py-3">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="size-3.5 text-pen-red" />
                    <span className="font-sans text-[12px] font-semibold text-pen-red">
                      {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {result.errors.map((e, i) => (
                      <li key={i} className="font-mono text-[11px] text-pen-muted">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => { setResult(null); setImportError(""); }}
                className="w-fit border-pen-card-border font-sans text-[12.5px]"
              >
                Run again
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
