"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DepartmentIconVisual } from "@/components/icons/department-icon-visual";
import {
  Users,
  Shield,
  FolderKanban,
  Plus,
  X,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  UserPickerDropdown,
  GrantAccessModal,
  ProjectAccessPicker,
  type UserOption,
  type AccessGrant,
} from "@/components/settings/settings-departments-page";
import {
  MemberConfigPanel,
  type MemberConfigTarget,
} from "@/components/settings/member-config-panel";
import {
  assignDepartmentManager,
  removeDepartmentManager,
  addDepartmentMember,
  removeDepartmentDirectMember,
  removeDepartmentMember,
  grantDepartmentAccess,
  revokeDepartmentAccess,
  fetchDepartmentAccessGrant,
  updateDepartmentAccess,
  updateAdminUser,
  revokeDepartmentInvite,
  type DepartmentInviteRow,
} from "@/lib/api/admin";
import { InviteByEmailModal } from "@/components/invites/invite-by-email-modal";

// ── Types ────────────────────────────────────────────────────────────────────

type ManagerRow = { id: string; userId: string; name: string; email: string; avatarUrl: string | null; color: string; location?: string | null; timezone?: string | null; subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[] };

type MemberRow = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  color: string;
  role: string;
  subDepartmentNames: string[];
  subDepartmentId: string | null;
  source: "native" | "direct";
  location?: string | null;
  timezone?: string | null;
  subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[];
};

export type DepartmentDetailData = {
  id: string;
  name: string;
  isHub: boolean;
  subDepartmentCount: number;
  projectCount: number;
  memberCount: number;
  isAdmin: boolean;
  availableSubDepartments: { id: string; name: string }[];
  allUsers: UserOption[];
  managers: ManagerRow[];
  members: MemberRow[];
  accessGrants: AccessGrant[];
  pendingInvites: DepartmentInviteRow[];
};

const ROLE_OPTIONS_ADMIN = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sub_manager", label: "Sub-manager" },
  { value: "agent", label: "Agent" },
];
const ROLE_OPTIONS_MANAGER = [
  { value: "sub_manager", label: "Sub-manager" },
  { value: "agent", label: "Agent" },
];
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-pen-blue/10 text-pen-blue",
  manager: "bg-pen-purple/10 text-pen-purple",
  sub_manager: "bg-pen-green/10 text-pen-green",
  agent: "bg-pen-surface text-pen-subtle",
};

// ── Edit Access Modal ────────────────────────────────────────────────────────

