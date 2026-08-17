"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Pencil, Plus, Trash2, X, Search, Users, Shield, Clock,
  ChevronDown, UserPlus, FolderKanban, ArrowRight,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { DepartmentIconVisual } from "@/components/icons/department-icon-visual";
import { cn } from "@/lib/utils";
import {
  DEPARTMENT_TYPES,
  DEFAULT_DEPARTMENT_TYPE,
  departmentTypeLabel,
  departmentTypeDescription,
} from "@/lib/department-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  assignDepartmentManager,
  removeDepartmentManager,
  grantDepartmentAccess,
  revokeDepartmentAccess,
  fetchDepartmentAccessGrant,
  updateDepartmentAccess,
  addDepartmentMember,
  removeDepartmentDirectMember,
  removeDepartmentMember,
  fetchDepartmentProjects,
  createAdminDepartment,
  updateAdminDepartment,
  deleteAdminDepartment,
  createAdminTeam,
} from "@/lib/api/admin";

// ── Types ──────────────────────────────────────────────────────────────────────

export type UserOption = { id: string; name: string; email: string; role: string; avatarUrl?: string | null };

type DeptManager = {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string; role: string; avatarUrl?: string | null };
};

type DeptMember = {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string; role: string; avatarUrl?: string | null };
};

export type AccessGrant = {
  id: string;
  userId: string;
  expiresAt: string | null;
  reason: string | null;
  grantedAt: string;
  fullAccess: boolean;
  user: { id: string; name: string; email: string; role: string; avatarUrl?: string | null };
  grantor: { id: string; name: string };
};

export type NativeMember = {
  userId: string;
  user: { id: string; name: string; email: string; role: string; avatarUrl?: string | null };
};

export type DepartmentRow = {
  id: string;
  name: string;
  isHub: boolean;
  type?: string;
  _count: { teams: number; projects?: number; members?: number };
  managers: DeptManager[];
  accessGrants: AccessGrant[];
  directMembers: DeptMember[];
  nativeMembers: NativeMember[];
  memberIds: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 24, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  return <UserAvatar name={name} avatarUrl={avatarUrl} size={size} />;
}

