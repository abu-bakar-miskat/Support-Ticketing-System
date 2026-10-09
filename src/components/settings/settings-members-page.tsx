"use client";

import { useState, useTransition, useEffect, useRef, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Trash2, X, Plus, Search, Settings2, BanIcon, ChevronDown, Mail, RefreshCw, SlidersHorizontal, Building2, Layers, ShieldCheck, UserMinus } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";
import { updateAdminUser, deleteAdminUser, removeAdminSubDepartmentMember, removeAdminDeptMember, removeAdminTenantMember, addAdminSubDepartmentMember, revokeDepartmentAccess, deleteTenantInvite, resendTenantInvite } from "@/lib/api/admin";
import { InviteMemberModal } from "@/components/invites/invite-member-modal";
import { MemberConfigPanel } from "@/components/settings/member-config-panel";
import { toast } from "sonner";
import { Tip } from "@/components/ui/tooltip";
import { ListSearchInput, SortDropdown, useListControls, byText, byDateAsc, byDateDesc } from "@/components/ui/list-controls";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  color: string;
  avatarUrl?: string | null;
  role: Role;
  subDepartments: string[];
  subDepartmentId?: string | null;
  department?: string | null;
  departmentId?: string | null;
  location?: string | null;
  timezone?: string | null;
  /** Profile-level active/inactive flag — applies to all roles */
  isActive?: boolean;
  /** Platform super-admin — surfaced with a badge so admins can spot elevated access */
  isSuperAdmin?: boolean;
  /** True when this person is from another department with a cross-access grant */
  isCrossAccess?: boolean;
  /** Per-team doNotAssign flags (used inside Configure Schedule panel) */
  subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[];
  departments?: { id: string; name: string }[];
  memberships?: { subDepartmentId: string; subDepartmentName: string; departmentId: string; departmentName: string; doNotAssign: boolean }[];
  /** ISO date the person's profile was created — drives the Newest / Oldest sorts. */
  createdAt?: string | null;
};

export type InviteRow = {
  id: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "expired" | "revoked";
  /** Human-readable "Invited to" target: "Tenant-wide", a department, or "Dept › Sub-dept" */
  target: string | null;
  invitedBy: string | null;
  /** ISO timestamps */
  createdAt: string;
  expiresAt: string;
};

const ROLE_RANK: Record<Role, number> = { admin: 0, manager: 1, sub_manager: 2, agent: 3 };

const INVITE_STATUS_STYLE: Record<InviteRow["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-sts-blue/10 text-sts-blue" },
  accepted: { label: "Accepted", className: "bg-sts-green/10 text-sts-green" },
  expired: { label: "Expired", className: "bg-sts-surface text-sts-subtle" },
  revoked: { label: "Revoked", className: "bg-red-500/10 text-red-500" },
};

function ROLE_LABEL(role: Role): string {
  return ({ admin: "Admin", manager: "Manager", sub_manager: "Sub-manager", agent: "Agent" } as Record<string, string>)[role] ?? role;
}

const ROLE_OPTIONS_ADMIN: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sub_manager", label: "Sub-manager" },
  { value: "agent", label: "Agent" },
];

// Managers can only assign lead or staff — not admin/manager
const ROLE_OPTIONS_MANAGER: { value: Role; label: string }[] = [
  { value: "sub_manager", label: "Sub-manager" },
  { value: "agent", label: "Agent" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-sts-blue/10 text-sts-blue",
  manager: "bg-sts-purple/10 text-sts-purple",
  sub_manager: "bg-sts-green/10 text-sts-green",
  agent: "bg-sts-surface text-sts-subtle",
};

// Short descriptions used by the role-first card grid in the Add-member modal
// (mirrors the Invite-member modal's layout).
const ROLE_CARD_HINTS: Record<string, string> = {
  manager: "Manages a single department.",
  sub_manager: "Leads a sub-department.",
  agent: "Works tickets in a sub-department.",
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle uppercase">
      {children}
    </span>
  );
}

function MemberAvatar({ name, color, avatarUrl, role, subDepartment, userId }: { name: string; color: string; avatarUrl?: string | null; role?: string; subDepartment?: string; userId?: string }) {
  return <UserAvatar name={name} avatarUrl={avatarUrl} size={28} userId={userId} meta={{ role, subDepartment }} />;
}

type Candidate = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
};

