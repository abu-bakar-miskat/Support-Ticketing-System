"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Trash2, X, Plus, Search, Settings2, BanIcon, ChevronDown } from "lucide-react";
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
import { updateAdminUser, deleteAdminUser, removeAdminSubDepartmentMember, removeAdminDeptMember, addAdminSubDepartmentMember, grantDepartmentAccess, revokeDepartmentAccess } from "@/lib/api/admin";
import { InviteByEmailModal } from "@/components/invites/invite-by-email-modal";
import { MemberConfigPanel } from "@/components/settings/member-config-panel";
import { toast } from "sonner";

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
  /** True when this person is from another department with a cross-access grant */
  isCrossAccess?: boolean;
  /** Per-team doNotAssign flags (used inside Configure Schedule panel) */
  subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[];
};

const ROLE_OPTIONS_ADMIN: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "lead", label: "Lead" },
  { value: "staff", label: "Staff" },
];

// Managers can only assign lead or staff — not admin/manager
const ROLE_OPTIONS_MANAGER: { value: Role; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "staff", label: "Staff" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-pen-blue/10 text-pen-blue",
  manager: "bg-pen-purple/10 text-pen-purple",
  lead: "bg-pen-green/10 text-pen-green",
  staff: "bg-pen-surface text-pen-subtle",
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
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

function AddMemberModal({
  departmentId,
  availableSubDepartments,
  isAdmin,
  isManager,
  onClose,
}: {
  departmentId: string | null;
  availableSubDepartments: { id: string; name: string }[];
  isAdmin: boolean;
  isManager: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [accessType, setAccessType] = useState<"full" | "guest">("full");
  const [subDepartmentId, setSubDepartmentId] = useState(availableSubDepartments[0]?.id ?? "");
  const [role, setRole] = useState<string>("staff");
  const [guestPermanent, setGuestPermanent] = useState(true);
  const [guestExpiresAt, setGuestExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!search.trim()) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      if (!departmentId) return;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/departments/${departmentId}/candidates?q=${encodeURIComponent(search.trim())}`,
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
  }, [search, departmentId]);

  async function handleSubmit() {
    if (!selected) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (accessType === "full") {
        if (!subDepartmentId) {
          setSubmitError("Please select a team.");
          setSubmitting(false);
          return;
        }
        await addAdminSubDepartmentMember(subDepartmentId, selected.id, role);
      } else {
        if (!departmentId) return;
        await grantDepartmentAccess(departmentId, {
          userId: selected.id,
          ...(!guestPermanent && guestExpiresAt ? { expiresAt: guestExpiresAt } : {}),
        });
      }
      toast.success(`${selected.name} has been added.`);
      router.refresh();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop">
      <div className="relative w-full max-w-[480px] mx-4 rounded-[10px] border border-pen-card-border bg-pen-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
          <span className="font-sans text-[14px] font-semibold text-pen-foreground">
            Add member
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
            <input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              placeholder="Search by name or email…"
              className="h-9 w-full rounded-[6px] border border-pen-card-border bg-pen-bg pl-8 pr-2.5 font-sans text-[12.5px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue/60"
            />
            {searching && (
              <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-pen-subtle" />
            )}
          </div>

          {/* Selected user highlight */}
          {selected && (
            <div className="flex items-center gap-2.5 rounded-[8px] border border-pen-blue/40 bg-pen-blue/5 px-3 py-2">
              <UserAvatar name={selected.name} avatarUrl={selected.avatarUrl} size={26} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                  {selected.name}
                </p>
                <p className="truncate font-sans text-[11.5px] text-pen-subtle">{selected.email}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full px-[7px] py-0.5 font-sans text-[11px] font-medium capitalize",
                  ROLE_COLORS[selected.role] ?? "bg-pen-surface text-pen-subtle",
                )}
              >
                {selected.role}
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-pen-subtle hover:text-pen-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {/* Candidate results */}
          {!selected && candidates.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto rounded-[8px] border border-pen-card-border bg-pen-bg">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setSelected(c); setCandidates([]); setSearch(""); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-pen-surface"
                >
                  <UserAvatar name={c.name} avatarUrl={c.avatarUrl} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                      {c.name}
                    </p>
                    <p className="truncate font-sans text-[11.5px] text-pen-subtle">{c.email}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center rounded-full px-[7px] py-0.5 font-sans text-[11px] font-medium capitalize",
                      ROLE_COLORS[c.role] ?? "bg-pen-surface text-pen-subtle",
                    )}
                  >
                    {c.role}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Access type toggle */}
          {selected && (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAccessType("full")}
                  className={cn(
                    "flex-1 h-9 rounded-[6px] border font-sans text-[12.5px] font-medium transition-colors",
                    accessType === "full"
                      ? "border-pen-blue bg-pen-blue text-white"
                      : "border-pen-card-border bg-pen-surface text-pen-muted hover:border-pen-blue/40 hover:text-pen-foreground",
                  )}
                >
                  Full member
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType("guest")}
                  className={cn(
                    "flex-1 h-9 rounded-[6px] border font-sans text-[12.5px] font-medium transition-colors",
                    accessType === "guest"
                      ? "border-pen-blue bg-pen-blue text-white"
                      : "border-pen-card-border bg-pen-surface text-pen-muted hover:border-pen-blue/40 hover:text-pen-foreground",
                  )}
                >
                  Guest access
                </button>
              </div>

              {/* Full member fields */}
              {accessType === "full" && (
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="font-sans text-[11.5px] text-pen-subtle">Team</label>
                    <SearchableSelect
                      value={subDepartmentId}
                      onChange={setSubDepartmentId}
                      options={availableSubDepartments.map((t) => ({ value: t.id, label: t.name }))}
                      placeholder="— Select team —"
                      className="bg-pen-bg"
                      aria-label="Team"
                    />
                  </div>

                  <div className="w-[130px] flex flex-col gap-1">
                    <label className="font-sans text-[11.5px] text-pen-subtle">Role</label>
                    <SearchableSelect
                      value={role}
                      onChange={setRole}
                      options={
                        isAdmin
                          ? [
                              { value: "staff", label: "Staff" },
                              { value: "lead", label: "Lead" },
                              { value: "manager", label: "Manager" },
                            ]
                          : [
                              { value: "staff", label: "Staff" },
                              { value: "lead", label: "Lead" },
                            ]
                      }
                      searchable={false}
                      className="bg-pen-bg"
                      aria-label="Role"
                    />
                  </div>
                </div>
              )}

              {accessType === "guest" && (
                <div className="flex flex-col gap-2">
                  <p className="font-sans text-[12px] text-pen-muted">
                    The user will get read access to this department without joining a team.
                  </p>
                  <div>
                    <span className="mb-1.5 block font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                      Access duration
                    </span>
                    <div className="flex h-8 overflow-hidden rounded-lg border border-pen-card-border">
                      <button
                        type="button"
                        onClick={() => setGuestPermanent(true)}
                        className={cn(
                          "flex flex-1 items-center justify-center font-sans text-[12px] font-medium transition-colors",
                          guestPermanent ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                        )}
                      >
                        Permanent
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuestPermanent(false)}
                        className={cn(
                          "flex flex-1 items-center justify-center border-l border-pen-card-border font-sans text-[12px] font-medium transition-colors",
                          !guestPermanent ? "bg-pen-blue text-white dark:text-gray-900" : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                        )}
                      >
                        Set expiry
                      </button>
                    </div>
                    {!guestPermanent && (
                      <input
                        type="date"
                        value={guestExpiresAt}
                        onChange={(e) => setGuestExpiresAt(e.target.value)}
                        className="mt-2 h-9 w-full rounded-[6px] border border-pen-card-border bg-pen-bg px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue/60"
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {submitError && (
            <p className="font-sans text-[12px] text-red-500">{submitError}</p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[7px] border border-pen-card-border bg-pen-surface px-4 font-sans text-[12.5px] font-medium text-pen-muted hover:text-pen-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected || submitting}
              onClick={handleSubmit}
              className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-pen-blue px-4 font-sans text-[12.5px] font-medium text-white disabled:opacity-50"
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
  currentUserId,
  departmentId = null,
  departmentName = null,
}: {
  members: MemberRow[];
  isAdmin: boolean;
  isManager?: boolean;
  availableSubDepartments?: { id: string; name: string }[];
  currentUserId?: string;
  departmentId?: string | null;
  departmentName?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRoles, setLocalRoles] = useState<Record<string, Role>>({});
  const [localSubDepartments, setLocalSubDepartments] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<MemberRow | null>(null);
  const [confirmRemoveSubDepartment, setConfirmRemoveSubDepartment] = useState<MemberRow | null>(null);
  const [confirmRemoveDept, setConfirmRemoveDept] = useState<MemberRow | null>(null);
  const [liveMembers, setLiveMembers] = useState(members);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [configMember, setConfigMember] = useState<MemberRow | null>(null);

  // Sync liveMembers when the server re-renders after router.refresh()
  useEffect(() => {
    setLiveMembers(members);
  }, [members]);

  function currentRole(m: MemberRow): Role {
    return localRoles[m.id] ?? m.role;
  }

  function currentSubDepartmentId(m: MemberRow): string {
    return localSubDepartments[m.id] ?? m.subDepartmentId ?? "";
  }

  async function handleSubDepartmentChange(memberId: string, newSubDepartmentId: string) {
    setLocalSubDepartments((prev) => ({ ...prev, [memberId]: newSubDepartmentId }));
    setSaving(memberId);
    setError(null);
    try {
      await updateAdminUser(memberId, { subDepartmentId: newSubDepartmentId });
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to update team");
      setLocalSubDepartments((prev) => { const n = { ...prev }; delete n[memberId]; return n; });
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

  async function handleRoleChange(memberId: string, newRole: Role) {
    setLocalRoles((prev) => ({ ...prev, [memberId]: newRole }));
    setSaving(memberId);
    setError(null);
    try {
      await updateAdminUser(memberId, { role: newRole });
      startTransition(() => router.refresh());
    } catch {
      setError("Failed to update role");
      setLocalRoles((prev) => {
        const n = { ...prev };
        delete n[memberId];
        return n;
      });
    } finally {
      setSaving(null);
    }
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

  return (
    <>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title="Delete member"
        description={
          confirmDelete
            ? `Remove ${confirmDelete.name} from the workspace? Their tickets and comments will be preserved but marked as deactivated. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        successMessage={confirmDelete ? `${confirmDelete.name} has been removed` : undefined}
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete.id); }}
      />
      <ConfirmDialog
        open={!!confirmRemoveSubDepartment}
        onOpenChange={(open) => { if (!open) setConfirmRemoveSubDepartment(null); }}
        title="Remove from team"
        description={
          confirmRemoveSubDepartment
            ? `Remove ${confirmRemoveSubDepartment.name} from ${confirmRemoveSubDepartment.subDepartments[0] ?? "this team"}? They will remain in the workspace.`
            : ""
        }
        confirmLabel="Remove"
        successMessage={confirmRemoveSubDepartment ? `${confirmRemoveSubDepartment.name} removed from team` : undefined}
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
              : `Remove ${confirmRemoveDept.name} from ${confirmRemoveDept.department ?? "this department"}? They will lose access to all teams in this department.`
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

    {addMemberOpen && (
      <AddMemberModal
        departmentId={departmentId}
        availableSubDepartments={availableSubDepartments}
        isAdmin={isAdmin}
        isManager={isManager}
        onClose={() => setAddMemberOpen(false)}
      />
    )}
    {inviteOpen && departmentId && (
      <InviteByEmailModal
        deptId={departmentId}
        subDepartments={availableSubDepartments}
        onSent={() => {
          toast.success("Invitation sent");
          startTransition(() => router.refresh());
        }}
        onClose={() => setInviteOpen(false)}
      />
    )}
    {configMember && (
      <MemberConfigPanel
        member={configMember}
        onClose={() => setConfigMember(null)}
      />
    )}

    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="pen-text-admin-title">
            Members
          </h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
            Manage roles, teams, status, and availability for everyone in the workspace.
          </p>
        </div>
        {departmentId && (isAdmin || isManager) && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              disabled={availableSubDepartments.length === 0}
              title={availableSubDepartments.length === 0 ? "Create a team before inviting" : undefined}
              className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-pen-card-border bg-pen-surface px-3.5 font-sans text-[12.5px] font-medium text-pen-foreground hover:bg-pen-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              Invite by email
            </button>
            <button
              type="button"
              onClick={() => setAddMemberOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 rounded-[7px] bg-pen-blue px-3.5 font-sans text-[12.5px] font-medium text-white hover:opacity-90"
            >
              <Plus className="size-3.5" />
              Add member
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="font-sans text-[12px] text-red-500">{error}</p>
      )}

      <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
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
                <SectionLabel>Teams</SectionLabel>
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
            {liveMembers.length === 0 ? (
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableCell colSpan={(isAdmin || isManager) ? 6 : 4} className="py-0">
                  <div className="flex h-[54px] items-center">
                    <span className="font-sans text-[11.5px] text-pen-muted">
                      No members yet
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
            {liveMembers.map((member) => {
              const role = currentRole(member);
              return (
                <TableRow
                  key={member.id}
                  className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]"
                >
                  {/* Member */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center gap-2.5">
                      <MemberAvatar name={member.name} color={member.color} avatarUrl={member.avatarUrl} role={role} subDepartment={member.subDepartments?.[0]} userId={member.id} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                            {member.name}
                          </p>
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
                        <p className="truncate font-sans text-[11.5px] text-pen-subtle">
                          {member.location ? `${member.email} · ${member.location}` : member.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Role — editable for admin (all roles) and manager (lead/staff only); read-only for
                      lead and for guests (a cross-access grant doesn't carry role-management rights here) */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center">
                      {!member.isCrossAccess && (isAdmin || (isManager && (role === "lead" || role === "staff"))) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={saving === member.id}
                            className={cn(
                              "inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2.5 pr-2 font-sans text-[11.5px] font-medium outline-none transition-opacity disabled:opacity-60",
                              ROLE_COLORS[role] ?? "bg-pen-surface text-pen-subtle",
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
                                onClick={() => handleRoleChange(member.id, o.value)}
                                className={cn(
                                  "gap-2 font-sans text-[12px]",
                                  role === o.value && "font-semibold",
                                )}
                              >
                                <span
                                  className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                                    ROLE_COLORS[o.value] ?? "bg-pen-surface text-pen-subtle",
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
                            ROLE_COLORS[role] ?? "bg-pen-surface text-pen-subtle",
                          )}
                        >
                          {role}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Department */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center">
                      {member.department ? (
                        <span className="inline-flex items-center rounded-full bg-pen-blue-tint px-[7px] py-0.5 font-sans text-[11.5px] font-semibold text-pen-id">
                          {member.department}
                        </span>
                      ) : (
                        <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Teams — not editable for guests (their team belongs to another department)
                      or managers (they oversee the whole department, not a single team) */}
                  <TableCell className="py-0">
                    <div className="flex h-[54px] items-center gap-1 flex-wrap">
                      {(isAdmin || isManager) && availableSubDepartments.length > 0 && !member.isCrossAccess && role !== "manager" ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={saving === member.id}
                            className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface pl-2.5 pr-2 font-sans text-[11.5px] text-pen-muted outline-none transition-opacity disabled:opacity-60 hover:border-pen-blue/50 hover:text-pen-foreground"
                          >
                            <span className="max-w-[120px] truncate">
                              {availableSubDepartments.find((t) => t.id === currentSubDepartmentId(member))?.name ?? "No team"}
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
                              <span className="inline-flex rounded-full bg-pen-surface px-2 py-0.5 text-[11.5px] font-medium text-pen-subtle">
                                No team
                              </span>
                            </DropdownMenuItem>
                            {availableSubDepartments.map((t) => (
                              <DropdownMenuItem
                                key={t.id}
                                onClick={() => handleSubDepartmentChange(member.id, t.id)}
                                className={cn(
                                  "gap-2 font-sans text-[12px]",
                                  currentSubDepartmentId(member) === t.id && "font-semibold",
                                )}
                              >
                                <span className="inline-flex rounded-full bg-pen-blue/10 px-2 py-0.5 text-[11.5px] font-semibold text-pen-blue">
                                  {t.name}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : member.subDepartments.length === 0 ? (
                        <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
                      ) : (
                        member.subDepartments.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded-full bg-pen-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-pen-muted"
                          >
                            {t}
                          </span>
                        ))
                      )}
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
                          <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
                        )}
                      </div>
                    </TableCell>
                  )}

                  {/* Actions — admin + manager */}
                  {(isAdmin || isManager) && (
                    <TableCell className="py-0 pr-2 text-right">
                      <div className="flex h-[54px] items-center justify-end gap-0.5">
                        {!member.isCrossAccess && (
                          <button
                            type="button"
                            title="Configure availability"
                            onClick={() => setConfigMember(member)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
                          >
                            <Settings2 className="size-3.5" />
                          </button>
                        )}
                        {member.id !== currentUserId && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              type="button"
                              className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
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
                              {member.subDepartmentId && !member.isCrossAccess && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="gap-2 font-sans text-xs"
                                  onClick={() => setConfirmRemoveSubDepartment(member)}
                                >
                                  <Trash2 className="size-3.5" />
                                  Remove from team
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
                              {isAdmin && !member.isCrossAccess && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="gap-2 font-sans text-xs"
                                  onClick={() => setConfirmDelete(member)}
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete from workspace
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
          </TableBody>
        </Table>
      </div>
    </div>
    </>
  );
}
