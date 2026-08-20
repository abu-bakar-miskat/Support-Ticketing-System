"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { avatarColorFor } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  getAdminUsers,
  getAdminSubDepartmentMembers,
  updateAdminUser,
  addAdminSubDepartmentMember,
  removeAdminSubDepartmentMember,
  createAdminSubDepartment,
  updateAdminSubDepartment,
  deleteAdminSubDepartment,
  handleDepartmentJoinRequest,
} from "@/lib/api/admin";
import { ProjectAccessPicker } from "@/components/settings/settings-departments-page";
import { notifEvents } from "@/store";

export type SubDepartmentRow = {
  id: string;
  name: string;
  prefix: string;
  departmentId: string;
  color: string;
  leads: { name: string; avatarUrl: string | null }[];
  memberColors: string[];
  members?: { name: string; avatarUrl: string | null }[];
  extraMembers: number;
  department: string;
};

export type PendingRequest = {
  id: string;
  departmentId: string;
  departmentName: string;
  subDepartments: { id: string; name: string }[];
  userId: string;
  userName: string;
  userEmail: string;
  userColor: string;
  userAvatarUrl?: string | null;
  requestedAt: string;
};

type Department = { id: string; name: string };

const PRESET_COLORS = [
  "#0a76b9", "#7c3aed", "#059669", "#dc2626",
  "#d97706", "#db2777", "#0891b2", "#65a30d",
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SubDepartmentAvatar({ name, avatarUrl, role, subDepartment }: { name: string; color?: string; avatarUrl?: string | null; role?: string; subDepartment?: string }) {
  return <UserAvatar name={name} avatarUrl={avatarUrl} size={24} meta={{ role, subDepartment }} />;
}

function LeadCell({ leads }: { leads: { name: string; avatarUrl: string | null }[] }) {
  if (leads.length === 0) {
    return <span className="font-sans text-xs text-pen-subtle">—</span>;
  }
  if (leads.length === 1) {
    const lead = leads[0];
    return (
      <div className="flex min-w-0 items-center gap-2">
        <SubDepartmentAvatar name={lead.name} avatarUrl={lead.avatarUrl} />
        <span className="truncate font-sans text-xs text-pen-foreground">{lead.name}</span>
      </div>
    );
  }
  const visible = leads.slice(0, 3);
  const extra = leads.length - visible.length;
  const label = leads.map((l) => l.name).join(", ");
  return (
    <div className="flex min-w-0 items-center gap-2" title={label}>
      <MemberStack members={visible} extra={extra} />
      <span className="truncate font-sans text-xs text-pen-foreground">{label}</span>
    </div>
  );
}

function MemberStack({ members, extra }: { members?: { name: string; avatarUrl: string | null }[]; extra: number }) {
  if (!members || members.length === 0) {
    return <span className="font-sans text-[11.5px] text-pen-subtle">No members</span>;
  }
  return (
    <AvatarGroup className="*:data-[slot=avatar]:ring-pen-card *:data-[slot=avatar-group-count]:ring-pen-card">
      {members.map((m, i) => (
        <Avatar key={`${m.name}-${i}`} size="sm">
          {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt={m.name} /> : null}
          <AvatarFallback
            style={{ backgroundColor: avatarColorFor(m.name) }}
            className="font-sans text-[10px] font-semibold text-white"
          >
            {initials(m.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <AvatarGroupCount className="bg-pen-surface font-sans text-[9px] text-pen-muted">
          +{extra}
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}

function ProjectPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-pen-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-pen-muted">
      {label}
    </span>
  );
}

type ModalMode =
  | { type: "create" }
  | { type: "edit"; subDepartment: SubDepartmentRow }
  | { type: "assign"; subDepartment: SubDepartmentRow }
  | { type: "members"; subDepartment: SubDepartmentRow };

function SubDepartmentModal({
  mode,
  departments,
  onClose,
  onSuccess,
}: {
  mode: ModalMode;
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = mode.type === "edit";
  const [name, setName] = useState(isEdit ? mode.subDepartment.name : "");
  const [prefix, setPrefix] = useState(isEdit ? mode.subDepartment.prefix : "");
  const [color, setColor] = useState(isEdit ? mode.subDepartment.color : PRESET_COLORS[0]);
  const [departmentId, setDepartmentId] = useState(
    isEdit ? mode.subDepartment.departmentId : (departments[0]?.id ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validatePrefix(p: string) {
    if (p.length < 2 || p.length > 5) return "Prefix must be 2–5 characters";
    if (!/^[A-Z]+$/.test(p)) return "Prefix must contain only letters (A–Z)";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const prefixError = validatePrefix(prefix);
    if (prefixError) { setError(prefixError); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await updateAdminSubDepartment(mode.subDepartment.id, { name, prefix, color, departmentId });
      } else {
        await createAdminSubDepartment({ name, prefix, color, departmentId });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 pen-overlay-backdrop"
        onClick={onClose}
      />
      <div
        className="pen-glass-panel relative w-full max-w-md rounded-2xl border border-pen-card-border
       p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="pen-text-modal-title">
            {isEdit ? "Edit sub department" : "New sub department"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Sub department name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Frontend"
              className="h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                Prefix{" "}
                <span className="text-pen-subtle">(2–5 letters)</span>
              </label>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                required
                minLength={2}
                maxLength={5}
                placeholder="FE"
                className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-mono text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[12px] font-semibold text-pen-foreground">
                Colour
              </label>
              <div className="flex h-9 items-center gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="size-5 shrink-0 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? `2px solid ${c}` : undefined,
                      outlineOffset: color === c ? "2px" : undefined,
                    }}
                    aria-label={c}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="ml-0.5 size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  title="Custom colour"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Department
            </label>
            <SearchableSelect
              value={departmentId}
              onChange={setDepartmentId}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Select department…"
              className="bg-pen-surface"
              aria-label="Department"
            />
          </div>

          {error && (
            <p className="font-sans text-[12px] text-red-500">{error}</p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-pen-card-border px-4 font-sans text-[12px] text-pen-foreground hover:bg-pen-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-8 rounded-lg bg-pen-id px-4 font-sans text-[12px] font-medium text-white hover:bg-pen-id/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create sub department"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub Department Members Modal ────────────────────────────────────────────────────────

type MemberEntry = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  nickname: string | null;
  isActive: boolean;
  avatarUrl: string | null;
};

function SubDepartmentMembersModal({
  subDepartment,
  isAdmin,
  onClose,
}: {
  subDepartment: SubDepartmentRow;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const roleOptions = isAdmin ? ROLE_OPTIONS_ADMIN : ROLE_OPTIONS_BASE;
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);

  useEffect(() => {
    getAdminSubDepartmentMembers(subDepartment.id)
      .then((data: any[]) => {
        setMembers(
          data.map((m) => ({
            membershipId: m.id,
            userId: m.user?.id ?? m.id,
            name: m.user?.name ?? m.name,
            email: m.user?.email ?? m.email,
            role: m.role,
            nickname: m.nickname,
            isActive: m.isActive,
            avatarUrl: m.user?.avatarUrl ?? m.avatarUrl,
          })),
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [subDepartment.id]);

  function startEdit(m: MemberEntry) {
    setEditingId(m.userId);
    setEditRole(m.role);
    setEditNickname(m.nickname ?? "");
    setEditActive(m.isActive);
    setError(null);
  }

  async function handleSave(userId: string) {
    setSaving(true);
    setError(null);
    try {
      try {
        await updateAdminUser(userId, { role: editRole });
      } catch {
        setError("Failed to update role");
        return;
      }

      try {
        await addAdminSubDepartmentMember(subDepartment.id, userId);
      } catch {
        setError("Failed to save");
        return;
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.userId === userId
            ? {
                ...m,
                role: editRole,
                nickname: editNickname.trim() || null,
                isActive: editActive,
              }
            : m,
        ),
      );
      setEditingId(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function doRemove(userId: string) {
    try {
      await removeAdminSubDepartmentMember(subDepartment.id, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      router.refresh();
    } catch {
      // silently ignore
    }
    setConfirmRemove(null);
  }

  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-pen-blue/10 text-pen-blue",
    manager: "bg-pen-purple/10 text-pen-purple",
    sub_manager: "bg-pen-green/10 text-pen-green",
    agent: "bg-pen-surface text-pen-subtle",
  };

  return (
    <>
    <ConfirmDialog
      open={!!confirmRemove}
      onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}
      title="Remove member"
      description={confirmRemove ? `Remove ${confirmRemove.name} from ${subDepartment.name}?` : ""}
      confirmLabel="Remove"
      successMessage={confirmRemove ? `${confirmRemove.name} removed from ${subDepartment.name}` : undefined}
      onConfirm={async () => { if (confirmRemove) await doRemove(confirmRemove.userId); }}
    />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 pen-overlay-backdrop"
        onClick={onClose}
      />
      <div className="pen-glass-panel relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-pen-card-border shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-pen-card-border px-6 py-4">
          <div
            className="size-3 shrink-0 rounded-[3px]"
            style={{ backgroundColor: subDepartment.color }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="pen-text-modal-title">
              {subDepartment.name}
            </h2>
            <p className="font-sans text-[11.5px] text-pen-subtle">
              {subDepartment.prefix} · {subDepartment.department}
            </p>
          </div>
          <span className="font-sans text-[11.5px] text-pen-subtle">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <span className="size-5 animate-spin rounded-full border-2 border-pen-id border-t-transparent" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="font-sans text-[12.5px] text-pen-subtle">
                No members yet
              </p>
            </div>
          ) : (
            <div>
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_120px_140px_32px] gap-3 border-b border-pen-card-border px-6 py-2">
                <span className="font-sans text-[11.5px] font-medium tracking-[0.9px] text-pen-subtle uppercase">
                  Member
                </span>
                <span className="font-sans text-[11.5px] font-medium tracking-[0.9px] text-pen-subtle uppercase">
                  Role
                </span>
                <span className="font-sans text-[11.5px] font-medium tracking-[0.9px] text-pen-subtle uppercase">
                  Nickname
                </span>
                <span />
              </div>

              {members.map((m) =>
                editingId === m.userId ? (
                  // ── Edit row ──────────────────────────────────────────
                  <div
                    key={m.userId}
                    className="border-b border-[#f0f4f8] bg-pen-bg/60 px-6 py-3 dark:border-[#3a3a37]"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.userId} size={32} meta={{ role: m.role, subDepartment: subDepartment.name }} />
                      <div className="min-w-0">
                        <p className="font-sans text-[13px] font-semibold text-pen-foreground">
                          {m.name}
                        </p>
                        <p className="font-sans text-[11.5px] text-pen-subtle">
                          {m.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="font-sans text-[11.5px] text-pen-subtle">
                          Role
                        </label>
                        <SearchableSelect
                          value={editRole}
                          onChange={setEditRole}
                          options={roleOptions}
                          searchable={false}
                          size="sm"
                          className="bg-pen-surface"
                          aria-label="Role"
                        />
                      </div>

                      <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                        <label className="font-sans text-[11.5px] text-pen-subtle">
                          Nickname{" "}
                          <span className="text-pen-muted">
                            (also updates profile name)
                          </span>
                        </label>
                        <input
                          value={editNickname}
                          onChange={(e) => setEditNickname(e.target.value)}
                          placeholder={m.name}
                          className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="font-sans text-[11.5px] text-pen-subtle">
                          Active
                        </label>
                        <div className="flex h-8 items-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={editActive}
                            onClick={() => setEditActive((v) => !v)}
                            className={cn(
                              "relative h-5 w-9 rounded-full transition-colors",
                              editActive ? "bg-pen-id" : "bg-pen-card-border",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
                                editActive
                                  ? "translate-x-4"
                                  : "translate-x-0.5",
                              )}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {error && (
                      <p className="mt-2 font-sans text-[11.5px] text-red-500">
                        {error}
                      </p>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSave(m.userId)}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-lg bg-pen-id px-4 py-1.5 font-sans text-[12px] font-medium text-white disabled:opacity-60"
                      >
                        {saving ? (
                          <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-pen-card-border px-4 py-1.5 font-sans text-[12px] text-pen-foreground hover:bg-pen-surface"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // ── View row ──────────────────────────────────────────
                  <div
                    key={m.userId}
                    className="grid grid-cols-[1fr_120px_140px_32px] items-center gap-3 border-b border-[#f0f4f8] px-6 py-3 hover:bg-pen-bg/40 dark:border-[#3a3a37]"
                  >
                    {/* Member */}
                    <div className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.userId} size={32} meta={{ role: m.role, subDepartment: subDepartment.name }} />
                      <div className="min-w-0">
                        <p className="truncate font-sans text-[13px] font-semibold text-pen-foreground">
                          {m.nickname ?? m.name}
                          {m.nickname && m.nickname !== m.name && (
                            <span className="ml-1 font-normal text-pen-subtle">
                              ({m.name})
                            </span>
                          )}
                        </p>
                        <p className="truncate font-sans text-[11.5px] text-pen-subtle">
                          {m.email}
                        </p>
                      </div>
                      {!m.isActive && (
                        <span className="shrink-0 rounded-full bg-pen-surface px-1.5 py-0.5 font-sans text-[11.5px] text-pen-muted">
                          inactive
                        </span>
                      )}
                    </div>

                    {/* Role badge */}
                    <div>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium capitalize",
                          ROLE_COLORS[m.role] ??
                            "bg-pen-surface text-pen-subtle",
                        )}
                      >
                        {m.role}
                      </span>
                    </div>

                    {/* Nickname */}
                    <p className="truncate font-sans text-[12px] text-pen-subtle">
                      {m.nickname ?? (
                        <span className="italic text-pen-muted">—</span>
                      )}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-32">
                          <DropdownMenuItem
                            className="font-sans text-xs"
                            onClick={() => startEdit(m)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            className="font-sans text-xs"
                            onClick={() => setConfirmRemove({ userId: m.userId, name: m.name })}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

type ProfileOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  subDepartment: { id: string; name: string } | null;
  avatarUrl?: string | null;
};

function AssignMemberModal({
  subDepartment,
  onClose,
  onSuccess,
}: {
  subDepartment: SubDepartmentRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      getAdminUsers(),
      getAdminSubDepartmentMembers(subDepartment.id),
    ])
      .then(([allUsers, currentMembers]: [ProfileOption[], { id: string; userId?: string }[]]) => {
        setProfiles(allUsers);
        setExistingIds(new Set(currentMembers.map((m) => m.userId ?? m.id)));
        setLoading(false);
        searchRef.current?.focus();
      })
      .catch(() => setLoading(false));
  }, [subDepartment.id]);

  const filtered = profiles.filter(
    (p) =>
      !existingIds.has(p.id) &&
      p.subDepartment === null &&
      (p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        p.email.toLowerCase().includes(debouncedSearch.toLowerCase())),
  );

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) {
      setError("Select at least one person");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      try {
        await Promise.all(
          [...selectedIds].map((userId) => addAdminSubDepartmentMember(subDepartment.id, userId)),
        );
        onSuccess();
      } catch {
        setError("Failed to assign some members");
        return;
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 pen-overlay-backdrop"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl border border-pen-card-border 
      bg-pen-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="pen-text-modal-title">
              Add members
            </h2>
            <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
              Sub department:{" "}
              <span className="font-semibold text-pen-foreground">
                {subDepartment.name}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 ">
          {/* Selected chips */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...selectedIds].map((id) => {
                const p = profiles.find((u) => u.id === id);
                if (!p) return null;
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface pl-1.5 pr-2 py-0.5"
                  >
                    <UserAvatar name={p.name} size={16} avatarUrl={p.avatarUrl ?? null} />
                    <span className="font-sans text-[11.5px] text-pen-foreground">
                      {p.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      className="text-pen-subtle hover:text-pen-foreground"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Search */}
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface pl-8 pr-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-1 focus:ring-pen-id"
              />
            </div>

            <div className="max-h-52 overflow-y-auto rounded-lg border border-pen-card-border 
            bg-pen-surface shadow-sm">
              {loading ? (
                <div className="flex h-20 items-center justify-center">
                  <span className="size-4 animate-spin rounded-full border-2 border-pen-id border-t-transparent" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-4 text-center font-sans text-[11.5px] text-pen-subtle">
                  {profiles.every(
                    (p) => p.subDepartment !== null || existingIds.has(p.id),
                  )
                    ? "All users are already assigned to a sub department"
                    : "No users found"}
                </p>
              ) : (
                filtered.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-pen-blue-tint",
                        isSelected && "bg-pen-blue-tint/60",
                      )}
                    >
                      <UserAvatar name={p.name} size={28} avatarUrl={p.avatarUrl ?? null} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                          {p.name}
                        </p>
                        <p className="truncate font-sans text-[11.5px] text-pen-subtle">
                          {p.email}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isSelected
                            ? "border-pen-id bg-pen-id"
                            : "border-pen-card-border bg-transparent",
                        )}
                      >
                        {isSelected && (
                          <Check
                            className="size-2.5 text-white"
                            strokeWidth={3}
                          />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {error && (
            <p className="font-sans text-[12px] text-red-500">{error}</p>
          )}

          <div className="mt-1 flex items-center justify-between">
            <span className="font-sans text-[11.5px] text-pen-subtle">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : ""}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-lg border border-pen-card-border px-4 font-sans text-[12px] text-pen-foreground hover:bg-pen-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || selectedIds.size === 0}
                className="h-8 rounded-lg bg-pen-id px-4 font-sans text-[12px] font-medium text-white hover:bg-pen-id/90 disabled:opacity-60"
              >
                {saving
                  ? "Adding…"
                  : `Add${selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const ROLE_OPTIONS_BASE: { value: Role; label: string }[] = [
  { value: "agent", label: "Agent" },
  { value: "sub_manager", label: "Sub-manager" },
  { value: "manager", label: "Manager" },
];
const ROLE_OPTIONS_ADMIN: { value: Role; label: string }[] = [
  ...ROLE_OPTIONS_BASE,
  { value: "admin", label: "Admin" },
];

function timeAgoShort(isoString: string) {
  const secs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

type ApprovalRole = "admin" | "manager" | "sub_manager" | "agent" | "cross-access";

const APPROVAL_ROLES: { value: ApprovalRole; label: string; hint: string }[] = [
  { value: "admin",        label: "Admin",           hint: "Full workspace access" },
  { value: "manager",      label: "Manager",         hint: "Manages whole department" },
  { value: "sub_manager",         label: "Sub-manager",     hint: "Sub-manager — pick a sub department" },
  { value: "agent",        label: "Agent",           hint: "Member — pick a sub department" },
  { value: "cross-access", label: "Cross-dept access", hint: "Guest access, no sub department" },
];

function JoinRequestsSection({
  requests: initialRequests,
}: {
  requests: PendingRequest[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedSubDepartmentId, setSelectedSubDepartmentId] = useState("");
  const [selectedRole, setSelectedRole] = useState<ApprovalRole>("agent");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [crossPermanent, setCrossPermanent] = useState(true);
  const [crossExpiresAt, setCrossExpiresAt] = useState("");
  const [crossReason, setCrossReason] = useState("");
  const [crossFullAccess, setCrossFullAccess] = useState(false);
  const [crossSelectedProjectIds, setCrossSelectedProjectIds] = useState<Set<string>>(new Set());

  function toggleCrossProject(id: string) {
    setCrossSelectedProjectIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // When another admin approves/rejects, remove the request from our list
  useEffect(() => {
    return notifEvents.subscribe((id, type) => {
      if (type === "join_request_resolved") {
        setRequests((prev) => prev.filter((r) => r.id !== id));
        setExpanded((e) => (e === id ? null : e));
      }
    });
  }, []);

  if (requests.length === 0) return null;

  const needsSubDepartment = selectedRole === "sub_manager" || selectedRole === "agent";
  const isCrossAccess = selectedRole === "cross-access";

  function openExpand(req: PendingRequest) {
    const id = req.id;
    setExpanded(id === expanded ? null : id);
    setSelectedSubDepartmentId(req.subDepartments[0]?.id ?? "");
    setSelectedRole("agent");
    setNickname("");
    setApproveError(null);
    setCrossPermanent(true);
    setCrossExpiresAt("");
    setCrossReason("");
    setCrossFullAccess(false);
    setCrossSelectedProjectIds(new Set());
  }

  async function handleAction(
    req: PendingRequest,
    action: "approve" | "reject",
  ) {
    if (action === "approve" && needsSubDepartment && !isCrossAccess && !selectedSubDepartmentId) {
      setApproveError("Please select a sub department");
      return;
    }
    if (action === "approve" && isCrossAccess && !crossFullAccess && crossSelectedProjectIds.size === 0) {
      setApproveError("Select at least one project, or choose full access");
      return;
    }
    setApproveError(null);
    setSubmitting(req.id);
    try {
      try {
        await handleDepartmentJoinRequest(req.departmentId, req.id, {
          action,
          ...(action === "approve"
            ? {
                role: selectedRole,
                ...(needsSubDepartment ? { subDepartmentId: selectedSubDepartmentId } : {}),
                nickname: nickname.trim() || null,
                ...(isCrossAccess
                  ? {
                      fullAccess: crossFullAccess,
                      projectIds: [...crossSelectedProjectIds],
                      expiresAt: crossPermanent ? undefined : crossExpiresAt || undefined,
                      reason: crossReason || undefined,
                    }
                  : {}),
              }
            : {}),
        });
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        setExpanded(null);
        router.refresh();
      } catch {
        // silently ignore
      }
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="pen-text-modal-title">
          Join Requests
        </h2>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-pen-id px-1.5 font-sans text-[11.5px] font-semibold text-white">
          {requests.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        {requests.map((req, i) => (
          <div
            key={req.id}
            className={cn(
              "border-[#f0f4f8] dark:border-[#3a3a37]",
              i < requests.length - 1 || expanded === req.id ? "border-b" : "",
            )}
          >
            {/* Request row */}
            <button
              type="button"
              onClick={() => openExpand(req)}
              className="flex w-full items-center gap-3 px-[18px] py-3 text-left hover:bg-pen-bg/40"
            >
              <UserAvatar name={req.userName} size={32} avatarUrl={req.userAvatarUrl ?? null} />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[13px] font-semibold text-pen-foreground">
                  {req.userName}
                </p>
                <p className="font-sans text-[11.5px] text-pen-subtle">
                  {req.userEmail} · wants to join{" "}
                  <span className="font-semibold text-pen-foreground">
                    {req.departmentName}
                  </span>
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 font-sans text-[11.5px] text-pen-subtle">
                <Clock className="size-3" />
                {timeAgoShort(req.requestedAt)}
              </span>
              {expanded === req.id ? (
                <ChevronUp className="size-4 shrink-0 text-pen-subtle" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-pen-subtle" />
              )}
            </button>

            {/* Expanded approval form */}
            {expanded === req.id && (
              <div className="border-t border-[#f0f4f8] dark:border-[#3a3a37]">
                <div className="px-5 py-5">
                  {/* Role pills */}
                  <div className="mb-4">
                    <p className="mb-2 pen-text-section-label">
                      Assign role
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {APPROVAL_ROLES.map((r) => {
                        const active = selectedRole === r.value;
                        return (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => {
                              setSelectedRole(r.value);
                              if (r.value === "admin" || r.value === "manager" || r.value === "cross-access") setSelectedSubDepartmentId("");
                              else setSelectedSubDepartmentId(req.subDepartments[0]?.id ?? "");
                              setApproveError(null);
                            }}
                            className={cn(
                              "flex flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-all",
                              active
                                ? "border-pen-id bg-pen-blue-tint"
                                : "border-pen-card-border bg-pen-surface hover:border-pen-id/40",
                            )}
                          >
                            <span className={cn(
                              "font-sans text-[12.5px] font-semibold",
                              active ? "text-pen-id" : "text-pen-foreground",
                            )}>
                              {r.label}
                            </span>
                            <span className="font-sans text-[11.5px] text-pen-subtle">
                              {r.hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sub department + Nickname row */}
                  <div className="flex flex-wrap items-end gap-3">
                    {/* Sub department — only for sub_manager/staff */}
                    {needsSubDepartment && (
                      <div className="flex flex-col gap-1.5">
                        <label className="font-sans text-[11.5px] font-medium text-pen-subtle">
                          Sub department
                        </label>
                        <SearchableSelect
                          value={selectedSubDepartmentId}
                          onChange={setSelectedSubDepartmentId}
                          options={
                            req.subDepartments.length === 0
                              ? [{ value: "", label: "No sub departments available" }]
                              : req.subDepartments.map((t) => ({ value: t.id, label: t.name }))
                          }
                          disabled={req.subDepartments.length === 0}
                          className="min-w-[160px] bg-pen-bg"
                          aria-label="Sub department"
                        />
                      </div>
                    )}

                    {/* Nickname — not applicable for cross-access guests (no team membership) */}
                    {!isCrossAccess && (
                      <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                        <label className="font-sans text-[11.5px] font-medium text-pen-subtle">
                          Display name <span className="text-pen-subtle/60">(optional)</span>
                        </label>
                        <input
                          value={nickname}
                          onChange={(e) => setNickname(e.target.value)}
                          placeholder={req.userName}
                          className="h-9 rounded-lg border border-pen-card-border bg-pen-bg px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle/50 focus:border-pen-id focus:ring-1 focus:ring-pen-id/20"
                        />
                      </div>
                    )}
                  </div>

                  {/* Cross-department access — same duration/project-access/reason flow as the standalone grant */}
                  {isCrossAccess && (
                    <div className="mt-3 flex flex-col gap-3">
                      <div>
                        <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-subtle">Access duration</label>
                        <div className="flex h-9 overflow-hidden rounded-lg border border-pen-card-border">
                          <button
                            type="button"
                            onClick={() => setCrossPermanent(true)}
                            className={cn(
                              "flex flex-1 items-center justify-center font-sans text-[12px] font-medium transition-colors",
                              crossPermanent ? "bg-pen-id text-white dark:text-gray-900" : "bg-pen-bg text-pen-muted hover:text-pen-foreground",
                            )}
                          >
                            Permanent
                          </button>
                          <button
                            type="button"
                            onClick={() => setCrossPermanent(false)}
                            className={cn(
                              "flex flex-1 items-center justify-center border-l border-pen-card-border font-sans text-[12px] font-medium transition-colors",
                              !crossPermanent ? "bg-pen-id text-white dark:text-gray-900" : "bg-pen-bg text-pen-muted hover:text-pen-foreground",
                            )}
                          >
                            Set expiry
                          </button>
                        </div>
                        {!crossPermanent && (
                          <input
                            type="date"
                            value={crossExpiresAt}
                            onChange={(e) => setCrossExpiresAt(e.target.value)}
                            className="mt-2 h-9 w-full rounded-lg border border-pen-card-border bg-pen-bg px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id"
                          />
                        )}
                      </div>
                      <ProjectAccessPicker
                        deptId={req.departmentId}
                        deptName={req.departmentName}
                        fullAccess={crossFullAccess}
                        onFullAccessChange={setCrossFullAccess}
                        selectedProjectIds={crossSelectedProjectIds}
                        onToggleProject={toggleCrossProject}
                      />
                      <div>
                        <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-subtle">Reason (optional)</label>
                        <input
                          value={crossReason}
                          onChange={(e) => setCrossReason(e.target.value)}
                          placeholder="e.g. Cross-sub-department ticket assignment"
                          className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-bg px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-id"
                        />
                      </div>
                    </div>
                  )}

                  {approveError && (
                    <p className="mt-2.5 flex items-center gap-1.5 font-sans text-[11.5px] text-pen-red">
                      <span className="inline-block size-1.5 rounded-full bg-pen-red" />
                      {approveError}
                    </p>
                  )}
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-2.5 border-t border-[#f0f4f8] px-5 py-3.5 dark:border-[#3a3a37]">
                  <button
                    type="button"
                    onClick={() => handleAction(req, "approve")}
                    disabled={submitting === req.id}
                    className="flex h-9 items-center gap-2 rounded-lg bg-pen-green px-5 font-sans text-[12.5px] font-medium text-white transition-colors hover:bg-pen-green/90 disabled:opacity-60 dark:text-gray-900"
                  >
                    {submitting === req.id
                      ? <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      : <Check className="size-3.5" strokeWidth={2.5} />}
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(req, "reject")}
                    disabled={submitting === req.id}
                    className="flex h-9 items-center gap-2 rounded-lg border border-pen-card-border px-5 font-sans text-[12.5px] font-semibold text-pen-foreground transition-colors hover:bg-pen-surface disabled:opacity-60"
                  >
                    <X className="size-3.5" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => { setExpanded(null); }}
                    className="ml-auto font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SubDepartmentCard({
  subDepartment,
  canManage,
  onEdit,
  onAssign,
  onViewMembers,
  onDelete,
}: {
  subDepartment: SubDepartmentRow;
  canManage: boolean;
  onEdit: () => void;
  onAssign: () => void;
  onViewMembers: () => void;
  onDelete: () => void;
}) {
  const [managersExpanded, setManagersExpanded] = useState(false);
  const [membersExpanded, setMembersExpanded] = useState(false);

  const totalMembers =
    subDepartment.leads.length + (subDepartment.members?.length ?? 0) + subDepartment.extraMembers;

  return (
    <div className="flex flex-col rounded-2xl border border-pen-card-border bg-pen-card">
      <div className="flex items-start gap-3 p-4">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl font-mono text-[11px] font-semibold text-white"
          style={{ backgroundColor: subDepartment.color }}
        >
          {initials(subDepartment.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-sans text-[14px] font-semibold text-pen-foreground">
              {subDepartment.name}
            </span>
            <span className="rounded bg-pen-surface px-1.5 py-0.5 font-mono text-[9.5px] text-pen-subtle">
              {subDepartment.prefix}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
              <Users className="size-3 shrink-0" />
              {totalMembers} member{totalMembers === 1 ? "" : "s"}
            </span>
            <ProjectPill label={subDepartment.department} />
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              title="Edit sub department"
              className="rounded-md p-1.5 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete sub department"
              className="rounded-md p-1.5 text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setManagersExpanded((v) => !v)}
        className="flex items-center justify-between border-t border-pen-card-border px-4 py-2.5 text-left transition-colors hover:bg-pen-surface/40"
      >
        <span className="flex items-center gap-1.5 font-sans text-[12.5px] font-medium text-pen-foreground">
          <Shield className="size-3.5 text-pen-muted" />
          Sub-managers
        </span>
        {managersExpanded ? (
          <ChevronUp className="size-3.5 text-pen-muted" />
        ) : (
          <ChevronDown className="size-3.5 text-pen-muted" />
        )}
      </button>
      {managersExpanded && (
        <div className="border-t border-pen-card-border/60 px-4 py-3">
          <LeadCell leads={subDepartment.leads} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setMembersExpanded((v) => !v)}
        className="flex items-center justify-between border-t border-pen-card-border px-4 py-2.5 text-left transition-colors hover:bg-pen-surface/40"
      >
        <span className="flex items-center gap-1.5 font-sans text-[12.5px] font-medium text-pen-foreground">
          <Users className="size-3.5 text-pen-muted" />
          Members {subDepartment.members?.length ? `(${totalMembers})` : ""}
        </span>
        {membersExpanded ? (
          <ChevronUp className="size-3.5 text-pen-muted" />
        ) : (
          <ChevronDown className="size-3.5 text-pen-muted" />
        )}
      </button>
      {membersExpanded && (
        <div className="flex items-center justify-between gap-3 border-t border-pen-card-border/60 px-4 py-3">
          <MemberStack members={subDepartment.members} extra={subDepartment.extraMembers} />
          {canManage && (
            <button
              type="button"
              onClick={onAssign}
              className="flex shrink-0 items-center gap-1 font-sans text-[11.5px] font-medium text-pen-blue hover:underline"
            >
              <Plus className="size-3" />
              Assign member
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onViewMembers}
        className="border-t border-pen-card-border px-4 py-2.5 text-center font-sans text-[11.5px] font-semibold text-pen-blue transition-colors hover:bg-pen-surface/50"
      >
        View all members
      </button>
    </div>
  );
}

export function SettingsSubDepartmentsPage({
  subDepartments,
  departments,
  isAdmin,
  isManager = false,
  pendingRequests = [],
}: {
  subDepartments: SubDepartmentRow[];
  departments: Department[];
  isAdmin: boolean;
  isManager?: boolean;
  pendingRequests?: PendingRequest[];
}) {
  const canManage = isAdmin || isManager;
  const router = useRouter();
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<SubDepartmentRow | null>(null);

  function refresh() {
    setModal(null);
    startTransition(() => router.refresh());
  }

  async function doDeleteSubDepartment(subDepartment: SubDepartmentRow) {
    await deleteAdminSubDepartment(subDepartment.id);
    startTransition(() => router.refresh());
    setConfirmDelete(null);
  }

  return (
    <>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title="Delete sub department"
        description={confirmDelete ? `Delete "${confirmDelete.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        successMessage={confirmDelete ? `"${confirmDelete.name}" deleted` : undefined}
        onConfirm={async () => { if (confirmDelete) await doDeleteSubDepartment(confirmDelete); }}
      />
      {modal && modal.type !== "assign" && modal.type !== "members" && (
        <SubDepartmentModal
          mode={modal}
          departments={departments}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
      {modal?.type === "assign" && (
        <AssignMemberModal
          subDepartment={modal.subDepartment}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
      {modal?.type === "members" && (
        <SubDepartmentMembersModal
          subDepartment={modal.subDepartment}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
        />
      )}

      <div className="flex flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="pen-text-admin-title">
              Sub departments & roles
            </h1>
            <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
              Sub departments can have multiple sub-managers. Roles control what everyone can see
              and do.
            </p>
          </div>
          {canManage && (
            <Button
              onClick={() => setModal({ type: "create" })}
              disabled={isPending}
              className="h-[34px] w-full shrink-0 gap-1.5 whitespace-nowrap rounded-[7px] bg-pen-blue px-3.5 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 sm:w-auto"
            >
              <Plus className="size-[13px]" strokeWidth={2.5} />
              New sub department
            </Button>
          )}
        </div>

        {subDepartments.length === 0 ? (
          <div className="rounded-2xl border border-pen-card-border bg-pen-card px-4 py-6 text-center">
            <p className="font-sans text-[12.5px] text-pen-muted">No sub departments yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subDepartments.map((subDepartment) => (
              <SubDepartmentCard
                key={subDepartment.id}
                subDepartment={subDepartment}
                canManage={canManage}
                onEdit={() => setModal({ type: "edit", subDepartment })}
                onAssign={() => setModal({ type: "assign", subDepartment })}
                onViewMembers={() => setModal({ type: "members", subDepartment })}
                onDelete={() => setConfirmDelete(subDepartment)}
              />
            ))}
          </div>
        )}

        {pendingRequests.length > 0 && (
          <JoinRequestsSection requests={pendingRequests} isAdmin={isAdmin} />
        )}
      </div>
    </>
  );
}
