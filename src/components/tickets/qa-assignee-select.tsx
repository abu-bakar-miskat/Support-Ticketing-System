"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, X, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import { matchesUserListSearch, type UserListPerson } from "@/lib/user-list-person";
import { addQaAssignee, removeQaAssignee } from "@/lib/api/tickets";
import { toast } from "sonner";

type Member = UserListPerson;

export function QaAssigneeSelect({
  ticketId,
  qaAssignees,
  teamMembers,
  onQaAssigneesChange,
  disabled = false,
}: {
  ticketId: string;
  qaAssignees: Member[];
  teamMembers: Member[];
  onQaAssigneesChange?: (newList: Member[]) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  // Staged selection — starts from current QA assignees, user edits freely
  const [staged, setStaged] = useState<Set<string>>(() => new Set(qaAssignees.map((m) => m.id)));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Sync staged when qaAssignees changes externally (refetch)
  useEffect(() => {
    if (!open) setStaged(new Set(qaAssignees.map((m) => m.id)));
  }, [qaAssignees, open]);

  // Calculate fixed position from trigger rect (accounts for CSS zoom in large-font mode).
  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const DROPDOWN_WIDTH = 240;
    const DROPDOWN_HEIGHT = 320;
    const top0 = rect.bottom / zoom;
    const top1 = (rect.top - DROPDOWN_HEIGHT) / zoom;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= DROPDOWN_HEIGHT || spaceBelow >= rect.top ? top0 + 6 : top1 - 6;
    const bodyW = document.body.offsetWidth;
    let left = rect.left / zoom;
    if (left + DROPDOWN_WIDTH > bodyW - 8) {
      left = rect.right / zoom - DROPDOWN_WIDTH;
    }
    left = Math.max(8, left);
    setDropPos({ top, left, width: DROPDOWN_WIDTH });
    setOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const currentIds = new Set(qaAssignees.map((m) => m.id));
  const filtered = teamMembers.filter((m) => matchesUserListSearch(m, search));

  const hasChanges =
    staged.size !== currentIds.size ||
    [...staged].some((id) => !currentIds.has(id));

  function toggle(id: string) {
    setStaged((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const toAdd = [...staged].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !staged.has(id));

    const results = await Promise.allSettled([
      ...toAdd.map((id) => addQaAssignee(ticketId, id)),
      ...toRemove.map((id) => removeQaAssignee(ticketId, id)),
    ]);

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(`${failed} QA assignment${failed > 1 ? "s" : ""} failed to save`);

    const newList = teamMembers.filter((m) => staged.has(m.id));
    onQaAssigneesChange?.(newList);
    setSaving(false);
    setOpen(false);
    setSearch("");
    router.refresh();
  }

  function cancel() {
    setStaged(new Set(qaAssignees.map((m) => m.id)));
    setSearch("");
    setOpen(false);
  }

  return (
    <div className="relative">
      {/* Current QA assignees as capsules */}
      {qaAssignees.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {qaAssignees.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface pl-1 pr-2 py-0.5"
              >
                <UserAvatar name={m.name} avatarUrl={m.avatarUrl} userId={m.id} size={20} />
                <span className="font-sans text-[11.5px] text-pen-foreground">{m.name.split(" ")[0]}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const newList = qaAssignees.filter((c) => c.id !== m.id);
                      removeQaAssignee(ticketId, m.id)
                        .then(() => { onQaAssigneesChange?.(newList); router.refresh(); })
                        .catch(() => toast.error("Failed to remove QA assignee"));
                    }}
                    className="ml-0.5 text-pen-subtle hover:text-pen-red"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {!disabled && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? setOpen(false) : openDropdown()}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-pen-card-border px-2 py-1 font-sans text-[11.5px] text-pen-subtle transition-colors hover:border-pen-id hover:text-pen-id"
        >
          <Plus className="size-3" />
          {qaAssignees.length > 0 ? "Edit QA" : "Add QA"}
        </button>
      )}

      {/* Dropdown — portalled to body so CSS transforms on parent don't break fixed positioning */}
      {open && dropPos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] overflow-hidden rounded-xl border border-pen-card-border bg-pen-bg shadow-2xl"
          style={{ top: dropPos.top, left: dropPos.left, width: 272 }}
        >
          {/* Search */}
          <div className="border-b border-pen-card-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-pen-subtle" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-7 w-full rounded-md border border-pen-card-border bg-pen-surface pl-6 pr-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
              />
            </div>
          </div>

          {/* Member list */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-3 text-center font-sans text-[11.5px] text-pen-subtle">No members found</p>
            ) : filtered.map((m) => {
              const selected = staged.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={cn(
                    userListPickerButtonClass,
                    "px-3 py-2 transition-colors",
                    selected ? "bg-pen-blue-tint" : "hover:bg-pen-surface",
                  )}
                >
                  <UserListItem
                    person={m}
                    avatarSize={24}
                    trailing={
                      selected ? <Check className="size-3.5 shrink-0 text-pen-blue" /> : null
                    }
                  />
                </button>
              );
            })}
          </div>

          {/* Footer — Save / Cancel */}
          <div className="flex items-center justify-end gap-2 border-t border-pen-card-border px-3 py-2">
            <button
              type="button"
              onClick={cancel}
              className="h-6 rounded-md px-2.5 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!hasChanges || saving}
              className="h-6 rounded-md bg-pen-blue px-2.5 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
