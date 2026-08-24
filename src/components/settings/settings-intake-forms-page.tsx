"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import {
  Plus,
  Copy,
  Check,
  Pencil,
  Trash2,
  X,
  Settings2,
  Loader2,
  GripVertical,
  Type,
  AlignLeft,
  ChevronDown,
  Paperclip,
  Inbox,
  ArrowUpRight,
  Mail,
  Hash,
  MessageCircle,
  FileText,
  RefreshCw,
  Gauge,
  ListChecks,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type UserListPerson } from "@/lib/user-list-person";
import {
  DEFAULT_FIELD_KEYS,
  DEFAULT_INTAKE_FIELDS,
  type DefaultFieldKey,
  type ResolvedDefaultFields,
} from "@/lib/intake-default-fields";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  isHexColor,
  type FormBranding,
  type FormBrandingDefaults,
} from "@/lib/form-branding";
import { Palette } from "lucide-react";

const SWITCH_ACCENTS = {
  green: {
    track: "border-pen-green/50 bg-pen-green-tint",
    label: "text-pen-green",
    thumb: "bg-pen-green",
  },
  blue: {
    track: "border-pen-blue/50 bg-pen-blue-tint",
    label: "text-pen-blue",
    thumb: "bg-pen-blue",
  },
} as const;

function LabeledSwitch({
  checked,
  onLabel,
  offLabel,
  onToggle,
  accent = "blue",
  loading = false,
  title,
}: {
  checked: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: () => void;
  accent?: keyof typeof SWITCH_ACCENTS;
  loading?: boolean;
  title?: string;
}) {
  const colors = SWITCH_ACCENTS[accent];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      disabled={loading}
      title={title}
      className={cn(
        "relative h-7 w-[80px] shrink-0 cursor-pointer overflow-hidden rounded-full border transition-colors duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-id/60 focus-visible:ring-offset-1 focus-visible:ring-offset-pen-bg",
        checked
          ? colors.track
          : "border-pen-card-border bg-pen-surface hover:border-pen-muted/60",
        loading && "cursor-wait opacity-70",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 font-sans text-[10px] font-semibold tracking-wide transition-colors duration-300",
          checked ? cn("left-3", colors.label) : "right-2.5 text-pen-muted",
        )}
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : checked ? (
          onLabel
        ) : (
          offLabel
        )}
      </span>
      <span
        className={cn(
          "absolute left-[3px] top-1/2 size-5 -translate-y-1/2 rounded-full shadow-sm transition-all duration-300 ease-out",
          checked ? cn("translate-x-[52px]", colors.thumb) : "translate-x-0 bg-pen-muted",
        )}
      />
    </button>
  );
}

export type AssignmentMethod = "RULE_BASED" | "ROUND_ROBIN" | "WORKLOAD_BASED" | "MANUAL";

export const ASSIGNMENT_METHOD_LABELS: Record<AssignmentMethod, string> = {
  RULE_BASED: "Rule-based",
  ROUND_ROBIN: "Round-robin",
  WORKLOAD_BASED: "Workload-based",
  MANUAL: "Manual",
};

export const ASSIGNMENT_METHOD_STYLES: Record<
  AssignmentMethod,
  { icon: LucideIcon; className: string }
> = {
  RULE_BASED: { icon: ListChecks, className: "text-violet-600 dark:text-violet-400" },
  ROUND_ROBIN: { icon: RefreshCw, className: "text-sky-600 dark:text-sky-400" },
  WORKLOAD_BASED: { icon: Gauge, className: "text-amber-600 dark:text-amber-400" },
  MANUAL: { icon: UserCog, className: "text-emerald-600 dark:text-emerald-400" },
};

export type IntakeFormRow = {
  id: string;
  name: string;
  isActive: boolean;
  autoAssign: boolean;
  displayMode: "FORM" | "CHAT";
  departmentId: string;
  departmentName: string;
  intakeSubDepartmentId: string;
  intakeSubDepartmentName: string;
  workloadThreshold: number;
  intakeCount: number;
  createdAt: string;
  defaultFields: ResolvedDefaultFields;
  branding: FormBranding;
  /** This form's own method override (null = inherits sub-dept → dept). */
  assignmentMethod: AssignmentMethod | null;
  /** Resolved method actually used: form → sub-department → department → round-robin. */
  effectiveMethod: AssignmentMethod;
};

