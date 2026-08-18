"use client";

import { useState, useEffect, useTransition, useRef, useMemo } from "react";
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
  Tag,
  MessageCircle,
  FileText,
  UserRound,
  Search,
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import { matchesUserListSearch, type UserListPerson } from "@/lib/user-list-person";
import {
  DEFAULT_FIELD_KEYS,
  DEFAULT_INTAKE_FIELDS,
  type DefaultFieldKey,
  type ResolvedDefaultFields,
} from "@/lib/intake-default-fields";
import { sidebarDropdownPanelClass } from "@/components/tickets/sidebar-field-styles";
import { Input } from "@/components/ui/input";
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

// ── Issue manager modal ───────────────────────────────────────────────────────

type IssueRow = {
  id: string;
  name: string;
  priority: string;
  estimatedHours: number | null;
  assigneeIds: string[];
};

const PRIORITY_COLORS: Record<string, string> = {
  Low:      "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  Medium:   "bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400",
  High:     "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
  Critical: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  Urgent:   "bg-orange-100 text-[#dd3300] dark:bg-[#40200f] dark:text-[#ff9466]",
};

function PriorityPill({ priority }: { priority: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-[11px] font-semibold",
      PRIORITY_COLORS[priority] ?? "bg-pen-surface text-pen-foreground",
    )}>
      {priority}
    </span>
  );
}

type IssueEditorState = {
  name: string;
  priority: string;
  estimatedHours: string;
  assigneeIds: string[];
};

const EMPTY_ISSUE: IssueEditorState = { name: "", priority: "Medium", estimatedHours: "", assigneeIds: [] };

/**
 * Multi-select assignee dropdown for the issue editor. Reuses the same building
 * blocks as the ticket "assign to" picker (Popover + UserListItem + UserAvatar)
 * but is fully controlled by the editor's `assigneeIds` state.
 */
