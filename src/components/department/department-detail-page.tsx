"use client";

import { useEffect, useState, useTransition } from "react";
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
  BanIcon,
  Mail,
  RotateCw,
  Trash2,
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
  type UserOption,
  type AccessGrant,
} from "@/components/settings/settings-departments-page";
import {
  MemberConfigPanel,
  type MemberConfigTarget,
} from "@/components/settings/member-config-panel";
import {
  removeDepartmentManager,
  removeDepartmentMember,
  updateAdminUser,
  addAdminSubDepartmentMember,
  removeAdminSubDepartmentMember,
  revokeDepartmentInvite,
  resendDepartmentInvite,
  type DepartmentInviteRow,
} from "@/lib/api/admin";
import { InviteByEmailModal } from "@/components/invites/invite-by-email-modal";

// ── Types ────────────────────────────────────────────────────────────────────

type ManagerRow = { id: string; userId: string; name: string; email: string; avatarUrl: string | null; color: string; location?: string | null; timezone?: string | null; subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean; accepted?: boolean }[] };

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
  subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean; accepted?: boolean }[];
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

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<MemberRow | null>(null);
  const [configMember, setConfigMember] = useState<MemberConfigTarget | null>(null);
  // Per-invite in-flight action ("resend" | "delete") for spinner/disabled state.
  const [inviteAction, setInviteAction] = useState<Record<string, "resend" | "delete">>({});

  useEffect(() => {
    setPendingInvites(data.pendingInvites);
  }, [data.pendingInvites]);

  async function resendInvite(inv: DepartmentInviteRow) {
    setInviteAction((prev) => ({ ...prev, [inv.id]: "resend" }));
    try {
      await resendDepartmentInvite(data.id, inv.id);
      toast.success(`Invite resent to ${inv.email}.`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend the invite.");
    } finally {
      setInviteAction((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
    }
  }

  async function deleteInvite(inv: DepartmentInviteRow) {
    setInviteAction((prev) => ({ ...prev, [inv.id]: "delete" }));
    try {
      await revokeDepartmentInvite(data.id, inv.id);
      setPendingInvites((prev) => prev.filter((p) => p.id !== inv.id));
      toast.success(`Invite to ${inv.email} deleted.`);
    } catch {
      toast.error("Couldn't delete the invite.");
    } finally {
      setInviteAction((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
    }
  }

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

  function currentRole(m: MemberRow) {
    return localRoles[m.userId] ?? m.role;
  }

  // One member row inside a sub-department group. `currentSubId` is the group the
  // row is rendered under, so the "Other sub-departments" column can hide the
  // current team and only show the member's *other* memberships (plus the Add
  // dropdown, which still offers every team they aren't already in).
  function renderMemberRow(m: MemberRow, currentSubId: string) {
    const role = currentRole(m);
    const memberships = m.subDepartmentMemberships ?? [];
    const otherMemberships = memberships.filter((s) => s.subDepartmentId !== currentSubId);
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
            {otherMemberships.length === 0 ? (
              <span className="font-sans text-[11.5px] text-sts-subtle">—</span>
            ) : (
              otherMemberships.map((s) => (
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
            {(() => {
              // Invite is "accepted" only when the member has at least one
              // sub-department membership and every one is active (isActive).
              // A pending (isActive: false) membership means they haven't
              // accepted yet — this is what login/ticket-creation require.
              const accepted = memberships.length > 0 && memberships.every((s) => s.accepted !== false);
              return (
                <span
                  title={accepted ? "Invite accepted" : "Invite pending — member hasn't accepted yet"}
                  className={cn(
                    "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 font-sans text-[11.5px] font-medium",
                    accepted
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", accepted ? "bg-green-500" : "bg-amber-500")} />
                  {accepted ? "Accepted" : "Pending"}
                </span>
              );
            })()}
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
              className="inline-flex size-7 items-center justify-center rounded-full text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground"
            >
              <Settings2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemoveMember(m)}
              title="Remove from department"
              className="rounded-full border border-sts-card-border p-1.5 text-sts-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 py-8 sm:px-10 lg:px-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sts-blue/10">
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
                            className="inline-flex items-center gap-1 rounded-full border border-sts-card-border px-2.5 py-1.5 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-60 dark:hover:bg-red-900/20"
                          >
                            <X className="size-3" /> Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveJoinRequest(r, "approve")}
                            disabled={processing || noTeams}
                            className="inline-flex items-center gap-1 rounded-full bg-sts-button px-2.5 py-1.5 font-sans text-[11.5px] font-semibold text-sts-button-fg transition-colors hover:bg-sts-button/90 disabled:opacity-60"
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
      >
        <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
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
                    <TableCell className="py-0 text-right">
                      <div className="flex h-[54px] items-center justify-end gap-0.5">
                        <button
                          type="button"
                          title="Configure availability"
                          onClick={() => setConfigMember(toConfigTarget(m))}
                          className="inline-flex size-7 items-center justify-center rounded-full text-sts-subtle outline-none hover:bg-sts-surface hover:text-sts-foreground"
                        >
                          <Settings2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeManager(m.userId)}
                          title="Remove manager"
                          className="rounded-full border border-sts-card-border p-1.5 text-sts-muted hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
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
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            disabled={data.availableSubDepartments.length === 0}
            title={
              data.availableSubDepartments.length === 0
                ? "Create a sub-department before inviting"
                : "Send an email invite to someone without an account"
            }
            className="flex h-7 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[11.5px] font-medium text-white transition-colors hover:bg-sts-blue/90 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-900"
          >
            <Mail className="size-3" /> Invite new members
          </button>
        }
      >
        {data.availableSubDepartments.length === 0 ? (
          <div className="rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] py-5">
            <span className="font-sans text-[11.5px] text-sts-muted">No sub-departments yet. Create a sub-department, then invite people into it.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {data.availableSubDepartments.map((sub) => {
              // A member belongs to this group if they hold a membership in this
              // sub-department. Members in several sub-departments appear under each.
              const groupMembers = members.filter((m) =>
                (m.subDepartmentMemberships ?? []).some((s) => s.subDepartmentId === sub.id),
              );
              return (
                <div key={sub.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-0.5">
                    <Users className="size-3.5 text-sts-subtle" />
                    <h3 className="font-sans text-[13px] font-semibold text-sts-foreground">{sub.name}</h3>
                    <span className="font-sans text-[11.5px] text-sts-subtle">
                      {groupMembers.length} member{groupMembers.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                          <TableHead className="h-8 w-[26%]"><SectionLabel>Name</SectionLabel></TableHead>
                          <TableHead className="h-8 w-[20%]"><SectionLabel>Email</SectionLabel></TableHead>
                          <TableHead className="h-8 w-[14%]"><SectionLabel>Role</SectionLabel></TableHead>
                          <TableHead className="h-8"><SectionLabel>Other sub-departments</SectionLabel></TableHead>
                          <TableHead className="h-8 w-[110px]"><SectionLabel>Invite</SectionLabel></TableHead>
                          <TableHead className="h-8 w-[100px]"><SectionLabel>Status</SectionLabel></TableHead>
                          <TableHead className="h-8 w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupMembers.length === 0 ? (
                          <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                            <TableCell colSpan={7} className="py-0">
                              <div className="flex h-[54px] items-center">
                                <span className="font-sans text-[11.5px] text-sts-muted">No members in this sub-department yet.</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          groupMembers.map((m) => renderMemberRow(m, sub.id))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Invited users */}
      <Section icon={Clock} title="Invited users" count={pendingInvites.length}>
        <div className="overflow-hidden rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[26%]"><SectionLabel>Email</SectionLabel></TableHead>
                <TableHead className="h-8 w-[15%]"><SectionLabel>SubDepartment</SectionLabel></TableHead>
                <TableHead className="h-8 w-[11%]"><SectionLabel>Role</SectionLabel></TableHead>
                <TableHead className="h-8 w-[12%]"><SectionLabel>Status</SectionLabel></TableHead>
                <TableHead className="h-8"><SectionLabel>Expires</SectionLabel></TableHead>
                <TableHead className="h-8 w-[190px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvites.length === 0 ? (
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableCell colSpan={6} className="py-0">
                    <div className="flex h-[54px] items-center">
                      <span className="font-sans text-[11.5px] text-sts-muted">No pending invites. Invite someone with “Invite new members”.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pendingInvites.map((inv) => (
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
                      {(() => {
                        const expired = new Date(inv.expiresAt).getTime() <= Date.now();
                        return (
                          <span
                            title={expired ? "Invite expired — resend to renew" : "Invite pending — awaiting sign-up"}
                            className={cn(
                              "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 font-sans text-[11.5px] font-medium",
                              expired
                                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", expired ? "bg-red-500" : "bg-amber-500")} />
                            {expired ? "Expired" : "Pending"}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-0">
                      <span className="font-sans text-[11.5px] text-sts-muted">
                        {new Date(inv.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </TableCell>
                    <TableCell className="py-0 text-right">
                      <div className="flex h-[54px] items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Resend invite email"
                          disabled={!!inviteAction[inv.id]}
                          onClick={() => resendInvite(inv)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-sts-card-border px-2.5 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:border-sts-blue/40 hover:text-sts-blue disabled:opacity-50"
                        >
                          {inviteAction[inv.id] === "resend" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                          Resend
                        </button>
                        <button
                          type="button"
                          title="Delete invite"
                          disabled={!!inviteAction[inv.id]}
                          onClick={() => deleteInvite(inv)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-sts-card-border px-2.5 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/20"
                        >
                          {inviteAction[inv.id] === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                          Delete
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
