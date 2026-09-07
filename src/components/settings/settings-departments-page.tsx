"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Pencil, Plus, Trash2, X, Search, Users, Shield,
  ChevronDown, UserPlus, FolderKanban, ArrowRight, BookOpen, MoreHorizontal,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { DepartmentIconVisual } from "@/components/icons/department-icon-visual";
import { cn } from "@/lib/utils";
import {
  DEPARTMENT_TYPES,
  departmentTypeLabel,
  departmentTypeDescription,
  type DepartmentType,
} from "@/lib/department-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DepartmentWalkthroughModal } from "@/components/departments/department-walkthrough";
import { UserAvatar, AvatarVisual } from "@/components/ui/user-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  assignDepartmentManager,
  fetchDepartmentProjects,
  createAdminDepartment,
  updateAdminDepartment,
  deleteAdminDepartment,
  createAdminSubDepartment,
} from "@/lib/api/admin";

// ── Types ──────────────────────────────────────────────────────────────────────

export type UserOption = { id: string; name: string; email: string; role: string; avatarUrl?: string | null };

/** A catalogue template offered as a department "template" option in the New Department modal. */
export type TemplateOption = {
  slug: string;
  name: string;
  description: string | null;
  featureCount: number;
  status: "active" | "requested" | "available";
  /** Board/interface type this template creates (shown as a badge beside the name). */
  departmentType: DepartmentType;
};

function TemplateTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-sts-blue-tint px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-blue">
      {departmentTypeLabel(type)}
    </span>
  );
}

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

export type SubDepartmentMembersGroup = {
  subDepartmentId: string;
  subDepartmentName: string;
  members: NativeMember[];
};