export function UserPickerDropdown({
  label,
  users,
  excludeIds,
  onSelect,
}: {
  label: string;
  users: UserOption[];
  excludeIds: string[];
  onSelect: (u: UserOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = users
    .filter((u) => !excludeIds.includes(u.id))
    .filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger
        type="button"
        className="flex h-7 items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[11.5px] text-pen-muted hover:border-pen-id hover:text-pen-foreground"
      >
        <UserPlus className="size-3 shrink-0" />
        {label}
        <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-0">
        <div className="border-b border-pen-card-border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-pen-subtle" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="h-7 w-full rounded-md border border-pen-card-border bg-pen-surface pl-6 pr-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="py-3 text-center font-sans text-[12px] text-pen-subtle">No users found</p>
          ) : filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onSelect(u); setOpen(false); setSearch(""); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-pen-blue-tint"
            >
              <Avatar name={u.name} size={22} avatarUrl={u.avatarUrl ?? null} />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate font-sans text-[12px] text-pen-foreground">{u.name}</p>
                <p className="truncate font-sans text-[11.5px] text-pen-subtle">{u.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-pen-surface px-1.5 py-0.5 font-sans text-[9.5px] text-pen-subtle capitalize">{u.role}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Project Access Picker (Full access vs. select specific projects) ───────────

export function ProjectAccessPicker({
  deptId,
  deptName,
  fullAccess,
  onFullAccessChange,
  selectedProjectIds,
  onToggleProject,
}: {
  deptId: string;
  deptName: string;
  fullAccess: boolean;
  onFullAccessChange: (v: boolean) => void;
  selectedProjectIds: Set<string>;
  onToggleProject: (id: string) => void;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState(false);

  function loadProjects() {
    setLoadingProjects(true);
    setProjectsError(false);
    fetchDepartmentProjects(deptId)
      .then(setProjects)
      .catch(() => setProjectsError(true))
      .finally(() => setLoadingProjects(false));
  }

  // "Select specific projects" is the default mode, so fetch as soon as this renders.
  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId]);

  return (
    <div>
      <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">Project access</label>
      <div className="flex h-9 overflow-hidden rounded-lg border border-pen-card-border">
        <button
          type="button"
          onClick={() => onFullAccessChange(false)}
          className={cn(
            "flex flex-1 items-center justify-center font-sans text-[12px] font-medium transition-colors",
            !fullAccess ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
          )}
        >
          Select projects
        </button>
        <button
          type="button"
          onClick={() => onFullAccessChange(true)}
          className={cn(
            "flex flex-1 items-center justify-center border-l border-pen-card-border font-sans text-[12px] font-medium transition-colors",
            fullAccess ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
          )}
        >
          Full access
        </button>
      </div>
      {fullAccess ? (
        <p className="mt-1.5 font-sans text-[11.5px] text-pen-subtle">
          Can see and create tickets on every project in {deptName}.
        </p>
      ) : (
        <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-pen-card-border">
          {loadingProjects ? (
            <p className="py-3 text-center font-sans text-[12px] text-pen-subtle">Loading projects…</p>
          ) : projectsError ? (
            <div className="flex flex-col items-center gap-1.5 py-3">
              <p className="font-sans text-[12px] text-red-500">Failed to load projects.</p>
              <button type="button" onClick={loadProjects} className="font-sans text-[11.5px] text-pen-id hover:underline">
                Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <p className="py-3 text-center font-sans text-[12px] text-pen-subtle">No projects in this department yet.</p>
          ) : (
            [...projects]
              .sort((a, b) => Number(selectedProjectIds.has(b.id)) - Number(selectedProjectIds.has(a.id)))
              .map((p) => {
              const checked = selectedProjectIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggleProject(p.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-pen-surface"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-pen-blue bg-pen-blue" : "border-pen-card-border",
                    )}
                  >
                    {checked && <Check className="size-3 text-white dark:text-gray-900" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">{p.name}</span>
                </button>
              );
            })
          )}
        </div>
      )}
      {!fullAccess && selectedProjectIds.size === 0 && (
        <p className="mt-1 font-sans text-[11.5px] text-amber-600 dark:text-amber-400">Select at least one project.</p>
      )}
    </div>
  );
}

// ── Grant Access Modal ────────────────────────────────────────────────────────

export function GrantAccessModal({
  deptId,
  deptName,
  users,
  excludeIds,
  onGrant,
  onClose,
}: {
  deptId: string;
  deptName: string;
  users: UserOption[];
  excludeIds: string[];
  onGrant: (
    userId: string,
    expiresAt: string,
    reason: string,
    fullAccess: boolean,
    projectIds: string[],
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [fullAccess, setFullAccess] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const filtered = users
    .filter((u) => !excludeIds.includes(u.id))
    .filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase()));

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const canSubmit = !!userId && (fullAccess || selectedProjectIds.size > 0);

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    await onGrant(userId, permanent ? "" : expiresAt, reason, fullAccess, [...selectedProjectIds]);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
          <p className="font-sans text-[14px] font-semibold text-pen-foreground">Grant access to {deptName}</p>
          <button type="button" onClick={onClose}><X className="size-4 text-pen-muted" /></button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">User <span className="text-red-500">*</span></label>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-full rounded-lg border border-pen-card-border bg-pen-surface pl-8 pr-3 font-sans text-[12.5px] outline-none focus:border-pen-id" />
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-pen-card-border">
              {filtered.map((u) => (
                <button key={u.id} type="button" onClick={() => { setUserId(u.id); setUserName(u.name); }}
                  className={cn("flex w-full items-center gap-2 px-3 py-2 text-left", userId === u.id ? "bg-pen-blue-tint" : "hover:bg-pen-surface")}>
                  <Avatar name={u.name} size={22} avatarUrl={u.avatarUrl ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[12px] text-pen-foreground">{u.name}</p>
                    <p className="font-sans text-[11.5px] text-pen-subtle">{u.email}</p>
                  </div>
                  {userId === u.id && <Check className="size-3.5 shrink-0 text-pen-id" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">Access duration</label>
            <div className="flex h-9 overflow-hidden rounded-lg border border-pen-card-border">
              <button
                type="button"
                onClick={() => setPermanent(true)}
                className={cn(
                  "flex flex-1 items-center justify-center font-sans text-[12px] font-medium transition-colors",
                  permanent ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                )}
              >
                Permanent
              </button>
              <button
                type="button"
                onClick={() => setPermanent(false)}
                className={cn(
                  "flex flex-1 items-center justify-center border-l border-pen-card-border font-sans text-[12px] font-medium transition-colors",
                  !permanent ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                )}
              >
                Set expiry
              </button>
            </div>
            {!permanent && (
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id"
              />
            )}
          </div>
          <ProjectAccessPicker
            deptId={deptId}
            deptName={deptName}
            fullAccess={fullAccess}
            onFullAccessChange={setFullAccess}
            selectedProjectIds={selectedProjectIds}
            onToggleProject={toggleProject}
          />
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cross-team ticket assignment" className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-pen-card-border px-5 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-pen-card-border px-4 font-sans text-[12.5px] text-pen-muted hover:bg-pen-surface">Cancel</button>
          <button type="button" disabled={!canSubmit || saving} onClick={submit} className="h-8 rounded-lg bg-pen-blue px-4 font-sans text-[12.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50">
            {saving ? "Granting…" : "Grant access"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Department Modal ──────────────────────────────────────────────────────

type PendingTeam = { id: string; name: string; prefix: string };

function autoPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
}

function NewDepartmentModal({
  allUsers,
  onClose,
  onCreated,
}: {
  allUsers: UserOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(DEFAULT_DEPARTMENT_TYPE);
  const [selectedManagers, setSelectedManagers] = useState<UserOption[]>([]);
  const [teams, setTeams] = useState<PendingTeam[]>([]);
  const [teamInput, setTeamInput] = useState("");
  const [teamPrefix, setTeamPrefix] = useState("");
  const [prefixManuallyEdited, setPrefixManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTeamNameChange(v: string) {
    setTeamInput(v);
    if (!prefixManuallyEdited) setTeamPrefix(autoPrefix(v));
  }

  function handlePrefixChange(v: string) {
    setTeamPrefix(v.toUpperCase().replace(/[^A-Z]/g, ""));
    setPrefixManuallyEdited(true);
  }

  function addTeam() {
    const n = teamInput.trim();
    const p = teamPrefix.trim() || autoPrefix(n);
    if (!n) return;
    if (teams.some((t) => t.name.toLowerCase() === n.toLowerCase())) return;
    setTeams((prev) => [...prev, { id: crypto.randomUUID(), name: n, prefix: p }]);
    setTeamInput("");
    setTeamPrefix("");
    setPrefixManuallyEdited(false);
  }

  function removeTeam(id: string) {
    setTeams((prev) => prev.filter((t) => t.id !== id));
  }

  function addManager(u: UserOption) {
    setSelectedManagers((prev) => prev.some((m) => m.id === u.id) ? prev : [...prev, u]);
  }

  function removeManager(id: string) {
    setSelectedManagers((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleSubmit() {
    const deptName = name.trim();
    if (!deptName) return;
    setSaving(true);
    setError(null);
    try {
      const dept = await createAdminDepartment({ name: deptName, type });
      await Promise.all([
        ...selectedManagers.map((m) => assignDepartmentManager(dept.id, m.id).catch(() => null)),
        ...teams.map((t) => createAdminTeam({ name: t.name, prefix: t.prefix, departmentId: dept.id }).catch(() => null)),
      ]);
      onCreated();
    } catch {
      setError("Failed to create department");
    }
    setSaving(false);
  }

  const managerIds = selectedManagers.map((m) => m.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop" onClick={onClose}>
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-pen-blue/10">
              <DepartmentIcon className="size-4 text-pen-blue" />
            </div>
            <p className="font-sans text-[14px] font-semibold text-pen-foreground">New department</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
              Department name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="e.g. Engineering"
              className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-blue/60"
            />
          </div>

          {/* Template */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
              Template
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DEPARTMENT_TYPES.map((t) => {
                const on = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-left transition-colors",
                      on
                        ? "border-pen-blue bg-pen-blue-tint"
                        : "border-pen-card-border hover:border-pen-blue/40",
                    )}
                  >
                    <div className={cn("font-sans text-[12.5px] font-semibold", on ? "text-pen-blue" : "text-pen-foreground")}>
                      {departmentTypeLabel(t)}
                    </div>
                    <div className="mt-0.5 font-sans text-[10.5px] leading-tight text-pen-subtle">
                      {departmentTypeDescription(t)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Managers */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <label className="font-sans text-[11.5px] font-medium text-pen-muted">Managers <span className="text-pen-subtle font-normal">(optional)</span></label>
              <span className="flex-1" />
              <UserPickerDropdown label="Add manager" users={allUsers} excludeIds={managerIds} onSelect={addManager} />
            </div>
            {selectedManagers.length === 0 ? (
              <p className="font-sans text-[11.5px] text-pen-subtle">No managers selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedManagers.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface py-1 pl-1.5 pr-2">
                    <UserAvatar name={m.name} size={18} avatarUrl={m.avatarUrl ?? null} />
                    <span className="font-sans text-[11.5px] text-pen-foreground">{m.name}</span>
                    <button type="button" onClick={() => removeManager(m.id)} className="ml-0.5 rounded-full p-0.5 text-pen-subtle hover:text-red-500">
                      <X className="size-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Teams */}
          <div>
            <label className="mb-2 block font-sans text-[11.5px] font-medium text-pen-muted">
              Teams <span className="text-pen-subtle font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                value={teamInput}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTeam(); } }}
                placeholder="Team name…"
                className="h-8 min-w-0 flex-1 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-blue/60"
              />
              <input
                value={teamPrefix}
                onChange={(e) => handlePrefixChange(e.target.value)}
                placeholder="PRE"
                maxLength={4}
                className="h-8 w-16 rounded-lg border border-pen-card-border bg-pen-surface px-2 text-center font-mono text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-blue/60"
                title="Prefix (auto-generated)"
              />
              <button
                type="button"
                onClick={addTeam}
                disabled={!teamInput.trim()}
                className="flex h-8 items-center gap-1 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-muted transition-colors hover:border-pen-blue/40 hover:text-pen-blue disabled:opacity-40"
              >
                <Plus className="size-3.5" /> Add
              </button>
            </div>
            {teams.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {teams.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-1.5">
                    <span className="font-mono text-[11.5px] text-pen-id">{t.prefix}</span>
                    <span className="font-sans text-[12.5px] text-pen-foreground flex-1">{t.name}</span>
                    <button type="button" onClick={() => removeTeam(t.id)} className="rounded p-0.5 text-pen-subtle hover:text-red-500">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="font-sans text-[12px] text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-pen-card-border px-5 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-pen-card-border px-4 font-sans text-[12.5px] text-pen-muted hover:bg-pen-surface">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || saving}
            onClick={handleSubmit}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-pen-blue px-4 font-sans text-[12.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating…
              </span>
            ) : (
              <>
                <Plus className="size-3.5" strokeWidth={2.5} />
                Create department
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Department Card ───────────────────────────────────────────────────────────

function DepartmentCard({
  dept,
  allUsers,
  isAdmin = false,
  onRename,
  onDelete,
  onEnterWorkspace,
}: {
  dept: DepartmentRow;
  allUsers: UserOption[];
  isAdmin?: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => void;
  onEnterWorkspace?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(dept.name);
  const [entering, setEntering] = useState(false);
  const [managers, setManagers] = useState<DeptManager[]>(dept.managers);
  const [directMembers, setDirectMembers] = useState<DeptMember[]>(dept.directMembers);
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>(dept.accessGrants);
  const [removedNativeIds, setRemovedNativeIds] = useState<Set<string>>(new Set());
  const nativeMembers = dept.nativeMembers.filter((m) => !removedNativeIds.has(m.userId));
  const [saving, setSaving] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [managersExpanded, setManagersExpanded] = useState(false);
  const [isHub, setIsHub] = useState(dept.isHub);
  const [togglingHub, setTogglingHub] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ userId: string; name: string } | null>(null);

  async function toggleHub() {
    setTogglingHub(true);
    try {
      await updateAdminDepartment(dept.id, { name: editName.trim() || dept.name, isHub: !isHub });
      setIsHub((v) => !v);
    } finally {
      setTogglingHub(false);
    }
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    setSaving(true);
    await onRename(dept.id, editName.trim());
    setSaving(false);
    setEditing(false);
  }

  async function assignManager(u: UserOption) {
    const data = await assignDepartmentManager(dept.id, u.id).catch(() => null);
    if (data) {
      setManagers((prev) => [...prev.filter((m) => m.userId !== u.id), data]);
      // Manager is also automatically added as a direct member
      setDirectMembers((prev) =>
        prev.some((m) => m.userId === u.id)
          ? prev
          : [...prev, { id: data.id + "_m", userId: u.id, user: data.user }],
      );
    }
  }

  async function removeManager(userId: string) {
    await removeDepartmentManager(dept.id, userId).catch(() => null);
    setManagers((prev) => prev.filter((m) => m.userId !== userId));
  }

  async function addMember(u: UserOption) {
    const data = await addDepartmentMember(dept.id, u.id).catch(() => null);
    if (data) setDirectMembers((prev) => [...prev.filter((m) => m.userId !== u.id), data]);
  }

  async function removeDirectMember(userId: string) {
    await removeDepartmentDirectMember(dept.id, userId).catch(() => null);
    setDirectMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  async function removeNativeMember(userId: string) {
    await removeDepartmentMember(dept.id, userId).catch(() => null);
    setRemovedNativeIds((prev) => new Set(prev).add(userId));
  }

  async function grantAccess(
    userId: string,
    expiresAt: string,
    reason: string,
    fullAccess: boolean,
    projectIds: string[],
  ) {
    const data = await grantDepartmentAccess(dept.id, {
      userId,
      expiresAt: expiresAt || undefined,
      reason: reason || undefined,
      fullAccess,
      projectIds,
    }).catch(() => null);
    if (data) setAccessGrants((prev) => [...prev.filter((g) => g.userId !== userId), data]);
  }

  async function revokeAccess(userId: string) {
    await revokeDepartmentAccess(dept.id, userId).catch(() => null);
    setAccessGrants((prev) => prev.filter((g) => g.userId !== userId));
  }

  // Quick-edit an existing grant, without revoke + re-grant.
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editPermanent, setEditPermanent] = useState(true);
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editFullAccess, setEditFullAccess] = useState(false);
  const [editSelectedProjectIds, setEditSelectedProjectIds] = useState<Set<string>>(new Set());

  function toggleEditProject(id: string) {
    setEditSelectedProjectIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function openEditGrant(g: AccessGrant) {
    if (editingGrantId === g.userId) {
      setEditingGrantId(null);
      return;
    }
    setEditingGrantId(g.userId);
    setEditLoading(true);
    try {
      const data = await fetchDepartmentAccessGrant(dept.id, g.userId);
      setEditFullAccess(data.fullAccess);
      setEditPermanent(!data.expiresAt);
      setEditExpiresAt(data.expiresAt ? data.expiresAt.slice(0, 10) : "");
      setEditReason(data.reason ?? "");
      setEditSelectedProjectIds(new Set(data.projectIds));
    } catch {
      setEditingGrantId(null);
    } finally {
      setEditLoading(false);
    }
  }

  async function saveGrantEdit(userId: string) {
    setEditSaving(true);
    try {
      const data = await updateDepartmentAccess(dept.id, userId, {
        expiresAt: editPermanent ? undefined : editExpiresAt || undefined,
        reason: editReason || undefined,
        fullAccess: editFullAccess,
        projectIds: [...editSelectedProjectIds],
      });
      setAccessGrants((prev) => prev.map((g) => (g.userId === userId ? data : g)));
      setEditingGrantId(null);
    } catch {
      // keep the panel open so the manager can retry
    } finally {
      setEditSaving(false);
    }
  }

  const managerIds = managers.map((m) => m.userId);
  const directMemberIds = directMembers.map((m) => m.userId);
  const accessIds = accessGrants.map((g) => g.userId);
  const nativeMemberIds = dept.memberIds;

  // Merge all members for display: native team members + direct-added members + managers, deduped
  const allMemberEntries = [
    ...nativeMembers.map((m) => ({ ...m, source: "native" as const })),
    ...directMembers
      .filter((m) => !nativeMemberIds.includes(m.userId))
      .map((m) => ({ userId: m.userId, user: m.user, source: "direct" as const })),
    ...managers
      .filter((m) => !nativeMemberIds.includes(m.userId) && !directMemberIds.includes(m.userId))
      .map((m) => ({ userId: m.userId, user: m.user, source: "native" as const })),
  ];

  return (
    <>
      <ConfirmDialog
        open={!!confirmRemoveMember}
        onOpenChange={(open) => { if (!open) setConfirmRemoveMember(null); }}
        title="Remove member"
        description={confirmRemoveMember ? `Remove ${confirmRemoveMember.name} from the department? This removes them from all of this department's teams.` : ""}
        confirmLabel="Remove"
        successMessage={confirmRemoveMember ? `${confirmRemoveMember.name} removed` : undefined}
        onConfirm={async () => { if (confirmRemoveMember) await removeNativeMember(confirmRemoveMember.userId); }}
      />
      {showGrantModal && (
        <GrantAccessModal
          deptId={dept.id}
          deptName={dept.name}
          users={allUsers}
          excludeIds={[...new Set([...managerIds, ...directMemberIds, ...accessIds, ...nativeMemberIds])]}
          onGrant={grantAccess}
          onClose={() => setShowGrantModal(false)}
        />
      )}
      <div className="flex flex-col rounded-2xl border border-pen-card-border bg-pen-card">

        {/* ── Card header ── */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pen-blue/10">
            <DepartmentIconVisual
              name={dept.name}
              id={dept.id}
              isHub={dept.isHub}
              size="lg"
              className="text-pen-blue"
            />
          </div>
          <div className="min-w-0 flex-1">
            {editing && isAdmin ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { setEditing(false); setEditName(dept.name); } }}
                  className="min-w-0 flex-1 rounded-lg border border-pen-blue/50 bg-pen-surface px-3 py-1 font-sans text-[14px] font-semibold text-pen-foreground outline-none"
                />
                <button type="button" onClick={saveEdit} disabled={saving} className="rounded-md p-1.5 text-pen-green hover:bg-pen-green/10"><Check className="size-3.5" /></button>
                <button type="button" onClick={() => { setEditing(false); setEditName(dept.name); }} className="rounded-md p-1.5 text-pen-subtle hover:text-pen-foreground"><X className="size-3.5" /></button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="pen-text-modal-title">{dept.name}</h3>
                {isHub ? (
                  <span className="inline-flex items-center rounded-full bg-violet-100 px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    Hub
                  </span>
                ) : dept.type && dept.type !== "development" ? (
                  <span className="inline-flex items-center rounded-full bg-pen-blue-tint px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-pen-blue">
                    {departmentTypeLabel(dept.type)}
                  </span>
                ) : null}
              </div>
            )}
            {/* Stats row */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                <Users className="size-3 shrink-0" />
                {dept._count.teams} team{dept._count.teams !== 1 ? "s" : ""}
              </span>
              {dept._count.projects !== undefined && (
                <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                  <FolderKanban className="size-3 shrink-0" />
                  {dept._count.projects} project{dept._count.projects !== 1 ? "s" : ""}
                </span>
              )}
              {dept._count.members !== undefined && (
                <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                  <Users className="size-3 shrink-0" />
                  {dept._count.members} member{dept._count.members !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          {!editing && (
            <div className="flex items-center gap-0.5">
              <a
                href={`/settings/departments/${dept.id}/sla`}
                title="SLA policies"
                className="rounded-md p-1.5 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
              >
                <Clock className="size-3.5" />
              </a>
            </div>
          )}
          {isAdmin && !editing && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={toggleHub}
                disabled={togglingHub}
                title={isHub ? "Disable hub department" : "Mark as hub department"}
                className={cn(
                  "rounded-md p-1.5 text-[10px] font-semibold transition-colors disabled:opacity-50",
                  isHub
                    ? "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400"
                    : "text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground",
                )}
              >
                Hub
              </button>
              <button type="button" onClick={() => setEditing(true)} className="rounded-md p-1.5 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground" title="Rename">
                <Pencil className="size-3.5" />
              </button>
              <button type="button" onClick={() => onDelete(dept.id)} className="rounded-md p-1.5 text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20" title="Delete">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Managers (collapsible) ── */}
        <div className="border-t border-pen-card-border px-5 py-3">
          <button
            type="button"
            onClick={() => setManagersExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Shield className="size-3.5 shrink-0 text-pen-muted" />
            <span className="font-sans text-[11.5px] font-semibold text-pen-foreground flex-1">
              Managers
              {managers.length > 0 && <span className="ml-1.5 font-normal text-pen-subtle">({managers.length})</span>}
            </span>
            {managers.length > 0 && !managersExpanded && (
              <div className="flex -space-x-1.5 mr-1">
                {managers.slice(0, 4).map((m) => (
                  <Avatar key={m.id} name={m.user.name} size={18} avatarUrl={m.user.avatarUrl ?? null} />
                ))}
                {managers.length > 4 && (
                  <span className="flex size-[18px] items-center justify-center rounded-full bg-pen-surface border border-pen-card-border font-sans text-[9px] text-pen-subtle">
                    +{managers.length - 4}
                  </span>
                )}
              </div>
            )}
            <ChevronDown className={cn("size-3.5 text-pen-subtle transition-transform", managersExpanded && "rotate-180")} />
          </button>
          {managersExpanded && (
            <>
              <div className="mt-2 flex justify-end">
                <UserPickerDropdown label="Assign manager" users={allUsers} excludeIds={managerIds} onSelect={assignManager} />
              </div>
              {managers.length === 0 ? (
                <p className="mt-1.5 font-sans text-[11.5px] text-pen-subtle">No managers assigned yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {managers.map((m) => (
                    <div key={m.id} className="group flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface py-1 pl-1.5 pr-2">
                      <Avatar name={m.user.name} size={18} avatarUrl={m.user.avatarUrl ?? null} />
                      <span className="font-sans text-[11.5px] text-pen-foreground">{m.user.name}</span>
                      <button type="button" onClick={() => removeManager(m.userId)} className="ml-0.5 rounded-full p-0.5 text-pen-subtle transition-opacity hover:text-red-500">
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Members (collapsible) ── */}
        <div className="border-t border-pen-card-border px-5 py-3">
          <button
            type="button"
            onClick={() => setMembersExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Users className="size-3.5 shrink-0 text-pen-muted" />
            <span className="font-sans text-[11.5px] font-semibold text-pen-foreground flex-1">
              Members
              {allMemberEntries.length > 0 && <span className="ml-1.5 font-normal text-pen-subtle">({allMemberEntries.length})</span>}
            </span>
            {allMemberEntries.length > 0 && !membersExpanded && (
              <div className="flex -space-x-1.5 mr-1">
                {allMemberEntries.slice(0, 4).map((m) => (
                  <Avatar key={m.userId} name={m.user.name} size={18} avatarUrl={m.user.avatarUrl ?? null} />
                ))}
                {allMemberEntries.length > 4 && (
                  <span className="flex size-[18px] items-center justify-center rounded-full bg-pen-surface border border-pen-card-border font-sans text-[9px] text-pen-subtle">
                    +{allMemberEntries.length - 4}
                  </span>
                )}
              </div>
            )}
            <ChevronDown className={cn("size-3.5 text-pen-subtle transition-transform", membersExpanded && "rotate-180")} />
          </button>
          {membersExpanded && (
            <>
              <div className="mt-2 flex justify-end">
                <UserPickerDropdown
                  label="Add member"
                  users={allUsers}
                  excludeIds={[...new Set([...nativeMemberIds, ...directMemberIds, ...managerIds])]}
                  onSelect={addMember}
                />
              </div>
              {allMemberEntries.length === 0 ? (
                <p className="mt-1.5 font-sans text-[11.5px] text-pen-subtle">No members yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {allMemberEntries.map((m) => (
                    <div key={m.userId} className="group flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface py-1 pl-1.5 pr-2">
                      <Avatar name={m.user.name} size={18} avatarUrl={m.user.avatarUrl ?? null} />
                      <span className="font-sans text-[11.5px] text-pen-foreground">{m.user.name}</span>
                      <span className="ml-0.5 rounded-full bg-pen-surface px-1 py-0.5 font-sans text-[9.5px] text-pen-subtle capitalize">{m.user.role}</span>
                      {!managerIds.includes(m.userId) && (
                        <button
                          type="button"
                          onClick={() => (m.source === "direct" ? removeDirectMember(m.userId) : setConfirmRemoveMember({ userId: m.userId, name: m.user.name }))}
                          title="Remove from department"
                          className="ml-0.5 rounded-full p-0.5 text-pen-subtle transition-opacity hover:text-red-500"
                        >
                          <X className="size-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Cross-dept access (collapsible) ── */}
        <div className="border-t border-pen-card-border px-5 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Users className="size-3.5 shrink-0 text-pen-muted" />
            <span className="font-sans text-[11.5px] font-semibold text-pen-foreground flex-1">
              Cross-department access
              {accessGrants.length > 0 && (
                <span className="ml-1.5 font-normal text-pen-subtle">({accessGrants.length})</span>
              )}
            </span>
            {accessGrants.length > 0 && (
              <div className="flex -space-x-1.5 mr-1">
                {accessGrants.slice(0, 3).map((g) => <Avatar key={g.id} name={g.user.name} size={18} avatarUrl={g.user.avatarUrl ?? null} />)}
              </div>
            )}
            <ChevronDown className={cn("size-3.5 text-pen-subtle transition-transform", expanded && "rotate-180")} />
          </button>

          {expanded && (
            <div className="mt-2 flex flex-col gap-1">
              {accessGrants.length === 0 ? (
                <p className="font-sans text-[11.5px] text-pen-subtle">No temporary access grants.</p>
              ) : (
                accessGrants.map((g) => (
                  <Fragment key={g.id}>
                  <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-pen-surface">
                    <button
                      type="button"
                      onClick={() => openEditGrant(g)}
                      title="Click to edit this grant"
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <Avatar name={g.user.name} size={22} avatarUrl={g.user.avatarUrl ?? null} />
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-[12px] font-semibold text-pen-foreground">{g.user.name}</p>
                        <p className="font-sans text-[11.5px] text-pen-subtle">
                          {g.reason ?? "No reason"}
                          {g.expiresAt && ` · expires ${new Date(g.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 font-sans text-[11.5px]",
                          g.fullAccess
                            ? "bg-pen-blue/10 text-pen-blue"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        )}
                      >
                        {g.fullAccess ? "Full access" : "Limited"}
                      </span>
                      {g.expiresAt && new Date(g.expiresAt) < new Date() ? (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 font-sans text-[11.5px] text-red-600 dark:bg-red-900/30 dark:text-red-400">Expired</span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-[11.5px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <Clock className="size-2.5" /> Active
                        </span>
                      )}
                    </button>
                    <button type="button" onClick={() => revokeAccess(g.userId)} title="Revoke access" className="shrink-0 rounded-md p-1 text-pen-subtle hover:text-red-500">
                      <X className="size-3" />
                    </button>
                  </div>
                  {editingGrantId === g.userId && (
                      <div className="mx-2 mb-2 flex flex-col gap-3 rounded-lg border border-pen-card-border bg-pen-bg p-3">
                        {editLoading ? (
                          <p className="py-2 text-center font-sans text-[12px] text-pen-subtle">Loading…</p>
                        ) : (
                          <>
                            <div>
                              <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">Access duration</label>
                              <div className="flex h-8 overflow-hidden rounded-lg border border-pen-card-border">
                                <button
                                  type="button"
                                  onClick={() => setEditPermanent(true)}
                                  className={cn(
                                    "flex flex-1 items-center justify-center font-sans text-[11.5px] font-medium transition-colors",
                                    editPermanent ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                                  )}
                                >
                                  Permanent
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditPermanent(false)}
                                  className={cn(
                                    "flex flex-1 items-center justify-center border-l border-pen-card-border font-sans text-[11.5px] font-medium transition-colors",
                                    !editPermanent ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                                  )}
                                >
                                  Set expiry
                                </button>
                              </div>
                              {!editPermanent && (
                                <input
                                  type="date"
                                  value={editExpiresAt}
                                  onChange={(e) => setEditExpiresAt(e.target.value)}
                                  className="mt-2 h-8 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-id"
                                />
                              )}
                            </div>
                            <ProjectAccessPicker
                              deptId={dept.id}
                              deptName={dept.name}
                              fullAccess={editFullAccess}
                              onFullAccessChange={setEditFullAccess}
                              selectedProjectIds={editSelectedProjectIds}
                              onToggleProject={toggleEditProject}
                            />
                            <div>
                              <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">Reason (optional)</label>
                              <input
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                className="h-8 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-id"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setEditingGrantId(null)} className="h-8 rounded-lg border border-pen-card-border px-3 font-sans text-[11.5px] text-pen-muted hover:bg-pen-surface">
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={editSaving || (!editFullAccess && editSelectedProjectIds.size === 0)}
                                onClick={() => saveGrantEdit(g.userId)}
                                className="h-8 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
                              >
                                {editSaving ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                  )}
                  </Fragment>
                ))
              )}
              <button
                type="button"
                onClick={() => setShowGrantModal(true)}
                className="mt-1 flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-pen-card-border px-3 font-sans text-[11.5px] text-pen-subtle hover:border-pen-blue/40 hover:text-pen-blue transition-colors"
              >
                <Plus className="size-3" /> Grant access
              </button>
            </div>
          )}
          {!expanded && (
            <button
              type="button"
              onClick={() => setShowGrantModal(true)}
              className="mt-1.5 flex h-6 items-center gap-1 font-sans text-[11.5px] text-pen-subtle hover:text-pen-blue transition-colors"
            >
              <Plus className="size-3" /> Grant access
            </button>
          )}
        </div>

        {/* ── Enter workspace CTA ── */}
        {onEnterWorkspace && (
          <div className="mt-auto border-t border-pen-card-border px-5 py-3">
            <button
              type="button"
              disabled={entering}
              onClick={() => { setEntering(true); onEnterWorkspace(dept.id); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-pen-blue py-2.5 font-sans text-[13px] font-semibold text-white dark:text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-80"
            >
              {entering ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Entering…
                </>
              ) : (
                <>
                  Enter
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SettingsDepartmentsPage({
  departments,
  allUsers,
  isAdmin = false,
  inWorkspace = false,
  onEnterWorkspace,
}: {
  departments: DepartmentRow[];
  allUsers: UserOption[];
  isAdmin?: boolean;
  /** True when admin is inside a dept workspace — hides the create-dept form */
  inWorkspace?: boolean;
  onEnterWorkspace?: (deptId: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showNewModal, setShowNewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDeleteDept = departments.find((d) => d.id === confirmDeleteId) ?? null;

  async function handleRename(id: string, name: string) {
    try {
      await updateAdminDepartment(id, { name });
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to rename");
    }
  }

  async function handleDelete(id: string) {
    await deleteAdminDepartment(id);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <ConfirmDialog
        open={!!confirmDeleteDept}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="Delete department"
        description={confirmDeleteDept ? `Delete "${confirmDeleteDept.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        successMessage={confirmDeleteDept ? `"${confirmDeleteDept.name}" deleted` : undefined}
        onConfirm={async () => { if (confirmDeleteDept) await handleDelete(confirmDeleteDept.id); }}
      />
      {showNewModal && (
        <NewDepartmentModal
          allUsers={allUsers}
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    <div className="flex flex-col gap-6 px-6 py-8 sm:px-10 lg:px-12">
      {/* ── Page header ── */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h1 className="pen-text-admin-title">
            {inWorkspace ? "Department" : "Departments"}
          </h1>
          <p className="mt-1 font-sans text-[13px] text-pen-muted">
            {inWorkspace
              ? "Manage this department — assign managers and grant cross-department access."
              : "Manage departments, assign managers, and grant cross-department access."}
          </p>
        </div>
        {isAdmin && !inWorkspace && (
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-pen-blue px-4 font-sans text-[12px] font-medium text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            New department
          </button>
        )}
      </div>

      {error && <p className="font-sans text-[12px] text-red-500">{error}</p>}

      {/* ── Department cards grid ── */}
      {departments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-pen-card-border py-16 text-center">
          <DepartmentIcon className="size-8 text-pen-subtle" strokeWidth={1.2} />
          <p className="font-sans text-[13px] text-pen-muted">No departments yet. Create one above.</p>
        </div>
      ) : inWorkspace ? (
        // Single-department workspace view — no grid needed, give the card room to breathe
        // instead of squeezing it into a multi-column layout meant for many departments.
        <div className="max-w-3xl">
          <DepartmentCard
            key={departments[0].id}
            dept={departments[0]}
            allUsers={allUsers}
            isAdmin={isAdmin}
            onRename={handleRename}
            onDelete={setConfirmDeleteId}
            onEnterWorkspace={onEnterWorkspace}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {departments.map((dept) => (
            <DepartmentCard
              key={dept.id}
              dept={dept}
              allUsers={allUsers}
              isAdmin={isAdmin}
              onRename={handleRename}
              onDelete={setConfirmDeleteId}
              onEnterWorkspace={onEnterWorkspace}
            />
          ))}
        </div>
      )}
    </div>
    </>
  );
}
