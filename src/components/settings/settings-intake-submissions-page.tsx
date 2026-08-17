"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Trash2, UserRound, Users, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineAssigneePicker } from "@/components/ui/inline-pickers";
import { AvatarVisual } from "@/components/ui/user-avatar";
import { BulkAssignModal } from "@/components/tickets/bulk-assign-modal";
import type { TeamMember } from "@/lib/api/teams";
import { cn } from "@/lib/utils";
import { BreadcrumbRegistrar } from "@/components/dashboard/breadcrumb-registrar";

export type SubmissionRow = {
  id: string;
  submitterName: string;
  submitterEmail: string;
  priority: string;
  createdAt: string;
  ticketId: string | null;
  ticketNumber: number | null;
  ticketStatus: string | null;
  ticketAssigneeId: string | null;
  ticketAssigneeName: string | null;
  ticketAssigneeAvatarUrl: string | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

const URGENT_PRIORITIES = new Set(["High", "Critical", "Urgent"]);

function PriorityPill({ priority }: { priority: string }) {
  const urgent = URGENT_PRIORITIES.has(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-[7px] py-0.5 font-sans text-[11.5px] font-medium",
        urgent
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-pen-surface text-pen-muted",
      )}
    >
      {priority}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type LiveAssignee = { id: string | null; name: string | null; avatarUrl?: string | null };
type FilterTab = "all" | "unassigned" | "assigned";

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsIntakeSubmissionsPage({
  formId,
  formName,
  departmentName,
  submissions,
  teamMembers,
}: {
  formId: string;
  formName: string;
  departmentName: string;
  submissions: SubmissionRow[];
  teamMembers: TeamMember[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<SubmissionRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [liveAssignees, setLiveAssignees] = useState<Record<string, LiveAssignee>>({});
  const [filter, setFilter] = useState<FilterTab>("all");
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  function getAssignee(s: SubmissionRow): LiveAssignee {
    return liveAssignees[s.id] ?? {
      id: s.ticketAssigneeId,
      name: s.ticketAssigneeName,
      avatarUrl: s.ticketAssigneeAvatarUrl,
    };
  }

  // Filter submissions based on tab
  const filtered = submissions.filter((s) => {
    if (filter === "unassigned") return !getAssignee(s).id;
    if (filter === "assigned") return !!getAssignee(s).id;
    return true;
  });

  // Only count selectable rows (those with a linked ticket)
  const selectableIds = filtered.filter((s) => s.ticketId).map((s) => s.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));

  // Submissions currently selected that have a ticket (for assignment)
  const selectedWithTicket = filtered.filter((s) => s.ticketId && selected.has(s.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  async function handleAssign(s: SubmissionRow, member: TeamMember | null) {
    if (!s.ticketId) return;
    const prev = getAssignee(s);
    setLiveAssignees((a) => ({ ...a, [s.id]: { id: member?.id ?? null, name: member?.name ?? null, avatarUrl: member?.avatarUrl } }));
    try {
      await fetch(`/api/tickets/${s.ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: member?.id ?? null }),
      });
      startTransition(() => router.refresh());
    } catch {
      setLiveAssignees((a) => ({ ...a, [s.id]: prev }));
    }
  }

  async function handleBulkAssign(mode: "single" | "round-robin", assigneeIds: string[]) {
    const ticketIds = selectedWithTicket.map((s) => s.ticketId as string);

    // Optimistic update: compute which member gets each ticket
    const memberMap = new Map(teamMembers.map((m) => [m.id, m]));
    if (mode === "single") {
      const m = memberMap.get(assigneeIds[0]);
      setLiveAssignees((prev) => {
        const next = { ...prev };
        selectedWithTicket.forEach((s) => {
          next[s.id] = { id: assigneeIds[0], name: m?.name ?? null, avatarUrl: m?.avatarUrl };
        });
        return next;
      });
    } else {
      setLiveAssignees((prev) => {
        const next = { ...prev };
        selectedWithTicket.forEach((s, i) => {
          const id = assigneeIds[i % assigneeIds.length];
          const m = memberMap.get(id);
          next[s.id] = { id, name: m?.name ?? null, avatarUrl: m?.avatarUrl };
        });
        return next;
      });
    }

    await fetch("/api/admin/tickets/smart-assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketIds, mode, assigneeIds }),
    });

    setAssignModalOpen(false);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/intake/submissions/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const res = await fetch(`/api/intake/submissions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      setBulkConfirm(false);
      setSelected(new Set());
      startTransition(() => router.refresh());
    }
  }

  const unassignedCount = submissions.filter((s) => !getAssignee(s).id && s.ticketId).length;
  const assignedCount = submissions.filter((s) => !!getAssignee(s).id).length;

  const FILTER_TABS: { value: FilterTab; label: string; count: number }[] = [
    { value: "all", label: "All", count: submissions.length },
    { value: "unassigned", label: "Unassigned", count: unassignedCount },
    { value: "assigned", label: "Assigned", count: assignedCount },
  ];

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <BreadcrumbRegistrar
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Support forms", href: "/settings/intake-forms" },
          { label: formName, href: `/settings/intake-forms/${formId}` },
          { label: "Submissions", href: `/settings/intake-forms/${formId}/submissions` },
        ]}
      />
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/settings/intake-forms"
          className="inline-flex w-fit items-center gap-1 font-sans text-[12px] font-medium text-pen-muted hover:text-pen-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Support forms
        </Link>
        <div className="min-w-0">
          <h1 className="pen-text-admin-title">{formName}</h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
            {departmentName} · {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-pen-card-border bg-pen-card p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setFilter(tab.value); setSelected(new Set()); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[12px] font-medium transition-colors",
              filter === tab.value
                ? "bg-pen-blue text-white dark:text-gray-900 shadow-sm"
                : "text-pen-muted hover:text-pen-foreground hover:bg-pen-surface",
            )}
          >
            {tab.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 font-sans text-[10.5px] font-semibold",
              filter === tab.value ? "bg-white/20 text-white dark:text-gray-900" : "bg-pen-surface text-pen-subtle",
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Floating action bar */}
      {someSelected && (
        <div className="flex items-center gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-2.5 shadow-sm">
          <span className="font-sans text-[12.5px] font-semibold text-pen-foreground">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          {filter === "unassigned" && selectedWithTicket.length > 0 && (
            <button
              type="button"
              onClick={() => setAssignModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-pen-blue px-3 py-1.5 font-sans text-[12px] font-semibold text-white dark:text-gray-900 hover:bg-pen-blue/90 transition-colors"
            >
              <Users className="size-3.5" />
              Assign {selectedWithTicket.length} ticket{selectedWithTicket.length !== 1 ? "s" : ""}
            </button>
          )}
          <button
            type="button"
            onClick={() => setBulkConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-pen-red/40 bg-red-50 px-3 py-1.5 font-sans text-[12px] font-semibold text-pen-red hover:bg-red-100 transition-colors dark:bg-red-950/30 dark:hover:bg-red-950/50"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-md p-1.5 text-pen-muted hover:bg-pen-surface hover:text-pen-foreground transition-colors"
            title="Clear selection"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-pen-card-border py-16 text-center">
          <p className="font-sans text-[13px] text-pen-muted">
            {filter === "unassigned" ? "No unassigned tickets." : filter === "assigned" ? "No assigned tickets." : "No submissions yet."}
          </p>
          {filter !== "all" && (
            <button type="button" onClick={() => setFilter("all")} className="mt-2 font-sans text-[12px] text-pen-id hover:underline">
              Show all submissions
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[4%]">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="size-3.5 cursor-pointer rounded accent-pen-blue"
                  />
                </TableHead>
                <TableHead className="h-8 w-[24%]"><SectionLabel>Submitter</SectionLabel></TableHead>
                <TableHead className="h-8 w-[11%]"><SectionLabel>Priority</SectionLabel></TableHead>
                <TableHead className="h-8 w-[13%]"><SectionLabel>Submitted</SectionLabel></TableHead>
                <TableHead className="h-8 w-[20%]"><SectionLabel>Assignee</SectionLabel></TableHead>
                <TableHead className="h-8 w-[14%]"><SectionLabel>Linked ticket</SectionLabel></TableHead>
                <TableHead className="h-8 w-[14%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className={cn("border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]", selected.has(s.id) && "bg-pen-blue/[0.03]")}>
                  <TableCell className="py-0">
                    <div className="flex h-[56px] items-center">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        disabled={!s.ticketId}
                        aria-label={`Select submission from ${s.submitterName}`}
                        className="size-3.5 cursor-pointer rounded accent-pen-blue disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </div>
                  </TableCell>

                  <TableCell className="py-0">
                    <Link href={`/settings/intake-forms/${formId}/submissions/${s.id}`} className="flex h-[56px] flex-col justify-center gap-0.5">
                      <span className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">{s.submitterName}</span>
                      <span className="truncate font-sans text-[11.5px] text-pen-subtle">{s.submitterEmail}</span>
                    </Link>
                  </TableCell>

                  <TableCell className="py-0">
                    <div className="flex h-[56px] items-center">
                      <PriorityPill priority={s.priority} />
                    </div>
                  </TableCell>

                  <TableCell className="py-0">
                    <div className="flex h-[56px] items-center">
                      <span className="font-sans text-[12px] text-pen-foreground">{formatDate(s.createdAt)}</span>
                    </div>
                  </TableCell>

                  {/* Inline assignee picker */}
                  <TableCell className="py-0">
                    <div className="flex h-[56px] items-center">
                      {s.ticketId ? (
                        <InlineAssigneePicker
                          members={teamMembers}
                          currentId={getAssignee(s).id}
                          onSelect={(member) => handleAssign(s, member)}
                        >
                          {({ ref, onClick }) => (
                            <button ref={ref} type="button" onClick={onClick} className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-pen-surface max-w-[160px]">
                              {getAssignee(s).name ? (
                                <>
                                  <AvatarVisual name={getAssignee(s).name!} avatarUrl={getAssignee(s).avatarUrl} size={20} />
                                  <span className="truncate font-sans text-[12px] text-pen-foreground">{getAssignee(s).name}</span>
                                </>
                              ) : (
                                <>
                                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pen-surface">
                                    <UserRound className="size-3 text-pen-subtle" />
                                  </span>
                                  <span className="font-sans text-[12px] text-pen-subtle">Unassigned</span>
                                </>
                              )}
                            </button>
                          )}
                        </InlineAssigneePicker>
                      ) : (
                        <span className="font-sans text-[12px] text-pen-subtle pl-2">—</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="py-0">
                    <div className="flex h-[56px] items-center">
                      {s.ticketId ? (
                        <Link href={`/tickets/${s.ticketId}`} className="font-sans text-[12px] font-medium text-pen-id hover:underline">
                          #{s.ticketNumber}
                          {s.ticketStatus ? <span className="ml-1 text-pen-subtle">· {s.ticketStatus}</span> : null}
                        </Link>
                      ) : (
                        <span className="font-sans text-[12px] text-pen-subtle">—</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="py-0 text-right">
                    <div className="flex h-[56px] items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(s)}
                        className="cursor-pointer rounded-md p-1.5 text-pen-muted hover:bg-red-50 hover:text-pen-red transition-colors dark:hover:bg-red-950/30"
                        title="Delete submission"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      <Link
                        href={`/settings/intake-forms/${formId}/submissions/${s.id}`}
                        className="flex items-center gap-1 rounded-md border border-pen-card-border bg-pen-surface px-2.5 py-1 font-sans text-[11.5px] font-semibold text-pen-foreground shadow-sm transition-colors hover:border-pen-id hover:bg-pen-blue-tint hover:text-pen-id"
                        title="View submission details"
                      >
                        <Eye className="size-3.5" />
                        View
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bulk assign modal */}
      {assignModalOpen && (
        <BulkAssignModal
          count={selectedWithTicket.length}
          teamMembers={teamMembers}
          onClose={() => setAssignModalOpen(false)}
          onAssign={handleBulkAssign}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete submission?"
        description={`The submission from "${deleteTarget?.submitterName}" will be permanently deleted. Any linked ticket will remain.`}
        confirmLabel="Delete"
        successMessage="Submission deleted."
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={bulkConfirm}
        onOpenChange={setBulkConfirm}
        title={`Delete ${selected.size} submission${selected.size !== 1 ? "s" : ""}?`}
        description={`${selected.size} submission${selected.size !== 1 ? "s" : ""} will be permanently deleted. Any linked tickets will remain.`}
        confirmLabel="Delete"
        successMessage="Submissions deleted."
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
