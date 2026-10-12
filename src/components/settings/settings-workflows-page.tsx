"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check, X, GripVertical, CheckCircle2, Tag } from "lucide-react";
import { toastError } from "@/lib/toast-error";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getSubDepartmentStatuses,
  createSubDepartmentStatus,
  updateSubDepartmentStatus,
  deleteSubDepartmentStatus,
  reorderSubDepartmentStatuses,
} from "@/lib/api/sub-departments";
import { useLabels } from "@/hooks/queries/use-labels";
import {
  patchSubDepartmentStatusInCaches,
  replaceSubDepartmentStatusesInCaches,
} from "@/hooks/queries/sync-sub-department-status-caches";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches";
import { Tip } from "@/components/ui/tooltip";
import { ListSearchInput } from "@/components/ui/list-controls";

import type { SubDepartmentStatus } from "@/lib/api/sub-departments";
import { STATUS_CATEGORIES, STATUS_CATEGORY_LABELS, statusCategory, sortStatusesByCategory, type StatusCategory } from "@/lib/status-category";
type SubDepartment = { id: string; name: string; prefix: string };

const PRESET_COLORS = [
  "#94a3b8", "#0a76b9", "#7c3aed", "#16a34a",
  "#dc2626", "#f97316", "#0891b2", "#d97706",
  "#db2777", "#65a30d",
];

function CategoryLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="pb-1.5 pt-3 font-sans text-[9.5px] font-medium tracking-[0.95px] text-sts-subtle uppercase">
      {children}
    </p>
  );
}