function IssueAssigneeSelect({
  value,
  onChange,
  members,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  members: MemberOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => members.filter((m) => matchesUserListSearch(m, query)),
    [members, query],
  );
  const selected = members.filter((m) => value.includes(m.id));

  function handleOpenChange(o: boolean) {
    setOpen(o);
    if (o) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className="flex h-9 items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 text-left transition-colors hover:border-pen-id focus:border-pen-id focus:outline-none"
      >
        {selected.length === 0 ? (
          <>
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-pen-card text-pen-subtle">
              <UserRound className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-muted">Unassigned</span>
          </>
        ) : (
          <>
            <span className="flex shrink-0 -space-x-1.5">
              {selected.slice(0, 4).map((m) => (
                <span key={m.id} className="rounded-full ring-2 ring-pen-surface">
                  <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.id} size={22} />
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">
              {selected.map((m) => m.name.split(" ")[0]).join(", ")}
            </span>
          </>
        )}
        <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn(sidebarDropdownPanelClass, "w-(--anchor-width) min-w-[240px] gap-0 overflow-hidden p-0")}
      >
        <div className="border-b border-pen-card-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-pen-subtle" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members…"
              className="h-8 border-pen-card-border bg-pen-surface pl-8 font-sans text-[12px]"
            />
          </div>
        </div>
        <ul className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-center font-sans text-[11.5px] text-pen-subtle">
              No members match &ldquo;{query}&rdquo;
            </li>
          ) : (
            filtered.map((member) => {
              const isSelected = value.includes(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => toggle(member.id)}
                    className={cn(
                      "pen-field-dropdown-item rounded-md px-2 py-1.5 font-sans text-[12px]",
                      userListPickerButtonClass,
                      isSelected && "bg-pen-surface",
                    )}
                  >
                    <UserListItem
                      person={member}
                      avatarSize={22}
                      trailing={isSelected ? <Check className="size-3.5 shrink-0 text-pen-blue" /> : null}
                    />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Small avatar stack + name summary, or a null icon when unassigned. */
function IssueAssigneeCell({ assigneeIds, members }: { assigneeIds: string[]; members: MemberOption[] }) {
  const assigned = members.filter((m) => assigneeIds.includes(m.id));
  if (assigned.length === 0) {
    return (
      <span className="flex size-7 items-center justify-center rounded-full bg-pen-surface text-pen-subtle" title="Unassigned">
        <UserRound className="size-3.5" />
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex shrink-0 -space-x-1.5">
        {assigned.slice(0, 4).map((m) => (
          <span key={m.id} className="rounded-full ring-2 ring-pen-card" title={m.name}>
            <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.id} size={24} />
          </span>
        ))}
      </span>
      {assigned.length > 4 && (
        <span className="font-sans text-[11px] text-pen-subtle">+{assigned.length - 4}</span>
      )}
    </div>
  );
}

/** Add/edit form for a single intake issue. Module-level (stable identity) so
 * inputs and the assignee dropdown keep focus/open state across re-renders. */
function IssueEditor({
  editorState,
  setEditorState,
  editorError,
  members,
  saving,
  onSave,
  onCancel,
}: {
  editorState: IssueEditorState;
  setEditorState: React.Dispatch<React.SetStateAction<IssueEditorState>>;
  editorError: string | null;
  members: MemberOption[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-pen-id/40 bg-pen-blue-tint px-4 py-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">Issue name</label>
        <input
          autoFocus
          value={editorState.name}
          onChange={(e) => setEditorState((s) => ({ ...s, name: e.target.value }))}
          placeholder="e.g. Cannot login"
          className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">Priority</label>
          <SearchableSelect
            value={editorState.priority}
            onChange={(v) => setEditorState((s) => ({ ...s, priority: v }))}
            options={[
              { value: "Low", label: "Low" },
              { value: "Medium", label: "Medium" },
              { value: "High", label: "High" },
              { value: "Critical", label: "Critical" },
              { value: "Urgent", label: "Urgent" },
            ]}
            searchable={false}
            size="sm"
            className="bg-pen-surface"
            aria-label="Priority"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">Est. hours</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={editorState.estimatedHours}
            onChange={(e) => setEditorState((s) => ({ ...s, estimatedHours: e.target.value }))}
            placeholder="—"
            className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-id"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">Assign to</label>
        {members.length === 0 ? (
          <p className="font-sans text-[11.5px] text-pen-subtle">No members in this department to assign.</p>
        ) : (
          <IssueAssigneeSelect
            value={editorState.assigneeIds}
            onChange={(ids) => setEditorState((s) => ({ ...s, assigneeIds: ids }))}
            members={members}
          />
        )}
        <p className="font-sans text-[11px] text-pen-subtle">
          One user → tickets auto-assign to them. Multiple → round-robin between them. Leave empty to use the team&apos;s rota.
        </p>
      </div>
      {editorError && <p className="font-sans text-[11.5px] text-pen-red">{editorError}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 items-center gap-1 rounded-lg px-3 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex h-7 items-center gap-1 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-50 dark:text-gray-900"
        >
          <Check className="size-3" />
          {saving ? "Saving…" : "Save issue"}
        </button>
      </div>
    </div>
  );
}

function IssueManagerModal({
  form,
  members,
  onClose,
}: {
  form: IntakeFormRow;
  members: MemberOption[];
  onClose: () => void;
}) {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingIssue, setAddingIssue] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssueRow | null>(null);
  const [editorState, setEditorState] = useState<IssueEditorState>(EMPTY_ISSUE);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/intake/forms/${form.id}/issues`)
      .then((r) => r.json())
      .then((data: IssueRow[]) => setIssues(data))
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [form.id]);

  function startAdd() {
    setEditorState(EMPTY_ISSUE);
    setAddingIssue(true);
    setEditingId(null);
    setEditorError(null);
  }

  function startEdit(issue: IssueRow) {
    setEditorState({
      name: issue.name,
      priority: issue.priority,
      estimatedHours: issue.estimatedHours != null ? String(issue.estimatedHours) : "",
      assigneeIds: issue.assigneeIds ?? [],
    });
    setEditingId(issue.id);
    setAddingIssue(false);
    setEditorError(null);
  }

  function cancelEditor() {
    setAddingIssue(false);
    setEditingId(null);
    setEditorError(null);
  }

  async function handleSaveAdd() {
    if (!editorState.name.trim()) { setEditorError("Name is required."); return; }
    if (!editorState.priority) { setEditorError("Priority is required."); return; }
    setSaving(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/intake/forms/${form.id}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editorState.name.trim(),
          priority: editorState.priority,
          estimatedHours: editorState.estimatedHours ? Number(editorState.estimatedHours) : null,
          assigneeIds: editorState.assigneeIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditorError((data as { error?: string }).error ?? "Failed to add issue.");
        return;
      }
      const issue: IssueRow = await res.json();
      setIssues((prev) => [...prev, issue]);
      setAddingIssue(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    if (!editorState.name.trim()) { setEditorError("Name is required."); return; }
    setSaving(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/intake/forms/${form.id}/issues/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editorState.name.trim(),
          priority: editorState.priority,
          estimatedHours: editorState.estimatedHours ? Number(editorState.estimatedHours) : null,
          assigneeIds: editorState.assigneeIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditorError((data as { error?: string }).error ?? "Failed to update issue.");
        return;
      }
      const updated: IssueRow = await res.json();
      setIssues((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/intake/forms/${form.id}/issues/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setIssues((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  }

  const isEditing = addingIssue || !!editingId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 pen-overlay-backdrop" onClick={onClose} />
      <div className="pen-glass-panel relative flex w-full max-w-3xl flex-col rounded-2xl border border-pen-card-border shadow-2xl" style={{ height: "70vh", maxHeight: "70vh" }}>
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-pen-card-border px-6 py-4">
          <div>
            <h2 className="pen-text-modal-title">Issues</h2>
            <p className="mt-0.5 font-sans text-[12px] text-pen-muted">
              {form.name} · {form.departmentName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startAdd}
              disabled={loading || isEditing}
              className="flex items-center gap-1.5 rounded-[7px] bg-pen-blue px-3 py-1.5 font-sans text-[11.5px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-50 dark:text-gray-900"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              Add issue
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
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <Loader2 className="size-5 animate-spin text-pen-muted" />
              <p className="font-sans text-[12px] text-pen-subtle">Loading issues…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {addingIssue && (
                <IssueEditor
                  editorState={editorState}
                  setEditorState={setEditorState}
                  editorError={editorError}
                  members={members}
                  saving={saving}
                  onSave={handleSaveAdd}
                  onCancel={cancelEditor}
                />
              )}

              {/* Issues table */}
              {issues.length > 0 && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-pen-card-border">
                      <th className="pb-2.5 text-left">
                        <span className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-pen-subtle">Issue name</span>
                      </th>
                      <th className="pb-2.5 text-left">
                        <span className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-pen-subtle">Priority</span>
                      </th>
                      <th className="pb-2.5 text-left">
                        <span className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-pen-subtle">Est. hours</span>
                      </th>
                      <th className="pb-2.5 text-left">
                        <span className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-pen-subtle">Assignee</span>
                      </th>
                      <th className="pb-2.5 w-[90px] text-right">
                        <span className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-pen-subtle">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((issue, idx) => {
                      if (editingId === issue.id) {
                        return (
                          <tr key={issue.id}>
                            <td colSpan={5} className="pt-3">
                              <IssueEditor
                                editorState={editorState}
                                setEditorState={setEditorState}
                                editorError={editorError}
                                members={members}
                                saving={saving}
                                onSave={handleSaveEdit}
                                onCancel={cancelEditor}
                              />
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr
                          key={issue.id}
                          className={cn(
                            idx !== issues.length - 1 && "border-b border-pen-card-border",
                          )}
                        >
                          <td className="py-3 pr-4">
                            <span className="font-sans text-[12.5px] font-medium text-pen-foreground">
                              {issue.name}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <PriorityPill priority={issue.priority} />
                          </td>
                          <td className="py-3 pr-4">
                            <span className="font-sans text-[12.5px] text-pen-muted">
                              {issue.estimatedHours != null ? `${issue.estimatedHours}h` : "—"}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <IssueAssigneeCell assigneeIds={issue.assigneeIds} members={members} />
                          </td>
                          <td className="py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => startEdit(issue)}
                                className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
                              >
                                <Pencil className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(issue)}
                                className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-red"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {issues.length === 0 && !addingIssue && (
                <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-pen-card-border py-12 text-center">
                  <p className="font-sans text-[13px] text-pen-muted">No issues yet.</p>
                  <p className="mt-1 font-sans text-[12px] text-pen-subtle">
                    Add issues to automatically set priority when submitted.
                  </p>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete issue?"
        description={`"${deleteTarget?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        successMessage="Issue deleted."
        onConfirm={handleDelete}
      />
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
  const [hasIssues, setHasIssues] = useState(false);
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

  useEffect(() => {
    fetch(`/api/intake/forms/${form.id}/issues`)
      .then((r) => r.json())
      .then((data: IssueRow[]) => setHasIssues(data.length > 0))
      .catch(() => setHasIssues(false));
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
      .filter((key) => key !== "issueType" || hasIssues)
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
                    {DEFAULT_FIELD_KEYS.filter((key) => key !== "issueType" || hasIssues).length}
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
                  {DEFAULT_FIELD_KEYS.filter((key) => key !== "issueType" || hasIssues).map((key) => {
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
            "h-9 w-full max-w-[150px] rounded-lg border bg-pen-surface px-3 font-mono text-[12.5px] text-pen-foreground outline-none focus:border-pen-id focus:ring-1 focus:ring-pen-id",
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

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 lg:flex-row">
          {/* Controls */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
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

            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                Intro text
              </label>
              <textarea
                value={introText}
                onChange={(e) => setIntroText(e.target.value)}
                rows={2}
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
                rows={2}
                placeholder="Shown after a successful submission."
                className="rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
              />
            </div>
          </div>

          {/* Live preview */}
          <div className="flex w-full flex-col gap-1.5 lg:max-w-[320px]">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Preview
            </label>
            <div className="overflow-hidden rounded-xl border border-pen-card-border" style={{ background: previewBg }}>
              <div className="px-4 py-3" style={{ background: previewHeader }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewLogo}
                  alt="Logo preview"
                  className="h-7 w-auto"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              </div>
              <div className="px-4 py-4">
                <p className="font-sans text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {form.departmentName}
                </p>
                <h3 className="mt-1 font-sans text-[16px] font-semibold text-gray-900">
                  {form.name}
                </h3>
                <p className="mt-1 font-sans text-[11px] text-gray-500">
                  {introText.trim() ||
                    "Fill in the details below and we'll get back to you as soon as possible."}
                </p>
                <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="h-2 w-16 rounded bg-gray-200" />
                  <div className="mt-2 h-7 rounded-md bg-gray-100" />
                </div>
                <span
                  className="mt-3 inline-flex h-9 items-center rounded-lg px-4 font-sans text-[12px] font-semibold text-white"
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
  const [issueModal, setIssueModal] = useState<IntakeFormRow | null>(null);
  const [designModal, setDesignModal] = useState<IntakeFormRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IntakeFormRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [optimisticActive, setOptimisticActive] = useState<Record<string, boolean>>({});
  const [togglingAutoAssignId, setTogglingAutoAssignId] = useState<string | null>(null);
  const [optimisticAutoAssign, setOptimisticAutoAssign] = useState<Record<string, boolean>>({});

  function getIsActive(form: IntakeFormRow) {
    return optimisticActive[form.id] ?? form.isActive;
  }

  function getAutoAssign(form: IntakeFormRow) {
    return optimisticAutoAssign[form.id] ?? form.autoAssign;
  }

  function handleSuccess() {
    setModal(null);
    startTransition(() => router.refresh());
  }

  async function handleToggleAutoAssign(form: IntakeFormRow) {
    const current = getAutoAssign(form);
    setOptimisticAutoAssign((prev) => ({ ...prev, [form.id]: !current }));
    setTogglingAutoAssignId(form.id);
    try {
      const res = await fetch(`/api/intake/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoAssign: !current }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
      } else {
        setOptimisticAutoAssign((prev) => ({ ...prev, [form.id]: current }));
      }
    } catch {
      setOptimisticAutoAssign((prev) => ({ ...prev, [form.id]: current }));
    } finally {
      setTogglingAutoAssignId(null);
    }
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


                    {/* Assignment mode toggle */}
                    <TableCell className="py-0">
                      <div className="flex h-[56px] items-center">
                        <LabeledSwitch
                          checked={getAutoAssign(form)}
                          onLabel="Auto"
                          offLabel="Manual"
                          loading={togglingAutoAssignId === form.id}
                          title={
                            getAutoAssign(form)
                              ? "Switch to manual assignment"
                              : "Switch to auto-assign"
                          }
                          onToggle={() => handleToggleAutoAssign(form)}
                        />
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
                          <>
                            <button
                              type="button"
                              onClick={() => setIssueModal(form)}
                              className="flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-1.5 font-sans text-[11.5px] font-semibold text-pen-muted transition-colors hover:border-pen-muted hover:bg-pen-card hover:text-pen-foreground"
                              title="Manage issues for this form"
                            >
                              <Tag className="size-3.5" />
                              Issues
                            </button>
                            <button
                              type="button"
                              onClick={() => setFieldModal(form)}
                              className="flex items-center gap-1.5 rounded-lg border border-pen-id/25 bg-pen-blue/10 px-3 py-1.5 font-sans text-[11.5px] font-semibold text-pen-id transition-colors hover:bg-pen-blue/20"
                              title="Add or edit the fields shown on this form"
                            >
                              <Settings2 className="size-3.5" />
                              Add Field
                            </button>
                          </>
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

      {issueModal && (
        <IssueManagerModal
          form={issueModal}
          members={departments.find((d) => d.id === issueModal.departmentId)?.members ?? []}
          onClose={() => setIssueModal(null)}
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
