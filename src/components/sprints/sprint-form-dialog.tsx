"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { notifyMutationError } from "@/lib/notify-mutation-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useCreateSprint, useProjectTickets, useUpdateSprint } from "@/hooks/queries/use-sprints";
import { useSettingsProjects } from "@/hooks/queries/use-settings-projects";
import { cn } from "@/lib/utils";

import { formatCalendarDate } from "@/lib/ticket-datetime";

// ── helpers ───────────────────────────────────────────────────────────────────

function toDateInputValue(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return formatCalendarDate(d);
}

const STATUS_DOT: Record<string, string> = {
  "To Do": "bg-pen-subtle",
  "In Progress": "bg-pen-blue",
  "In Review": "bg-yellow-400",
  Live: "bg-pen-green",
  Blocked: "bg-pen-red",
};

// ── types ─────────────────────────────────────────────────────────────────────

export type SprintForEdit = {
  id: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  pointsTarget: number | null;
  projectId: string | null;
};

type SprintFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprint?: SprintForEdit;
  onSuccess: () => void;
  lockedProjectId?: string;
};

// ── component ─────────────────────────────────────────────────────────────────

export function SprintFormDialog({
  open,
  onOpenChange,
  sprint,
  onSuccess,
  lockedProjectId,
}: SprintFormDialogProps) {
  const isEdit = !!sprint;

  // ── form fields ──────────────────────────────────────────────────────────
  const [name, setName] = useState(sprint?.name ?? "");
  const [description, setDescription] = useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(sprint?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(sprint?.endDate));
  const [pointsTarget, setPointsTarget] = useState(
    sprint?.pointsTarget != null ? String(sprint.pointsTarget) : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── project + tickets ────────────────────────────────────────────────────
  const [projectId, setProjectId] = useState(sprint?.projectId ?? lockedProjectId ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ticketSearch, setTicketSearch] = useState("");

  const { data: projects = [], isLoading: projectsLoading } = useSettingsProjects();
  const { data: tickets = [], isLoading: ticketsLoading } = useProjectTickets(projectId);

  // Track which projectId's tickets have been used to initialise selection
  const initializedProjectRef = useRef<string>("");
  useEffect(() => {
    if (!projectId) {
      setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
      setTicketSearch("");
      initializedProjectRef.current = "";
      return;
    }
    if (ticketsLoading || initializedProjectRef.current === projectId) return;
    initializedProjectRef.current = projectId;
    if (isEdit && sprint) {
      setSelectedIds(new Set(tickets.filter((t) => t.sprintId === sprint.id).map((t) => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tickets, ticketsLoading]);

  // ── mutations ────────────────────────────────────────────────────────────
  const createMutation = useCreateSprint({
    onSuccess: () => {
      toast.success("Sprint created");
      onSuccess();
      closeDialog();
    },
    onError: notifyMutationError,
  });

  const updateMutation = useUpdateSprint(sprint?.id ?? "", {
    onSuccess: () => {
      toast.success("Sprint updated");
      onSuccess();
      closeDialog();
    },
    onError: notifyMutationError,
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── helpers ──────────────────────────────────────────────────────────────

  function resetForm() {
    setName(sprint?.name ?? "");
    setDescription(sprint?.goal ?? "");
    setStartDate(toDateInputValue(sprint?.startDate));
    setEndDate(toDateInputValue(sprint?.endDate));
    setPointsTarget(sprint?.pointsTarget != null ? String(sprint.pointsTarget) : "");
    setProjectId(sprint?.projectId ?? lockedProjectId ?? "");
    setSelectedIds(new Set());
    setTicketSearch("");
    setErrors({});
    initializedProjectRef.current = "";
  }

  function closeDialog() {
    resetForm();
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) resetForm();
    onOpenChange(next);
  }

  function toggleTicket(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required";
    if (!projectId) next.projectId = "Project is required";
    if (!startDate) next.startDate = "Start date is required";
    if (!endDate) next.endDate = "End date is required";
    if (startDate && endDate && endDate <= startDate)
      next.endDate = "End date must be after start date";
    if (pointsTarget && (isNaN(Number(pointsTarget)) || Number(pointsTarget) < 0))
      next.pointsTarget = "Must be a non-negative number";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: name.trim(),
      goal: description || null,
      startDate,
      endDate,
      pointsTarget: pointsTarget ? Number(pointsTarget) : null,
      projectId,
      ticketIds: projectId ? [...selectedIds] : undefined,
    };

    if (isEdit && sprint) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  const filteredTickets = tickets.filter(
    (t) =>
      !ticketSearch ||
      t.title.toLowerCase().includes(ticketSearch.toLowerCase()) ||
      `${t.subDepartment.prefix}-${t.ticketNumber}`.toLowerCase().includes(ticketSearch.toLowerCase()),
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex w-[min(560px,95vw)] max-h-[calc(92dvh/var(--pen-font-scale,1))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl">
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-pen-card-border px-5 py-4">
              <Dialog.Title className="font-sans text-[14px] font-semibold text-pen-foreground">
                {isEdit ? "Edit sprint" : "New sprint"}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
                className="rounded-md p-1 text-pen-muted hover:bg-pen-surface hover:text-pen-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">

              {/* Sprint name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sprint-name" className="font-sans text-[12px] text-pen-foreground">
                  Sprint name <span className="text-pen-red">*</span>
                </Label>
                <Input
                  id="sprint-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sprint 12"
                  className="font-sans text-[13px]"
                  disabled={isPending}
                />
                {errors.name && (
                  <p className="font-sans text-[11.5px] text-pen-red">{errors.name}</p>
                )}
              </div>

              {/* Description (rich text) */}
              <div className="flex flex-col gap-1.5">
                <Label className="font-sans text-[12px] text-pen-foreground">
                  Description
                </Label>
                <RichTextEditor
                  key={isEdit ? sprint?.id : "new"}
                  content={description}
                  onChange={setDescription}
                  placeholder="What should this sprint deliver?"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sprint-start" className="font-sans text-[12px] text-pen-foreground">
                    Start date <span className="text-pen-red">*</span>
                  </Label>
                  <Input
                    id="sprint-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="font-sans text-[13px]"
                    disabled={isPending}
                  />
                  {errors.startDate && (
                    <p className="font-sans text-[11.5px] text-pen-red">{errors.startDate}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sprint-end" className="font-sans text-[12px] text-pen-foreground">
                    End date <span className="text-pen-red">*</span>
                  </Label>
                  <Input
                    id="sprint-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="font-sans text-[13px]"
                    disabled={isPending}
                  />
                  {errors.endDate && (
                    <p className="font-sans text-[11.5px] text-pen-red">{errors.endDate}</p>
                  )}
                </div>
              </div>

              {/* Points target */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sprint-points" className="font-sans text-[12px] text-pen-foreground">
                  Points target
                </Label>
                <Input
                  id="sprint-points"
                  type="number"
                  min={0}
                  value={pointsTarget}
                  onChange={(e) => setPointsTarget(e.target.value)}
                  placeholder="e.g. 40"
                  className="font-sans text-[13px]"
                  disabled={isPending}
                />
                {errors.pointsTarget && (
                  <p className="font-sans text-[11.5px] text-pen-red">{errors.pointsTarget}</p>
                )}
              </div>

              <div className="h-px bg-pen-card-border" />

              {/* Project selector — hidden when locked to a specific project */}
              {!lockedProjectId && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sprint-project" className="font-sans text-[12px] text-pen-foreground">
                    Project <span className="text-pen-red">*</span>
                  </Label>
                  <SearchableSelect
                    aria-label="Project"
                    value={projectId}
                    onChange={setProjectId}
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder={projectsLoading ? "Loading projects…" : "Select a project"}
                    searchPlaceholder="Search projects…"
                    disabled={projectsLoading || isPending}
                    size="sm"
                  />
                  {errors.projectId && (
                    <p className="font-sans text-[11.5px] text-pen-red">{errors.projectId}</p>
                  )}
                </div>
              )}

              {/* Ticket checklist */}
              {projectId && (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-muted" />
                    <input
                      type="text"
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      placeholder="Search tickets…"
                      className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>

                  {selectedIds.size > 0 && (
                    <p className="font-sans text-[11.5px] text-pen-blue">
                      {selectedIds.size} ticket{selectedIds.size !== 1 ? "s" : ""} selected
                    </p>
                  )}

                  <div className="max-h-[220px] overflow-y-auto rounded-xl border border-pen-card-border">
                    {ticketsLoading ? (
                      <div className="flex h-16 items-center justify-center gap-2 text-pen-muted">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="font-sans text-[12.5px]">Loading tickets…</span>
                      </div>
                    ) : filteredTickets.length === 0 ? (
                      <div className="flex h-16 items-center justify-center">
                        <span className="font-sans text-[12.5px] text-pen-muted">
                          {ticketSearch ? "No tickets match your search" : "No tickets in this project"}
                        </span>
                      </div>
                    ) : (
                      filteredTickets.map((ticket, i) => {
                        const checked = selectedIds.has(ticket.id);
                        const isLast = i === filteredTickets.length - 1;
                        return (
                          <label
                            key={ticket.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-pen-surface",
                              !isLast && "border-b border-pen-card-border",
                              checked && "bg-pen-blue-tint dark:bg-[#1a2a3a]",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTicket(ticket.id)}
                              className="size-3.5 accent-pen-blue"
                            />
                            <span className="shrink-0 font-mono text-[11.5px] text-pen-muted">
                              {ticket.subDepartment.prefix}-{ticket.ticketNumber}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">
                              {ticket.title}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  STATUS_DOT[ticket.status] ?? "bg-pen-subtle",
                                )}
                              />
                              <span className="hidden font-sans text-[11.5px] text-pen-muted sm:inline">
                                {ticket.status}
                              </span>
                            </span>
                            {ticket.sprintId && ticket.sprintId !== sprint?.id && (
                              <span className="shrink-0 rounded-full bg-pen-surface px-1.5 py-0.5 font-sans text-[9.5px] text-pen-muted">
                                in sprint
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 justify-end gap-2 border-t border-pen-card-border px-5 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
                className="font-sans text-[12px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="gap-1.5 bg-pen-blue font-sans text-[12px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
              >
                {isPending && <Loader2 className="size-3.5 animate-spin" />}
                {isEdit ? "Save changes" : "Create sprint"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
