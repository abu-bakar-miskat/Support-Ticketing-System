"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check, X, GripVertical, CheckCircle2, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  getTeamStatuses,
  createTeamStatus,
  updateTeamStatus,
  deleteTeamStatus,
  reorderTeamStatuses,
  getTeamGitHubMap,
  updateTeamGitHubMap,
  type TeamGitHubMap,
  type TeamGitHubMapResponse,
} from "@/lib/api/teams";
import { useLabels } from "@/hooks/queries/use-labels";
import {
  patchTeamStatusInCaches,
  replaceTeamStatusesInCaches,
} from "@/hooks/queries/sync-team-status-caches";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type TeamStatus = { id: string; label: string; color: string; order: number; isComplete: boolean; allowedLabels: string[] };
type Team = { id: string; name: string; prefix: string };

type GitHubMapField = keyof TeamGitHubMap;

const SENTINEL_AUTO = "__auto__";
const SENTINEL_NONE = "__none__";

const GITHUB_MAP_ROWS: {
  field: GitHubMapField;
  label: string;
  defaultKey: keyof TeamGitHubMapResponse["defaults"];
}[] = [
  { field: "onPrOpened", label: "PR opened", defaultKey: "prOpened" },
  { field: "onPrReadyForReview", label: "Marked ready for review", defaultKey: "prReadyForReview" },
  { field: "onPrMerged", label: "PR merged into main/master/modifications", defaultKey: "prMerged" },
];

const PRESET_COLORS = [
  "#94a3b8", "#0a76b9", "#7c3aed", "#16a34a",
  "#dc2626", "#f97316", "#0891b2", "#d97706",
  "#db2777", "#65a30d",
];

function CategoryLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="pb-1.5 pt-3 font-sans text-[9.5px] font-medium tracking-[0.95px] text-pen-subtle uppercase">
      {children}
    </p>
  );
}

function groupStatuses(statuses: TeamStatus[]) {
  const sorted = [...statuses].sort((a, b) => a.order - b.order);
  if (sorted.length === 0) return { unstarted: [], active: [], done: [] };
  const unstarted = [sorted[0]];
  const done = [sorted[sorted.length - 1]];
  const active = sorted.slice(1, sorted.length - 1);
  return { unstarted, active, done };
}

type Props = {
  teams: Team[];
  defaultTeamId: string | null;
  initialStatuses: TeamStatus[];
};