export function AddMemberModal({
  departmentId,
  availableSubDepartments,
  availableDepartments,
  isAdmin,
  isManager,
  onClose,
}: {
  departmentId: string | null;
  availableSubDepartments: { id: string; name: string; departmentId?: string | null }[];
  availableDepartments: { id: string; name: string }[];
  isAdmin: boolean;
  isManager: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  // When no department is fixed (tenant-wide view) the admin picks one here; it
  // then scopes both the candidate search and the sub-department options.
  const [selectedDeptId, setSelectedDeptId] = useState(departmentId ?? availableDepartments[0]?.id ?? "");
  const effectiveDeptId = departmentId ?? selectedDeptId;
  const subDeptOptions = availableSubDepartments.filter(
    (sd) => sd.departmentId == null || sd.departmentId === effectiveDeptId,
  );
  const [subDepartmentId, setSubDepartmentId] = useState(subDeptOptions[0]?.id ?? "");
  const [role, setRole] = useState<string>("agent");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Switch the target department: reset the candidate + sub-department selections so a
  // stale sub-department from another department can't be submitted.
  function changeDepartment(nextDeptId: string) {
    setSelectedDeptId(nextDeptId);
    setSelected(null);
    setCandidates([]);
    const first = availableSubDepartments.find(
      (sd) => sd.departmentId == null || sd.departmentId === nextDeptId,
    );
    setSubDepartmentId(first?.id ?? "");
  }

  // Debounced search
  useEffect(() => {
    if (!search.trim()) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      if (!effectiveDeptId) return;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/departments/${effectiveDeptId}/candidates?q=${encodeURIComponent(search.trim())}`,
        );
        if (res.ok) {
          const data = await res.json();
          setCandidates(data);
        }
      } catch {
        // silently ignore search errors
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, effectiveDeptId]);

  async function handleSubmit() {
    if (!selected) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (!subDepartmentId) {
        setSubmitError("Please select a sub department.");
        setSubmitting(false);
        return;
      }
      await addAdminSubDepartmentMember(subDepartmentId, selected.id, role);
      toast.success(`${selected.name} has been added.`);
      router.refresh();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const roleOptions: string[] = isAdmin
    ? ["manager", "sub_manager", "agent"]
    : ["sub_manager", "agent"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
          <p className="font-sans text-[14px] font-semibold text-sts-foreground">Add existing member</p>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-sts-muted" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Member search */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Member</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
              <input
                ref={searchRef}
                autoFocus
                disabled={!effectiveDeptId}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
                placeholder={effectiveDeptId ? "Search by name or email…" : "Select a department first…"}
                className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface pl-8 pr-2.5 font-sans text-[13px] text-sts-foreground placeholder:text-sts-subtle outline-none focus:border-sts-id disabled:opacity-50"
              />
              {searching && (
                <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-sts-subtle" />
              )}
            </div>

            {/* Selected user highlight */}
            {selected && (
              <div className="mt-1.5 flex items-center gap-2.5 rounded-lg border border-sts-blue/40 bg-sts-blue/5 px-3 py-2">
                <UserAvatar name={selected.name} avatarUrl={selected.avatarUrl} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">
                    {selected.name}
                  </p>
                  <p className="truncate font-sans text-[11.5px] text-sts-subtle">{selected.email}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center rounded-full px-[7px] py-0.5 font-sans text-[11px] font-medium capitalize",
                    ROLE_COLORS[selected.role] ?? "bg-sts-surface text-sts-subtle",
                  )}
                >
                  {selected.role}
                </span>
                <Tip label="Clear selection">
                  <button
                    aria-label="Clear selection"
                    type="button"
                    onClick={() => setSelected(null)}
                    className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-sts-subtle hover:text-sts-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Tip>
              </div>
            )}

            {/* Candidate results */}
            {!selected && candidates.length > 0 && (
              <div className="mt-1.5 max-h-[200px] overflow-y-auto rounded-lg border border-sts-card-border bg-sts-surface">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelected(c); setCandidates([]); setSearch(""); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-sts-bg"
                  >
                    <UserAvatar name={c.name} avatarUrl={c.avatarUrl} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">
                        {c.name}
                      </p>
                      <p className="truncate font-sans text-[11.5px] text-sts-subtle">{c.email}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 inline-flex items-center rounded-full px-[7px] py-0.5 font-sans text-[11px] font-medium capitalize",
                        ROLE_COLORS[c.role] ?? "bg-sts-surface text-sts-subtle",
                      )}
                    >
                      {c.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Role — mirrors the Invite modal's role card grid. */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Role</label>
            <div className="grid grid-cols-2 gap-1.5">
              {roleOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
                    role === r
                      ? "border-sts-blue bg-sts-blue/10"
                      : "border-sts-card-border bg-sts-surface hover:border-sts-blue/40",
                  )}
                >
                  <span
                    className={cn(
                      "font-sans text-[12.5px] font-semibold",
                      role === r ? "text-sts-blue" : "text-sts-foreground",
                    )}
                  >
                    {ROLE_LABEL(r as Role)}
                  </span>
                  <span className="font-sans text-[10.5px] text-sts-subtle">{ROLE_CARD_HINTS[r]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Department picker — only on the tenant-wide view (no fixed department) */}
          {!departmentId && (
            <div>
              <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">Department</label>
              <SearchableSelect
                value={selectedDeptId}
                onChange={changeDepartment}
                options={availableDepartments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder="Select a department…"
                searchPlaceholder="Search departments…"
                className="w-full bg-sts-surface"
                aria-label="Department"
              />
            </div>
          )}

          {/* Sub-department */}
          <div>
            <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">
              Sub-department
            </label>
            <SearchableSelect
              value={subDepartmentId}
              onChange={setSubDepartmentId}
              options={subDeptOptions.map((t) => ({ value: t.id, label: t.name }))}
              placeholder={subDeptOptions.length === 0 ? "No sub departments available" : "Select a sub department…"}
              searchPlaceholder="Search sub departments…"
              emptyLabel="No sub departments available"
              className="w-full bg-sts-surface"
              aria-label="Sub-department"
            />
          </div>

          {/* Error */}
          {submitError && (
            <p className="font-sans text-[12px] text-red-500" role="alert">{submitError}</p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-sts-card-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-full px-3 font-sans text-[12.5px] font-medium text-sts-muted hover:text-sts-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected || submitting}
              onClick={handleSubmit}
              className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[12.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Add member
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsMembersPage({
  members,
  isAdmin,
  isManager = false,
  availableSubDepartments = [],
  availableDepartments = [],
  currentUserId,
  departmentId = null,
  departmentName = null,
  tenantId = null,
  invites = [],
}: {
  members: MemberRow[];
  isAdmin: boolean;
  isManager?: boolean;
  availableSubDepartments?: { id: string; name: string; departmentId?: string | null }[];
  availableDepartments?: { id: string; name: string }[];
  currentUserId?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  tenantId?: string | null;
  invites?: InviteRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRoles, setLocalRoles] = useState<Record<string, Role>>({});
  const [localSubDepartments, setLocalSubDepartments] = useState<Record<string, string>>({});
  const [localDepartments, setLocalDepartments] = useState<Record<string, string>>({});
  // Tenant-wide view (no department is active) — admins can move members between
  // departments here; inside a specific department the column stays read-only.
  const canEditDepartment = !departmentId && isAdmin && availableDepartments.length > 0;
  const [confirmDelete, setConfirmDelete] = useState<MemberRow | null>(null);
  // Converting an Admin to a lower role revokes their admin access (and, for
  // Manager, moves them into DepartmentManager) — confirm before applying.
  const [confirmAdminDemote, setConfirmAdminDemote] = useState<{ member: MemberRow; newRole: Role } | null>(null);
  const [confirmRemoveSubDepartment, setConfirmRemoveSubDepartment] = useState<MemberRow | null>(null);
  const [confirmRemoveDept, setConfirmRemoveDept] = useState<MemberRow | null>(null);
  const [confirmRemoveTenant, setConfirmRemoveTenant] = useState<MemberRow | null>(null);
  const [liveMembers, setLiveMembers] = useState(members);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [configMember, setConfigMember] = useState<MemberRow | null>(null);
  const [liveInvites, setLiveInvites] = useState(invites);
  // inviteId → "resend" | "delete" while that action is in flight
  const [inviteBusy, setInviteBusy] = useState<Record<string, "resend" | "delete">>({});
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState<InviteRow | null>(null);
  // Filter bar — "" means "all". Department also accepts the NO_DEPT sentinel to
  // isolate people who belong to no department at all.
  const [filterDept, setFilterDept] = useState("");
  const [filterSubDept, setFilterSubDept] = useState("");
  const [filterRole, setFilterRole] = useState<"" | Role>("");

  // Sync liveMembers when the server re-renders after router.refresh()
  useEffect(() => {
    setLiveMembers(members);
  }, [members]);

  useEffect(() => {
    setLiveInvites(invites);
  }, [invites]);

  async function handleResendInvite(invite: InviteRow) {
    if (!tenantId) return;
    setInviteBusy((prev) => ({ ...prev, [invite.id]: "resend" }));
    try {
      await resendTenantInvite(tenantId, invite.id);
      toast.success(`Invitation resent to ${invite.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resend invite");
    } finally {
      setInviteBusy((prev) => { const n = { ...prev }; delete n[invite.id]; return n; });
    }
  }

  async function handleDeleteInvite(invite: InviteRow) {
    if (!tenantId) return;
    setInviteBusy((prev) => ({ ...prev, [invite.id]: "delete" }));
    try {
      await deleteTenantInvite(tenantId, invite.id);
      setLiveInvites((list) => list.filter((i) => i.id !== invite.id));
      toast.success(`Invitation to ${invite.email} deleted`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete invite");
    } finally {
      setInviteBusy((prev) => { const n = { ...prev }; delete n[invite.id]; return n; });
    }
  }

  function currentRole(m: MemberRow): Role {
    return localRoles[m.id] ?? m.role;
  }

  function currentSubDepartmentId(m: MemberRow): string {
    return localSubDepartments[m.id] ?? m.subDepartmentId ?? "";
  }

  function currentDepartmentId(m: MemberRow): string {
    return localDepartments[m.id] ?? m.departmentId ?? "";
  }

  // Sub-departments belonging to the member's (current) department — the dropdown
  // is scoped so the department choice drives which sub-departments are offered.
  function subDepartmentsForMember(m: MemberRow) {
    const deptId = currentDepartmentId(m);
    // When sub-departments carry no departmentId (legacy rows / fixed-department
    // view) fall back to the full list so the dropdown is never wrongly empty.
    const hasDeptTags = availableSubDepartments.some((sd) => sd.departmentId != null);
    if (!hasDeptTags || !deptId) return availableSubDepartments;
    return availableSubDepartments.filter((sd) => sd.departmentId === deptId);
  }

  async function handleDepartmentChange(memberId: string, newDepartmentId: string) {
    setLocalDepartments((prev) => ({ ...prev, [memberId]: newDepartmentId }));
    // A department move clears the sub-department; drop any stale local override.
    setLocalSubDepartments((prev) => { const n = { ...prev }; delete n[memberId]; return n; });
    setSaving(memberId);
    setError(null);
    try {
      await updateAdminUser(memberId, { departmentId: newDepartmentId });
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to change department");
      setLocalDepartments((prev) => { const n = { ...prev }; delete n[memberId]; return n; });
    } finally {
      setSaving(null);
    }
  }

  async function handleSubDepartmentChange(memberId: string, newSubDepartmentId: string) {
    if (!newSubDepartmentId) return;
    const member = liveMembers.find((m) => m.id === memberId) ?? members.find((m) => m.id === memberId);
    setLocalSubDepartments((prev) => ({ ...prev, [memberId]: newSubDepartmentId }));
    setSaving(memberId);
    setError(null);
    try {
      // Additive — keep existing sub-department memberships.
      await addAdminSubDepartmentMember(newSubDepartmentId, memberId, member ? currentRole(member) : "agent");
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to update subDepartment");
      setLocalSubDepartments((prev) => { const n = { ...prev }; delete n[memberId]; return n; });
    } finally {
      setSaving(null);
    }
  }

  async function handleAddToSubDepartment(member: MemberRow, subDepartmentId: string) {
    setSaving(member.id);
    setError(null);
    try {
      await addAdminSubDepartmentMember(subDepartmentId, member.id, currentRole(member));
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to add subDepartment membership");
    } finally {
      setSaving(null);
    }
  }

  async function handleRemoveMembership(member: MemberRow, subDepartmentId: string) {
    setSaving(member.id);
    try {
      await removeAdminSubDepartmentMember(subDepartmentId, member.id);
      setLiveMembers((members) => members.map((current) => current.id === member.id
        ? { ...current, memberships: current.memberships?.filter((item) => item.subDepartmentId !== subDepartmentId) }
        : current));
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to remove subDepartment membership");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(memberId: string) {
    await deleteAdminUser(memberId);
    setLiveMembers((prev) => prev.filter((m) => m.id !== memberId));
    startTransition(() => router.refresh());
  }

  async function handleRemoveFromSubDepartment(member: MemberRow) {
    const subDepartmentId = member.subDepartmentId;
    if (!subDepartmentId) return;
    await removeAdminSubDepartmentMember(subDepartmentId, member.id);
    setLiveMembers((prev) =>
      prev.map((m) => m.id === member.id ? { ...m, subDepartmentId: null, subDepartments: [] } : m),
    );
    startTransition(() => router.refresh());
  }

  async function handleRemoveFromDept(member: MemberRow) {
    const deptId = member.departmentId;
    if (!deptId) return;
    if (member.isCrossAccess) {
      await revokeDepartmentAccess(deptId, member.id);
    } else {
      await removeAdminDeptMember(deptId, member.id);
    }
    setLiveMembers((prev) => prev.filter((m) => m.id !== member.id));
    startTransition(() => router.refresh());
  }

  async function handleRemoveFromTenant(member: MemberRow) {
    if (!tenantId) return;
    await removeAdminTenantMember(tenantId, member.id);
    setLiveMembers((prev) => prev.filter((m) => m.id !== member.id));
    startTransition(() => router.refresh());
  }

  async function handleRoleChange(memberId: string, newRole: Role) {
    setLocalRoles((prev) => ({ ...prev, [memberId]: newRole }));
    setSaving(memberId);
    setError(null);
    const member = liveMembers.find((m) => m.id === memberId);
    try {
      await updateAdminUser(memberId, {
        role: newRole,
        departmentId: member?.departmentId ?? departmentId ?? undefined,
        subDepartmentId: member?.subDepartmentId ?? undefined,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
      setLocalRoles((prev) => {
        const n = { ...prev };
        delete n[memberId];
        return n;
      });
    } finally {
      setSaving(null);
    }
  }

  // Gate role changes: converting an Admin to a lower role revokes admin access
  // (and, for Manager, moves them into DepartmentManager), so confirm first.
  // Everything else applies immediately.
  function requestRoleChange(member: MemberRow, newRole: Role) {
    if (newRole === currentRole(member)) return;
    if (currentRole(member) === "admin" && newRole !== "admin") {
      setConfirmAdminDemote({ member, newRole });
      return;
    }
    handleRoleChange(member.id, newRole);
  }

  async function handleToggleActive(member: MemberRow) {
    const next = !(member.isActive ?? true);
    // Optimistic update
    setLiveMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, isActive: next } : m)),
    );
    try {
      await fetch(`/api/admin/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      startTransition(() => router.refresh());
    } catch {
      // Revert on failure
      setLiveMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, isActive: !next } : m)),
      );
    }
  }

  const NO_DEPT = "__no_dept__";

  // A member's departments, normalized (falls back to the single department fields).
  const deptEntriesOf = (m: MemberRow) =>
    m.departments?.length
      ? m.departments
      : m.departmentId && m.department
        ? [{ id: m.departmentId, name: m.department }]
        : [];
  // Every sub-department id a member belongs to.
  const subDeptIdsOf = (m: MemberRow) => {
    const ids = new Set<string>();
    for (const ms of m.memberships ?? []) ids.add(ms.subDepartmentId);
    if (m.subDepartmentId) ids.add(m.subDepartmentId);
    return ids;
  };

  // Filter dropdown options, derived from the members actually on the page so the
  // lists reflect reality even for roles without availableDepartments seeded.
  const deptFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let hasNoDept = false;
    for (const m of liveMembers) {
      const entries = deptEntriesOf(m);
      if (entries.length === 0) hasNoDept = true;
      for (const d of entries) byId.set(d.id, d.name);
    }
    const opts = [
      { value: "", label: "All departments" },
      ...[...byId.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({ value: id, label: name })),
    ];
    if (hasNoDept) opts.push({ value: NO_DEPT, label: "No department" });
    return opts;
  }, [liveMembers]);

  const subDeptFilterOptions = useMemo(() => {
    const byId = new Map<string, { name: string; deptId: string | null }>();
    for (const m of liveMembers) {
      for (const ms of m.memberships ?? []) {
        byId.set(ms.subDepartmentId, { name: ms.subDepartmentName, deptId: ms.departmentId });
      }
    }
    let entries = [...byId.entries()];
    // Scope to the chosen department (unless filtering for "no department").
    if (filterDept && filterDept !== NO_DEPT) {
      entries = entries.filter(([, v]) => v.deptId === filterDept);
    }
    entries.sort((a, b) => a[1].name.localeCompare(b[1].name));
    return [
      { value: "", label: "All sub-departments" },
      ...entries.map(([id, v]) => ({ value: id, label: v.name })),
    ];
  }, [liveMembers, filterDept]);

  // Free-text search + sort, applied before the filter bar and grouping so each
  // department group keeps the chosen order.
  const memberList = useListControls(liveMembers, {
    searchText: (m) =>
      [
        m.name,
        m.email,
        m.role.replace("_", " "),
        m.location ?? "",
        ...deptEntriesOf(m).map((d) => d.name),
        ...(m.memberships?.map((ms) => ms.subDepartmentName) ?? m.subDepartments),
      ].join(" "),
    sortOptions: [
      { id: "name", label: "Name A–Z", compare: byText((m: MemberRow) => m.name) },
      { id: "name-desc", label: "Name Z–A", compare: (a, b) => byText((m: MemberRow) => m.name)(b, a) },
      { id: "newest", label: "Newest first", compare: byDateDesc((m: MemberRow) => m.createdAt) },
      { id: "oldest", label: "Oldest first", compare: byDateAsc((m: MemberRow) => m.createdAt) },
      { id: "email", label: "Email", compare: byText((m: MemberRow) => m.email) },
      {
        id: "role",
        label: "Role",
        compare: (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || byText((m: MemberRow) => m.name)(a, b),
      },
    ],
  });

  const inviteList = useListControls(liveInvites, {
    searchText: (i) => [i.email, i.role.replace("_", " "), i.target ?? "", i.invitedBy ?? "", i.status].join(" "),
    sortOptions: [
      { id: "newest", label: "Newest first", compare: byDateDesc((i: InviteRow) => i.createdAt) },
      { id: "oldest", label: "Oldest first", compare: byDateAsc((i: InviteRow) => i.createdAt) },
      { id: "email", label: "Email A–Z", compare: byText((i: InviteRow) => i.email) },
      { id: "expiring", label: "Expiring soonest", compare: byDateAsc((i: InviteRow) => i.expiresAt) },
    ],
  });

  const roleFilterOptions = [{ value: "", label: "All roles" }, ...ROLE_OPTIONS_ADMIN];
  const hasActiveFilter = filterDept !== "" || filterSubDept !== "" || filterRole !== "" || memberList.isFiltering;
  const clearFilters = () => { setFilterDept(""); setFilterSubDept(""); setFilterRole(""); memberList.setQuery(""); };

  // Apply the filter bar to the member list before grouping.
  const filteredMembers = useMemo(() => {
    return memberList.visible.filter((m) => {
      if (filterRole && currentRole(m) !== filterRole) return false;
      if (filterDept) {
        const entries = deptEntriesOf(m);
        if (filterDept === NO_DEPT) {
          if (entries.length > 0) return false;
        } else if (!entries.some((d) => d.id === filterDept)) {
          return false;
        }
      }
      if (filterSubDept && !subDeptIdsOf(m).has(filterSubDept)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberList.visible, filterDept, filterSubDept, filterRole, localRoles]);

  // Group members department-wise. A member in several departments appears once
  // under each. Members with no department fall into a trailing "No department" group.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; members: MemberRow[] }>();
    for (const member of filteredMembers) {
      const entries = deptEntriesOf(member);
      const targets = entries.length ? entries : [{ id: NO_DEPT, name: "No department" }];
      for (const dept of targets) {
        const group = map.get(dept.id) ?? { name: dept.name, members: [] };
        group.members.push(member);
        map.set(dept.id, group);
      }
    }
    let result = [...map.entries()]
      .sort((a, b) => {
        if (a[0] === NO_DEPT) return 1;
        if (b[0] === NO_DEPT) return -1;
        return a[1].name.localeCompare(b[1].name);
      })
      .map(([id, group]) => ({ id, ...group }));
    // When a specific department is selected, collapse to just that group so a
    // member's *other* departments don't show alongside it.
    if (filterDept) result = result.filter((g) => g.id === filterDept);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMembers, filterDept]);
  const colSpan = (isAdmin || isManager) ? 6 : 4;

  return (
    <>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title="Delete permanently"
        description={
          confirmDelete
            ? `Permanently delete ${confirmDelete.name}'s account? Their tickets and comments are preserved but the account is deactivated everywhere. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete permanently"
        successMessage={confirmDelete ? `${confirmDelete.name} has been deleted` : undefined}
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete.id); }}
      />
      <ConfirmDialog
        open={!!confirmAdminDemote}
        onOpenChange={(open) => { if (!open) setConfirmAdminDemote(null); }}
        title={confirmAdminDemote?.member.id === currentUserId ? "Give up your admin access?" : "Remove admin access?"}
        description={(() => {
          if (!confirmAdminDemote) return "";
          const { member, newRole } = confirmAdminDemote;
          const label = ROLE_LABEL(newRole);
          const managerNote =
            newRole === "manager" ? " and be added as a department manager" : "";
          if (member.id === currentUserId) {
            return `You're about to change your own role from Admin to ${label}. You'll immediately lose administrator access to this workspace — including this Members page — and won't be able to restore it yourself. Another admin would have to promote you back.`;
          }
          return `${member.name} is currently an Admin. Changing them to ${label} will remove their admin access${managerNote}. Continue?`;
        })()}
        confirmLabel={confirmAdminDemote?.member.id === currentUserId ? "Yes, remove my admin access" : "Remove admin access"}
        onConfirm={async () => {
          if (confirmAdminDemote) await handleRoleChange(confirmAdminDemote.member.id, confirmAdminDemote.newRole);
        }}
      />
      <ConfirmDialog
        open={!!confirmRemoveTenant}
        onOpenChange={(open) => { if (!open) setConfirmRemoveTenant(null); }}
        title="Remove from tenant"
        description={
          confirmRemoveTenant
            ? `Remove ${confirmRemoveTenant.name} from this workspace? They'll lose access to every department and sub-department here, but their account and past tickets are kept and you can re-add them later.`
            : ""
        }
        confirmLabel="Remove"
        successMessage={confirmRemoveTenant ? `${confirmRemoveTenant.name} removed from the workspace` : undefined}
        onConfirm={async () => { if (confirmRemoveTenant) await handleRemoveFromTenant(confirmRemoveTenant); }}
      />
      <ConfirmDialog
        open={!!confirmRemoveSubDepartment}
        onOpenChange={(open) => { if (!open) setConfirmRemoveSubDepartment(null); }}
        title="Remove from subDepartment"
        description={
          confirmRemoveSubDepartment
            ? `Remove ${confirmRemoveSubDepartment.name} from ${confirmRemoveSubDepartment.subDepartments[0] ?? "this sub department"}? They will remain in the workspace.`
            : ""
        }
        confirmLabel="Remove"
        successMessage={confirmRemoveSubDepartment ? `${confirmRemoveSubDepartment.name} removed from subDepartment` : undefined}
        onConfirm={async () => { if (confirmRemoveSubDepartment) await handleRemoveFromSubDepartment(confirmRemoveSubDepartment); }}
      />
      <ConfirmDialog
        open={!!confirmRemoveDept}
        onOpenChange={(open) => { if (!open) setConfirmRemoveDept(null); }}
        title={confirmRemoveDept?.isCrossAccess ? "Revoke cross-department access" : "Remove from department"}
        description={
          confirmRemoveDept
            ? confirmRemoveDept.isCrossAccess
              ? `Revoke ${confirmRemoveDept.name}'s cross-department access to ${departmentName ?? "this department"}? They will lose access to any projects assigned here.`
              : `Remove ${confirmRemoveDept.name} from ${confirmRemoveDept.department ?? "this department"}? They will lose access to all sub departments in this department.`
            : ""
        }
        confirmLabel={confirmRemoveDept?.isCrossAccess ? "Revoke" : "Remove"}
        successMessage={
          confirmRemoveDept
            ? confirmRemoveDept.isCrossAccess
              ? `${confirmRemoveDept.name}'s cross-department access revoked`
              : `${confirmRemoveDept.name} removed from department`
            : undefined
        }
        onConfirm={async () => { if (confirmRemoveDept) await handleRemoveFromDept(confirmRemoveDept); }}
      />
      <ConfirmDialog
        open={!!confirmDeleteInvite}
        onOpenChange={(open) => { if (!open) setConfirmDeleteInvite(null); }}
        title="Delete invitation"
        description={
          confirmDeleteInvite
            ? `Delete the pending invitation to ${confirmDeleteInvite.email}? The invite link will stop working. You can always send a new invite later.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={async () => { if (confirmDeleteInvite) await handleDeleteInvite(confirmDeleteInvite); }}
      />

    {addMemberOpen && (
      <AddMemberModal
        departmentId={departmentId}
        availableSubDepartments={availableSubDepartments}
        availableDepartments={availableDepartments}
        isAdmin={isAdmin}
        isManager={isManager}
        onClose={() => setAddMemberOpen(false)}
      />
    )}
    {inviteOpen && tenantId && (
      <InviteMemberModal
        tenantId={tenantId}
        canInvitePrivileged={isAdmin}
        departments={availableDepartments}
        subDepartments={availableSubDepartments}
        onSent={(delivered) => {
          if (delivered) toast.success("Invitation sent");
          startTransition(() => router.refresh());
        }}
        onClose={() => setInviteOpen(false)}
      />
    )}
    {configMember && (
      <MemberConfigPanel
        member={configMember}
        onClose={() => setConfigMember(null)}
        reassignContext={
          departmentId && (isAdmin || isManager)
            ? {
                departmentId,
                subDepartments: availableSubDepartments,
                agents: liveMembers
                  .filter((m) => m.id !== configMember.id)
                  .map((m) => ({ id: m.id, name: m.name })),
              }
            : null
        }
      />
    )}

    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="sts-text-admin-title">
            Members
            <span className="ml-2 font-sans text-[13px] font-normal text-sts-muted">
              ({hasActiveFilter ? `${filteredMembers.length} of ${liveMembers.length}` : liveMembers.length})
            </span>
          </h1>
          <p className="mt-[3px] font-sans text-[13px] text-sts-muted">
            Manage roles, subDepartments, status, and availability for everyone in the workspace.
          </p>
        </div>
        {(isAdmin || isManager) && (departmentId || availableDepartments.length > 0) && (
          <div className="flex shrink-0 items-center gap-2">
            <Tip
              wrap
              label={
                !isAdmin && availableSubDepartments.length === 0
                  ? "Create a sub-department before inviting"
                  : "Send an email invite to someone without an account"
              }
            >
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                disabled={!isAdmin && availableSubDepartments.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface px-3.5 font-sans text-[12.5px] font-medium text-sts-foreground hover:bg-sts-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail className="size-3.5" />
                Invite new members
              </button>
            </Tip>
            <Tip label="Add people who already have an account">
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 rounded-full bg-sts-blue px-3.5 font-sans text-[12.5px] font-medium text-white hover:opacity-90"
              >
                <Plus className="size-3.5" />
                Add existing members
              </button>
            </Tip>
          </div>
        )}
      </div>

      {error && (
        <p className="font-sans text-[12px] text-red-500">{error}</p>
      )}

      {liveMembers.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-[10px] border border-sts-card-border bg-sts-card px-3 py-2.5">
          <ListSearchInput
            value={memberList.query}
            onChange={memberList.setQuery}
            placeholder="Search name, email, team…"
          />
          <span className="inline-flex items-center gap-1.5 pr-1 font-sans text-[11.5px] font-semibold uppercase tracking-[0.5px] text-sts-subtle">
            <SlidersHorizontal className="size-3.5" />
            Filter
          </span>
          <SearchableSelect
            value={filterDept}
            onChange={(v) => { setFilterDept(v); setFilterSubDept(""); }}
            options={deptFilterOptions}
            placeholder="All departments"
            searchPlaceholder="Search departments…"
            icon={Building2}
            className="w-[190px] bg-sts-surface"
            highlightWhenSet
            aria-label="Filter by department"
          />
          {/* Sub-department is meaningful only within a single department, so it
              only appears once a specific department is chosen. */}
          {filterDept && filterDept !== NO_DEPT && (
            <SearchableSelect
              value={filterSubDept}
              onChange={setFilterSubDept}
              options={subDeptFilterOptions}
              placeholder="All sub-departments"
              searchPlaceholder="Search sub-departments…"
              icon={Layers}
              className="w-[200px] bg-sts-surface"
              highlightWhenSet
              aria-label="Filter by sub-department"
            />
          )}
          <SearchableSelect
            value={filterRole}
            onChange={(v) => setFilterRole(v as "" | Role)}
            options={roleFilterOptions}
            placeholder="All roles"
            icon={ShieldCheck}
            className="w-[150px] bg-sts-surface"
            highlightWhenSet
            aria-label="Filter by role"
          />
          {hasActiveFilter && (
            <>
              <span className="font-sans text-[11.5px] text-sts-subtle">
                {filteredMembers.length} of {liveMembers.length}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto inline-flex h-8 items-center gap-1 rounded-full border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12px] font-medium text-sts-muted transition-colors hover:border-sts-muted hover:text-sts-foreground"
              >
                <X className="size-3.5" />
                Clear
              </button>
            </>
          )}
          <div className={cn(!hasActiveFilter && "ml-auto")}>
            <SortDropdown value={memberList.sortKey} onChange={memberList.setSortKey} options={memberList.sortDropdownOptions} />
          </div>
        </div>
      )}

      <div className="shrink-0 overflow-x-auto rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
              <TableHead className="h-8 w-[30%]">
                <SectionLabel>Member</SectionLabel>
              </TableHead>
              <TableHead className="h-8 w-[18%]">
                <SectionLabel>Role</SectionLabel>
              </TableHead>
              <TableHead className="h-8 w-[20%]">
                <SectionLabel>Department</SectionLabel>
              </TableHead>
              <TableHead className="h-8">
                <SectionLabel>SubDepartments</SectionLabel>
              </TableHead>
              {(isAdmin || isManager) && (
                <TableHead className="h-8 w-[100px]">
                  <SectionLabel>Status</SectionLabel>
                </TableHead>
              )}
              {(isAdmin || isManager) && <TableHead className="h-8 w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableCell colSpan={colSpan} className="py-0">
                  <div className="flex h-[54px] items-center">
                    <span className="font-sans text-[11.5px] text-sts-muted">
                      {liveMembers.length === 0
                        ? "No members yet"
                        : memberList.isFiltering
                          ? `No members match "${memberList.query.trim()}"`
                          : "No members match these filters"}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
            {groups.map((group) => (
              <Fragment key={group.id}>
                <TableRow className="border-none hover:bg-transparent">
                  <TableCell colSpan={colSpan} className="py-0">
                    <div className="flex h-9 items-center gap-2 pt-2">
                      <SectionLabel>{group.name}</SectionLabel>
                      <span className="font-sans text-[11px] font-medium text-sts-subtle">
                        ({group.members.length})
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                {group.members.map((member) => {
              const role = currentRole(member);
              const departmentEntries = member.departments?.length
                ? member.departments
                : member.departmentId && member.department ? [{ id: member.departmentId, name: member.department }] : [];
              const subDepartmentEntries = member.memberships?.length
                ? member.memberships.map((membership) => ({ id: membership.subDepartmentId, name: membership.subDepartmentName }))
                : member.subDepartments.map((name) => ({ id: name, name }));
              // Sub-departments offered in the "Add" dropdown: exclude ones the member
              // already belongs to, and — when a department is assigned — scope to only
              // that department's sub-departments (all of them, if the member is in several).
              const memberDeptIds = new Set(departmentEntries.map((d) => d.id));
              const hasDeptTags = availableSubDepartments.some((sd) => sd.departmentId != null);
              // A sub-department only makes sense within one of the member's
              // departments. When sub-departments are department-tagged, a member
              // with no department has no valid sub-department to add — so the
              // list is empty and the "Add" control is disabled (below), rather
              // than offering every department's sub-departments indiscriminately.
              //
              // For a member with no saved department the Department dropdown acts
              // as a filter: picking one there (held in local state) narrows the
              // addable sub-departments so a home can be chosen — adding the
              // sub-department is what actually assigns the department.
              const scopeDeptIds = memberDeptIds.size > 0
                ? memberDeptIds
                : (() => { const id = currentDepartmentId(member); return id ? new Set([id]) : new Set<string>(); })();
              const canAddSubDepartment = !hasDeptTags || scopeDeptIds.size > 0;
              const addableSubDepartments = availableSubDepartments.filter((subDepartment) => {
                if (member.memberships?.some((membership) => membership.subDepartmentId === subDepartment.id)) return false;
                if (hasDeptTags) {
                  return scopeDeptIds.size > 0 && subDepartment.departmentId != null && scopeDeptIds.has(subDepartment.departmentId);
                }
                return true;
              });
              return (
                <TableRow
                  key={`${group.id}-${member.id}`}
                  className="border-[#f0f4f8] hover:bg-sts-bg/40 dark:border-[#3a3a37]"
                >
                  {/* Member */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center gap-2.5">
                      <MemberAvatar name={member.name} color={member.color} avatarUrl={member.avatarUrl} role={role} subDepartment={member.subDepartments?.[0]} userId={member.id} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">
                            {member.name}
                          </p>
                          {member.isSuperAdmin && (
                            <span title="Platform super-admin" className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-sts-red/10 px-[6px] py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-sts-red">
                              <ShieldCheck className="size-2.5" />
                              Super admin
                            </span>
                          )}
                          {!member.isSuperAdmin && role === "admin" && (
                            <span title="Tenant admin" className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-sts-blue/10 px-[6px] py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-sts-blue">
                              <ShieldCheck className="size-2.5" />
                              Tenant Admin
                            </span>
                          )}
                          {!member.isSuperAdmin && role === "manager" && (
                            <span title="Department manager" className="shrink-0 inline-flex items-center rounded-full bg-sts-purple/10 px-[6px] py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-sts-purple">
                              Manager
                            </span>
                          )}
                          {!member.isSuperAdmin && role === "sub_manager" && (
                            <span title="Sub-department manager" className="shrink-0 inline-flex items-center rounded-full bg-sts-green/10 px-[6px] py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-sts-green">
                              Sub-manager
                            </span>
                          )}
                          {member.isCrossAccess && (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-amber-100 px-[6px] py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Guest
                            </span>
                          )}
                          {!member.isActive && (
                            <span title="Excluded from assignment" className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-[6px] py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              <BanIcon className="size-2.5" />
                              No assign
                            </span>
                          )}
                        </div>
                        <p className="truncate font-sans text-[11.5px] text-sts-subtle">
                          {member.location ? `${member.email} · ${member.location}` : member.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Role — editable for admin (all roles) and manager (lead/staff only); read-only for
                      lead and for guests (a cross-access grant doesn't carry role-management rights here) */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center">
                      {!member.isCrossAccess && (isAdmin || (isManager && (role === "sub_manager" || role === "agent"))) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={saving === member.id}
                            className={cn(
                              "inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2.5 pr-2 font-sans text-[11.5px] font-medium outline-none transition-opacity disabled:opacity-60",
                              ROLE_COLORS[role] ?? "bg-sts-surface text-sts-subtle",
                            )}
                          >
                            <span className="capitalize">{role}</span>
                            {saving === member.id ? (
                              <Loader2 className="size-3 animate-spin opacity-70" />
                            ) : (
                              <ChevronDown className="size-3 opacity-60" />
                            )}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[110px]">
                            {(isAdmin ? ROLE_OPTIONS_ADMIN : ROLE_OPTIONS_MANAGER).map((o) => (
                              <DropdownMenuItem
                                key={o.value}
                                onClick={() => requestRoleChange(member, o.value)}
                                className={cn(
                                  "gap-2 font-sans text-[12px]",
                                  role === o.value && "font-semibold",
                                )}
                              >
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                                    ROLE_COLORS[o.value] ?? "bg-sts-surface text-sts-subtle",
                                  )}
                                >
                                  {o.label}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium capitalize",
                            ROLE_COLORS[role] ?? "bg-sts-surface text-sts-subtle",
                          )}
                        >
                          {role}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Department — editable on the tenant-wide view (admin), read-only
                      inside a specific department and for guests */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center">
                      {/* Editable single-select "move" dropdown only when the member is in
                          0–1 departments. Members in multiple departments fall through to the
                          chip list below so every department they belong to is visible. */}
                      {canEditDepartment && !member.isCrossAccess && departmentEntries.length <= 1 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={saving === member.id}
                            className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface pl-2.5 pr-2 font-sans text-[11.5px] text-sts-muted outline-none transition-opacity disabled:opacity-60 hover:border-sts-blue/50 hover:text-sts-foreground"
                          >
                            <span className="max-w-[130px] truncate">
                              {availableDepartments.find((d) => d.id === currentDepartmentId(member))?.name ?? "No department"}
                            </span>
                            {saving === member.id ? (
                              <Loader2 className="size-3 animate-spin opacity-70" />
                            ) : (
                              <ChevronDown className="size-3 opacity-60" />
                            )}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[160px]">
                            {availableDepartments.map((d) => (
                              <DropdownMenuItem
                                key={d.id}
                                onClick={() => {
                                  if (currentDepartmentId(member) !== d.id) handleDepartmentChange(member.id, d.id);
                                }}
                                className={cn(
                                  "gap-2 font-sans text-[12px]",
                                  currentDepartmentId(member) === d.id && "font-semibold",
                                )}
                              >
                                <span className="inline-flex rounded-full bg-sts-blue-tint px-2 py-0.5 text-[11.5px] font-semibold text-sts-id">
                                  {d.name}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : member.departments?.length ? (
                        <div className="flex items-center gap-1 flex-wrap" title={`${departmentEntries.length} department${departmentEntries.length === 1 ? "" : "s"}`}>
                          {departmentEntries.map((department) => (
                            <span key={department.id} className="inline-flex items-center gap-1 rounded-full bg-sts-blue-tint px-[7px] py-0.5 font-sans text-[11.5px] font-semibold text-sts-id">
                              {department.name}
                              {(isAdmin || isManager) && !member.isCrossAccess && (
                                <Tip label={`Remove from ${department.name}`}>
                                  <button aria-label={`Remove from ${department.name}`} type="button" disabled={saving === member.id} onClick={() => setConfirmRemoveDept({ ...member, departmentId: department.id, department: department.name })} className="rounded text-sts-id/60 hover:text-red-500 disabled:opacity-50">
                                    <X className="size-3" />
                                  </button>
                                </Tip>
                              )}
                            </span>
                          ))}
                          {departmentEntries.length > 1 && <span className="rounded-full bg-sts-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-sts-blue">{departmentEntries.length}</span>}
                        </div>
                      ) : member.department ? (
                        <span className="inline-flex items-center rounded-full bg-sts-blue-tint px-[7px] py-0.5 font-sans text-[11.5px] font-semibold text-sts-id">
                          {member.department}
                        </span>
                      ) : (
                        <span className="font-sans text-[11.5px] text-sts-subtle">—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* SubDepartments — not editable for guests (their subDepartment belongs to another department)
                      or managers (they oversee the whole department, not a single subDepartment) */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center gap-1 flex-wrap" title={`${subDepartmentEntries.length} subDepartment${subDepartmentEntries.length === 1 ? "" : "s"}`}>
                      {(isAdmin || isManager) && !member.isCrossAccess && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={saving === member.id || !canAddSubDepartment}
                            title={!canAddSubDepartment ? "Assign a department first" : undefined}
                            className="inline-flex h-[26px] items-center gap-1 rounded-full border border-sts-card-border bg-sts-surface px-2 font-sans text-[11.5px] text-sts-muted outline-none hover:border-sts-blue/50 hover:text-sts-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Plus className="size-3" /> Add
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[150px]">
                            {addableSubDepartments.length === 0 ? (
                              <div className="px-2 py-1.5 font-sans text-[11.5px] text-sts-subtle">No sub departments</div>
                            ) : addableSubDepartments.map((subDepartment) => (
                              <DropdownMenuItem key={subDepartment.id} onClick={() => handleAddToSubDepartment(member, subDepartment.id)} className="gap-2 font-sans text-[12px]">
                                <span className="inline-flex rounded-full bg-sts-blue/10 px-2 py-0.5 text-[11.5px] font-semibold text-sts-blue">{subDepartment.name}</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {!member.memberships && (isAdmin || isManager) && !member.isCrossAccess && role !== "manager" && currentDepartmentId(member) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={saving === member.id}
                            className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface pl-2.5 pr-2 font-sans text-[11.5px] text-sts-muted outline-none transition-opacity disabled:opacity-60 hover:border-sts-blue/50 hover:text-sts-foreground"
                          >
                            <span className="max-w-[120px] truncate">
                              {subDepartmentsForMember(member).find((t) => t.id === currentSubDepartmentId(member))?.name ?? "No subDepartment"}
                            </span>
                            {saving === member.id ? (
                              <Loader2 className="size-3 animate-spin opacity-70" />
                            ) : (
                              <ChevronDown className="size-3 opacity-60" />
                            )}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[150px]">
                            <DropdownMenuItem
                              onClick={() => handleSubDepartmentChange(member.id, "")}
                              className={cn(
                                "gap-2 font-sans text-[12px]",
                                !currentSubDepartmentId(member) && "font-semibold",
                              )}
                            >
                              <span className="inline-flex rounded-full bg-sts-surface px-2 py-0.5 text-[11.5px] font-medium text-sts-subtle">
                                No sub department
                              </span>
                            </DropdownMenuItem>
                            {subDepartmentsForMember(member).map((t) => (
                              <DropdownMenuItem
                                key={t.id}
                                onClick={() => handleSubDepartmentChange(member.id, t.id)}
                                className={cn(
                                  "gap-2 font-sans text-[12px]",
                                  currentSubDepartmentId(member) === t.id && "font-semibold",
                                )}
                              >
                                <span className="inline-flex rounded-full bg-sts-blue/10 px-2 py-0.5 text-[11.5px] font-semibold text-sts-blue">
                                  {t.name}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : member.subDepartments.length === 0 ? (
                        <span className="font-sans text-[11.5px] text-sts-subtle">—</span>
                      ) : (
                        subDepartmentEntries.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 rounded-full bg-sts-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-sts-muted"
                          >
                            {t.name}
                            {(isAdmin || isManager) && !member.isCrossAccess && member.memberships?.some((membership) => membership.subDepartmentId === t.id) && (
                              <Tip label={`Remove from ${t.name}`}>
                                <button aria-label={`Remove from ${t.name}`} type="button" disabled={saving === member.id} onClick={() => handleRemoveMembership(member, t.id)} className="rounded text-sts-subtle hover:text-red-500 disabled:opacity-50">
                                  <X className="size-3" />
                                </button>
                              </Tip>
                            )}
                          </span>
                        ))
                      )}
                      {subDepartmentEntries.length > 1 && <span className="rounded-full bg-sts-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-sts-blue">{subDepartmentEntries.length}</span>}
                    </div>
                  </TableCell>

                  {/* Active / Inactive toggle */}
                  {(isAdmin || isManager) && (
                    <TableCell className="py-0">
                      <div className="flex h-[54px] items-center">
                        {!member.isCrossAccess ? (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(member)}
                            className={cn(
                              "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 font-sans text-[11.5px] font-medium transition-colors",
                              member.isActive
                                ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400",
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", member.isActive ? "bg-green-500" : "bg-red-500")} />
                            {member.isActive ? "Active" : "Inactive"}
                          </button>
                        ) : (
                          <span className="font-sans text-[11.5px] text-sts-subtle">—</span>
                        )}
                      </div>
                    </TableCell>
                  )}

                  {/* Actions — admin + manager */}
                  {(isAdmin || isManager) && (
                    <TableCell className="py-0 pr-2 text-right">
                      <div className="flex h-[54px] items-center justify-end gap-0.5">
                        {!member.isCrossAccess && (
                          <Tip label="Configure availability">
                            <button
                              aria-label="Configure availability"
                              type="button"
                              onClick={() => setConfigMember(member)}
                              className="inline-flex size-7 items-center justify-center rounded-full text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground"
                            >
                              <Settings2 className="size-3.5" />
                            </button>
                          </Tip>
                        )}
                        {member.id !== currentUserId && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              type="button"
                              className="inline-flex size-7 items-center justify-center rounded-full text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[180px]">
                              {!member.isCrossAccess && (
                                <DropdownMenuItem
                                  className="gap-2 font-sans text-xs"
                                  onClick={() => setConfigMember(member)}
                                >
                                  <Settings2 className="size-3.5" />
                                  Configure availability
                                </DropdownMenuItem>
                              )}
                              {/* Guests only get one action: revoke their cross-department access */}
                              {member.subDepartmentId && !member.memberships?.length && !member.isCrossAccess && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="gap-2 font-sans text-xs"
                                  onClick={() => setConfirmRemoveSubDepartment(member)}
                                >
                                  <Trash2 className="size-3.5" />
                                  Remove from subDepartment
                                </DropdownMenuItem>
                              )}
                              {member.departmentId && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="gap-2 font-sans text-xs"
                                  onClick={() => setConfirmRemoveDept(member)}
                                >
                                  <Trash2 className="size-3.5" />
                                  {member.isCrossAccess ? "Revoke department access" : "Remove from department"}
                                </DropdownMenuItem>
                              )}
                              {isAdmin && !member.isCrossAccess && tenantId && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="gap-2 font-sans text-xs"
                                  onClick={() => setConfirmRemoveTenant(member)}
                                >
                                  <UserMinus className="size-3.5" />
                                  Remove from tenant
                                </DropdownMenuItem>
                              )}
                              {isAdmin && !member.isCrossAccess && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="gap-2 font-sans text-xs"
                                  onClick={() => setConfirmDelete(member)}
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete permanently
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {(isAdmin || isManager) && (
        <div className="mt-2 shrink-0">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="sts-text-admin-title text-[15px]">
              Invited members
              <span className="ml-2 font-sans text-[13px] font-normal text-sts-muted">
                ({liveInvites.length})
              </span>
            </h2>
            <p className="font-sans text-[12px] text-sts-muted">
              People emailed an invite who haven&apos;t joined yet.
            </p>
          </div>

          {liveInvites.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <ListSearchInput value={inviteList.query} onChange={inviteList.setQuery} placeholder="Search invites…" />
              <SortDropdown value={inviteList.sortKey} onChange={inviteList.setSortKey} options={inviteList.sortDropdownOptions} />
            </div>
          )}

          <div className="overflow-x-auto rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableHead className="h-8 w-[30%]"><SectionLabel>Email</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[14%]"><SectionLabel>Role</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[24%]"><SectionLabel>Invited to</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[16%]"><SectionLabel>Invited</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[100px]"><SectionLabel>Status</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[92px] text-right"><SectionLabel>Actions</SectionLabel></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inviteList.visible.length === 0 ? (
                  <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                    <TableCell colSpan={6} className="py-0">
                      <div className="flex h-[54px] items-center">
                        <span className="font-sans text-[11.5px] text-sts-muted">
                          {liveInvites.length === 0 ? "No pending invitations" : `No invites match "${inviteList.query.trim()}"`}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  inviteList.visible.map((invite) => {
                    const badge = INVITE_STATUS_STYLE[invite.status];
                    const busy = inviteBusy[invite.id];
                    return (
                      <TableRow key={invite.id} className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                        <TableCell className="py-0">
                          <div className="flex h-[54px] items-center gap-2">
                            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-sts-surface text-sts-subtle">
                              <Mail className="size-3.5" />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-sans text-[13px] font-medium text-sts-foreground">{invite.email}</div>
                              {invite.invitedBy && (
                                <div className="truncate font-sans text-[11px] text-sts-muted">Invited by {invite.invitedBy}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[11px] font-medium", ROLE_COLORS[invite.role] ?? "bg-sts-surface text-sts-subtle")}>
                            {ROLE_LABEL(invite.role)}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="font-sans text-[12.5px] text-sts-foreground">{invite.target ?? "—"}</span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="font-sans text-[12.5px] text-sts-muted">
                            {new Date(invite.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium", badge.className)}>
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell className="py-0 pr-2 text-right">
                          <div className="flex h-[54px] items-center justify-end gap-0.5">
                            <Tip label="Resend invitation email">
                              <button
                                aria-label="Resend invitation email"
                                type="button"
                                disabled={!!busy}
                                onClick={() => handleResendInvite(invite)}
                                className="inline-flex size-7 items-center justify-center rounded-full text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busy === "resend" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                              </button>
                            </Tip>
                            <Tip label="Delete invitation">
                              <button
                                aria-label="Delete invitation"
                                type="button"
                                disabled={!!busy}
                                onClick={() => setConfirmDeleteInvite(invite)}
                                className="inline-flex size-7 items-center justify-center rounded-full text-sts-subtle outline-none hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-900/30"
                              >
                                {busy === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                              </button>
                            </Tip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