function CategorySelect({ value, onChange, label }: { value: StatusCategory; onChange: (category: StatusCategory) => void; label: string }) {
  return (
    <Select value={value} onValueChange={(value) => value && onChange(value as StatusCategory)}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-32 font-sans text-xs">
        <SelectValue>{STATUS_CATEGORY_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{STATUS_CATEGORY_LABELS[category]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

type Props = {
  subDepartments: SubDepartment[];
  defaultSubDepartmentId: string | null;
  initialStatuses: SubDepartmentStatus[];
};

export function SettingsWorkflowsPage({ subDepartments, defaultSubDepartmentId, initialStatuses }: Props) {
  const queryClient = useQueryClient();
  const [selectedSubDepartmentId, setSelectedSubDepartmentId] = useState(defaultSubDepartmentId ?? "");
  const [statuses, setStatuses] = useState<SubDepartmentStatus[]>(initialStatuses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusToDelete, setStatusToDelete] = useState<SubDepartmentStatus | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editCategory, setEditCategory] = useState<StatusCategory>("TODO");
  const [newCategory, setNewCategory] = useState<StatusCategory>("TODO");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#94a3b8");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const { data: labelOptions = [], isLoading: labelsLoading } = useLabels();

  useEffect(() => {
    if (selectedSubDepartmentId && statuses.length > 0) {
      replaceSubDepartmentStatusesInCaches(queryClient, selectedSubDepartmentId, statuses);
    }
  }, [selectedSubDepartmentId, statuses, queryClient]);

  async function loadStatuses(subDepartmentId: string) {
    getSubDepartmentStatuses(subDepartmentId)
      .then((next) => {
        setStatuses(next);
        replaceSubDepartmentStatusesInCaches(queryClient, subDepartmentId, next);
      })
      .catch(() => null);
  }

  async function toggleAllowedLabel(id: string, current: string[], labelName: string) {
    const next = current.includes(labelName)
      ? current.filter((l) => l !== labelName)
      : [...current, labelName];
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, allowedLabels: next } : s)));
    patchSubDepartmentStatusInCaches(queryClient, selectedSubDepartmentId, id, { allowedLabels: next });
    try {
      const updated = (await updateSubDepartmentStatus(selectedSubDepartmentId, id, {
        allowedLabels: next,
      })) as SubDepartmentStatus;
      patchSubDepartmentStatusInCaches(queryClient, selectedSubDepartmentId, id, {
        allowedLabels: updated.allowedLabels,
      });
    } catch (err) {
      setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, allowedLabels: current } : s)));
      patchSubDepartmentStatusInCaches(queryClient, selectedSubDepartmentId, id, { allowedLabels: current });
      toastError("Failed to update linked labels", err);
    }
  }

  function handleSubDepartmentChange(subDepartmentId: string) {
    setSelectedSubDepartmentId(subDepartmentId);
    setEditingId(null);
    setAdding(false);
    setError(null);
    startTransition(() => { loadStatuses(subDepartmentId); });
  }

  function startEdit(s: SubDepartmentStatus) {
    setEditingId(s.id);
    setEditLabel(s.label);
    setEditColor(s.color);
    setEditCategory(statusCategory(s));
    setError(null);
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim()) return;
    setError(null);
    try {
      const updated = await updateSubDepartmentStatus(selectedSubDepartmentId, id, {
        label: editLabel.trim(),
        color: editColor,
        category: editCategory,
      }) as SubDepartmentStatus;
      setStatuses((prev) => prev.map((s) => (s.id === id ? updated : s)));
      patchSubDepartmentStatusInCaches(queryClient, selectedSubDepartmentId, id, updated);
      invalidateTaskCaches(queryClient);
      setEditingId(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save");
    }
  }

  // Throws on failure so ConfirmDialog surfaces the error as a toast.
  async function deleteStatus(id: string) {
    setError(null);
    await deleteSubDepartmentStatus(selectedSubDepartmentId, id);
    setStatuses((prev) => {
      const next = prev.filter((s) => s.id !== id);
      replaceSubDepartmentStatusesInCaches(queryClient, selectedSubDepartmentId, next);
      return next;
    });
  }

  async function addStatus() {
    if (!newLabel.trim() || !selectedSubDepartmentId) return;
    setError(null);
    try {
      const created = await createSubDepartmentStatus(selectedSubDepartmentId, {
        label: newLabel.trim(),
        color: newColor,
        category: newCategory,
      }) as SubDepartmentStatus;
      setStatuses((prev) => {
        const next = [...prev, created];
        replaceSubDepartmentStatusesInCaches(queryClient, selectedSubDepartmentId, next);
        return next;
      });
      setNewLabel("");
      setNewColor("#94a3b8");
      setAdding(false);
    } catch {
      setError("Failed to add");
    }
  }

  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const sorted = sortStatusesByCategory(statuses);
    const fromIdx = sorted.findIndex((s) => s.id === fromId);
    const toIdx = sorted.findIndex((s) => s.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    if (statusCategory(sorted[fromIdx]) !== statusCategory(sorted[toIdx])) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const withNewOrders = reordered.map((s, i) => ({ ...s, order: i }));
    setStatuses(withNewOrders);
    replaceSubDepartmentStatusesInCaches(queryClient, selectedSubDepartmentId, withNewOrders);

    try {
      await reorderSubDepartmentStatuses(selectedSubDepartmentId, withNewOrders.map((s) => ({ id: s.id, order: s.order })));
    } catch (error) {
      setStatuses(sorted);
      replaceSubDepartmentStatusesInCaches(queryClient, selectedSubDepartmentId, sorted);
      toastError("Failed to reorder statuses", error);
    }
  }

  // Search only — column order is the board order (drag to reorder), so it is never re-sorted.
  // Grouping is computed on the full list so a filtered status keeps its real category.
  const [statusQuery, setStatusQuery] = useState("");
  const statusTerms = statusQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesQuery = (s: SubDepartmentStatus) => {
    const hay = [s.label, ...s.allowedLabels, STATUS_CATEGORY_LABELS[statusCategory(s)]].join(" ").toLowerCase();
    return statusTerms.every((t) => hay.includes(t));
  };
  const sortedStatuses = sortStatusesByCategory(statuses);
  const filteredStatuses = sortedStatuses.filter(matchesQuery);
  const noStatusMatches = statuses.length > 0 && filteredStatuses.length === 0;

  function renderRow(s: SubDepartmentStatus) {
    const isEditing = editingId === s.id;

    if (isEditing) {
      return (
        <div key={s.id} className="flex min-h-12 flex-wrap items-center gap-3 py-2 border-t border-[#f0f4f8] dark:border-[#3a3a37]">
          <GripVertical className="size-4 shrink-0 text-sts-subtle opacity-40" />
          {/* Color picker */}
          <div className="relative flex items-center gap-1.5">
            <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: editColor }} />
            <div className="flex flex-wrap gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  aria-label={`Status color ${c}`}
                  aria-pressed={editColor === c}
                  className={cn("size-3.5 rounded-full border-2 transition-transform", editColor === c ? "border-sts-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <input
            autoFocus
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(s.id); if (e.key === "Escape") setEditingId(null); }}
            className="min-w-0 flex-1 rounded-[5px] border border-sts-card-border bg-sts-bg px-2 py-1 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue"
          />
          <CategorySelect value={editCategory} onChange={setEditCategory} label="Status category" />
          <Tip label="Save status">
            <button aria-label="Save status" type="button" onClick={() => saveEdit(s.id)} className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-green hover:bg-sts-surface">
              <Check className="size-3.5" />
            </button>
          </Tip>
          <Tip label="Cancel editing">
            <button aria-label="Cancel editing" type="button" onClick={() => setEditingId(null)} className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-subtle hover:bg-sts-surface">
              <X className="size-3.5" />
            </button>
          </Tip>
        </div>
      );
    }

    const isDragOver = dragOverId === s.id;
    return (
      <div
        key={s.id}
        draggable
        onDragStart={() => { dragId.current = s.id; }}
        onDragOver={(e) => { e.preventDefault(); setDragOverId(s.id); }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={() => { setDragOverId(null); if (dragId.current) reorder(dragId.current, s.id); dragId.current = null; }}
        onDragEnd={() => { dragId.current = null; setDragOverId(null); }}
        className={cn(
          "group flex h-10 cursor-grab items-center gap-3 border-t border-[#f0f4f8] transition-colors active:cursor-grabbing dark:border-[#3a3a37]",
          isDragOver && "bg-sts-blue-tint",
        )}
      >
        <GripVertical className="size-4 shrink-0 text-sts-subtle opacity-30 group-hover:opacity-70" />
        <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
        <span className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">{s.label}</span>
        <Popover>
          <PopoverTrigger
            className={cn(
              "flex h-6 shrink-0 items-center gap-1 rounded-full border border-dashed px-2 font-sans text-[11px] transition-colors",
              s.allowedLabels.length > 0
                ? "border-sts-blue/40 text-sts-blue"
                : "border-sts-card-border text-sts-subtle hover:border-sts-blue/40 hover:text-sts-blue",
            )}
          >
            <Tag className="size-3 shrink-0" />
            {s.allowedLabels.length > 0 ? `${s.allowedLabels.length} label${s.allowedLabels.length > 1 ? "s" : ""}` : "Any label"}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-[220px] gap-0 rounded-[9px] border border-sts-card-border bg-sts-card p-0 shadow-lg"
          >
            <div className="border-b border-sts-card-border px-2.5 py-2">
              <p className="font-sans text-[11px] font-medium text-sts-foreground">Linked labels</p>
              <p className="mt-0.5 font-sans text-[10.5px] text-sts-subtle">
                Moving a ticket into this status will require picking one of these labels. Leave empty to allow any label with no prompt.
              </p>
            </div>
            <div className="max-h-[200px] overflow-y-auto py-1">
              {labelsLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 font-sans text-[11.5px] text-sts-subtle">
                  <LoadingSpinner className="size-3.5 shrink-0" />
                  Loading labels…
                </div>
              ) : labelOptions.length === 0 ? (
                <p className="px-3 py-2 font-sans text-[11.5px] text-sts-subtle">No labels yet</p>
              ) : (
                labelOptions.map((opt) => {
                  const active = s.allowedLabels.includes(opt.name);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleAllowedLabel(s.id, s.allowedLabels, opt.name)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 hover:bg-sts-surface"
                    >
                      <span className="size-[10px] shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                      <span className="flex-1 text-left font-sans text-[12.5px] text-sts-foreground">{opt.name}</span>
                      {active && <Check className="size-3 shrink-0 text-sts-blue" />}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
        <span className="min-w-0 flex-1" />
        {statusCategory(s) === "COMPLETE" && <CheckCircle2 className="size-3 text-sts-green" aria-label="Completion status" />}
        <div className="flex items-center gap-0.5 transition-opacity">
          <button type="button" aria-label={`Edit ${s.label}`} onClick={() => startEdit(s)} className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground">
            <Pencil className="size-3" />
          </button>
          <button type="button" aria-label={`Delete ${s.label}`} onClick={() => setStatusToDelete(s)} className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-subtle hover:bg-sts-surface hover:text-sts-red">
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    );
  }

  const selectedSubDepartment = subDepartments.find((t) => t.id === selectedSubDepartmentId);

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="sts-text-admin-title">Workflows & statuses</h1>
          <p className="mt-[3px] font-sans text-[13px] text-sts-muted">Organise each sub-department’s statuses into four lifecycle categories.</p>
        </div>
      </div>

      {/* SubDepartment selector */}
      <div className="flex items-center gap-3">
        <label className="shrink-0 font-sans text-[12px] font-medium text-sts-muted">SubDepartment</label>
        <Select value={selectedSubDepartmentId} onValueChange={(v) => v && handleSubDepartmentChange(v)}>
          <SelectTrigger className="h-8 min-w-48 rounded-[7px] border-sts-card-border bg-sts-card font-sans text-[12.5px] text-sts-foreground">
            <SelectValue>
              {subDepartments.find((t) => t.id === selectedSubDepartmentId)
                ? `${subDepartments.find((t) => t.id === selectedSubDepartmentId)!.prefix} — ${subDepartments.find((t) => t.id === selectedSubDepartmentId)!.name}`
                : "Select sub department"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {subDepartments.map((t) => (
              <SelectItem key={t.id} value={t.id} className="font-sans text-[12.5px]">
                {t.prefix} — {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isPending && <span className="font-sans text-[11.5px] text-sts-subtle">Loading…</span>}
      </div>

      {/* Status list */}
      {selectedSubDepartmentId && (
        <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pb-2 pt-4">
          <div className="flex flex-col gap-2 pb-1.5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-sans text-sm font-semibold text-sts-foreground">
                {selectedSubDepartment?.prefix} workflow
              </h2>
              <p className="mt-0.5 font-sans text-[11.5px] text-sts-muted">
                Customise status names within To-do, In progress, Blocked and Complete. Drag to reorder within a category.
              </p>
            </div>
            {statuses.length > 0 && (
              <ListSearchInput value={statusQuery} onChange={setStatusQuery} placeholder="Search statuses…" />
            )}
          </div>

          {error && (
            <p className="mt-2 rounded-[6px] bg-sts-red-tint px-3 py-2 font-sans text-[11.5px] text-sts-red">{error}</p>
          )}

          {noStatusMatches ? (
            <p className="py-4 font-sans text-[12px] text-sts-subtle">No statuses match &ldquo;{statusQuery.trim()}&rdquo;</p>
          ) : STATUS_CATEGORIES.map((category) => {
            const rows = filteredStatuses.filter((status) => statusCategory(status) === category);
            return (
              <div key={category}>
                <div className="flex items-center justify-between">
                  <CategoryLabel>{STATUS_CATEGORY_LABELS[category]}</CategoryLabel>
                  <button type="button" aria-label={`Add status to ${STATUS_CATEGORY_LABELS[category]}`} onClick={() => { setNewCategory(category); setAdding(true); setError(null); }} className="flex items-center gap-1 font-sans text-xs text-sts-muted hover:text-sts-blue">
                    <Plus className="size-3" /> Add status
                  </button>
                </div>
                {rows.length ? rows.map(renderRow) : <p className="py-2 font-sans text-xs text-sts-subtle">No statuses in this category.</p>}
              </div>
            );
          })}

          {/* Add status row */}
          {adding ? (
            <div className="flex min-h-12 flex-wrap items-center gap-3 py-2 border-t border-[#f0f4f8] dark:border-[#3a3a37]">
              <GripVertical className="size-4 shrink-0 text-sts-subtle opacity-30" />
              <div className="flex items-center gap-1.5">
                <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: newColor }} />
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setNewColor(c)}
                      aria-label={`Status color ${c}`} aria-pressed={newColor === c}
                      className={cn("size-3.5 rounded-full border-2 transition-transform", newColor === c ? "border-sts-foreground scale-110" : "border-transparent")}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <input
                autoFocus
                placeholder="Status name…"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addStatus(); if (e.key === "Escape") setAdding(false); }}
                className="min-w-0 flex-1 rounded-[5px] border border-sts-card-border bg-sts-bg px-2 py-1 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue"
              />
              <CategorySelect value={newCategory} onChange={setNewCategory} label="New status category" />
              <Tip label="Add status">
                <button aria-label="Add status" type="button" onClick={addStatus} className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-green hover:bg-sts-surface">
                  <Check className="size-3.5" />
                </button>
              </Tip>
              <Tip label="Cancel">
                <button aria-label="Cancel adding status" type="button" onClick={() => setAdding(false)} className="flex size-7 shrink-0 items-center justify-center rounded-full text-sts-subtle hover:bg-sts-surface">
                  <X className="size-3.5" />
                </button>
              </Tip>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAdding(true); setError(null); }}
              className="flex h-10 w-full items-center gap-2 border-t border-[#f0f4f8] font-sans text-xs font-semibold text-sts-id transition-colors hover:text-sts-blue dark:border-[#3a3a37]"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              Add status
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={statusToDelete !== null}
        onOpenChange={(o) => { if (!o) setStatusToDelete(null); }}
        title={`Delete "${statusToDelete?.label ?? ""}" status?`}
        description="Tickets currently in this status may need to be moved to another column. This can't be undone."
        successMessage="Status deleted."
        onConfirm={async () => {
          if (statusToDelete) await deleteStatus(statusToDelete.id);
        }}
      />
    </div>
  );
}
