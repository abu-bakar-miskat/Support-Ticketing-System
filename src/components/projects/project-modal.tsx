"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { X, Search, Check, Building2, ImagePlus, Trash2, Layers, Users } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatUserListSubtitle, matchesUserListSearch } from "@/lib/user-list-person";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import { createAdminProject, updateAdminProject, uploadAdminProjectAvatar } from "@/lib/api/admin";
import { fetchDepartmentPeople } from "@/lib/api/projects";
import { usePermissions } from "@/hooks/use-permissions";
import { LifecycleStepper } from "@/components/projects/lifecycle-stepper";
import {
  type LifecycleStage,
  DEFAULT_LIFECYCLE_STAGES,
  resolveCurrentStage,
  visibleLifecycleStages,
} from "@/lib/project-lifecycle";
import { validateProjectIcon, PROJECT_ICON_ACCEPT } from "@/lib/project-icon";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export type ProjectRow = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
  description?: string | null;
  projectStatus?: string | null;
  lifecycleStages?: LifecycleStage[] | null;
  moduleSystemEnabled?: boolean;
  liveDomain?: string | null;
  openCount: number;
  prefix: string;
  departmentId: string | null;
  departmentName: string | null;
  members: {
    id: string;
    name: string;
    avatarColor: string;
    avatarUrl?: string | null;
  }[];
};

type DepartmentOption = { id: string; name: string };

type UserOption = {
  id: string;
  name: string;
  subDepartmentName: string | null;
  departmentName?: string | null;
  avatarUrl?: string | null;
};

const PRESET_COLORS = [
  "#0a76b9",
  "#7c3aed",
  "#059669",
  "#f97316",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#65a30d",
  "#6366f1",
];

const fieldInputClass =
  "h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id";

// ── Member picker ──────────────────────────────────────────────────────────────

const MEMBER_DROPDOWN_MAX_HEIGHT = 200;

type MemberDropdownPos = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

function getBodyZoom() {
  if (typeof document === "undefined") return 1;
  return parseFloat(getComputedStyle(document.body).zoom) || 1;
}

