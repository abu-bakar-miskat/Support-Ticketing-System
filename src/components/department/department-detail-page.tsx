"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DepartmentIconVisual } from "@/components/icons/department-icon-visual";
import {
  Users,
  UserPlus,
  Shield,
  FolderKanban,
  Plus,
  X,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Settings2,
  Activity,
  BanIcon,
} from "lucide-react";
import { toast } from "sonner";
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
  removeDepartmentMember,
  grantDepartmentAccess,
  revokeDepartmentAccess,
  fetchDepartmentAccessGrant,
  updateDepartmentAccess,
  updateAdminUser,
  addAdminSubDepartmentMember,
  removeAdminSubDepartmentMember,
  revokeDepartmentInvite,
  type DepartmentInviteRow,
} from "@/lib/api/admin";
import { InviteByEmailModal } from "@/components/invites/invite-by-email-modal";
import { DepartmentFeaturesPanel } from "@/components/settings/department-features-panel";
import { AddMemberModal } from "@/components/settings/settings-members-page";

// ── Types ────────────────────────────────────────────────────────────────────

type DeptRole = "admin" | "manager";
type ManagerRow = { id: string; userId: string; name: string; email: string; avatarUrl: string | null; color: string; deptRole?: DeptRole; location?: string | null; timezone?: string | null; subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[] };

type MemberRow = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  color: string;
  role: string;
  subDepartmentNames: string[];
  subDepartmentId: string | null;
  source: "native";
  location?: string | null;
  timezone?: string | null;
  isActive?: boolean;
  subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[];
};

export type JoinRequestRow = {
  id: string;
  /** "sub" = wants a specific sub-department (joins as agent); "dept" = department-level. */
  kind: "sub" | "dept";
  /** Sub-department id (kind "sub") or department id (kind "dept"). */
  targetId: string;
  targetName: string;
  message: string | null;
  requestedAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
};

export type DepartmentDetailData = {
  id: string;
  name: string;
  isHub: boolean;
  subDepartmentCount: number;
  projectCount: number;
  memberCount: number;
  managerCount: number;
  isAdmin: boolean;
  canGrantAdmin: boolean;
  /** Super Admin — may grant/revoke this department's features. */
  canControlFeatures: boolean;
  availableSubDepartments: { id: string; name: string }[];
  allUsers: UserOption[];
  managers: ManagerRow[];
  members: MemberRow[];
  accessGrants: AccessGrant[];
  pendingInvites: DepartmentInviteRow[];
  joinRequests: JoinRequestRow[];
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
  admin: "bg-sts-blue/10 text-sts-blue",
  manager: "bg-sts-purple/10 text-sts-purple",
  sub_manager: "bg-sts-green/10 text-sts-green",
  agent: "bg-sts-surface text-sts-subtle",
};