function EditAccessModal({
  deptId,
  deptName,
  grant,
  onSaved,
  onClose,
}: {
  deptId: string;
  deptName: string;
  grant: AccessGrant;
  onSaved: (updated: AccessGrant) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permanent, setPermanent] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [fullAccess, setFullAccess] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchDepartmentAccessGrant(deptId, grant.userId)
      .then((data) => {
        setFullAccess(data.fullAccess);
        setPermanent(!data.expiresAt);
        setExpiresAt(data.expiresAt ? data.expiresAt.slice(0, 10) : "");
        setReason(data.reason ?? "");
        setSelectedProjectIds(new Set(data.projectIds));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const canSubmit = fullAccess || selectedProjectIds.size > 0;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const updated = await updateDepartmentAccess(deptId, grant.userId, {
        expiresAt: permanent ? undefined : expiresAt || undefined,
        reason: reason || undefined,
        fullAccess,
        projectIds: [...selectedProjectIds],
      });
      onSaved(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
          <p className="font-sans text-[14px] font-semibold text-pen-foreground">Edit access — {grant.user.name}</p>
          <button type="button" onClick={onClose}><X className="size-4 text-pen-muted" /></button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-pen-subtle" />
          </div>
        ) : (
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
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
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id"
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-pen-card-border px-5 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-pen-card-border px-4 font-sans text-[12.5px] text-pen-muted hover:bg-pen-surface">Cancel</button>
          <button type="button" disabled={!canSubmit || saving || loading} onClick={submit} className="h-8 rounded-lg bg-pen-blue px-4 font-sans text-[12.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Section shell ────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  count,
  action,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-pen-muted" />
        <h2 className="font-sans text-[15px] font-semibold text-pen-foreground">
          {title} <span className="font-normal text-pen-subtle">({count})</span>
        </h2>
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-muted uppercase">
      {children}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DepartmentDetailPage({ data }: { data: DepartmentDetailData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [managers, setManagers] = useState<ManagerRow[]>(data.managers);
  const [members, setMembers] = useState<MemberRow[]>(data.members);
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>(data.accessGrants);
  const [pendingInvites, setPendingInvites] = useState<DepartmentInviteRow[]>(data.pendingInvites);
  const [localRoles, setLocalRoles] = useState<Record<string, string>>({});
  const [localSubDepartmentIds, setLocalSubDepartmentIds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingGrant, setEditingGrant] = useState<AccessGrant | null>(null);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<MemberRow | null>(null);
  const [configMember, setConfigMember] = useState<MemberConfigTarget | null>(null);

  useEffect(() => {
    setPendingInvites(data.pendingInvites);
  }, [data.pendingInvites]);

  useEffect(() => {
    setMembers(data.members);
    setManagers(data.managers);
  }, [data.members, data.managers]);

  function toConfigTarget(m: {
    userId: string;
    name: string;
    email: string;
    location?: string | null;
    timezone?: string | null;
    subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[];
  }): MemberConfigTarget {
    return {
      id: m.userId,
      name: m.name,
      email: m.email,
      location: m.location ?? null,
      timezone: m.timezone ?? null,
      subDepartmentMemberships: m.subDepartmentMemberships ?? [],
    };
  }
  function refresh() {
    startTransition(() => router.refresh());
  }

  const managerIds = managers.map((m) => m.userId);
  const memberIds = members.map((m) => m.userId);
  const accessIds = accessGrants.map((g) => g.userId);

  // Manager candidates: only people already connected to this department — native
  // members or cross-access guests — not the whole organization.
  const managerCandidates: UserOption[] = [
    ...members.map((m) => ({ id: m.userId, name: m.name, email: m.email, role: m.role, avatarUrl: m.avatarUrl })),
    ...accessGrants.map((g) => g.user),
  ].filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i);

  async function assignManager(u: UserOption) {
    const created = await assignDepartmentManager(data.id, u.id).catch(() => null);
    if (created) {
      setManagers((prev) => [...prev.filter((m) => m.userId !== u.id), {
        id: created.id, userId: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? null, color: "",
      }]);
      setMembers((prev) => prev.filter((m) => m.userId !== u.id));
      refresh();
    }
  }

  async function removeManager(userId: string) {
    await removeDepartmentManager(data.id, userId).catch(() => null);
    setManagers((prev) => prev.filter((m) => m.userId !== userId));
    refresh();
  }

  async function addMember(u: UserOption) {
    const created = await addDepartmentMember(data.id, u.id).catch(() => null);
    if (created) {
      setMembers((prev) => [...prev.filter((m) => m.userId !== u.id), {
        userId: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? null, color: "",
        role: u.role, subDepartmentNames: [], subDepartmentId: null, source: "direct",
      }]);
      refresh();
    }
  }

  async function removeMember(member: MemberRow) {
    if (member.source === "native") {
      await removeDepartmentMember(data.id, member.userId).catch(() => null);
    } else {
      await removeDepartmentDirectMember(data.id, member.userId).catch(() => null);
    }
    setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    refresh();
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    setLocalRoles((prev) => ({ ...prev, [memberId]: newRole }));
    setSaving(memberId);
    try {
      await updateAdminUser(memberId, { role: newRole });
      refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleSubDepartmentChange(memberId: string, newSubDepartmentId: string) {
    setLocalSubDepartmentIds((prev) => ({ ...prev, [memberId]: newSubDepartmentId }));
    setSaving(memberId);
    try {
      await updateAdminUser(memberId, { subDepartmentId: newSubDepartmentId });
      refresh();
    } finally {
      setSaving(null);
    }
  }

  async function grantAccess(userId: string, expiresAt: string, reason: string, fullAccess: boolean, projectIds: string[]) {
    const created = await grantDepartmentAccess(data.id, {
      userId, expiresAt: expiresAt || undefined, reason: reason || undefined, fullAccess, projectIds,
    }).catch(() => null);
    if (created) setAccessGrants((prev) => [...prev.filter((g) => g.userId !== userId), created]);
  }

  async function revokeAccess(userId: string) {
    await revokeDepartmentAccess(data.id, userId).catch(() => null);
    setAccessGrants((prev) => prev.filter((g) => g.userId !== userId));
  }

  function currentRole(m: MemberRow) {
    return localRoles[m.userId] ?? m.role;
  }
  function currentSubDepartmentId(m: MemberRow) {
    return localSubDepartmentIds[m.userId] ?? m.subDepartmentId ?? "";
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 py-8 sm:px-10 lg:px-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-pen-blue/10">
          <DepartmentIconVisual
            name={data.name}
            id={data.id}
            isHub={data.isHub}
            size="lg"
            className="text-pen-blue"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="pen-text-admin-title">{data.name}</h1>
            {data.isHub && (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                Hub
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 font-sans text-[12.5px] text-pen-muted">
              <Users className="size-3.5 shrink-0" /> {data.subDepartmentCount} team{data.subDepartmentCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 font-sans text-[12.5px] text-pen-muted">
              <FolderKanban className="size-3.5 shrink-0" /> {data.projectCount} project{data.projectCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 font-sans text-[12.5px] text-pen-muted">
              <Users className="size-3.5 shrink-0" /> {data.memberCount} member{data.memberCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Managers */}
      <Section
        icon={Shield}
        title="Managers"
        count={managers.length}
        action={<UserPickerDropdown label="Assign manager" users={managerCandidates} excludeIds={managerIds} onSelect={assignManager} />}
      >
        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[480px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[45%]"><SectionLabel>Name</SectionLabel></TableHead>
                <TableHead className="h-8"><SectionLabel>Email</SectionLabel></TableHead>
                <TableHead className="h-8 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {managers.length === 0 ? (
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableCell colSpan={3} className="py-0">
                    <div className="flex h-[54px] items-center">
                      <span className="font-sans text-[11.5px] text-pen-muted">No managers assigned yet</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                managers.map((m) => (
                  <TableRow key={m.id} className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]">
                    <TableCell className="py-0">
                      <div className="flex h-[54px] items-center gap-2.5">
                        <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.userId} size={28} />
                        <span className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className="font-sans text-[11.5px] text-pen-subtle">{m.email}</span>
                    </TableCell>
                    <TableCell className="py-0 text-right">
                      <div className="flex h-[54px] items-center justify-end gap-0.5">
                        <button
                          type="button"
                          title="Configure availability"
                          onClick={() => setConfigMember(toConfigTarget(m))}
                          className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
                        >
                          <Settings2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeManager(m.userId)}
                          title="Remove manager"
                          className="rounded-md border border-pen-card-border p-1.5 text-pen-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* Members */}
      <Section
        icon={Users}
        title="Members"
        count={members.length}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              disabled={data.availableSubDepartments.length === 0}
              title={data.availableSubDepartments.length === 0 ? "Create a team before inviting" : undefined}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-pen-card-border px-3 font-sans text-[11.5px] font-medium text-pen-muted hover:border-pen-blue/40 hover:text-pen-blue transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3" /> Invite by email
            </button>
            <UserPickerDropdown label="Add member" users={data.allUsers} excludeIds={[...managerIds, ...memberIds]} onSelect={addMember} />
          </div>
        }
      >
        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[30%]"><SectionLabel>Name</SectionLabel></TableHead>
                <TableHead className="h-8 w-[22%]"><SectionLabel>Email</SectionLabel></TableHead>
                <TableHead className="h-8 w-[16%]"><SectionLabel>Role</SectionLabel></TableHead>
                <TableHead className="h-8"><SectionLabel>Team</SectionLabel></TableHead>
                <TableHead className="h-8 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableCell colSpan={5} className="py-0">
                    <div className="flex h-[54px] items-center">
                      <span className="font-sans text-[11.5px] text-pen-muted">No members yet</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => {
                  const role = currentRole(m);
                  const subDepartmentId = currentSubDepartmentId(m);
                  return (
                    <TableRow key={m.userId} className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]">
                      <TableCell className="py-0">
                        <div className="flex h-[54px] items-center gap-2.5">
                          <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.userId} size={28} />
                          <span className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">{m.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <span className="font-sans text-[11.5px] text-pen-muted">{m.email}</span>
                      </TableCell>
                      <TableCell className="py-0">
                        <RoleDropdown
                          role={role}
                          options={data.isAdmin ? ROLE_OPTIONS_ADMIN : ROLE_OPTIONS_MANAGER}
                          saving={saving === m.userId}
                          onChange={(v) => handleRoleChange(m.userId, v)}
                        />
                      </TableCell>
                      <TableCell className="py-0">
                        <SubDepartmentDropdown
                          subDepartmentId={subDepartmentId}
                          subDepartments={data.availableSubDepartments}
                          saving={saving === m.userId}
                          onChange={(v) => handleSubDepartmentChange(m.userId, v)}
                        />
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <div className="flex h-[54px] items-center justify-end gap-0.5">
                          <button
                            type="button"
                            title="Configure availability"
                            onClick={() => setConfigMember(toConfigTarget(m))}
                            className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
                          >
                            <Settings2 className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveMember(m)}
                            title="Remove from department"
                            className="rounded-md border border-pen-card-border p-1.5 text-pen-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <Section icon={Clock} title="Pending invites" count={pendingInvites.length}>
          <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableHead className="h-8 w-[28%]"><SectionLabel>Email</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[16%]"><SectionLabel>Team</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[12%]"><SectionLabel>Role</SectionLabel></TableHead>
                  <TableHead className="h-8"><SectionLabel>Expires</SectionLabel></TableHead>
                  <TableHead className="h-8 w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((inv) => (
                  <TableRow key={inv.id} className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]">
                    <TableCell className="py-0">
                      <div className="flex h-[54px] flex-col justify-center">
                        <span className="font-sans text-[12.5px] font-semibold text-pen-foreground">{inv.email}</span>
                        <span className="font-sans text-[11px] text-pen-subtle">Invited by {inv.inviter.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className="font-sans text-[11.5px] text-pen-muted">{inv.subDepartment.name}</span>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 font-sans text-[11px] font-medium capitalize", ROLE_COLORS[inv.role] ?? ROLE_COLORS.staff)}>
                        {inv.role}
                      </span>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className="font-sans text-[11.5px] text-pen-muted">
                        {new Date(inv.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </TableCell>
                    <TableCell className="py-0 text-right">
                      <button
                        type="button"
                        title="Revoke invite"
                        onClick={async () => {
                          await revokeDepartmentInvite(data.id, inv.id).catch(() => null);
                          setPendingInvites((prev) => prev.filter((p) => p.id !== inv.id));
                        }}
                        className="rounded-md border border-pen-card-border p-1.5 text-pen-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <X className="size-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}

      {/* Cross-department access */}
      <Section
        icon={Users}
        title="Cross-department access"
        count={accessGrants.length}
        action={
          <button
            type="button"
            onClick={() => setShowGrantModal(true)}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-pen-card-border px-3 font-sans text-[11.5px] font-medium text-pen-muted hover:border-pen-blue/40 hover:text-pen-blue transition-colors"
          >
            <Plus className="size-3" /> Grant access
          </button>
        }
      >
        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[26%]"><SectionLabel>Name</SectionLabel></TableHead>
                <TableHead className="h-8 w-[20%]"><SectionLabel>Email</SectionLabel></TableHead>
                <TableHead className="h-8 w-[13%]"><SectionLabel>Access</SectionLabel></TableHead>
                <TableHead className="h-8 w-[13%]"><SectionLabel>Status</SectionLabel></TableHead>
                <TableHead className="h-8"><SectionLabel>Reason</SectionLabel></TableHead>
                <TableHead className="h-8 w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessGrants.length === 0 ? (
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableCell colSpan={6} className="py-0">
                    <div className="flex h-[54px] items-center">
                      <span className="font-sans text-[11.5px] text-pen-muted">No cross-department access grants</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                accessGrants.map((g) => {
                  const expired = !!g.expiresAt && new Date(g.expiresAt) < new Date();
                  return (
                    <TableRow key={g.id} className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]">
                      <TableCell className="py-0">
                        <div className="flex h-[54px] items-center gap-2.5">
                          <UserAvatar name={g.user.name} avatarUrl={g.user.avatarUrl ?? null} size={28} />
                          <span className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">{g.user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <span className="font-sans text-[11.5px] text-pen-muted">{g.user.email}</span>
                      </TableCell>
                      <TableCell className="py-0">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium",
                            g.fullAccess ? "bg-pen-blue/10 text-pen-blue" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                          )}
                        >
                          {g.fullAccess ? "Full access" : "Limited"}
                        </span>
                      </TableCell>
                      <TableCell className="py-0">
                        {expired ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 font-sans text-[11.5px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">Expired</span>
                        ) : (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-sans text-[11.5px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <Clock className="size-2.5" /> Active
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-0">
                        <span className="block max-w-[160px] truncate font-sans text-[11.5px] text-pen-muted">{g.reason ?? "No reason"}</span>
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingGrant(g)} title="Edit access" className="font-sans text-[11.5px] font-medium text-pen-id hover:underline">
                            Edit
                          </button>
                          <button type="button" onClick={() => revokeAccess(g.userId)} title="Revoke access" className="rounded-md border border-pen-card-border p-1.5 text-pen-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Section>

      {showGrantModal && (
        <GrantAccessModal
          deptId={data.id}
          deptName={data.name}
          users={data.allUsers}
          excludeIds={[...new Set([...managerIds, ...memberIds, ...accessIds])]}
          onGrant={grantAccess}
          onClose={() => setShowGrantModal(false)}
        />
      )}

      {showInviteModal && (
        <InviteByEmailModal
          deptId={data.id}
          subDepartments={data.availableSubDepartments}
          onSent={(invite) => {
            setPendingInvites((prev) => [invite, ...prev.filter((p) => p.id !== invite.id)]);
          }}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {editingGrant && (
        <EditAccessModal
          deptId={data.id}
          deptName={data.name}
          grant={editingGrant}
          onSaved={(updated) => setAccessGrants((prev) => prev.map((g) => (g.userId === updated.userId ? updated : g)))}
          onClose={() => setEditingGrant(null)}
        />
      )}

      {configMember && (
        <MemberConfigPanel
          member={configMember}
          onClose={() => setConfigMember(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmRemoveMember}
        onOpenChange={(open) => { if (!open) setConfirmRemoveMember(null); }}
        title="Remove from department"
        description={
          confirmRemoveMember
            ? `Remove ${confirmRemoveMember.name} from ${data.name}? They will lose access to all teams in this department.`
            : ""
        }
        confirmLabel="Remove"
        successMessage={confirmRemoveMember ? `${confirmRemoveMember.name} removed from department` : undefined}
        onConfirm={async () => { if (confirmRemoveMember) await removeMember(confirmRemoveMember); }}
      />
    </div>
  );
}

// ── Small dropdown helpers ───────────────────────────────────────────────────

function RoleDropdown({
  role,
  options,
  saving,
  onChange,
}: {
  role: string;
  options: { value: string; label: string }[];
  saving: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={saving}
        className={cn(
          "inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2.5 pr-2 font-sans text-[11.5px] font-medium capitalize outline-none transition-opacity disabled:opacity-60",
          ROLE_COLORS[role] ?? "bg-pen-surface text-pen-subtle",
        )}
      >
        {role}
        {saving ? <Loader2 className="size-3 animate-spin opacity-70" /> : <ChevronDown className="size-3 opacity-60" />}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-auto min-w-[110px] gap-0 rounded-lg border border-pen-card-border bg-pen-bg p-1 shadow-lg"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { onChange(o.value); setOpen(false); }}
            className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-pen-surface", role === o.value && "font-semibold")}
          >
            <span className={cn("inline-flex rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium", ROLE_COLORS[o.value] ?? "bg-pen-surface text-pen-subtle")}>
              {o.label}
            </span>
            {role === o.value && <Check className="ml-auto size-3 text-pen-id" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function SubDepartmentDropdown({
  subDepartmentId,
  subDepartments,
  saving,
  onChange,
}: {
  subDepartmentId: string;
  subDepartments: { id: string; name: string }[];
  saving: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = subDepartments.find((t) => t.id === subDepartmentId)?.name ?? "No team";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={saving}
        className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface pl-2.5 pr-2 font-sans text-[11.5px] text-pen-muted outline-none transition-opacity disabled:opacity-60 hover:border-pen-blue/50 hover:text-pen-foreground"
      >
        <span className="max-w-[120px] truncate">{current}</span>
        {saving ? <Loader2 className="size-3 animate-spin opacity-70" /> : <ChevronDown className="size-3 opacity-60" />}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-auto min-w-[150px] gap-0 rounded-lg border border-pen-card-border bg-pen-bg p-1 shadow-lg"
      >
        <button
          type="button"
          onClick={() => { onChange(""); setOpen(false); }}
          className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-pen-surface", !subDepartmentId && "font-semibold")}
        >
          <span className="inline-flex rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] font-medium text-pen-subtle">No team</span>
        </button>
        {subDepartments.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { onChange(t.id); setOpen(false); }}
            className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-pen-surface", subDepartmentId === t.id && "font-semibold")}
          >
            <span className="inline-flex rounded-full bg-pen-blue/10 px-2 py-0.5 font-sans text-[11.5px] font-semibold text-pen-blue">{t.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
