"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, UserPlus, Trash2, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { UserListItem } from "@/components/ui/user-list-item";
import { formatUserListSubtitle } from "@/lib/user-list-person";
import type { UserListPerson } from "@/lib/user-list-person";

type Member = UserListPerson & { role: string };

type Props = {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onChanged?: () => void;
};

export function ProjectMembersModal({ projectId, projectName, onClose, onChanged }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [available, setAvailable] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null); // userId being acted on
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members ?? []);
        setAvailable(data.availableUsers ?? []);
      })
      .catch(() => toast.error("Failed to load members"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    searchRef.current?.focus();
  }, [loading]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function patchMembers(newMemberIds: string[]) {
    const res = await fetch(`/api/admin/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: newMemberIds }),
    });
    if (!res.ok) throw new Error();
  }

  async function addMember(user: Member) {
    setSaving(user.id);
    try {
      const newIds = [...members.map((m) => m.id), user.id];
      await patchMembers(newIds);
      setMembers((prev) => [...prev, user]);
      setAvailable((prev) => prev.filter((u) => u.id !== user.id));
      setSearch("");
      toast.success(`${user.name} added to project`);
      onChanged?.();
    } catch {
      toast.error("Failed to add member");
    } finally {
      setSaving(null);
    }
  }

  async function removeMember(user: Member) {
    setSaving(user.id);
    try {
      const newIds = members.filter((m) => m.id !== user.id).map((m) => m.id);
      await patchMembers(newIds);
      setMembers((prev) => prev.filter((m) => m.id !== user.id));
      setAvailable((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`${user.name} removed from project`);
      onChanged?.();
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setSaving(null);
    }
  }

  const filteredAvailable = available.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()),
  );

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 pen-overlay-backdrop"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative z-10 flex w-full max-w-md flex-col rounded-2xl border border-pen-card-border shadow-2xl"
        style={{ background: "var(--pen-card-solid)", maxHeight: "min(600px, calc(90vh / var(--pen-font-scale, 1)))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-pen-card-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-sans text-[14px] font-semibold text-pen-foreground">
              Manage members
            </p>
            <p className="font-sans text-[12px] text-pen-muted">{projectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-pen-muted" />
            </div>
          ) : (
            <>
              {/* Current members */}
              <div className="px-5 pt-4">
                <p className="mb-2 pen-text-section-label">
                  Current members ({members.length})
                </p>
                {members.length === 0 ? (
                  <p className="py-3 font-sans text-[12.5px] text-pen-muted">No members yet.</p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-pen-surface"
                      >
                        <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                            {m.name}
                          </p>
                          <p className="font-sans text-[11.5px] text-pen-muted">
                            {m.role}
                            {formatUserListSubtitle(m.departmentName, m.subDepartmentName) && (
                              <span className="ml-1.5 text-pen-subtle">
                                · {formatUserListSubtitle(m.departmentName, m.subDepartmentName)}
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(m)}
                          disabled={saving === m.id}
                          title="Remove from project"
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-pen-subtle transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-wait dark:hover:bg-red-950/30"
                        >
                          {saving === m.id
                            ? <Loader2 className="size-3.5 animate-spin" />
                            : <Trash2 className="size-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add members */}
              <div className="px-5 pb-4 pt-4">
                <p className="mb-2 pen-text-section-label">
                  Add members
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search people…"
                    className="h-8 w-full rounded-lg border border-pen-card-border bg-pen-surface pl-8 pr-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue"
                  />
                </div>

                {filteredAvailable.length === 0 ? (
                  <p className="py-2 font-sans text-[12px] text-pen-subtle">
                    {search ? "No results" : "Everyone is already a member"}
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {filteredAvailable.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-pen-surface"
                      >
                        <UserListItem person={u} avatarSize={30} className="min-w-0 flex-1" />
                        <button
                          type="button"
                          onClick={() => addMember(u)}
                          disabled={saving === u.id}
                          title="Add to project"
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-wait",
                            "text-pen-subtle hover:bg-pen-blue hover:text-white",
                          )}
                        >
                          {saving === u.id
                            ? <Loader2 className="size-3.5 animate-spin" />
                            : <UserPlus className="size-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(modal, document.body);
}