export type SubDepartmentOption = { id: string; name: string };
export type MemberOption = UserListPerson;
export type DeptOption = {
  id: string;
  name: string;
  subDepartments: SubDepartmentOption[];
  members: MemberOption[];
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[11.5px] font-medium text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
      title={url}
    >
      {copied ? (
        <Check className="size-3 text-pen-green" />
      ) : (
        <Copy className="size-3" />
      )}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

type FormState = {
  name: string;
  departmentId: string;
  intakeSubDepartmentId: string;
  workloadThreshold: number;
  isActive: boolean;
  autoAssign: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  departmentId: "",
  intakeSubDepartmentId: "",
  workloadThreshold: 5,
  isActive: true,
  autoAssign: true,
};

type ModalMode = { type: "create" } | { type: "edit"; form: IntakeFormRow };

function IntakeFormModal({
  mode,
  departments,
  onClose,
  onSuccess,
}: {
  mode: ModalMode;
  departments: DeptOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = mode.type === "edit";
  const [name, setName] = useState(isEdit ? mode.form.name : "");
  const [departmentId, setDepartmentId] = useState(
    isEdit ? mode.form.departmentId : (departments[0]?.id ?? ""),
  );
  const [intakeSubDepartmentId, setIntakeSubDepartmentId] = useState(
    isEdit ? mode.form.intakeSubDepartmentId : "",
  );
  const [workloadThreshold, setWorkloadThreshold] = useState(
    isEdit ? mode.form.workloadThreshold : 5,
  );
  const [isActive, setIsActive] = useState(isEdit ? mode.form.isActive : true);
  const [autoAssign, setAutoAssign] = useState(isEdit ? mode.form.autoAssign : true);
  const [displayMode, setDisplayMode] = useState<"FORM" | "CHAT">(
    isEdit ? mode.form.displayMode : "FORM",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const availableSubDepartments =
    departments.find((d) => d.id === departmentId)?.subDepartments ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Form name is required.");
      return;
    }
    if (!intakeSubDepartmentId) {
      setError("Support team is required.");
      return;
    }
    if (!isEdit && !departmentId) {
      setError("Department is required.");
      return;
    }

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/intake/forms/${mode.form.id}`
        : "/api/intake/forms";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? { name: name.trim(), intakeSubDepartmentId, workloadThreshold, isActive, autoAssign, displayMode }
            : {
                name: name.trim(),
                departmentId,
                intakeSubDepartmentId,
                workloadThreshold,
                autoAssign,
                displayMode,
              },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Something went wrong.");
        return;
      }
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 pen-overlay-backdrop"
        onClick={onClose}
      />
      <div className="pen-glass-panel relative w-full max-w-md rounded-2xl border border-pen-card-border p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="pen-text-modal-title">
            {isEdit ? "Edit support form" : "New support form"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Form name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. IT Support Request"
              className="h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
            />
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                Department
              </label>
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v ?? "");
                  setIntakeSubDepartmentId("");
                }}
              >
                <SelectTrigger className="h-9 w-full rounded-lg border-pen-card-border bg-pen-surface font-sans text-[13px] text-pen-foreground">
                  <span
                    className={
                      departmentId ? "text-pen-foreground" : "text-pen-subtle"
                    }
                  >
                    {departments.find((d) => d.id === departmentId)?.name ??
                      "Select department"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem
                      key={d.id}
                      value={d.id}
                      className="font-sans text-[12.5px]"
                    >
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Support team
            </label>
            <Select
              value={intakeSubDepartmentId}
              onValueChange={(v) => setIntakeSubDepartmentId(v ?? "")}
              disabled={!departmentId && !isEdit}
            >
              <SelectTrigger className="h-9 w-full rounded-lg border-pen-card-border bg-pen-surface font-sans text-[13px] text-pen-foreground">
                <span
                  className={
                    intakeSubDepartmentId ? "text-pen-foreground" : "text-pen-subtle"
                  }
                >
                  {availableSubDepartments.find((t) => t.id === intakeSubDepartmentId)?.name ??
                    "Select team"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {availableSubDepartments.map((t) => (
                  <SelectItem
                    key={t.id}
                    value={t.id}
                    className="font-sans text-[12.5px]"
                  >
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Form style
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "FORM", label: "Classic form", icon: <FileText className="size-3.5" /> },
                  { value: "CHAT", label: "Chat", icon: <MessageCircle className="size-3.5" /> },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDisplayMode(opt.value)}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-lg border font-sans text-[12.5px] font-medium transition-colors",
                    displayMode === opt.value
                      ? "border-pen-id bg-pen-blue-tint text-pen-id"
                      : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground",
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="font-sans text-[11.5px] text-pen-subtle">
              Chat asks the form&apos;s questions one at a time, like a conversation.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Workload threshold
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={workloadThreshold}
              onChange={(e) => setWorkloadThreshold(Number(e.target.value))}
              className="h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id focus:ring-1 focus:ring-pen-id"
            />
            <p className="font-sans text-[11.5px] text-pen-subtle">
              Max open tickets before a member is considered at capacity.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                Auto-assign
              </label>
              <p className="font-sans text-[11px] text-pen-subtle">
                {autoAssign ? "New tickets assigned via ROTA round-robin" : "New tickets left unassigned for manual pick"}
              </p>
            </div>
            <LabeledSwitch
              checked={autoAssign}
              onLabel="Auto"
              offLabel="Manual"
              onToggle={() => setAutoAssign((v) => !v)}
            />
          </div>

          {isEdit && (
            <div className="flex items-center justify-between">
              <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                Status
              </label>
              <LabeledSwitch
                checked={isActive}
                onLabel="Active"
                offLabel="Inactive"
                accent="green"
                onToggle={() => setIsActive((v) => !v)}
              />
            </div>
          )}

          {error && (
            <p className="font-sans text-[11.5px] text-pen-red">{error}</p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="font-sans text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-pen-blue font-sans text-xs text-white hover:bg-pen-blue/90 dark:text-gray-900"
            >
              {saving
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create form"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Field types ───────────────────────────────────────────────────────────────

type FieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
};

type FieldRow = {
  id: string;
  label: string;
  type: "text" | "richtext" | "select" | "file" | "email" | "number";
  isRequired: boolean;
  options: string[];
  childOptions: Record<string, string[]>;
  order: number;
  placeholder?: string | null;
  helperText?: string | null;
  validation?: FieldValidation | null;
};

const FIELD_TYPES: { value: FieldRow["type"]; label: string; icon: React.ReactNode }[] = [
  { value: "text", label: "Short text", icon: <Type className="size-3.5" /> },
  { value: "richtext", label: "Rich text", icon: <AlignLeft className="size-3.5" /> },
  { value: "email", label: "Email", icon: <Mail className="size-3.5" /> },
  { value: "number", label: "Number", icon: <Hash className="size-3.5" /> },
  { value: "select", label: "Dropdown", icon: <ChevronDown className="size-3.5" /> },
  { value: "file", label: "File upload", icon: <Paperclip className="size-3.5" /> },
];

function typeLabel(type: FieldRow["type"]) {
  return FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

function FieldTypeIcon({ type }: { type: FieldRow["type"] }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-pen-surface text-pen-muted">
      {FIELD_TYPES.find((t) => t.value === type)?.icon}
    </span>
  );
}

// Metadata for the Classic Form's default static fields. Their title +
// placeholder are editable per department (see lib/intake-default-fields); the
// fields themselves can't be deleted.
const DEFAULT_FIELD_META: Record<
  DefaultFieldKey,
  { typeLabel: string; required: boolean; icon: React.ReactNode }
> = {
  submitterName: { typeLabel: "Short text", required: true, icon: <Type className="size-3.5" /> },
  submitterEmail: { typeLabel: "Email", required: true, icon: <Mail className="size-3.5" /> },
  title: { typeLabel: "Short text", required: false, icon: <Type className="size-3.5" /> },
  issueType: { typeLabel: "Dropdown", required: true, icon: <ChevronDown className="size-3.5" /> },
};

type FieldEditorState = {
  label: string;
  type: FieldRow["type"];
  isRequired: boolean;
  options: string[];
  childOptions: Record<string, string[]>;
  placeholder: string;
  helperText: string;
  validation: FieldValidation;
};

function FieldEditor({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: FieldEditorState;
  onSave: (s: FieldEditorState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [state, setState] = useState<FieldEditorState>(initial);
  const [newOption, setNewOption] = useState("");
  const [expandedOption, setExpandedOption] = useState<string | null>(null);
  const [newChild, setNewChild] = useState("");
  const [editingChild, setEditingChild] = useState<{ parent: string; idx: number; draft: string } | null>(null);
  const [editingOption, setEditingOption] = useState<{ idx: number; draft: string } | null>(null);

  function addOption() {
    const trimmed = newOption.trim();
    if (!trimmed || state.options.includes(trimmed)) return;
    setState((s) => ({ ...s, options: [...s.options, trimmed] }));
    setNewOption("");
  }

  function removeOption(opt: string) {
    setState((s) => {
      const childOptions = { ...s.childOptions };
      delete childOptions[opt];
      return { ...s, options: s.options.filter((o) => o !== opt), childOptions };
    });
    if (expandedOption === opt) setExpandedOption(null);
  }

  function addChild(parent: string) {
    const trimmed = newChild.trim();
    if (!trimmed) return;
    const existing = state.childOptions[parent] ?? [];
    if (existing.includes(trimmed)) return;
    setState((s) => ({
      ...s,
      childOptions: { ...s.childOptions, [parent]: [...existing, trimmed] },
    }));
    setNewChild("");
  }

  function removeChild(parent: string, child: string) {
    setState((s) => ({
      ...s,
      childOptions: {
        ...s.childOptions,
        [parent]: (s.childOptions[parent] ?? []).filter((c) => c !== child),
      },
    }));
  }

  function confirmEditOption() {
    if (!editingOption) return;
    const { idx, draft } = editingOption;
    const trimmed = draft.trim();
    if (trimmed) {
      setState((s) => {
        const options = [...s.options];
        const oldVal = options[idx];
        options[idx] = trimmed;
        const childOptions = { ...s.childOptions };
        if (oldVal in childOptions) {
          childOptions[trimmed] = childOptions[oldVal];
          delete childOptions[oldVal];
        }
        return { ...s, options, childOptions };
      });
      if (expandedOption === state.options[idx]) setExpandedOption(trimmed);
    }
    setEditingOption(null);
  }

  function confirmEditChild() {
    if (!editingChild) return;
    const { parent, idx, draft } = editingChild;
    const trimmed = draft.trim();
    if (trimmed) {
      setState((s) => {
        const children = [...(s.childOptions[parent] ?? [])];
        children[idx] = trimmed;
        return { ...s, childOptions: { ...s.childOptions, [parent]: children } };
      });
    }
    setEditingChild(null);
  }

  const hasPlaceholder = state.type === "text" || state.type === "email" || state.type === "number";
  const hasValidation = state.type !== "select" && state.type !== "file";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-pen-id/30 bg-pen-card px-4 py-3.5 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">
          Label
        </label>
        <input
          autoFocus
          value={state.label}
          onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
          placeholder="e.g. Full name"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(state);
            if (e.key === "Escape") onCancel();
          }}
          className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">
          Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setState((s) => ({ ...s, type: t.value, options: [], childOptions: {}, validation: {} }))}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-sans text-[11.5px] font-medium transition-colors",
                state.type === t.value
                  ? "border-pen-id bg-pen-blue-tint font-semibold text-pen-id"
                  : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {state.type === "select" && (
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">
            Options
          </label>

          <div className="flex flex-col gap-1">
            {state.options.map((opt, idx) => {
              const children = state.childOptions[opt] ?? [];
              const isOpen = expandedOption === opt;
              const isEditingOpt = editingOption?.idx === idx;
              return (
                <div key={opt} className="rounded-lg border border-pen-card-border bg-pen-surface">
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    {isEditingOpt ? (
                      <>
                        <input
                          autoFocus
                          value={editingOption.draft}
                          onChange={(e) => setEditingOption({ ...editingOption, draft: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); confirmEditOption(); }
                            if (e.key === "Escape") setEditingOption(null);
                          }}
                          className="h-6 min-w-0 flex-1 rounded-md border border-pen-id bg-pen-card px-2 font-sans text-[12px] text-pen-foreground outline-none"
                        />
                        <button type="button" onClick={confirmEditOption} className="flex h-6 items-center justify-center rounded-md bg-pen-blue px-2 text-white">
                          <Check className="size-3" />
                        </button>
                        <button type="button" onClick={() => setEditingOption(null)} className="flex h-6 items-center justify-center rounded-md border border-pen-card-border px-2 text-pen-subtle hover:text-pen-foreground">
                          <X className="size-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 font-sans text-[12px] text-pen-foreground">{opt}</span>
                        <button
                          type="button"
                          onClick={() => setExpandedOption(isOpen ? null : opt)}
                          className={cn(
                            "flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[10.5px] transition-colors",
                            isOpen ? "bg-pen-blue-tint text-pen-id" : "text-pen-subtle hover:text-pen-foreground",
                          )}
                        >
                          <ChevronDown className={cn("size-3 transition-transform", isOpen && "rotate-180")} />
                          {children.length > 0 ? `${children.length} sub-option${children.length !== 1 ? "s" : ""}` : "Sub-options"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingOption({ idx, draft: opt })}
                          className="text-pen-subtle hover:text-pen-foreground"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOption(opt)}
                          className="text-pen-subtle hover:text-pen-red"
                        >
                          <X className="size-3" />
                        </button>
                      </>
                    )}
                  </div>

                  {isOpen && (
                    <div className="border-t border-pen-card-border px-2.5 py-2 flex flex-col gap-1.5">
                      {children.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {children.map((child, idx) => {
                            const isEditingThis = editingChild?.parent === opt && editingChild?.idx === idx;
                            return isEditingThis ? (
                              <div key={child} className="flex gap-1.5">
                                <input
                                  autoFocus
                                  value={editingChild.draft}
                                  onChange={(e) => setEditingChild({ ...editingChild, draft: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); confirmEditChild(); }
                                    if (e.key === "Escape") setEditingChild(null);
                                  }}
                                  className="h-6 min-w-0 flex-1 rounded-md border border-pen-id bg-pen-card px-2 font-sans text-[11.5px] text-pen-foreground outline-none"
                                />
                                <button type="button" onClick={confirmEditChild} className="flex h-6 items-center justify-center rounded-md bg-pen-blue px-2 text-white">
                                  <Check className="size-2.5" />
                                </button>
                                <button type="button" onClick={() => setEditingChild(null)} className="flex h-6 items-center justify-center rounded-md border border-pen-card-border px-2 text-pen-subtle hover:text-pen-foreground">
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            ) : (
                              <div key={child} className="flex items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-card px-2 py-1">
                                <span className="flex-1 font-sans text-[11px] text-pen-foreground">{child}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingChild({ parent: opt, idx, draft: child })}
                                  className="text-pen-subtle hover:text-pen-foreground"
                                >
                                  <Pencil className="size-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeChild(opt, child)}
                                  className="text-pen-subtle hover:text-pen-red"
                                >
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          value={newChild}
                          onChange={(e) => setNewChild(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addChild(opt); }
                          }}
                          placeholder={`Add sub-option for "${opt}"…`}
                          className="h-6 min-w-0 flex-1 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[11.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                        />
                        <button
                          type="button"
                          onClick={() => addChild(opt)}
                          className="flex h-6 items-center gap-1 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[11px] text-pen-muted hover:text-pen-foreground"
                        >
                          <Plus className="size-2.5" />
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-1.5">
            <input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
              placeholder="Add option…"
              className="h-7 min-w-0 flex-1 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
            />
            <button
              type="button"
              onClick={addOption}
              className="flex h-7 items-center gap-1 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
            >
              <Plus className="size-3" />
              Add
            </button>
          </div>
        </div>
      )}

      {/* Placeholder */}
      {hasPlaceholder && (
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">
            Placeholder text
          </label>
          <input
            value={state.placeholder}
            onChange={(e) => setState((s) => ({ ...s, placeholder: e.target.value }))}
            placeholder="e.g. Enter your answer here…"
            className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
          />
        </div>
      )}

      {/* Helper text */}
      <div className="flex flex-col gap-1">
        <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">
          Helper text
        </label>
        <input
          value={state.helperText}
          onChange={(e) => setState((s) => ({ ...s, helperText: e.target.value }))}
          placeholder="e.g. Include your department and issue type"
          className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
        />
        <p className="font-sans text-[10.5px] text-pen-subtle">Shown below the field to guide submitters.</p>
      </div>

      {/* Validation rules */}
      {hasValidation && (
        <div className="flex flex-col gap-2 border-t border-pen-card-border pt-3">
          <label className="font-sans text-[10.5px] font-medium uppercase tracking-[0.08em] text-pen-subtle/80">
            Validation · optional
          </label>

          {(state.type === "text" || state.type === "richtext") && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[11px] text-pen-muted">Min length</span>
                <input
                  type="number"
                  min={0}
                  value={state.validation.minLength ?? ""}
                  onChange={(e) => setState((s) => ({ ...s, validation: { ...s.validation, minLength: e.target.value ? Number(e.target.value) : undefined } }))}
                  placeholder="—"
                  className="h-7 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[11px] text-pen-muted">Max length</span>
                <input
                  type="number"
                  min={0}
                  value={state.validation.maxLength ?? ""}
                  onChange={(e) => setState((s) => ({ ...s, validation: { ...s.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } }))}
                  placeholder="—"
                  className="h-7 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id"
                />
              </div>
            </div>
          )}

          {state.type === "number" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[11px] text-pen-muted">Min value</span>
                <input
                  type="number"
                  value={state.validation.min ?? ""}
                  onChange={(e) => setState((s) => ({ ...s, validation: { ...s.validation, min: e.target.value ? Number(e.target.value) : undefined } }))}
                  placeholder="—"
                  className="h-7 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[11px] text-pen-muted">Max value</span>
                <input
                  type="number"
                  value={state.validation.max ?? ""}
                  onChange={(e) => setState((s) => ({ ...s, validation: { ...s.validation, max: e.target.value ? Number(e.target.value) : undefined } }))}
                  placeholder="—"
                  className="h-7 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id"
                />
              </div>
            </div>
          )}

          {(state.type === "text" || state.type === "email") && (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[11px] text-pen-muted">Regex pattern</span>
                <input
                  value={state.validation.pattern ?? ""}
                  onChange={(e) => setState((s) => ({ ...s, validation: { ...s.validation, pattern: e.target.value || undefined } }))}
                  placeholder="e.g. ^[A-Z]{2}-\d{4}$"
                  className="h-7 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-mono text-[11.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                />
              </div>
              {state.validation.pattern && (
                <div className="flex flex-col gap-1">
                  <span className="font-sans text-[11px] text-pen-muted">Pattern error message</span>
                  <input
                    value={state.validation.patternMessage ?? ""}
                    onChange={(e) => setState((s) => ({ ...s, validation: { ...s.validation, patternMessage: e.target.value || undefined } }))}
                    placeholder="e.g. Must be in format XX-0000"
                    className="h-7 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2">
        <span className="flex flex-col">
          <span className="font-sans text-[12px] font-medium text-pen-foreground">Required field</span>
          <span className="font-sans text-[10.5px] text-pen-subtle">Submitters must fill this in.</span>
        </span>
        <input
          type="checkbox"
          checked={state.isRequired}
          onChange={(e) => setState((s) => ({ ...s, isRequired: e.target.checked }))}
          className="size-4 rounded accent-pen-blue"
        />
      </label>

      {error && <p className="font-sans text-[11.5px] text-pen-red">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-pen-card-border pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 items-center gap-1 rounded-lg px-3 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(state)}
          disabled={saving}
          className="flex h-7 items-center gap-1 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-50 dark:text-gray-900"
        >
          <Check className="size-3" />
          {saving ? "Saving…" : "Save field"}
        </button>
      </div>
    </div>
  );
}

// ── Field builder modal ───────────────────────────────────────────────────────

function FieldBuilderModal({
  form,
  defaultFields,
  onClose,
}: {
  form: IntakeFormRow;
  defaultFields: ResolvedDefaultFields;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [addingField, setAddingField] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FieldRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Editable default-field labels/placeholders (per form). Starts from the
  // resolved values passed in; persisted via the form endpoint.
  const [defaults, setDefaults] = useState<ResolvedDefaultFields>(defaultFields);
  const [savedDefaults, setSavedDefaults] = useState<ResolvedDefaultFields>(defaultFields);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsCollapsed, setDefaultsCollapsed] = useState(true);
  const defaultsDirty = JSON.stringify(defaults) !== JSON.stringify(savedDefaults);

  async function saveDefaults() {
    setSavingDefaults(true);
    try {
      const res = await fetch(`/api/intake/forms/${form.id}/default-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaults),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Failed to save default fields.");
        return;
      }
      const saved: ResolvedDefaultFields = await res.json();
      setDefaults(saved);
      setSavedDefaults(saved);
      toast.success("Default fields updated for this form.");
    } finally {
      setSavingDefaults(false);
    }
  }

  useEffect(() => {
    fetch(`/api/intake/forms/${form.id}/fields`)
      .then((r) => r.json())
      .then((data: FieldRow[]) => setFields([...data].sort((a, b) => a.order - b.order)))
      .catch(() => setFields([]))
      .finally(() => setLoadingFields(false));
  }, [form.id]);

  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const fromIdx = fields.findIndex((f) => f.id === fromId);
    const toIdx = fields.findIndex((f) => f.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...fields];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const withOrders = reordered.map((f, i) => ({ ...f, order: i }));
    setFields(withOrders);
    await fetch(`/api/intake/forms/${form.id}/fields/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldIds: withOrders.map((f) => f.id) }),
    }).catch(() => null);
  }

  function collidesWithStaticField(label: string) {
    return DEFAULT_FIELD_KEYS
      .some((key) => defaults[key].label.toLowerCase() === label.trim().toLowerCase());
  }

  async function handleAdd(state: FieldEditorState) {
    if (!state.label.trim()) { setEditorError("Label is required."); return; }
    if (collidesWithStaticField(state.label)) {
      toast.error(`"${state.label.trim()}" is already used by a static field.`);
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/intake/forms/${form.id}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditorError((data as { error?: string }).error ?? "Failed to add field.");
        return;
      }
      const field: FieldRow = await res.json();
      setFields((prev) => [...prev, field]);
      setAddingField(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(fieldId: string, state: FieldEditorState) {
    if (!state.label.trim()) { setEditorError("Label is required."); return; }
    if (collidesWithStaticField(state.label)) {
      toast.error(`"${state.label.trim()}" is already used by a static field.`);
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/intake/forms/${form.id}/fields/${fieldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditorError((data as { error?: string }).error ?? "Failed to update field.");
        return;
      }
      const updated: FieldRow = await res.json();
      setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...updated, order: f.order } : f)));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/intake/forms/${form.id}/fields/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 pen-overlay-backdrop" onClick={onClose} />
      <div className="pen-glass-panel relative flex w-full max-w-2xl flex-col rounded-2xl border border-pen-card-border shadow-2xl" style={{ height: "70vh", maxHeight: "70vh" }}>
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-pen-card-border px-6 py-4">
          <div>
            <h2 className="pen-text-modal-title">
              Form fields
            </h2>
            <p className="mt-0.5 font-sans text-[12px] text-pen-muted">
              {form.name} · {form.departmentName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setAddingField(true); setEditingId(null); setEditorError(null); }}
              disabled={loadingFields}
              className="flex items-center gap-1.5 rounded-[7px] bg-pen-blue px-3 py-1.5 font-sans text-[11.5px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-50 dark:text-gray-900"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              Add field
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-pen-card-border p-1.5 text-pen-subtle hover:border-pen-muted hover:text-pen-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadingFields ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <Loader2 className="size-5 animate-spin text-pen-muted" />
              <p className="font-sans text-[12px] text-pen-subtle">Loading fields…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-pen-card-border bg-pen-surface/40 px-3 py-2 transition-colors",
                  defaultsCollapsed ? "hover:border-pen-id/40 hover:bg-pen-surface/70" : "rounded-b-none border-b-0",
                )}
              >
                <button
                  type="button"
                  onClick={() => setDefaultsCollapsed((v) => !v)}
                  className="group flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                  aria-expanded={!defaultsCollapsed}
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 text-pen-subtle transition-transform group-hover:text-pen-foreground",
                      defaultsCollapsed && "-rotate-90",
                    )}
                  />
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle group-hover:text-pen-foreground">
                    Default fields
                  </span>
                  <span className="rounded-full bg-pen-surface px-1.5 py-px font-sans text-[10.5px] font-medium text-pen-subtle">
                    {DEFAULT_FIELD_KEYS.length}
                  </span>
                  {defaultsDirty && (
                    <span className="size-1.5 shrink-0 rounded-full bg-pen-blue" title="Unsaved changes" />
                  )}
                </button>
                {!defaultsCollapsed && (
                  <button
                    type="button"
                    onClick={saveDefaults}
                    disabled={!defaultsDirty || savingDefaults}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-40 dark:text-gray-900"
                  >
                    {savingDefaults ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Save
                  </button>
                )}
              </div>
              {!defaultsCollapsed && (
                <div className="flex flex-col gap-2 rounded-b-xl border border-t-0 border-pen-card-border px-3 pb-3 pt-2">
                  <p className="font-sans text-[11px] text-pen-subtle">
                    Rename the title &amp; placeholder for this form. These can&apos;t be removed.
                  </p>
                  {DEFAULT_FIELD_KEYS.map((key) => {
                    const meta = DEFAULT_FIELD_META[key];
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-surface/40 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-pen-surface text-pen-muted">
                            {meta.icon}
                          </span>
                          <span className="font-sans text-[11.5px] font-medium text-pen-subtle">
                            {meta.typeLabel}
                            {meta.required && <span className="ml-1 text-pen-red">*</span>}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-sans text-[10.5px] font-semibold uppercase tracking-wide text-pen-subtle">Title</label>
                            <input
                              value={defaults[key].label}
                              onChange={(e) => setDefaults((d) => ({ ...d, [key]: { ...d[key], label: e.target.value } }))}
                              placeholder={DEFAULT_INTAKE_FIELDS[key].label}
                              className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-sans text-[10.5px] font-semibold uppercase tracking-wide text-pen-subtle">Placeholder</label>
                            <input
                              value={defaults[key].placeholder}
                              onChange={(e) => setDefaults((d) => ({ ...d, [key]: { ...d[key], placeholder: e.target.value } }))}
                              placeholder={DEFAULT_INTAKE_FIELDS[key].placeholder}
                              className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-2 font-sans text-[11px] font-medium uppercase tracking-wide text-pen-subtle">
                Custom fields
              </p>
              {fields.length === 0 && !addingField && (
                <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-pen-card-border py-12 text-center">
                  <p className="font-sans text-[13px] text-pen-muted">No fields yet.</p>
                  <p className="mt-1 font-sans text-[12px] text-pen-subtle">
                    Add fields to define what submitters will fill in.
                  </p>
                </div>
              )}

              {fields.map((field) => {
                if (editingId === field.id) {
                  return (
                    <FieldEditor
                      key={field.id}
                      initial={{ label: field.label, type: field.type, isRequired: field.isRequired, options: field.options, childOptions: field.childOptions ?? {}, placeholder: field.placeholder ?? "", helperText: field.helperText ?? "", validation: (field.validation as FieldValidation) ?? {} }}
                      onSave={(state) => handleEdit(field.id, state)}
                      onCancel={() => { setEditingId(null); setEditorError(null); }}
                      saving={saving}
                      error={editorError}
                    />
                  );
                }
                return (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => { dragId.current = field.id; }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverId(field.id); }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={() => { setDragOverId(null); if (dragId.current) reorder(dragId.current, field.id); dragId.current = null; }}
                    onDragEnd={() => { dragId.current = null; setDragOverId(null); }}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border border-pen-card-border bg-pen-card px-3 py-2.5 transition-colors",
                      dragOverId === field.id && "border-pen-id bg-pen-blue-tint",
                    )}
                  >
                    <GripVertical className="size-4 shrink-0 cursor-grab text-pen-subtle opacity-30 group-hover:opacity-70 active:cursor-grabbing" />
                    <FieldTypeIcon type={field.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                        {field.label}
                        {field.isRequired && <span className="ml-1 text-pen-red">*</span>}
                      </p>
                      <p className="font-sans text-[11.5px] text-pen-subtle">
                        {typeLabel(field.type)}
                        {field.type === "select" && field.options.length > 0 && (
                          <> · {field.options.length} option{field.options.length !== 1 ? "s" : ""}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 transition-opacity">
                      <button
                        type="button"
                        onClick={() => { setEditingId(field.id); setAddingField(false); setEditorError(null); }}
                        className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(field)}
                        className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-red"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {addingField && (
                <FieldEditor
                  initial={{ label: "", type: "text", isRequired: false, options: [], childOptions: {}, placeholder: "", helperText: "", validation: {} }}
                  onSave={handleAdd}
                  onCancel={() => { setAddingField(false); setEditorError(null); }}
                  saving={saving}
                  error={editorError}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete field?"
        description={`"${deleteTarget?.label}" will be permanently removed from this form.`}
        confirmLabel="Delete"
        successMessage="Field deleted."
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ── Public form design (branding) editor ────────────────────────────────────

function BrandColorRow({
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  /** Workspace default shown when no override is set. */
  fallback: string;
  onChange: (next: string) => void;
}) {
  const active = value.trim().length > 0;
  const valid = !active || isHexColor(value);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-sans text-[12px] font-semibold text-pen-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHexColor(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} picker`}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-pen-card-border bg-pen-surface p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${fallback} (default)`}
          className={cn(
            "h-9 w-full min-w-0 rounded-lg border bg-pen-surface px-3 font-mono text-[12.5px] text-pen-foreground outline-none focus:border-pen-id focus:ring-1 focus:ring-pen-id",
            valid ? "border-pen-card-border" : "border-pen-red",
          )}
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="font-sans text-[11.5px] text-pen-subtle hover:text-pen-foreground"
          >
            Use default
          </button>
        )}
      </div>
      <p className="font-sans text-[11px] text-pen-subtle">{hint}</p>
    </div>
  );
}

function FormDesignModal({
  form,
  defaults,
  onClose,
  onSuccess,
}: {
  form: IntakeFormRow;
  defaults: FormBrandingDefaults;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const b = form.branding;
  const [logoUrl, setLogoUrl] = useState(b.logoUrl ?? "");
  const [headerColor, setHeaderColor] = useState(b.headerColor ?? "");
  const [backgroundColor, setBackgroundColor] = useState(b.backgroundColor ?? "");
  const [accentColor, setAccentColor] = useState(b.accentColor ?? "");
  const [introText, setIntroText] = useState(b.introText ?? "");
  const [confirmationText, setConfirmationText] = useState(b.confirmationText ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");

  const colorsValid =
    (!headerColor.trim() || isHexColor(headerColor)) &&
    (!backgroundColor.trim() || isHexColor(backgroundColor)) &&
    (!accentColor.trim() || isHexColor(accentColor));

  const previewLogo = logoUrl.trim() || defaults.logoUrl;
  const previewHeader = isHexColor(headerColor) ? headerColor : defaults.headerColor;
  const previewAccent = isHexColor(accentColor) ? accentColor : defaults.accentColor;
  const previewBg = isHexColor(backgroundColor) ? backgroundColor : "#f8f8fc";

  async function handleSave() {
    if (!colorsValid) {
      setError("Enter valid hex colors, e.g. #0a76b9.");
      return;
    }
    setSaving(true);
    setError(null);
    const branding: FormBranding = {};
    if (logoUrl.trim()) branding.logoUrl = logoUrl.trim();
    if (isHexColor(headerColor)) branding.headerColor = headerColor.trim();
    if (isHexColor(backgroundColor)) branding.backgroundColor = backgroundColor.trim();
    if (isHexColor(accentColor)) branding.accentColor = accentColor.trim();
    if (introText.trim()) branding.introText = introText.trim();
    if (confirmationText.trim()) branding.confirmationText = confirmationText.trim();
    const payload = Object.keys(branding).length > 0 ? branding : null;
    try {
      const res = await fetch(`/api/intake/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branding: payload }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to save design");
      }
      toast.success("Form design saved");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save design");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 pen-overlay-backdrop" onClick={onClose} />
      <div className="pen-glass-panel relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-pen-card-border shadow-2xl">
        <div className="flex items-center justify-between border-b border-pen-card-border px-6 py-4">
          <div>
            <h2 className="pen-text-modal-title">Form design</h2>
            <p className="mt-0.5 font-sans text-[12px] text-pen-muted">
              Branding for the public “{form.name}” page. Empty fields fall back
              to the workspace brand.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Edit / Preview toggle */}
        <div className="flex items-center gap-1 border-b border-pen-card-border px-6 py-3">
          <div className="inline-flex rounded-lg border border-pen-card-border bg-pen-surface p-0.5">
            <button
              type="button"
              onClick={() => setView("edit")}
              className={`inline-flex h-7 items-center rounded-md px-3 font-sans text-[12px] font-semibold transition-colors ${
                view === "edit"
                  ? "bg-pen-blue text-white dark:text-gray-900"
                  : "text-pen-muted hover:text-pen-foreground"
              }`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setView("preview")}
              className={`inline-flex h-7 items-center rounded-md px-3 font-sans text-[12px] font-semibold transition-colors ${
                view === "preview"
                  ? "bg-pen-blue text-white dark:text-gray-900"
                  : "text-pen-muted hover:text-pen-foreground"
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          {/* Controls */}
          <div
            className={`min-w-0 flex-col gap-6 ${view === "edit" ? "flex" : "hidden"}`}
          >
            {/* Branding */}
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-sans text-[13px] font-semibold text-pen-foreground">
                  Branding
                </h3>
                <p className="font-sans text-[11.5px] text-pen-subtle">
                  Logo and colors used across the public form page.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                  Logo URL
                </label>
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…/logo.svg"
                  className="h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
                />
                <p className="font-sans text-[11px] text-pen-subtle">
                  Shown in a banner at the top of the form. Leave blank to use the
                  workspace logo.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <BrandColorRow
                  label="Header background"
                  hint="Banner color behind the logo."
                  value={headerColor}
                  fallback={defaults.headerColor}
                  onChange={setHeaderColor}
                />
                <BrandColorRow
                  label="Page background"
                  hint="Background of the whole form page."
                  value={backgroundColor}
                  fallback="#f8f8fc"
                  onChange={setBackgroundColor}
                />
                <BrandColorRow
                  label="Accent color"
                  hint="Submit button and highlights."
                  value={accentColor}
                  fallback={defaults.accentColor}
                  onChange={setAccentColor}
                />
              </div>
            </section>

            {/* Copy */}
            <section className="flex flex-col gap-4 border-t border-pen-card-border pt-6">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-sans text-[13px] font-semibold text-pen-foreground">
                  Messaging
                </h3>
                <p className="font-sans text-[11.5px] text-pen-subtle">
                  Text shown to people filling out and submitting the form.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                    Intro text
                  </label>
                  <textarea
                    value={introText}
                    onChange={(e) => setIntroText(e.target.value)}
                    rows={3}
                    placeholder="Fill in the details below and we'll get back to you…"
                    className="rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                    Confirmation message
                  </label>
                  <textarea
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    rows={3}
                    placeholder="Shown after a successful submission."
                    className="rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Live preview */}
          <div
            className={`w-full flex-col items-center gap-1.5 ${view === "preview" ? "flex" : "hidden"}`}
          >
            <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-pen-card-border" style={{ background: previewBg }}>
              <div className="px-6 py-5" style={{ background: previewHeader }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewLogo}
                  alt="Logo preview"
                  className="h-10 w-auto"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              </div>
              <div className="px-6 py-6">
                <p className="font-sans text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  {form.departmentName}
                </p>
                <h3 className="mt-1.5 font-sans text-[22px] font-semibold text-gray-900">
                  {form.name}
                </h3>
                <p className="mt-1.5 font-sans text-[14px] text-gray-500">
                  {introText.trim() ||
                    "Fill in the details below and we'll get back to you as soon as possible."}
                </p>
                <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="h-2.5 w-24 rounded bg-gray-200" />
                  <div className="mt-3 h-10 rounded-md bg-gray-100" />
                </div>
                <span
                  className="mt-5 inline-flex h-11 items-center rounded-lg px-6 font-sans text-[14px] font-semibold text-white"
                  style={{ background: previewAccent }}
                >
                  Submit request
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-pen-card-border px-6 py-4">
          <span className="font-sans text-[11.5px] text-pen-red">{error}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg border border-pen-card-border px-4 font-sans text-[12.5px] font-medium text-pen-muted hover:text-pen-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !colorsValid}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-pen-blue px-4 font-sans text-[12.5px] font-semibold text-white hover:bg-pen-blue/90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-900"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {saving ? "Saving…" : "Save design"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsIntakeFormsPage({
  forms: initialForms,
  departments,
  isAdmin,
  scopedDepartmentName = null,
  workspaceBranding,
}: {
  forms: IntakeFormRow[];
  departments: DeptOption[];
  isAdmin: boolean;
  scopedDepartmentName?: string | null;
  workspaceBranding: FormBrandingDefaults;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [fieldModal, setFieldModal] = useState<IntakeFormRow | null>(null);
  const [designModal, setDesignModal] = useState<IntakeFormRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IntakeFormRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [optimisticActive, setOptimisticActive] = useState<Record<string, boolean>>({});

  function getIsActive(form: IntakeFormRow) {
    return optimisticActive[form.id] ?? form.isActive;
  }

  function handleSuccess() {
    setModal(null);
    startTransition(() => router.refresh());
  }

  async function handleToggleActive(form: IntakeFormRow) {
    const current = getIsActive(form);
    setOptimisticActive((prev) => ({ ...prev, [form.id]: !current }));
    setTogglingId(form.id);
    try {
      const res = await fetch(`/api/intake/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
      } else {
        setOptimisticActive((prev) => ({ ...prev, [form.id]: current }));
      }
    } catch {
      setOptimisticActive((prev) => ({ ...prev, [form.id]: current }));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/intake/forms/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Failed to delete form");
    }
    setDeleteTarget(null);
    startTransition(() => router.refresh());
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const showDepartmentColumn = !scopedDepartmentName;

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="pen-text-admin-title">
            Support forms
          </h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
            {scopedDepartmentName
              ? `Public submission forms for ${scopedDepartmentName}.`
              : "Public submission forms across all departments."}
          </p>
        </div>
        <Button
          onClick={() => setModal({ type: "create" })}
          className="h-[34px] w-full shrink-0 gap-1.5 rounded-lg bg-pen-blue px-4 font-sans text-[12.5px] font-semibold text-white shadow-sm hover:bg-pen-blue/90 sm:w-auto dark:text-gray-900"
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
          New form
        </Button>
      </div>

      {initialForms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-pen-card-border py-16 text-center">
          <p className="font-sans text-[13px] text-pen-muted">
            No support forms yet.
          </p>
          <p className="mt-1 font-sans text-[12px] text-pen-subtle">
            Create your first form to start accepting public submissions.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[780px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className={cn("h-8", showDepartmentColumn ? "w-[22%]" : "w-[28%]")}>
                  <SectionLabel>Form</SectionLabel>
                </TableHead>
                {showDepartmentColumn && (
                  <TableHead className="h-8 w-[14%]">
                    <SectionLabel>Department</SectionLabel>
                  </TableHead>
                )}
                <TableHead className="h-8 w-[14%]">
                  <SectionLabel>Status</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[14%]">
                  <SectionLabel>Assignment</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[12%] text-center">
                  <SectionLabel>Submissions</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[16%]">
                  <SectionLabel>Public link</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[16%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialForms.map((form) => {
                const deptSlug = slugify(form.departmentName);
                const shareUrl = `${origin}/support/${deptSlug}/${form.id}`;
                return (
                  <TableRow
                    key={form.id}
                    className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]"
                  >
                    {/* Form name */}
                    <TableCell className="py-0">
                      <div className="flex h-[56px] flex-col justify-center gap-0.5">
                        <span className="flex items-center gap-1.5 truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                          {form.name}
                          {form.displayMode === "CHAT" && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-pen-id/25 bg-pen-blue-tint px-1.5 py-0.5 font-sans text-[10px] font-semibold text-pen-id"
                              title="Renders as a chat conversation"
                            >
                              <MessageCircle className="size-2.5" />
                              Chat
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>

                    {showDepartmentColumn && (
                      <TableCell className="py-0">
                        <div className="flex h-[56px] items-center">
                          <span className="inline-flex max-w-full items-center rounded-full bg-pen-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-pen-muted">
                            <span className="truncate">{form.departmentName}</span>
                          </span>
                        </div>
                      </TableCell>
                    )}

                    {/* Status toggle */}
                    <TableCell className="py-0">
                      <div className="flex h-[56px] items-center">
                        <LabeledSwitch
                          checked={getIsActive(form)}
                          onLabel="Active"
                          offLabel="Inactive"
                          accent="green"
                          loading={togglingId === form.id}
                          title={
                            getIsActive(form)
                              ? "Deactivate this form"
                              : "Activate this form"
                          }
                          onToggle={() => handleToggleActive(form)}
                        />
                      </div>
                    </TableCell>


                    {/* Assignment method (configured on the Assignment methods page) */}
                    <TableCell className="py-0">
                      <div className="flex h-[56px] items-center">
                        {(() => {
                          const style = ASSIGNMENT_METHOD_STYLES[form.effectiveMethod];
                          const MethodIcon = style.icon;
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 font-sans text-[11.5px] font-semibold ${style.className}`}
                              title={
                                form.assignmentMethod === null
                                  ? `Inherited from the sub-department (${ASSIGNMENT_METHOD_LABELS[form.effectiveMethod]})`
                                  : "Set on the Assignment methods page"
                              }
                            >
                              <MethodIcon className="size-3.5" />
                              {ASSIGNMENT_METHOD_LABELS[form.effectiveMethod]}
                              {form.assignmentMethod === null && (
                                <span className="text-pen-subtle">· inherited</span>
                              )}
                            </span>
                          );
                        })()}
                      </div>
                    </TableCell>

                    {/* Submission count */}
                    <TableCell className="py-0 text-center">
                      <div className="flex h-[56px] items-center justify-center">
                        {form.intakeCount > 0 ? (
                          <Link
                            href={`/settings/intake-forms/${form.id}/submissions`}
                            className="group/sub inline-flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface py-1 pl-2.5 pr-2 font-sans text-[11.5px] font-semibold text-pen-foreground shadow-sm transition-colors hover:border-pen-id hover:bg-pen-blue-tint hover:text-pen-id"
                            title="View submissions"
                          >
                            <Inbox className="size-3 text-pen-muted transition-colors group-hover/sub:text-pen-id" />
                            {form.intakeCount}
                            <ArrowUpRight className="size-3 text-pen-subtle transition-colors group-hover/sub:text-pen-id" />
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-pen-card-border py-1 pl-2.5 pr-2.5 font-sans text-[11.5px] font-medium text-pen-subtle">
                            <Inbox className="size-3" />
                            0
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Public link */}
                    <TableCell className="py-0">
                      <div className="flex h-[56px] items-center">
                        <CopyLinkButton url={shareUrl} />
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-0 text-right">
                      <div className="flex h-[56px] items-center justify-end gap-1">
                        {form.displayMode !== "CHAT" && (
                          <button
                            type="button"
                            onClick={() => setFieldModal(form)}
                            className="flex items-center gap-1.5 rounded-lg border border-pen-id/25 bg-pen-blue/10 px-3 py-1.5 font-sans text-[11.5px] font-semibold text-pen-id transition-colors hover:bg-pen-blue/20"
                            title="Add or edit the fields shown on this form"
                          >
                            <Settings2 className="size-3.5" />
                            Add Field
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDesignModal(form)}
                          className="flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-1.5 font-sans text-[11.5px] font-semibold text-pen-muted transition-colors hover:border-pen-muted hover:bg-pen-card hover:text-pen-foreground"
                          title="Customize the public form's logo and colors"
                        >
                          <Palette className="size-3.5" />
                          Design
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ type: "edit", form })}
                          className="cursor-pointer rounded-lg p-1.5 text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                          title="Edit form settings"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(form)}
                          className="cursor-pointer rounded-lg p-1.5 text-pen-muted transition-colors hover:bg-red-500/10 hover:text-pen-red dark:hover:bg-red-950/30"
                          title="Delete this form"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {modal && (
        <IntakeFormModal
          mode={modal}
          departments={departments}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}

      {fieldModal && (
        <FieldBuilderModal
          form={fieldModal}
          defaultFields={fieldModal.defaultFields}
          onClose={() => setFieldModal(null)}
        />
      )}

      {designModal && (
        <FormDesignModal
          form={designModal}
          defaults={workspaceBranding}
          onClose={() => setDesignModal(null)}
          onSuccess={() => {
            setDesignModal(null);
            startTransition(() => router.refresh());
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete support form?"
        description={`"${deleteTarget?.name}" and all its fields and submissions will be permanently deleted.`}
        confirmLabel="Delete"
        successMessage="Support form deleted."
        onConfirm={handleDelete}
      />
    </div>
  );
}