export function SettingsWorkflowsPage({ teams, defaultTeamId, initialStatuses }: Props) {
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId ?? "");
  const [statuses, setStatuses] = useState<TeamStatus[]>(initialStatuses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#94a3b8");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [githubMap, setGithubMap] = useState<TeamGitHubMapResponse | null>(null);
  const [githubMapLoading, setGithubMapLoading] = useState(false);
  const [githubMapError, setGithubMapError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<GitHubMapField | null>(null);
  // Which team the GitHub automation card's state belongs to; guards late-resolving
  // requests started on one team from clobbering another team's state after a switch.
  const githubMapTeamRef = useRef<string | null>(null);
  const { data: labelOptions = [], isLoading: labelsLoading } = useLabels();

  useEffect(() => {
    if (selectedTeamId && statuses.length > 0) {
      replaceTeamStatusesInCaches(queryClient, selectedTeamId, statuses);
    }
  }, [selectedTeamId, statuses, queryClient]);

  async function loadStatuses(teamId: string) {
    getTeamStatuses(teamId)
      .then((next) => {
        setStatuses(next);
        replaceTeamStatusesInCaches(queryClient, teamId, next);
      })
      .catch(() => null);
  }

  async function toggleAllowedLabel(id: string, current: string[], labelName: string) {
    const next = current.includes(labelName)
      ? current.filter((l) => l !== labelName)
      : [...current, labelName];
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, allowedLabels: next } : s)));
    patchTeamStatusInCaches(queryClient, selectedTeamId, id, { allowedLabels: next });
    try {
      const updated = (await updateTeamStatus(selectedTeamId, id, {
        allowedLabels: next,
      })) as TeamStatus;
      patchTeamStatusInCaches(queryClient, selectedTeamId, id, {
        allowedLabels: updated.allowedLabels,
      });
    } catch {
      setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, allowedLabels: current } : s)));
      patchTeamStatusInCaches(queryClient, selectedTeamId, id, { allowedLabels: current });
      toast.error("Failed to update linked labels");
    }
  }

  // Load the GitHub automation config whenever the selected team changes (including on mount).
  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    async function loadGithubMap(teamId: string) {
      githubMapTeamRef.current = teamId;
      // Clear the previous team's card so it can't stay rendered/interactive
      // (and no per-field save can appear in-flight) while the new team loads.
      setGithubMap(null);
      setSavingField(null);
      setGithubMapLoading(true);
      setGithubMapError(null);
      try {
        const data = await getTeamGitHubMap(teamId);
        if (!cancelled) setGithubMap(data);
      } catch {
        if (!cancelled) setGithubMapError("Failed to load GitHub automation settings");
      } finally {
        if (!cancelled) setGithubMapLoading(false);
      }
    }
    void loadGithubMap(selectedTeamId);
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  async function handleGitHubMapChange(field: GitHubMapField, raw: string) {
    if (!selectedTeamId || !githubMap) return;
    const teamId = selectedTeamId;
    const value = raw === SENTINEL_AUTO ? null : raw === SENTINEL_NONE ? "" : raw;
    const prevConfig = githubMap.config;
    const prevValue = prevConfig ? prevConfig[field] : null;
    if (value === prevValue) return;

    const baseConfig: TeamGitHubMap = prevConfig ?? {
      onPrOpened: null,
      onPrReadyForReview: null,
      onPrMerged: null,
    };
    setGithubMap((current) =>
      current ? { ...current, config: { ...baseConfig, [field]: value } } : current,
    );
    setSavingField(field);
    try {
      const updated = await updateTeamGitHubMap(teamId, { [field]: value });
      // Ignore late responses if the card now shows a different team.
      if (githubMapTeamRef.current === teamId) {
        setGithubMap((current) => (current ? { ...current, config: updated } : current));
      }
    } catch {
      if (githubMapTeamRef.current === teamId) {
        setGithubMap((current) => (current ? { ...current, config: prevConfig } : current));
      }
      toast.error("Failed to update GitHub automation setting");
    } finally {
      if (githubMapTeamRef.current === teamId) {
        setSavingField(null);
      }
    }
  }

  function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId);
    setEditingId(null);
    setAdding(false);
    setError(null);
    startTransition(() => { loadStatuses(teamId); });
  }

  function startEdit(s: TeamStatus) {
    setEditingId(s.id);
    setEditLabel(s.label);
    setEditColor(s.color);
    setError(null);
  }

  async function saveEdit(id: string) {
    if (!editLabel.trim()) return;
    setError(null);
    try {
      const updated = await updateTeamStatus(selectedTeamId, id, {
        label: editLabel.trim(),
        color: editColor,
      }) as TeamStatus;
      setStatuses((prev) => prev.map((s) => (s.id === id ? updated : s)));
      patchTeamStatusInCaches(queryClient, selectedTeamId, id, updated);
      setEditingId(null);
    } catch {
      setError("Failed to save");
    }
  }

  async function deleteStatus(id: string) {
    setError(null);
    try {
      await deleteTeamStatus(selectedTeamId, id);
      setStatuses((prev) => {
        const next = prev.filter((s) => s.id !== id);
        replaceTeamStatusesInCaches(queryClient, selectedTeamId, next);
        return next;
      });
    } catch {
      setError("Failed to delete");
    }
  }

  async function addStatus() {
    if (!newLabel.trim() || !selectedTeamId) return;
    setError(null);
    try {
      const created = await createTeamStatus(selectedTeamId, {
        label: newLabel.trim(),
        color: newColor,
      }) as TeamStatus;
      setStatuses((prev) => {
        const next = [...prev, created];
        replaceTeamStatusesInCaches(queryClient, selectedTeamId, next);
        return next;
      });
      setNewLabel("");
      setNewColor("#94a3b8");
      setAdding(false);
    } catch {
      setError("Failed to add");
    }
  }

  async function toggleComplete(id: string, current: boolean) {
    setError(null);
    setTogglingId(id);
    try {
      const updated = await updateTeamStatus(selectedTeamId, id, { isComplete: !current }) as TeamStatus;
      setStatuses((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isComplete: updated.isComplete } : s))
      );
      patchTeamStatusInCaches(queryClient, selectedTeamId, id, {
        isComplete: updated.isComplete,
      });
    } catch {
      setError("Failed to update");
    } finally {
      setTogglingId(null);
    }
  }

  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const sorted = [...statuses].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((s) => s.id === fromId);
    const toIdx = sorted.findIndex((s) => s.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const withNewOrders = reordered.map((s, i) => ({ ...s, order: i }));
    setStatuses(withNewOrders);
    replaceTeamStatusesInCaches(queryClient, selectedTeamId, withNewOrders);

    await reorderTeamStatuses(
      selectedTeamId,
      reordered.map((s, i) => ({ id: s.id, order: i })),
    ).catch(() => null);
  }

  const { unstarted, active, done } = groupStatuses(statuses);
  const sortedStatuses = [...statuses].sort((a, b) => a.order - b.order);

  function renderRow(s: TeamStatus) {
    const isEditing = editingId === s.id;

    if (isEditing) {
      return (
        <div key={s.id} className="flex h-12 items-center gap-3 border-t border-[#f0f4f8] dark:border-[#3a3a37]">
          <GripVertical className="size-4 shrink-0 text-pen-subtle opacity-40" />
          {/* Color picker */}
          <div className="relative flex items-center gap-1.5">
            <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: editColor }} />
            <div className="flex flex-wrap gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  className={cn("size-3.5 rounded-full border-2 transition-transform", editColor === c ? "border-pen-foreground scale-110" : "border-transparent")}
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
            className="min-w-0 flex-1 rounded-[5px] border border-pen-card-border bg-pen-bg px-2 py-1 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue"
          />
          <button type="button" onClick={() => saveEdit(s.id)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-pen-green hover:bg-pen-surface">
            <Check className="size-3.5" />
          </button>
          <button type="button" onClick={() => setEditingId(null)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface">
            <X className="size-3.5" />
          </button>
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
          isDragOver && "bg-pen-blue-tint",
        )}
      >
        <GripVertical className="size-4 shrink-0 text-pen-subtle opacity-30 group-hover:opacity-70" />
        <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
        <span className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">{s.label}</span>
        <Popover>
          <PopoverTrigger
            className={cn(
              "flex h-6 shrink-0 items-center gap-1 rounded-full border border-dashed px-2 font-sans text-[11px] transition-colors",
              s.allowedLabels.length > 0
                ? "border-pen-blue/40 text-pen-blue"
                : "border-pen-card-border text-pen-subtle hover:border-pen-blue/40 hover:text-pen-blue",
            )}
          >
            <Tag className="size-3 shrink-0" />
            {s.allowedLabels.length > 0 ? `${s.allowedLabels.length} label${s.allowedLabels.length > 1 ? "s" : ""}` : "Any label"}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-[220px] gap-0 rounded-[9px] border border-pen-card-border bg-pen-card p-0 shadow-lg"
          >
            <div className="border-b border-pen-card-border px-2.5 py-2">
              <p className="font-sans text-[11px] font-medium text-pen-foreground">Linked labels</p>
              <p className="mt-0.5 font-sans text-[10.5px] text-pen-subtle">
                Moving a ticket into this status will require picking one of these labels. Leave empty to allow any label with no prompt.
              </p>
            </div>
            <div className="max-h-[200px] overflow-y-auto py-1">
              {labelsLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 font-sans text-[11.5px] text-pen-subtle">
                  <LoadingSpinner className="size-3.5 shrink-0" />
                  Loading labels…
                </div>
              ) : labelOptions.length === 0 ? (
                <p className="px-3 py-2 font-sans text-[11.5px] text-pen-subtle">No labels yet</p>
              ) : (
                labelOptions.map((opt) => {
                  const active = s.allowedLabels.includes(opt.name);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleAllowedLabel(s.id, s.allowedLabels, opt.name)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 hover:bg-pen-surface"
                    >
                      <span className="size-[10px] shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                      <span className="flex-1 text-left font-sans text-[12.5px] text-pen-foreground">{opt.name}</span>
                      {active && <Check className="size-3 shrink-0 text-pen-blue" />}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
        <span className="min-w-0 flex-1" />
        {/* isComplete toggle */}
        {togglingId === s.id ? (
          <div className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-pen-surface px-2.5">
            <Loader2 className="size-3 animate-spin text-pen-subtle" />
            <span className="font-sans text-[11px] text-pen-subtle">Saving…</span>
          </div>
        ) : s.isComplete ? (
          <button
            type="button"
            title="Click to remove completion status"
            onClick={() => toggleComplete(s.id, true)}
            className="group/toggle flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-pen-green/10 px-2.5 transition-colors hover:bg-pen-red/10"
          >
            <CheckCircle2 className="size-3 text-pen-green transition-colors group-hover/toggle:hidden" />
            <X className="hidden size-3 text-pen-red transition-colors group-hover/toggle:block" />
            <span className="font-sans text-[11px] font-medium text-pen-green transition-colors group-hover/toggle:text-pen-red">
              <span className="group-hover/toggle:hidden">Complete</span>
              <span className="hidden group-hover/toggle:inline">Remove</span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            title="Mark as completion status"
            onClick={() => toggleComplete(s.id, false)}
            className="flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-pen-subtle transition-all hover:bg-pen-green/10 hover:text-pen-green"
          >
            <CheckCircle2 className="size-3" />
            <span className="font-sans text-[11px] font-medium">Set complete</span>
          </button>
        )}
        <div className="flex items-center gap-0.5 transition-opacity">
          <button type="button" onClick={() => startEdit(s)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground">
            <Pencil className="size-3" />
          </button>
          <button type="button" onClick={() => deleteStatus(s.id)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-red">
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    );
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="pen-text-admin-title">Workflows & statuses</h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">Configure the status columns for each team's board.</p>
        </div>
      </div>

      {/* Team selector */}
      <div className="flex items-center gap-3">
        <label className="shrink-0 font-sans text-[12px] font-medium text-pen-muted">Team</label>
        <Select value={selectedTeamId} onValueChange={(v) => v && handleTeamChange(v)}>
          <SelectTrigger className="h-8 min-w-48 rounded-[7px] border-pen-card-border bg-pen-card font-sans text-[12.5px] text-pen-foreground">
            <SelectValue>
              {teams.find((t) => t.id === selectedTeamId)
                ? `${teams.find((t) => t.id === selectedTeamId)!.prefix} — ${teams.find((t) => t.id === selectedTeamId)!.name}`
                : "Select team"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id} className="font-sans text-[12.5px]">
                {t.prefix} — {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isPending && <span className="font-sans text-[11.5px] text-pen-subtle">Loading…</span>}
      </div>

      {/* Status list */}
      {selectedTeamId && (
        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pb-2 pt-4">
          <div className="pb-1.5">
            <h2 className="font-sans text-sm font-semibold text-pen-foreground">
              {selectedTeam?.prefix} workflow
            </h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">
              Status columns shown on the board. First = starting, last = done.
            </p>
          </div>

          {error && (
            <p className="mt-2 rounded-[6px] bg-pen-red-tint px-3 py-2 font-sans text-[11.5px] text-pen-red">{error}</p>
          )}

          {statuses.length > 0 ? (
            <>
              {unstarted.length > 0 && (
                <>
                  <CategoryLabel>UNSTARTED</CategoryLabel>
                  {unstarted.map(renderRow)}
                </>
              )}
              {active.length > 0 && (
                <>
                  <CategoryLabel>ACTIVE</CategoryLabel>
                  {active.map(renderRow)}
                </>
              )}
              {done.length > 0 && (
                <>
                  <CategoryLabel>DONE</CategoryLabel>
                  {done.map(renderRow)}
                </>
              )}
            </>
          ) : (
            <p className="py-4 font-sans text-[12px] text-pen-subtle">No statuses configured yet.</p>
          )}

          {/* Add status row */}
          {adding ? (
            <div className="flex h-12 items-center gap-3 border-t border-[#f0f4f8] dark:border-[#3a3a37]">
              <GripVertical className="size-4 shrink-0 text-pen-subtle opacity-30" />
              <div className="flex items-center gap-1.5">
                <span className="size-[9px] shrink-0 rounded-full" style={{ backgroundColor: newColor }} />
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setNewColor(c)}
                      className={cn("size-3.5 rounded-full border-2 transition-transform", newColor === c ? "border-pen-foreground scale-110" : "border-transparent")}
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
                className="min-w-0 flex-1 rounded-[5px] border border-pen-card-border bg-pen-bg px-2 py-1 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue"
              />
              <button type="button" onClick={addStatus} className="flex size-7 shrink-0 items-center justify-center rounded-md text-pen-green hover:bg-pen-surface">
                <Check className="size-3.5" />
              </button>
              <button type="button" onClick={() => setAdding(false)} className="flex size-7 shrink-0 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface">
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAdding(true); setError(null); }}
              className="flex h-10 w-full items-center gap-2 border-t border-[#f0f4f8] font-sans text-xs font-semibold text-pen-id transition-colors hover:text-pen-blue dark:border-[#3a3a37]"
            >
              <Plus className="size-3.5" strokeWidth={2.5} />
              Add status
            </button>
          )}
        </div>
      )}

      {/* GitHub automation */}
      {selectedTeamId && (
        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pb-2 pt-4">
          <div className="pb-1.5">
            <h2 className="font-sans text-sm font-semibold text-pen-foreground">GitHub automation</h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">
              Where tickets move when linked pull requests change on GitHub.
            </p>
          </div>

          {githubMapError && (
            <p className="mt-2 rounded-[6px] bg-pen-red-tint px-3 py-2 font-sans text-[11.5px] text-pen-red">{githubMapError}</p>
          )}

          {githubMapLoading && !githubMap ? (
            <p className="py-4 font-sans text-[12px] text-pen-subtle">Loading…</p>
          ) : (
            GITHUB_MAP_ROWS.map((row) => {
              const currentValue = githubMap?.config ? githubMap.config[row.field] : null;
              const selectValue =
                currentValue === null ? SENTINEL_AUTO : currentValue === "" ? SENTINEL_NONE : currentValue;
              const defaultLabel = githubMap?.defaults[row.defaultKey] ?? null;
              const autoLabel = defaultLabel ? `Auto — → ${defaultLabel}` : "Auto — no move";
              const isSaving = savingField === row.field;

              return (
                <div
                  key={row.field}
                  className="flex h-12 items-center gap-3 border-t border-[#f0f4f8] dark:border-[#3a3a37]"
                >
                  <span className="w-48 shrink-0 truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                    {row.label}
                  </span>
                  <Select
                    value={selectValue}
                    onValueChange={(v) => v && handleGitHubMapChange(row.field, v)}
                    disabled={isSaving || !githubMap}
                  >
                    <SelectTrigger className="h-8 min-w-56 rounded-[7px] border-pen-card-border bg-pen-bg font-sans text-[12.5px] text-pen-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value={SENTINEL_AUTO} className="font-sans text-[12.5px]">
                        {autoLabel}
                      </SelectItem>
                      <SelectItem value={SENTINEL_NONE} className="font-sans text-[12.5px]">
                        No change
                      </SelectItem>
                      {sortedStatuses.map((s) => (
                        <SelectItem key={s.id} value={s.label} className="font-sans text-[12.5px]">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isSaving && (
                    <span className="flex items-center gap-1.5 font-sans text-[11px] text-pen-subtle">
                      <Loader2 className="size-3 animate-spin" />
                      Saving…
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