export type DepartmentRow = {
  id: string;
  name: string;
  isHub: boolean;
  type?: string;
  /** ISO timestamp — set automatically on create so the department is operational immediately. */
  setupCompletedAt?: string | null;
  _count: { subDepartments: number; projects?: number; members?: number };
  managers: DeptManager[];
  accessGrants: AccessGrant[];
  directMembers: DeptMember[];
  nativeMembers: NativeMember[];
  /** People on each sub-department (membership is sub-department-scoped only). */
  membersBySubDepartment: SubDepartmentMembersGroup[];
  memberIds: string[];
  subDepartments: { id: string; name: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 24, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  return <UserAvatar name={name} avatarUrl={avatarUrl} size={size} />;
}

function AvatarStack({
  people,
  total,
}: {
  people: { key: string; name: string; avatarUrl?: string | null }[];
  total: number;
}) {
  if (people.length === 0) return null;
  const extra = Math.max(0, total - people.length);
  return (
    <div className="mr-1 flex items-center">
      {people.map((p, i) => (
        <div
          key={p.key}
          className="rounded-full border-2 border-sts-surface"
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: i + 1 }}
          title={p.name}
        >
          <AvatarVisual name={p.name} avatarUrl={p.avatarUrl} size={18} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="flex size-[22px] items-center justify-center rounded-full border-2 border-sts-surface bg-sts-card font-sans text-[9px] font-medium text-sts-subtle"
          style={{ marginLeft: -6, zIndex: people.length + 1 }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
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
        className="flex h-7 items-center gap-1.5 rounded-md border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[11.5px] text-sts-muted hover:border-sts-id hover:text-sts-foreground"
      >
        <UserPlus className="size-3 shrink-0" />
        {label}
        <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-0">
        <div className="border-b border-sts-card-border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-sts-subtle" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="h-7 w-full rounded-md border border-sts-card-border bg-sts-surface pl-6 pr-2 font-sans text-[12px] text-sts-foreground outline-none focus:border-sts-id"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="py-3 text-center font-sans text-[12px] text-sts-subtle">No users found</p>
          ) : filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onSelect(u); setOpen(false); setSearch(""); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-sts-blue-tint"
            >
              <Avatar name={u.name} size={22} avatarUrl={u.avatarUrl ?? null} />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate font-sans text-[12px] text-sts-foreground">{u.name}</p>
                <p className="truncate font-sans text-[11.5px] text-sts-subtle">{u.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-sts-surface px-1.5 py-0.5 font-sans text-[9.5px] text-sts-subtle capitalize">{u.role}</span>
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
      <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Project access</label>
      <div className="flex h-9 overflow-hidden rounded-lg border border-sts-card-border">
        <button
          type="button"
          onClick={() => onFullAccessChange(false)}
          className={cn(
            "flex flex-1 items-center justify-center font-sans text-[12px] font-medium transition-colors",
            !fullAccess ? "bg-sts-blue text-white dark:text-gray-900" : "bg-sts-surface text-sts-muted hover:text-sts-foreground",
          )}
        >
          Select projects
        </button>
        <button
          type="button"
          onClick={() => onFullAccessChange(true)}
          className={cn(
            "flex flex-1 items-center justify-center border-l border-sts-card-border font-sans text-[12px] font-medium transition-colors",
            fullAccess ? "bg-sts-blue text-white dark:text-gray-900" : "bg-sts-surface text-sts-muted hover:text-sts-foreground",
          )}
        >
          Full access
        </button>
      </div>
      {fullAccess ? (
        <p className="mt-1.5 font-sans text-[11.5px] text-sts-subtle">
          Can see and create tickets on every project in {deptName}.
        </p>
      ) : (
        <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-sts-card-border">
          {loadingProjects ? (
            <p className="py-3 text-center font-sans text-[12px] text-sts-subtle">Loading projects…</p>
          ) : projectsError ? (
            <div className="flex flex-col items-center gap-1.5 py-3">
              <p className="font-sans text-[12px] text-red-500">Failed to load projects.</p>
              <button type="button" onClick={loadProjects} className="font-sans text-[11.5px] text-sts-id hover:underline">
                Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <p className="py-3 text-center font-sans text-[12px] text-sts-subtle">No projects in this department yet.</p>
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
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-sts-surface"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-sts-blue bg-sts-blue" : "border-sts-card-border",
                    )}
                  >
                    {checked && <Check className="size-3 text-white dark:text-gray-900" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-foreground">{p.name}</span>
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
    // Cross-department access is for managers/admins only.
    .filter((u) => u.role === "manager" || u.role === "admin")
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
    <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
          <p className="font-sans text-[14px] font-semibold text-sts-foreground">Grant manager access to {deptName}</p>
          <button type="button" onClick={onClose}><X className="size-4 text-sts-muted" /></button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">User <span className="text-red-500">*</span></label>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-full rounded-lg border border-sts-card-border bg-sts-surface pl-8 pr-3 font-sans text-[12.5px] outline-none focus:border-sts-id" />
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-sts-card-border">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center font-sans text-[12px] text-sts-subtle">
                  No eligible managers. Cross-department access is for department managers only — add agents to a sub-department instead.
                </p>
              ) : filtered.map((u) => (
                <button key={u.id} type="button" onClick={() => { setUserId(u.id); setUserName(u.name); }}
                  className={cn("flex w-full items-center gap-2 px-3 py-2 text-left", userId === u.id ? "bg-sts-blue-tint" : "hover:bg-sts-surface")}>
                  <Avatar name={u.name} size={22} avatarUrl={u.avatarUrl ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[12px] text-sts-foreground">{u.name}</p>
                    <p className="font-sans text-[11.5px] text-sts-subtle">{u.email}</p>
                  </div>
                  {userId === u.id && <Check className="size-3.5 shrink-0 text-sts-id" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Access duration</label>
            <div className="flex h-9 overflow-hidden rounded-lg border border-sts-card-border">
              <button
                type="button"
                onClick={() => setPermanent(true)}
                className={cn(
                  "flex flex-1 items-center justify-center font-sans text-[12px] font-medium transition-colors",
                  permanent ? "bg-sts-blue text-white dark:text-gray-900" : "bg-sts-surface text-sts-muted hover:text-sts-foreground",
                )}
              >
                Permanent
              </button>
              <button
                type="button"
                onClick={() => setPermanent(false)}
                className={cn(
                  "flex flex-1 items-center justify-center border-l border-sts-card-border font-sans text-[12px] font-medium transition-colors",
                  !permanent ? "bg-sts-blue text-white dark:text-gray-900" : "bg-sts-surface text-sts-muted hover:text-sts-foreground",
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
                className="mt-2 h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-id"
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
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cross-team ticket assignment" className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-id" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-sts-card-border px-5 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-sts-card-border px-4 font-sans text-[12.5px] text-sts-muted hover:bg-sts-surface">Cancel</button>
          <button type="button" disabled={!canSubmit || saving} onClick={submit} className="h-8 rounded-lg bg-sts-blue px-4 font-sans text-[12.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50">
            {saving ? "Granting…" : "Grant access"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Department Modal ──────────────────────────────────────────────────────

type PendingSubDepartment = { id: string; name: string; prefix: string };

function autoPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
}

// Fall back to the built-in department types when the catalogue is empty, so a
// department can always be created (and the interface-driving support/hub types
// stay reachable). Mapped into the same shape the picker renders.
function builtInTemplateOptions(): TemplateOption[] {
  return DEPARTMENT_TYPES.map((t) => ({
    slug: t,
    name: departmentTypeLabel(t),
    description: departmentTypeDescription(t),
    featureCount: 0,
    status: "active" as const,
    departmentType: t,
  }));
}

function NewDepartmentModal({
  allUsers,
  templateOptions,
  onClose,
  onCreated,
}: {
  allUsers: UserOption[];
  templateOptions: TemplateOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const options = templateOptions.length > 0 ? templateOptions : builtInTemplateOptions();
  const [name, setName] = useState("");
  // Empty until the admin explicitly picks a template — selection is required.
  const [templateSlug, setTemplateSlug] = useState("");
  const [selectedManagers, setSelectedManagers] = useState<UserOption[]>([]);
  const [subDepartments, setSubDepartments] = useState<PendingSubDepartment[]>([]);
  const [subDepartmentInput, setSubDepartmentInput] = useState("");
  const [subDepartmentPrefix, setSubDepartmentPrefix] = useState("");
  const [prefixManuallyEdited, setPrefixManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Holds the department id once created, so a retry (after a sub-department
  // error) never creates a duplicate department.
  const createdDeptIdRef = useRef<string | null>(null);

  const selectedTemplate = options.find((opt) => opt.slug === templateSlug) ?? null;

  function handleSubDepartmentNameChange(v: string) {
    setSubDepartmentInput(v);
    if (!prefixManuallyEdited) setSubDepartmentPrefix(autoPrefix(v));
  }

  function handlePrefixChange(v: string) {
    setSubDepartmentPrefix(v.toUpperCase().replace(/[^A-Z]/g, ""));
    setPrefixManuallyEdited(true);
  }

  function addSubDepartment() {
    const n = subDepartmentInput.trim();
    const p = subDepartmentPrefix.trim() || autoPrefix(n);
    if (!n) return;
    if (subDepartments.some((t) => t.name.toLowerCase() === n.toLowerCase())) return;
    setSubDepartments((prev) => [...prev, { id: crypto.randomUUID(), name: n, prefix: p }]);
    setSubDepartmentInput("");
    setSubDepartmentPrefix("");
    setPrefixManuallyEdited(false);
  }

  function removeSubDepartment(id: string) {
    setSubDepartments((prev) => prev.filter((t) => t.id !== id));
  }

  function addManager(u: UserOption) {
    setSelectedManagers((prev) => prev.some((m) => m.id === u.id) ? prev : [...prev, u]);
  }

  function removeManager(id: string) {
    setSelectedManagers((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleSubmit() {
    const deptName = name.trim();
    if (!deptName || !templateSlug) return;
    setSaving(true);
    setError(null);

    // Include a sub department that was typed but not yet "Added" so it isn't
    // silently dropped when the user clicks Create.
    const pendingName = subDepartmentInput.trim();
    const subs: PendingSubDepartment[] =
      pendingName && !subDepartments.some((t) => t.name.toLowerCase() === pendingName.toLowerCase())
        ? [
            ...subDepartments,
            { id: "pending", name: pendingName, prefix: subDepartmentPrefix.trim() || autoPrefix(pendingName) },
          ]
        : subDepartments;

    // Create the department once; reuse it on retry so we never duplicate it.
    let deptId = createdDeptIdRef.current;
    if (!deptId) {
      try {
        // Pass the selected catalogue/built-in slug as templateSlug so the server
        // seeds features and derives the board type.
        const dept = await createAdminDepartment({
          name: deptName,
          type: templateSlug,
          templateSlug,
        });
        deptId = dept.id;
        createdDeptIdRef.current = dept.id;
      } catch {
        setError("Failed to create department");
        setSaving(false);
        return;
      }
      await Promise.all(
        selectedManagers.map((m) => assignDepartmentManager(deptId!, m.id).catch(() => null)),
      );
    }
    if (!deptId) {
      setSaving(false);
      return;
    }

    const succeeded: string[] = [];
    const failures: string[] = [];
    for (const t of subs) {
      try {
        await createAdminSubDepartment({ name: t.name, prefix: t.prefix, departmentId: deptId });
        succeeded.push(t.name);
      } catch (e) {
        failures.push(`${t.name} — ${e instanceof Error ? e.message : "failed"}`);
      }
    }

    // Drop successfully-created sub departments (and the pending input) so a
    // retry only re-attempts the ones that failed.
    if (succeeded.length > 0) {
      setSubDepartments((prev) => prev.filter((t) => !succeeded.includes(t.name)));
      if (succeeded.includes(pendingName)) {
        setSubDepartmentInput("");
        setSubDepartmentPrefix("");
        setPrefixManuallyEdited(false);
      }
    }

    setSaving(false);
    if (failures.length > 0) {
      // Department already exists — keep the modal open so the error is visible
      // and the remaining sub departments can be retried without duplicating.
      setError(`Department created, but couldn't add: ${failures.join("; ")}`);
      return;
    }
    onCreated();
  }

  const managerIds = selectedManagers.map((m) => m.id);
  const canCreate = Boolean(name.trim() && templateSlug) && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop" onClick={onClose}>
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sts-blue/10">
              <DepartmentIcon className="size-4 text-sts-blue" />
            </div>
            <p className="font-sans text-[14px] font-semibold text-sts-foreground">New department</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-sts-subtle hover:text-sts-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">
              Department name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="e.g. Engineering"
              className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-blue/60"
            />
          </div>

          {/* Template */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">
              Template <span className="text-red-500">*</span>
            </label>
            <Select
              items={options.map((opt) => ({ value: opt.slug, label: opt.name }))}
              value={templateSlug || null}
              onValueChange={(v) => setTemplateSlug(v ?? "")}
            >
              <SelectTrigger className="h-9 w-full border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground">
                <SelectValue placeholder="Select a template…">
                  {selectedTemplate ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{selectedTemplate.name}</span>
                      <TemplateTypeBadge type={selectedTemplate.departmentType} />
                    </span>
                  ) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.slug} value={opt.slug} className="py-1.5">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-sans text-[12.5px] font-semibold text-sts-foreground">
                          {opt.name}
                        </span>
                        <TemplateTypeBadge type={opt.departmentType} />
                        {opt.featureCount > 0 && (
                          <span className="rounded-full bg-sts-surface px-1.5 py-0.5 font-sans text-[9.5px] font-medium text-sts-subtle">
                            {opt.featureCount} {opt.featureCount === 1 ? "feature" : "features"}
                          </span>
                        )}
                      </div>
                      {opt.description && (
                        <span className="font-sans text-[10.5px] leading-tight text-sts-subtle">
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Managers */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <label className="font-sans text-[11.5px] font-medium text-sts-muted">Managers <span className="text-sts-subtle font-normal">(optional)</span></label>
              <span className="flex-1" />
              <UserPickerDropdown label="Add manager" users={allUsers} excludeIds={managerIds} onSelect={addManager} />
            </div>
            {selectedManagers.length === 0 ? (
              <p className="font-sans text-[11.5px] text-sts-subtle">No managers selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedManagers.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 rounded-md border border-sts-card-border bg-sts-surface py-1 pl-1.5 pr-2">
                    <UserAvatar name={m.name} size={18} avatarUrl={m.avatarUrl ?? null} />
                    <span className="font-sans text-[11.5px] text-sts-foreground">{m.name}</span>
                    <button type="button" onClick={() => removeManager(m.id)} className="ml-0.5 rounded-full p-0.5 text-sts-subtle hover:text-red-500">
                      <X className="size-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sub departments */}
          <div>
            <label className="mb-2 block font-sans text-[11.5px] font-medium text-sts-muted">
              Sub departments <span className="text-sts-subtle font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                value={subDepartmentInput}
                onChange={(e) => handleSubDepartmentNameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubDepartment(); } }}
                placeholder="Sub department name…"
                className="h-8 min-w-0 flex-1 rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[12.5px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-blue/60"
              />
              <input
                value={subDepartmentPrefix}
                onChange={(e) => handlePrefixChange(e.target.value)}
                placeholder="Prefix"
                maxLength={5}
                className="h-8 w-20 rounded-lg border border-sts-card-border bg-sts-surface px-2 text-center font-mono text-[12px] text-sts-foreground uppercase outline-none placeholder:text-sts-subtle placeholder:normal-case focus:border-sts-blue/60"
                title="Custom prefix — 2–5 letters, used on this sub department's ticket IDs (auto-filled from the name, editable)"
              />
              <button
                type="button"
                onClick={addSubDepartment}
                disabled={!subDepartmentInput.trim()}
                className="flex h-8 items-center gap-1 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12px] text-sts-muted transition-colors hover:border-sts-blue/40 hover:text-sts-blue disabled:opacity-40"
              >
                <Plus className="size-3.5" /> Add
              </button>
            </div>
            {subDepartments.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {subDepartments.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg border border-sts-card-border bg-sts-surface px-3 py-1.5">
                    <span className="font-mono text-[11.5px] text-sts-id">{t.prefix}</span>
                    <span className="font-sans text-[12.5px] text-sts-foreground flex-1">{t.name}</span>
                    <button type="button" onClick={() => removeSubDepartment(t.id)} className="rounded p-0.5 text-sts-subtle hover:text-red-500">
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
        <div className="flex items-center justify-end gap-2 border-t border-sts-card-border px-5 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-sts-card-border px-4 font-sans text-[12.5px] text-sts-muted hover:bg-sts-surface">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={handleSubmit}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-sts-blue px-4 font-sans text-[12.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
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
  isAdmin = false,
  onRename,
  onDelete,
  onEnterWorkspace,
  animationIndex = 0,
}: {
  dept: DepartmentRow;
  isAdmin?: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => void;
  onEnterWorkspace?: (id: string) => void;
  animationIndex?: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(dept.name);
  const [entering, setEntering] = useState(false);
  const [managing, setManaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  async function saveEdit() {
    if (!editName.trim()) return;
    setSaving(true);
    await onRename(dept.id, editName.trim());
    setSaving(false);
    setEditing(false);
  }

  async function setActiveDept() {
    await fetch("/api/active-dept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deptId: dept.id }),
    });
  }

  async function managePeople() {
    setManaging(true);
    try {
      await setActiveDept();
      router.push("/department");
    } catch {
      setManaging(false);
    }
  }

  const membersBySub = dept.membersBySubDepartment ?? [];
  const totalPeople = dept._count.members ?? dept.memberIds.length;
  const filledSubs = membersBySub.filter((g) => g.members.length > 0);
  const emptySubs = membersBySub.filter((g) => g.members.length === 0);
  const memberPeek = (() => {
    const seen = new Set<string>();
    const list: NativeMember[] = [];
    for (const group of membersBySub) {
      for (const m of group.members) {
        if (seen.has(m.userId)) continue;
        seen.add(m.userId);
        list.push(m);
        if (list.length >= 3) return list;
      }
    }
    return list;
  })();

  return (
    <>
      <DepartmentWalkthroughModal
        departmentId={dept.id}
        departmentName={dept.name}
        open={walkthroughOpen}
        onOpenChange={setWalkthroughOpen}
      />
      <div
        className="flex flex-col rounded-2xl border border-sts-card-border bg-sts-card transition-colors hover:border-sts-blue/30 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300"
        style={{ animationDelay: `${Math.min(animationIndex, 8) * 40}ms` }}
      >
        {/* Identity */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sts-blue/10">
            <DepartmentIconVisual
              name={dept.name}
              id={dept.id}
              isHub={dept.isHub}
              size="lg"
              className="text-sts-blue"
            />
          </div>
          <div className="min-w-0 flex-1">
            {editing && isAdmin ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") { setEditing(false); setEditName(dept.name); }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-sts-blue/50 bg-sts-surface px-3 py-1 font-sans text-[14px] font-semibold text-sts-foreground outline-none"
                />
                <button type="button" onClick={saveEdit} disabled={saving} className="rounded-md p-1.5 text-sts-green hover:bg-sts-green/10"><Check className="size-3.5" /></button>
                <button type="button" onClick={() => { setEditing(false); setEditName(dept.name); }} className="rounded-md p-1.5 text-sts-subtle hover:text-sts-foreground"><X className="size-3.5" /></button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="sts-text-modal-title">{dept.name}</h3>
                {dept.type ? (
                  <span className="inline-flex items-center rounded-full bg-sts-blue-tint px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-blue">
                    {departmentTypeLabel(dept.type)}
                  </span>
                ) : null}
                {dept.isHub && (
                  <span className="inline-flex items-center rounded-full bg-violet-100 px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    Hub
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11.5px] text-sts-muted">
              <span className="flex items-center gap-1">
                <Users className="size-3 shrink-0" />
                {dept._count.subDepartments} sub-dept{dept._count.subDepartments !== 1 ? "s" : ""}
              </span>
              {dept._count.projects !== undefined && (
                <span className="flex items-center gap-1">
                  <FolderKanban className="size-3 shrink-0" />
                  {dept._count.projects} project{dept._count.projects !== 1 ? "s" : ""}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="size-3 shrink-0" />
                {totalPeople} {totalPeople === 1 ? "member" : "members"}
              </span>
            </div>
          </div>
          {isAdmin && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-md p-1.5 text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground"
                aria-label="Department actions"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWalkthroughOpen(true)}>
                  <BookOpen className="size-3.5" />
                  Setup walkthrough
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(dept.id)}>
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* People quick view — collapsible, read-only */}
        <div className="mx-5 mb-4 overflow-hidden rounded-xl border border-sts-card-border/80 bg-sts-surface/40">
          {/* Managers */}
          <div className="border-b border-sts-card-border/70">
            <button
              type="button"
              onClick={() => setManagersOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-sts-surface/60"
            >
              <Shield className="size-3.5 shrink-0 text-sts-muted" />
              <span className="min-w-0 flex-1 font-sans text-[12px] font-semibold text-sts-foreground">
                Managers
                <span className="ml-1.5 font-normal text-sts-subtle">({dept.managers.length})</span>
              </span>
              {!managersOpen && dept.managers.length > 0 && (
                <AvatarStack
                  people={dept.managers.slice(0, 3).map((m) => ({
                    key: m.id,
                    name: m.user.name,
                    avatarUrl: m.user.avatarUrl,
                  }))}
                  total={dept.managers.length}
                />
              )}
              <ChevronDown className={cn("size-3.5 shrink-0 text-sts-subtle transition-transform", managersOpen && "rotate-180")} />
            </button>
            {managersOpen && (
              <div className="border-t border-sts-card-border/60 px-3.5 pb-3 pt-2">
                {dept.managers.length === 0 ? (
                  <p className="font-sans text-[12px] text-sts-subtle">None assigned yet</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {dept.managers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-1.5 rounded-md border border-sts-card-border bg-sts-card py-1 pl-1 pr-2"
                        title={m.user.email}
                      >
                        <Avatar name={m.user.name} size={18} avatarUrl={m.user.avatarUrl ?? null} />
                        <span className="max-w-[8rem] truncate font-sans text-[11.5px] text-sts-foreground">{m.user.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Members by sub-department */}
          <div>
            <button
              type="button"
              onClick={() => setMembersOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-sts-surface/60"
            >
              <Users className="size-3.5 shrink-0 text-sts-muted" />
              <span className="min-w-0 flex-1 font-sans text-[12px] font-semibold text-sts-foreground">
                Members
                <span className="ml-1.5 font-normal text-sts-subtle">
                  ({totalPeople} · by sub-department)
                </span>
              </span>
              {!membersOpen && memberPeek.length > 0 && (
                <AvatarStack
                  people={memberPeek.map((m) => ({
                    key: m.userId,
                    name: m.user.name,
                    avatarUrl: m.user.avatarUrl,
                  }))}
                  total={totalPeople}
                />
              )}
              <ChevronDown className={cn("size-3.5 shrink-0 text-sts-subtle transition-transform", membersOpen && "rotate-180")} />
            </button>
            {membersOpen && (
              <div className="border-t border-sts-card-border/60 px-3.5 pb-3 pt-2">
                {membersBySub.length === 0 ? (
                  <p className="font-sans text-[12px] text-sts-subtle">
                    No sub-departments yet — create one, then invite people into it.
                  </p>
                ) : totalPeople === 0 ? (
                  <p className="font-sans text-[12px] text-sts-subtle">
                    {membersBySub.length} sub-department{membersBySub.length !== 1 ? "s" : ""} with no members yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {filledSubs.map((group) => (
                      <div key={group.subDepartmentId} className="min-w-0 rounded-lg border border-sts-card-border/80 bg-sts-card/60 px-2.5 py-2">
                        <p className="mb-1.5 truncate font-sans text-[11.5px] font-medium text-sts-foreground">
                          {group.subDepartmentName}
                          <span className="ml-1 font-normal text-sts-subtle">({group.members.length})</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {group.members.map((m) => (
                            <div
                              key={`${group.subDepartmentId}-${m.userId}`}
                              className="flex items-center gap-1.5 rounded-md border border-sts-card-border bg-sts-card py-1 pl-1 pr-2"
                              title={`${m.user.email} · ${m.user.role}`}
                            >
                              <Avatar name={m.user.name} size={18} avatarUrl={m.user.avatarUrl ?? null} />
                              <span className="max-w-[7rem] truncate font-sans text-[11.5px] text-sts-foreground">{m.user.name}</span>
                              <span className="rounded-full bg-sts-surface px-1 py-0.5 font-sans text-[9.5px] capitalize text-sts-subtle">
                                {m.user.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {emptySubs.length > 0 && (
                      <p className="font-sans text-[11px] text-sts-subtle">
                        Empty: {emptySubs.map((g) => g.subDepartmentName).join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {dept.accessGrants.length > 0 && (
            <p className="border-t border-sts-card-border/70 px-3.5 py-2 font-sans text-[11px] text-sts-subtle">
              {dept.accessGrants.length} cross-department access grant{dept.accessGrants.length !== 1 ? "s" : ""} — open Manage to review
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-3 border-t border-sts-card-border px-5 py-3.5">
          {onEnterWorkspace ? (
            <>
              <button
                type="button"
                disabled={managing}
                onClick={managePeople}
                className="font-sans text-[12.5px] font-medium text-sts-muted transition-colors hover:text-sts-blue disabled:opacity-60"
              >
                {managing ? "Opening…" : "Manage"}
              </button>
              <button
                type="button"
                disabled={entering}
                onClick={() => { setEntering(true); onEnterWorkspace(dept.id); }}
                className="ml-auto flex items-center justify-center gap-2 rounded-xl bg-sts-blue px-4 py-2.5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-80 dark:text-gray-900"
              >
                {entering ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-gray-900/30 dark:border-t-gray-900" />
                    Entering…
                  </>
                ) : (
                  <>
                    Enter
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={managing}
              onClick={managePeople}
              className="ml-auto flex w-full items-center justify-center gap-2 rounded-xl bg-sts-blue px-4 py-2.5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-80 dark:text-gray-900"
            >
              {managing ? "Opening…" : (
                <>
                  Manage
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </button>
          )}
        </div>
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
  templateOptions = [],
  tenantId = null,
  showCrossDeptAccess = false,
  onEnterWorkspace,
}: {
  departments: DepartmentRow[];
  allUsers: UserOption[];
  isAdmin?: boolean;
  /** True when admin is inside a dept workspace — hides the create-dept form */
  inWorkspace?: boolean;
  /** Catalogue templates offered as department "template" options; empty falls back to built-in types. */
  templateOptions?: TemplateOption[];
  /** Active tenant — kept for callers; invites live on the org header / department detail. */
  tenantId?: string | null;
  /** Kept for API compatibility; cross-dept access is managed on /department. */
  showCrossDeptAccess?: boolean;
  onEnterWorkspace?: (deptId: string) => void;
}) {
  void tenantId;
  void showCrossDeptAccess;
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
          templateOptions={templateOptions}
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
          <h1 className="sts-text-admin-title">
            {inWorkspace ? "Department" : "Departments"}
          </h1>
          <p className="mt-1 font-sans text-[13px] text-sts-muted">
            {inWorkspace
              ? "Enter the workspace, or Manage to assign managers, members, and access."
              : "Browse departments, enter a workspace, or Manage people and access."}
          </p>
        </div>
        {isAdmin && !inWorkspace && (
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-sts-blue px-4 font-sans text-[12px] font-medium text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            New department
          </button>
        )}
      </div>

      {error && <p className="font-sans text-[12px] text-red-500">{error}</p>}

      {/* ── Department cards grid ── */}
      {departments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-sts-card-border py-16 text-center">
          <DepartmentIcon className="size-8 text-sts-subtle" strokeWidth={1.2} />
          <p className="font-sans text-[13px] text-sts-muted">No departments yet. Create one above.</p>
        </div>
      ) : inWorkspace ? (
        // Single-department workspace view — no grid needed, give the card room to breathe
        // instead of squeezing it into a multi-column layout meant for many departments.
        <div className="max-w-3xl">
          <DepartmentCard
            key={departments[0].id}
            dept={departments[0]}
            isAdmin={isAdmin}
            onRename={handleRename}
            onDelete={setConfirmDeleteId}
            onEnterWorkspace={onEnterWorkspace}
            animationIndex={0}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {departments.map((dept, i) => (
            <DepartmentCard
              key={dept.id}
              dept={dept}
              isAdmin={isAdmin}
              onRename={handleRename}
              onDelete={setConfirmDeleteId}
              onEnterWorkspace={onEnterWorkspace}
              animationIndex={i}
            />
          ))}
        </div>
      )}
    </div>
    </>
  );
}