function MemberPicker({
  users,
  selected,
  onChange,
  isLoading = false,
}: {
  users: UserOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPos, setMenuPos] = useState<MemberDropdownPos | null>(null);
  const debouncedSearch = useDebounce(search, 250);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const zoom = getBodyZoom();
    const spaceBelow = (window.innerHeight - rect.bottom) / zoom;
    const spaceAbove = rect.top / zoom;
    const openUp =
      spaceBelow < MEMBER_DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;

    if (openUp) {
      setMenuPos({
        bottom: (window.innerHeight - rect.top + 4) / zoom,
        left: rect.left / zoom,
        width: rect.width / zoom,
        maxHeight: Math.min(MEMBER_DROPDOWN_MAX_HEIGHT, spaceAbove - 8),
      });
      return;
    }

    setMenuPos({
      top: (rect.bottom + 4) / zoom,
      left: rect.left / zoom,
      width: rect.width / zoom,
      maxHeight: Math.min(MEMBER_DROPDOWN_MAX_HEIGHT, spaceBelow - 8),
    });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    requestAnimationFrame(() => inputRef.current?.focus());
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuPosition]);

  const filtered = users.filter((u) => matchesUserListSearch(u, debouncedSearch));
  const selectedUsers = users.filter((u) => selected.includes(u.id));

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    setSearch("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function openPicker() {
    setOpen(true);
    requestAnimationFrame(updateMenuPosition);
  }

  const dropdown =
    open && menuPos ? (
      <div
        ref={menuRef}
        className="pen-field-dropdown fixed z-10000 flex flex-col overflow-hidden rounded-lg border border-pen-card-border shadow-lg"
        style={{
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
          ...(menuPos.top !== undefined
            ? { top: menuPos.top }
            : { bottom: menuPos.bottom }),
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-pen-card-border/80 px-2.5 py-1.5">
          <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-pen-subtle">
            {debouncedSearch ? `${filtered.length} found` : "People"}
          </span>
          {selected.length > 0 && (
            <span className="font-sans text-[10px] font-medium text-pen-id">
              {selected.length} selected
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
          {isLoading ? (
            <div className="flex flex-col gap-1.5 px-1.5 py-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-2 rounded-md px-1.5 py-1">
                  <div className="size-6 shrink-0 rounded-full bg-pen-surface" />
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="h-2 w-24 rounded bg-pen-surface" />
                    <div className="h-1.5 w-16 rounded bg-pen-surface" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <Users className="size-4 text-pen-subtle" strokeWidth={1.5} />
              <p className="font-sans text-[11.5px] text-pen-muted">No people found</p>
            </div>
          ) : (
            filtered.map((u) => {
              const isSelected = selected.includes(u.id);
              const subtitle = formatUserListSubtitle(u.departmentName, u.subDepartmentName);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={cn(
                    "pen-field-dropdown-item mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors",
                    isSelected && "bg-pen-blue-tint/50",
                  )}
                >
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={22} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[12px] font-medium text-pen-foreground">
                      {u.name}
                    </p>
                    {subtitle && (
                      <p className="truncate font-sans text-[10.5px] text-pen-subtle">{subtitle}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isSelected
                        ? "border-pen-id bg-pen-id text-white"
                        : "border-pen-card-border bg-transparent",
                    )}
                  >
                    {isSelected && <Check className="size-2.5" strokeWidth={2.5} />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <div
        ref={triggerRef}
        onClick={openPicker}
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-pen-card-border bg-pen-surface px-2 py-1.5 cursor-text transition-colors",
          open && "border-pen-id ring-1 ring-pen-id/30",
        )}
      >
        <Search className="size-3.5 shrink-0 text-pen-subtle" />
        {selectedUsers.length === 0 && !open && (
          <span className="font-sans text-[12px] text-pen-subtle">Search and add people…</span>
        )}
        {selectedUsers.map((u) => (
          <span
            key={u.id}
            className="flex items-center gap-1 rounded-full border border-pen-card-border/80 bg-pen-card py-0.5 pl-0.5 pr-1"
          >
            <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={16} />
            <span className="max-w-[120px] truncate font-sans text-[11px] text-pen-foreground">{u.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(u.id); }}
              className="flex size-3.5 items-center justify-center rounded-full text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        {(open || selectedUsers.length > 0) && (
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onClick={(e) => { e.stopPropagation(); openPicker(); }}
            placeholder={selectedUsers.length > 0 ? "Add more…" : ""}
            className="min-w-[72px] flex-1 bg-transparent font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle"
          />
        )}
      </div>

      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────

export type ModalMode =
  | { type: "create" }
  | { type: "edit"; project: ProjectRow };

export function ProjectModal({
  mode,
  departments,
  lockedDepartment,
  onClose,
  onSuccess,
}: {
  mode: ModalMode;
  departments: DepartmentOption[];
  /** When set, the department field is shown as read-only (for non-admin users). */
  lockedDepartment?: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = mode.type === "edit";
  const { canManageProjectLifecycle } = usePermissions();
  const [name, setName] = useState(isEdit ? mode.project.name : "");
  const [color, setColor] = useState(
    isEdit ? mode.project.color : PRESET_COLORS[0],
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    isEdit ? (mode.project.avatarUrl ?? null) : null,
  );
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // For create mode: hold the file to upload after project is created
  const pendingAvatarFile = useRef<File | null>(null);
  const [description, setDescription] = useState(isEdit ? (mode.project.description ?? "") : "");
  const [projectStatus, setProjectStatus] = useState<string>(
    isEdit ? (mode.project.projectStatus ?? "pipeline") : "pipeline",
  );
  const [stages, setStages] = useState<LifecycleStage[]>(
    isEdit && mode.project.lifecycleStages && mode.project.lifecycleStages.length > 0
      ? mode.project.lifecycleStages
      : DEFAULT_LIFECYCLE_STAGES,
  );

  function updateStage(id: string, patch: Partial<LifecycleStage>) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addStage(input: {
    label: string;
    color: string;
    startDate: string | null;
    endDate: string | null;
  }) {
    setStages((prev) => [
      ...prev,
      {
        id: `stage-${Date.now()}`,
        label: input.label,
        color: input.color,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    ]);
  }
  function deleteStage(id: string) {
    setStages((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === projectStatus) setProjectStatus(next[0]?.id ?? "");
      return next;
    });
  }
  function moveStage(index: number, dir: -1 | 1) {
    setStages((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  const [moduleSystemEnabled, setModuleSystemEnabled] = useState<boolean>(
    isEdit ? (mode.project.moduleSystemEnabled ?? false) : false,
  );
  const [liveDomain, setLiveDomain] = useState(isEdit ? (mode.project.liveDomain ?? "") : "");
  const [departmentId, setDepartmentId] = useState(
    lockedDepartment?.id ??
      (isEdit ? (mode.project.departmentId ?? "") : (departments[0]?.id ?? "")),
  );
  const [memberIds, setMemberIds] = useState<string[]>(
    isEdit ? mode.project.members.map((m) => m.id) : [],
  );
  const { data: rawUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["department-people", departmentId],
    queryFn: () => fetchDepartmentPeople(departmentId),
    enabled: !!departmentId,
    staleTime: 2 * 60 * 1000,
  });
  const users: UserOption[] = rawUsers.map((u) => ({
    id: u.id,
    name: u.name,
    subDepartmentName: u.subDepartmentName,
    departmentName: u.departmentName,
    avatarUrl: u.avatarUrl,
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateProjectIcon(file);
    if (validationError) {
      toast.error(validationError);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }

    const preview = URL.createObjectURL(file);
    setAvatarUrl(preview);
    if (isEdit) {
      setAvatarUploading(true);
      try {
        const data = await uploadAdminProjectAvatar(mode.project.id, file);
        setAvatarUrl(data.avatarUrl);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setAvatarUploading(false);
      }
    } else {
      pendingAvatarFile.current = file;
    }
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  async function handleRemoveAvatar() {
    setAvatarUrl(null);
    pendingAvatarFile.current = null;
    if (isEdit) {
      await fetch(`/api/admin/projects/${mode.project.id}/avatar`, { method: "DELETE" }).catch(() => undefined);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setError(null);
    setSaving(true);
    const pendingIcon = pendingAvatarFile.current;
    try {
      const payload = {
        name: name.trim(),
        color,
        description: description.trim() || null,
        ...(canManageProjectLifecycle
          ? { projectStatus, lifecycleStages: stages }
          : {}),
        moduleSystemEnabled,
        liveDomain: liveDomain.trim() || null,
        ...(departmentId ? { departmentId } : { departmentId: null }),
        memberIds,
      };
      if (isEdit) {
        await updateAdminProject(mode.project.id, payload as never);
        onSuccess();
      } else {
        const created = await createAdminProject(payload);
        pendingAvatarFile.current = null;
        onSuccess();

        if (pendingIcon && created.id) {
          void uploadAdminProjectAvatar(created.id, pendingIcon).catch((err) => {
            toast.error(
              err instanceof Error
                ? `Project created, but icon upload failed: ${err.message}`
                : "Project created, but icon upload failed",
            );
          });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong";
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  const isCustomColor = !PRESET_COLORS.includes(color);

  return (
    <div className="pen-overlay-enter fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 pen-overlay-backdrop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        className="pen-glass-panel pen-modal-enter relative flex max-h-[calc(90vh/var(--pen-font-scale,1))] w-full max-w-[580px] flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-pen-card-border pl-[22px] pr-3.5">
          <ProjectAvatar
            name={name || "P"}
            color={color}
            avatarUrl={avatarUrl}
            size={28}
          />
          <h2 id="project-modal-title" className="pen-text-modal-title">
            {isEdit ? "Edit project" : "New project"}
          </h2>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] py-5">
            {/* Name */}
            <div className="flex flex-col gap-[5px]">
              <label className="pen-text-label">
                Project name <span className="text-pen-red">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="e.g. Website Redesign"
                className={fieldInputClass}
              />
            </div>

            {/* Members */}
            <div className="rounded-xl border border-pen-card-border bg-pen-surface/35 p-3.5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="pen-text-section-label">Members</p>
                <span className="font-sans text-[10.5px] text-pen-subtle">Optional</span>
              </div>
              <MemberPicker
                users={users}
                selected={memberIds}
                onChange={setMemberIds}
                isLoading={usersLoading}
              />
            </div>

            {/* Department */}
            {departments.length > 0 && (
              <div className="flex flex-col gap-[5px]">
                <label className="pen-text-label">Department</label>
                {lockedDepartment ? (
                  <div className="flex h-9 items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface/60 px-3">
                    <Building2 className="size-3.5 shrink-0 text-pen-subtle" />
                    <span className="truncate font-sans text-[13px] text-pen-foreground">
                      {lockedDepartment.name || "—"}
                    </span>
                    <span className="ml-auto shrink-0 font-sans text-[10.5px] text-pen-subtle">
                      auto-assigned
                    </span>
                  </div>
                ) : (
                  <SearchableSelect
                    aria-label="Department"
                    value={departmentId}
                    onChange={setDepartmentId}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    searchPlaceholder="Search departments…"
                    className="bg-pen-surface"
                  />
                )}
              </div>
            )}

            {/* Lifecycle / Status — saved status shown as current stage; add stages with ranges */}
            <LifecycleStepper
              stages={visibleLifecycleStages(
                stages,
                projectStatus,
                canManageProjectLifecycle,
              )}
              status={resolveCurrentStage(stages, projectStatus)?.id ?? projectStatus}
              canEdit={canManageProjectLifecycle}
              onSelectStatus={setProjectStatus}
              onUpdateStage={updateStage}
              onMoveStage={moveStage}
              onDeleteStage={deleteStage}
              onAddStage={addStage}
            />

            {/* Module system */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-pen-card-border bg-pen-surface/35 px-3.5 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pen-blue/10 text-pen-blue">
                  <Layers className="size-4" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="font-sans text-[12.5px] font-medium text-pen-foreground">Module system</p>
                  <p className="mt-0.5 font-sans text-[11px] leading-snug text-pen-subtle">
                    Sub-categorize tickets into custom modules. Turning off hides modules without deleting them.
                  </p>
                </div>
              </div>
              <Switch
                checked={moduleSystemEnabled}
                onCheckedChange={setModuleSystemEnabled}
                className="shrink-0 data-checked:bg-pen-blue"
              />
            </div>

            {/* Appearance */}
            <div className="rounded-xl border border-pen-card-border bg-pen-surface/35 p-3.5">
              <p className="mb-3 pen-text-section-label">Appearance</p>
              <div className="flex items-center gap-4">
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <ProjectAvatar
                    name={name || "P"}
                    color={color}
                    avatarUrl={avatarUrl}
                    size={44}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="flex items-center gap-1 rounded-md border border-pen-card-border px-2 py-1 font-sans text-[10.5px] text-pen-foreground transition-colors hover:bg-pen-card disabled:opacity-50"
                    >
                      <ImagePlus className="size-3" strokeWidth={2} />
                      {avatarUploading ? "…" : "Upload"}
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        title="Remove photo"
                        className="flex size-6 items-center justify-center rounded-md border border-pen-card-border text-pen-muted transition-colors hover:bg-pen-card hover:text-pen-red"
                      >
                        <Trash2 className="size-3" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept={PROJECT_ICON_ACCEPT}
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="mb-2 pen-text-label">
                    Colour <span className="font-normal normal-case text-pen-subtle">(when no photo)</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_COLORS.map((c) => {
                      const selected = color === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={cn(
                            "size-6 rounded-full transition-transform hover:scale-105",
                            selected && "ring-2 ring-offset-2 ring-offset-pen-card",
                          )}
                          style={{
                            backgroundColor: c,
                            ...(selected ? { boxShadow: `0 0 0 2px ${c}` } : {}),
                          }}
                          aria-label={c}
                          aria-pressed={selected}
                        />
                      );
                    })}
                    <label
                      title="Custom colour"
                      className={cn(
                        "relative flex size-6 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105",
                        isCustomColor && "ring-2 ring-pen-foreground ring-offset-2 ring-offset-pen-card",
                      )}
                    >
                      <span
                        className="size-4 rounded-full border border-white/15"
                        style={{ backgroundColor: color }}
                      />
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-[5px]">
              <label className="pen-text-label">
                Description <span className="font-normal normal-case text-pen-subtle">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What is this project for?"
                className="resize-none rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
              />
            </div>

            {/* Live Domain */}
            <div className="flex flex-col gap-[5px]">
              <label className="pen-text-label">
                Live domain <span className="font-normal normal-case text-pen-subtle">(optional)</span>
              </label>
              <input
                type="url"
                value={liveDomain}
                onChange={(e) => setLiveDomain(e.target.value)}
                placeholder="https://example.com"
                className={fieldInputClass}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-pen-red/10 px-3 py-2 font-sans text-[12px] text-pen-red">
                {error}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-pen-card-border px-[22px] py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg px-4 font-sans text-[12.5px] text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="h-8 rounded-lg bg-pen-id px-4 font-sans text-[12.5px] font-medium text-white transition-colors hover:bg-pen-id/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
