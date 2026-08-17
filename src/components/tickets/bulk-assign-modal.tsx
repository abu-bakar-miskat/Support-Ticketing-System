"use client";

import { useState } from "react";
import { RefreshCw, User, Users, Check, X, Search } from "lucide-react";
import { AvatarVisual } from "@/components/ui/user-avatar";
import type { TeamMember } from "@/lib/api/teams";
import { cn } from "@/lib/utils";

type AssignMode = "round-robin-all" | "single" | "round-robin-pick";

/** Searchable avatar list for picking one (single) or several (multi) members. */
function MemberPickerList({
  members,
  selected,
  onSelect,
}: {
  members: TeamMember[];
  selected: Set<string>;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="overflow-hidden rounded-lg border border-pen-card-border bg-pen-surface">
      <div className="relative border-b border-pen-card-border px-2.5 py-2">
        <Search className="pointer-events-none absolute left-[18px] top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
        <input
          type="text"
          aria-label="Search members"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members…"
          className="w-full rounded-md border border-pen-card-border bg-transparent py-1.5 pl-8 pr-2 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
        />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 font-sans text-[11.5px] text-pen-subtle">No matches</p>
        ) : (
          filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-pen-card",
                selected.has(m.id) && "bg-pen-blue/5",
              )}
            >
              <AvatarVisual name={m.name} avatarUrl={m.avatarUrl} size={22} />
              <span className="flex-1 font-sans text-[12.5px] text-pen-foreground">{m.name}</span>
              {selected.has(m.id) && <Check className="size-3.5 shrink-0 text-pen-blue" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function BulkAssignModal({
  count,
  teamMembers,
  onClose,
  onAssign,
}: {
  count: number;
  teamMembers: TeamMember[];
  onClose: () => void;
  onAssign: (mode: "single" | "round-robin", assigneeIds: string[]) => Promise<void>;
}) {
  // Managers are excluded from round-robin distribution — they're not meant to work tickets.
  const rotationMembers = teamMembers.filter((m) => m.role !== "manager");

  const [mode, setMode] = useState<AssignMode>("round-robin-all");
  const [singleId, setSingleId] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching modes resets the other pickers so a deselected mode never keeps a stale selection.
  function changeMode(next: AssignMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setSingleId("");
    setPicked(new Set());
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    let apiMode: "single" | "round-robin";
    let ids: string[];

    if (mode === "single") {
      if (!singleId) { setError("Select a member."); return; }
      apiMode = "single";
      ids = [singleId];
    } else if (mode === "round-robin-all") {
      if (rotationMembers.length === 0) { setError("No eligible members to round robin across."); return; }
      apiMode = "round-robin";
      ids = rotationMembers.map((m) => m.id);
    } else {
      if (picked.size === 0) { setError("Select at least one member."); return; }
      apiMode = "round-robin";
      ids = rotationMembers.filter((m) => picked.has(m.id)).map((m) => m.id);
    }

    setAssigning(true);
    try {
      await onAssign(apiMode, ids);
    } catch {
      setError("Assignment failed. Please try again.");
    } finally {
      setAssigning(false);
    }
  }

  const MODES: { value: AssignMode; icon: React.ReactNode; label: string; desc: string }[] = [
    {
      value: "round-robin-all",
      icon: <RefreshCw className="size-3.5" />,
      label: "Round robin — all active members",
      desc: "Distribute evenly across all team members",
    },
    {
      value: "single",
      icon: <User className="size-3.5" />,
      label: "Assign all to one member",
      desc: "Every selected ticket goes to the same person",
    },
    {
      value: "round-robin-pick",
      icon: <Users className="size-3.5" />,
      label: "Round robin — choose members",
      desc: "Pick specific members and distribute evenly",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 pen-overlay-backdrop" onClick={onClose} />
      <div className="pen-glass-panel relative w-full max-w-md rounded-2xl border border-pen-card-border p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="pen-text-modal-title">Assign {count} ticket{count !== 1 ? "s" : ""}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => changeMode(m.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                mode === m.value
                  ? "border-pen-blue bg-pen-blue/5"
                  : "border-pen-card-border bg-pen-surface hover:border-pen-blue/40",
              )}
            >
              <span className={cn("mt-0.5 shrink-0", mode === m.value ? "text-pen-blue" : "text-pen-muted")}>
                {m.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-sans text-[12.5px] font-semibold", mode === m.value ? "text-pen-blue" : "text-pen-foreground")}>
                  {m.label}
                </p>
                <p className="font-sans text-[11.5px] text-pen-subtle">{m.desc}</p>
              </div>
              {mode === m.value && <Check className="mt-0.5 size-3.5 shrink-0 text-pen-blue" />}
            </button>
          ))}
        </div>

        {/* Single member picker */}
        {mode === "single" && (
          <div className="mt-4 flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">Member</label>
            <MemberPickerList
              members={teamMembers}
              selected={singleId ? new Set([singleId]) : new Set()}
              onSelect={setSingleId}
            />
          </div>
        )}

        {/* Multi-member picker for round-robin-pick */}
        {mode === "round-robin-pick" && (
          <div className="mt-4 flex flex-col gap-1.5">
            <label className="font-sans text-[12px] font-semibold text-pen-foreground">
              Members <span className="text-pen-subtle font-normal">({picked.size} selected)</span>
            </label>
            <MemberPickerList
              members={rotationMembers}
              selected={picked}
              onSelect={togglePick}
            />
          </div>
        )}

        {error && <p className="mt-3 font-sans text-[11.5px] text-pen-red">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-pen-card-border bg-transparent px-3 font-sans text-xs font-semibold text-pen-foreground hover:bg-pen-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={assigning}
            className="h-8 min-w-[100px] rounded-md bg-pen-blue px-3 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 disabled:opacity-50"
          >
            {assigning ? "Assigning…" : `Assign ${count} ticket${count !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