// Department-scoped Admin vs Manager control (role-hierarchy.md). Editable only
// for a tenant admin / department Admin (canEdit); otherwise a static badge. An
// Admin holds admin-only settings power for this department; a Manager is
// operational only.
function DeptRoleToggle({
  role,
  canEdit,
  onChange,
}: {
  role: DeptRole;
  canEdit: boolean;
  onChange: (role: DeptRole) => void;
}) {
  if (!canEdit) {
    return (
      <span
        className={cn(
          "inline-flex rounded-md px-2 py-0.5 font-sans text-[11px] font-medium capitalize",
          ROLE_COLORS[role] ?? ROLE_COLORS.manager,
        )}
      >
        {role}
      </span>
    );
  }
  return (
    <div className="inline-flex rounded-md border border-sts-card-border p-0.5">
      {(["manager", "admin"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded px-2 py-0.5 font-sans text-[11px] font-medium capitalize transition-colors",
            role === opt
              ? "bg-sts-id text-white"
              : "text-sts-muted hover:text-sts-foreground",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
          <p className="font-sans text-[14px] font-semibold text-sts-foreground">Edit access — {grant.user.name}</p>
          <button type="button" onClick={onClose}><X className="size-4 text-sts-muted" /></button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-sts-subtle" />
          </div>
        ) : (
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
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
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-id"
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-sts-card-border px-5 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-sts-card-border px-4 font-sans text-[12.5px] text-sts-muted hover:bg-sts-surface">Cancel</button>
          <button type="button" disabled={!canSubmit || saving || loading} onClick={submit} className="h-8 rounded-lg bg-sts-blue px-4 font-sans text-[12.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50">
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
        <Icon className="size-4 text-sts-muted" />
        <h2 className="font-sans text-[15px] font-semibold text-sts-foreground">
          {title} <span className="font-normal text-sts-subtle">({count})</span>
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
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-muted uppercase">
      {children}
    </span>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DepartmentDetailPage({ data }: { data: DepartmentDetailData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [managers, setManagers] = useState<ManagerRow[]>(data.managers);
  const [members, setMembers] = useState<MemberRow[]>(data.members);
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>(data.accessGrants);
  const [pendingInvites, setPendingInvites] = useState<DepartmentInviteRow[]>(data.pendingInvites);
  // Requests resolved in this session are hidden immediately; a router.refresh()
  // then drops them from `data.joinRequests` too. Deriving avoids mirroring props
  // into state via an effect.
  const [resolvedReqIds, setResolvedReqIds] = useState<Set<string>>(new Set());
  const joinRequests = data.joinRequests.filter((r) => !resolvedReqIds.has(r.id));
  // For a department-level request, the approver must choose which sub-department
  // (team) to place the new agent into. Keyed by request id; defaults to the first.
  const [joinReqTeam, setJoinReqTeam] = useState<Record<string, string>>({});
  const [processingReq, setProcessingReq] = useState<string | null>(null);
  const [localRoles, setLocalRoles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [editingGrant, setEditingGrant] = useState<AccessGrant | null>(null);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<MemberRow | null>(null);
  const [configMember, setConfigMember] = useState<MemberConfigTarget | null>(null);

  useEffect(() => {
    setPendingInvites(data.pendingInvites);
  }, [data.pendingInvites]);

  async function resolveJoinRequest(reqRow: JoinRequestRow, action: "approve" | "reject") {
    // A team request approves directly (agent) via the sub-department endpoint; a
    // department-level request needs a chosen team, routed via the department endpoint.
    let url: string;
    let body: Record<string, unknown>;
    if (reqRow.kind === "sub") {
      url = `/api/sub-departments/${reqRow.targetId}/join-requests/${reqRow.id}`;
      body = { action };
    } else {
      const teamId = joinReqTeam[reqRow.id] ?? data.availableSubDepartments[0]?.id;
      if (action === "approve" && !teamId) {
        toast.error("Add a sub-department first — a new member joins a team as an agent.");
        return;
      }
      url = `/api/departments/${data.id}/join-requests/${reqRow.id}`;
      body = action === "approve" ? { action, subDepartmentId: teamId, role: "agent" } : { action };
    }

    setProcessingReq(reqRow.id);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg =
          res.status === 403
            ? "You don't have permission to resolve this request."
            : "Couldn't update the request. Please try again.";
        toast.error(msg);
        return;
      }
      setResolvedReqIds((prev) => new Set(prev).add(reqRow.id));
      toast.success(
        action === "approve"
          ? `${reqRow.user.name} added to ${reqRow.targetName}.`
          : `Request from ${reqRow.user.name} declined.`,
      );
      startTransition(() => router.refresh());
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setProcessingReq(null);
    }
  }

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
        id: created.id, userId: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? null, color: "", deptRole: "manager",
      }]);
      setMembers((prev) => prev.filter((m) => m.userId !== u.id));
      refresh();
    }
  }

  async function setManagerRole(userId: string, role: DeptRole) {
    // Optimistic; revert on failure (e.g. a manager forbidden from granting admin).
    const prevRole = managers.find((m) => m.userId === userId)?.deptRole ?? "manager";
    if (prevRole === role) return;
    setManagers((prev) => prev.map((m) => (m.userId === userId ? { ...m, deptRole: role } : m)));
    try {
      await assignDepartmentManager(data.id, userId, role);
      refresh();
    } catch {
      setManagers((prev) => prev.map((m) => (m.userId === userId ? { ...m, deptRole: prevRole } : m)));
    }
  }

  async function removeManager(userId: string) {
    await removeDepartmentManager(data.id, userId).catch(() => null);
    setManagers((prev) => prev.filter((m) => m.userId !== userId));
    refresh();
  }

  async function removeMember(member: MemberRow) {
    await removeDepartmentMember(data.id, member.userId).catch(() => null);
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

  async function handleAddToSubDepartment(member: MemberRow, subDepartmentId: string) {
    setSaving(member.userId);
    try {
      await addAdminSubDepartmentMember(subDepartmentId, member.userId, currentRole(member));
      refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleRemoveMembership(member: MemberRow, subDepartmentId: string) {
    setSaving(member.userId);
    try {
      await removeAdminSubDepartmentMember(subDepartmentId, member.userId);
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === member.userId
            ? { ...m, subDepartmentMemberships: m.subDepartmentMemberships?.filter((s) => s.subDepartmentId !== subDepartmentId) }
            : m,
        ),
      );
      refresh();
    } finally {
      setSaving(null);
    }
  }

  async function handleToggleActive(member: MemberRow) {
    const next = !(member.isActive ?? true);
    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, isActive: next } : m)));
    try {
      await fetch(`/api/admin/users/${member.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      refresh();
    } catch {
      // Revert on failure
      setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, isActive: !next } : m)));
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

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 py-8 sm:px-10 lg:px-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sts-blue/10">
          <DepartmentIconVisual
            name={data.name}
            id={data.id}
            isHub={data.isHub}
            size="lg"
            className="text-sts-blue"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="sts-text-admin-title">{data.name}</h1>
            {data.isHub && (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                Hub
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 font-sans text-[12.5px] text-sts-muted">
              <Users className="size-3.5 shrink-0" /> {data.subDepartmentCount} sub-department{data.subDepartmentCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 font-sans text-[12.5px] text-sts-muted">
              <FolderKanban className="size-3.5 shrink-0" /> {data.projectCount} project{data.projectCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 font-sans text-[12.5px] text-sts-muted">
              <Shield className="size-3.5 shrink-0" /> {data.managerCount} manager{data.managerCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 font-sans text-[12.5px] text-sts-muted">
              <Users className="size-3.5 shrink-0" /> {data.memberCount} member{data.memberCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <Link
          href="/department/activity"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sts-card-border bg-sts-card px-3 py-1.5 font-sans text-[12.5px] font-medium text-sts-foreground transition-colors hover:bg-sts-bg"
        >
          <Activity className="size-3.5 shrink-0" /> Activity
        </Link>
      </div>

      {/* Join requests */}
      {joinRequests.length > 0 && (
        <Section icon={UserPlus} title="Join requests" count={joinRequests.length}>
          <div className="overflow-hidden rounded-[6px] border border-sts-accent/30 bg-sts-accent/[0.04] px-[22px] pt-4 pb-2">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableHead className="h-8 w-[34%]"><SectionLabel>Name</SectionLabel></TableHead>
                  <TableHead className="h-8"><SectionLabel>Wants to join</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[14%]"><SectionLabel>Requested</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[170px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {joinRequests.map((r) => {
                  const processing = processingReq === r.id;
                  const noTeams = r.kind === "dept" && data.availableSubDepartments.length === 0;
                  return (
                    <TableRow key={r.id} className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                      <TableCell className="py-0">
                        <div className="flex h-[58px] items-center gap-2.5">
                          <UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} userId={r.user.id} size={28} />
                          <div className="min-w-0">
                            <div className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">{r.user.name}</div>
                            <div className="truncate font-sans text-[11px] text-sts-subtle">{r.user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        {r.kind === "sub" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-sts-accent/10 px-2 py-[3px] font-sans text-[11.5px] font-medium text-sts-accent">
                            <Users className="size-3" /> {r.targetName}
                          </span>
                        ) : noTeams ? (
                          <span className="font-sans text-[11.5px] text-sts-muted">Add a sub-department first</span>
                        ) : (
                          <select
                            value={joinReqTeam[r.id] ?? data.availableSubDepartments[0]?.id ?? ""}
                            onChange={(e) => setJoinReqTeam((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="max-w-[200px] rounded-md border border-sts-card-border bg-sts-card px-2 py-1 font-sans text-[11.5px] text-sts-foreground focus-visible:border-sts-accent/50 focus-visible:outline-none"
                          >
                            {data.availableSubDepartments.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        )}
                      </TableCell>
                      <TableCell className="py-0">
                        <span className="font-sans text-[11.5px] text-sts-subtle">{timeAgo(r.requestedAt)}</span>
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <div className="flex h-[58px] items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => resolveJoinRequest(r, "reject")}
                            disabled={processing}
                            className="inline-flex items-center gap-1 rounded-md border border-sts-card-border px-2.5 py-1.5 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-60 dark:hover:bg-red-900/20"
                          >
                            <X className="size-3" /> Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveJoinRequest(r, "approve")}
                            disabled={processing || noTeams}
                            className="inline-flex items-center gap-1 rounded-md bg-sts-button px-2.5 py-1.5 font-sans text-[11.5px] font-semibold text-sts-button-fg transition-colors hover:bg-sts-button/90 disabled:opacity-60"
                          >
                            {processing ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Approve
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}

      {/* Managers */}
      <Section
        icon={Shield}
        title="Managers"
        count={managers.length}
        action={<UserPickerDropdown label="Assign manager" users={managerCandidates} excludeIds={managerIds} onSelect={assignManager} />}
      >
        <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[480px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[45%]"><SectionLabel>Name</SectionLabel></TableHead>
                <TableHead className="h-8"><SectionLabel>Email</SectionLabel></TableHead>
                <TableHead className="h-8"><SectionLabel>Role</SectionLabel></TableHead>
                <TableHead className="h-8 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {managers.length === 0 ? (
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableCell colSpan={4} className="py-0">
                    <div className="flex h-[54px] items-center">
                      <span className="font-sans text-[11.5px] text-sts-muted">No managers assigned yet</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                managers.map((m) => (
                  <TableRow key={m.id} className="border-[#f0f4f8] hover:bg-sts-bg/40 dark:border-[#3a3a37]">
                    <TableCell className="py-0">
                      <div className="flex h-[54px] items-center gap-2.5">
                        <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.userId} size={28} />
                        <span className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className="font-sans text-[11.5px] text-sts-subtle">{m.email}</span>
                    </TableCell>
                    <TableCell className="py-0">
                      <DeptRoleToggle
                        role={m.deptRole ?? "manager"}
                        canEdit={data.canGrantAdmin}
                        onChange={(r) => setManagerRole(m.userId, r)}
                      />
                    </TableCell>
                    <TableCell className="py-0 text-right">
                      <div className="flex h-[54px] items-center justify-end gap-0.5">
                        <button
                          type="button"
                          title="Configure availability"
                          onClick={() => setConfigMember(toConfigTarget(m))}
                          className="inline-flex size-7 items-center justify-center rounded-md text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground"
                        >
                          <Settings2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeManager(m.userId)}
                          title="Remove manager"
                          className="rounded-md border border-sts-card-border p-1.5 text-sts-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
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

      {/* Sub-department members — no department-wide membership */}
      <Section
        icon={Users}
        title="Sub-department members"
        count={members.length}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddMemberModal(true)}
              disabled={data.availableSubDepartments.length === 0}
              title={data.availableSubDepartments.length === 0 ? "Create a sub-department before adding members" : undefined}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-sts-card-border px-3 font-sans text-[11.5px] font-medium text-sts-muted hover:border-sts-blue/40 hover:text-sts-blue transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UserPlus className="size-3" /> Add member
            </button>
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              disabled={data.availableSubDepartments.length === 0}
              title={data.availableSubDepartments.length === 0 ? "Create a sub-department before inviting" : undefined}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-sts-card-border px-3 font-sans text-[11.5px] font-medium text-sts-muted hover:border-sts-blue/40 hover:text-sts-blue transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3" /> Invite to sub-department
            </button>
          </div>
        }
      >
        <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[26%]"><SectionLabel>Name</SectionLabel></TableHead>
                <TableHead className="h-8 w-[20%]"><SectionLabel>Email</SectionLabel></TableHead>
                <TableHead className="h-8 w-[14%]"><SectionLabel>Role</SectionLabel></TableHead>
                <TableHead className="h-8"><SectionLabel>SubDepartments</SectionLabel></TableHead>
                <TableHead className="h-8 w-[100px]"><SectionLabel>Status</SectionLabel></TableHead>
                <TableHead className="h-8 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableCell colSpan={6} className="py-0">
                    <div className="flex h-[54px] items-center">
                      <span className="font-sans text-[11.5px] text-sts-muted">No sub-department members yet. Invite people into a sub-department.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => {
                  const role = currentRole(m);
                  const memberships = m.subDepartmentMemberships ?? [];
                  return (
                    <TableRow key={m.userId} className="border-[#f0f4f8] hover:bg-sts-bg/40 dark:border-[#3a3a37]">
                      <TableCell className="py-0">
                        <div className="flex h-[54px] items-center gap-2.5">
                          <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.userId} size={28} />
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">{m.name}</span>
                            {m.isActive === false && (
                              <span title="Excluded from assignment" className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-[6px] py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                <BanIcon className="size-2.5" />
                                No assign
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <span className="font-sans text-[11.5px] text-sts-muted">{m.email}</span>
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
                        <div className="flex h-[54px] items-center gap-1 flex-wrap">
                          <SubDepartmentAddDropdown
                            subDepartments={data.availableSubDepartments.filter((s) => !memberships.some((ms) => ms.subDepartmentId === s.id))}
                            saving={saving === m.userId}
                            onAdd={(v) => handleAddToSubDepartment(m, v)}
                          />
                          {memberships.length === 0 ? (
                            <span className="font-sans text-[11.5px] text-sts-subtle">—</span>
                          ) : (
                            memberships.map((s) => (
                              <span key={s.subDepartmentId} className="inline-flex items-center gap-1 rounded-full bg-sts-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-sts-muted">
                                {s.subDepartmentName}
                                <button
                                  type="button"
                                  title={`Remove from ${s.subDepartmentName}`}
                                  disabled={saving === m.userId}
                                  onClick={() => handleRemoveMembership(m, s.subDepartmentId)}
                                  className="rounded text-sts-subtle hover:text-red-500 disabled:opacity-50"
                                >
                                  <X className="size-3" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <div className="flex h-[54px] items-center">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(m)}
                            className={cn(
                              "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 font-sans text-[11.5px] font-medium transition-colors",
                              m.isActive !== false
                                ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400",
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", m.isActive !== false ? "bg-green-500" : "bg-red-500")} />
                            {m.isActive !== false ? "Active" : "Inactive"}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <div className="flex h-[54px] items-center justify-end gap-0.5">
                          <button
                            type="button"
                            title="Configure availability"
                            onClick={() => setConfigMember(toConfigTarget(m))}
                            className="inline-flex size-7 items-center justify-center rounded-md text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground"
                          >
                            <Settings2 className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveMember(m)}
                            title="Remove from department"
                            className="rounded-md border border-sts-card-border p-1.5 text-sts-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
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
          <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableHead className="h-8 w-[28%]"><SectionLabel>Email</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[16%]"><SectionLabel>SubDepartment</SectionLabel></TableHead>
                  <TableHead className="h-8 w-[12%]"><SectionLabel>Role</SectionLabel></TableHead>
                  <TableHead className="h-8"><SectionLabel>Expires</SectionLabel></TableHead>
                  <TableHead className="h-8 w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((inv) => (
                  <TableRow key={inv.id} className="border-[#f0f4f8] hover:bg-sts-bg/40 dark:border-[#3a3a37]">
                    <TableCell className="py-0">
                      <div className="flex h-[54px] flex-col justify-center">
                        <span className="font-sans text-[12.5px] font-semibold text-sts-foreground">{inv.email}</span>
                        <span className="font-sans text-[11px] text-sts-subtle">Invited by {inv.inviter.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className="font-sans text-[11.5px] text-sts-muted">{inv.subDepartment.name}</span>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 font-sans text-[11px] font-medium capitalize", ROLE_COLORS[inv.role] ?? ROLE_COLORS.agent)}>
                        {inv.role}
                      </span>
                    </TableCell>
                    <TableCell className="py-0">
                      <span className="font-sans text-[11.5px] text-sts-muted">
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
                        className="rounded-md border border-sts-card-border p-1.5 text-sts-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
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

      {/* Super-Admin feature control — grant/revoke this department's features. */}
      {data.canControlFeatures && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-sts-muted" />
            <h2 className="font-sans text-[15px] font-semibold text-sts-foreground">
              Features <span className="font-normal text-sts-subtle">(super admin)</span>
            </h2>
          </div>
          <div className="rounded-[6px] border border-sts-card-border bg-sts-card p-[22px]">
            <DepartmentFeaturesPanel departmentId={data.id} />
          </div>
        </div>
      )}

      {/* Cross-department access — managers only */}
      <Section
        icon={Users}
        title="Cross-department access"
        count={accessGrants.length}
        action={
          <button
            type="button"
            onClick={() => setShowGrantModal(true)}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-dashed border-sts-card-border px-3 font-sans text-[11.5px] font-medium text-sts-muted hover:border-sts-blue/40 hover:text-sts-blue transition-colors"
          >
            <Plus className="size-3" /> Grant access
          </button>
        }
      >
        <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
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
                      <span className="font-sans text-[11.5px] text-sts-muted">No cross-department access grants</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                accessGrants.map((g) => {
                  const expired = !!g.expiresAt && new Date(g.expiresAt) < new Date();
                  return (
                    <TableRow key={g.id} className="border-[#f0f4f8] hover:bg-sts-bg/40 dark:border-[#3a3a37]">
                      <TableCell className="py-0">
                        <div className="flex h-[54px] items-center gap-2.5">
                          <UserAvatar name={g.user.name} avatarUrl={g.user.avatarUrl ?? null} size={28} />
                          <span className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">{g.user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0">
                        <span className="font-sans text-[11.5px] text-sts-muted">{g.user.email}</span>
                      </TableCell>
                      <TableCell className="py-0">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium",
                            g.fullAccess ? "bg-sts-blue/10 text-sts-blue" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
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
                        <span className="block max-w-[160px] truncate font-sans text-[11.5px] text-sts-muted">{g.reason ?? "No reason"}</span>
                      </TableCell>
                      <TableCell className="py-0 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingGrant(g)} title="Edit access" className="font-sans text-[11.5px] font-medium text-sts-id hover:underline">
                            Edit
                          </button>
                          <button type="button" onClick={() => revokeAccess(g.userId)} title="Revoke access" className="rounded-md border border-sts-card-border p-1.5 text-sts-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
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

      {showAddMemberModal && (
        <AddMemberModal
          departmentId={data.id}
          availableSubDepartments={data.availableSubDepartments}
          availableDepartments={[]}
          isAdmin={data.isAdmin}
          isManager={!data.isAdmin}
          onClose={() => setShowAddMemberModal(false)}
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
          reassignContext={{
            departmentId: data.id,
            subDepartments: data.availableSubDepartments,
            agents: members
              .filter((m) => m.userId !== configMember.id)
              .map((m) => ({ id: m.userId, name: m.name })),
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmRemoveMember}
        onOpenChange={(open) => { if (!open) setConfirmRemoveMember(null); }}
        title="Remove from department"
        description={
          confirmRemoveMember
            ? `Remove ${confirmRemoveMember.name} from all sub-departments in ${data.name}?`
            : ""
        }
        confirmLabel="Remove"
        successMessage={confirmRemoveMember ? `${confirmRemoveMember.name} removed from sub-departments` : undefined}
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
          ROLE_COLORS[role] ?? "bg-sts-surface text-sts-subtle",
        )}
      >
        {role}
        {saving ? <Loader2 className="size-3 animate-spin opacity-70" /> : <ChevronDown className="size-3 opacity-60" />}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-auto min-w-[110px] gap-0 rounded-lg border border-sts-card-border bg-sts-bg p-1 shadow-lg"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { onChange(o.value); setOpen(false); }}
            className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-sts-surface", role === o.value && "font-semibold")}
          >
            <span className={cn("inline-flex rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium", ROLE_COLORS[o.value] ?? "bg-sts-surface text-sts-subtle")}>
              {o.label}
            </span>
            {role === o.value && <Check className="ml-auto size-3 text-sts-id" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// Adds an agent/sub-manager to another sub-department. Membership is additive, so
// this only lists sub-departments they aren't already in; existing memberships are
// shown as removable chips beside it.
function SubDepartmentAddDropdown({
  subDepartments,
  saving,
  onAdd,
}: {
  subDepartments: { id: string; name: string }[];
  saving: boolean;
  onAdd: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (subDepartments.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={saving}
        className="inline-flex h-[26px] items-center gap-1 rounded-full border border-sts-card-border bg-sts-surface px-2 font-sans text-[11.5px] text-sts-muted outline-none transition-opacity disabled:opacity-60 hover:border-sts-blue/50 hover:text-sts-foreground"
      >
        {saving ? <Loader2 className="size-3 animate-spin opacity-70" /> : <Plus className="size-3" />} Add
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-auto min-w-[150px] gap-0 rounded-lg border border-sts-card-border bg-sts-bg p-1 shadow-lg"
      >
        {subDepartments.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { onAdd(t.id); setOpen(false); }}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-sts-surface"
          >
            <span className="inline-flex rounded-full bg-sts-blue/10 px-2 py-0.5 font-sans text-[11.5px] font-semibold text-sts-blue">{t.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
