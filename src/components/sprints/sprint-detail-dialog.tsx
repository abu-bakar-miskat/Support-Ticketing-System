"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  CheckCircle2,
  Circle,
  Clock,
  Edit2,
  Loader2,
  RefreshCw,
  Target,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { RichTextDisplay } from "@/components/ui/rich-text-editor";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { cn } from "@/lib/utils";
import { useSprintDetail } from "@/hooks/queries/use-sprints";
import type { SprintStatus } from "@/lib/api/sprints";

export type SprintDetailTrigger = {
  id: string;
  name: string;
};

type SprintDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sprintId: string | null;
  onEdit: (sprintId: string) => void;
  onDelete: (sprintId: string) => void;
  onStatus: (sprintId: string) => void;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_CONFIG: Record<
  SprintStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  planned: {
    label: "Planned",
    dot: "bg-pen-subtle",
    bg: "bg-pen-surface",
    text: "text-pen-muted",
  },
  active: {
    label: "Active",
    dot: "bg-pen-blue",
    bg: "bg-[#e7f7ec] dark:bg-[#26352b]",
    text: "text-pen-green",
  },
  completed: {
    label: "Completed",
    dot: "bg-pen-id",
    bg: "bg-pen-blue-tint",
    text: "text-pen-id",
  },
};

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "text-[#ff4500]",
  Critical: "text-pen-red",
  High: "text-orange-500",
  Medium: "text-pink-500",
  Low: "text-pen-muted",
};

const STATUS_DOT: Record<string, string> = {
  "To Do": "bg-pen-subtle",
  "In Progress": "bg-pen-blue",
  "In Review": "bg-yellow-400",
  Live: "bg-pen-green",
  Blocked: "bg-pen-red",
};

const TICKET_STATUS_PILL: Record<string, { bg: string; text: string }> = {
  "To Do": { bg: "bg-pen-surface", text: "text-pen-muted" },
  "In Progress": { bg: "bg-pen-blue-tint", text: "text-pen-blue" },
  "In Review": {
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    text: "text-yellow-600 dark:text-yellow-400",
  },
  Live: { bg: "bg-[#e7f7ec] dark:bg-[#26352b]", text: "text-pen-green" },
  Blocked: { bg: "bg-pen-red/10", text: "text-pen-red" },
};

function StatusPill({ status }: { status: SprintStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-[11.5px] font-medium",
        c.bg,
        c.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {c.label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-pen-card-border bg-pen-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-pen-muted">
        <Icon className="size-3.5" />
        <span className="font-sans text-[11.5px] tracking-wide">
          {label}
        </span>
      </div>
      <p className="font-mono text-[18px] font-semibold text-pen-foreground">
        {value}
      </p>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export function SprintDetailDialog({
  open,
  onOpenChange,
  sprintId,
  onEdit,
  onDelete,
  onStatus,
}: SprintDetailDialogProps) {
  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useSprintDetail(open ? sprintId : null);
  const error =
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? "Failed to load sprint"
        : null;

  const totalTickets = data?.tickets.length ?? 0;
  const doneTickets =
    data?.tickets.filter((t) => t.isDone).length ?? 0;
  const totalPoints =
    data?.tickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0) ?? 0;
  const donePoints =
    data?.tickets
      .filter((t) => t.isDone)
      .reduce((s, t) => s + (t.storyPoints ?? 0), 0) ?? 0;
  const completionPct =
    totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop transition-opacity duration-200" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex h-[calc(90dvh/var(--pen-font-scale,1))] w-[min(680px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl">
          {/* Loading / Error */}
          {loading && (
            <div className="flex flex-1 items-center justify-center gap-2 text-pen-muted">
              <Loader2 className="size-5 animate-spin" />
              <span className="font-sans text-[13px]">Loading sprint…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-sans text-[13px] text-pen-red">{error}</p>
            </div>
          )}

          {/* Content */}
          {data && !loading && (
            <>
              {/* Header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-pen-card-border px-6 py-5">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={data.status} />
                    <span className="font-mono text-[11.5px] text-pen-muted">
                      {fmt(data.startDate)} – {fmt(data.endDate)}
                    </span>
                  </div>
                  <h2 className="font-sans text-[18px] font-semibold text-pen-foreground">
                    {data.name}
                  </h2>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {data.status !== "completed" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        onStatus(data.id);
                      }}
                      className="h-7 gap-1.5 font-sans text-[11.5px]"
                    >
                      <RefreshCw className="size-3.5" />
                      {data.status === "planned"
                        ? "Start sprint"
                        : "Complete sprint"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onEdit(data.id);
                    }}
                    className="h-7 gap-1.5 font-sans text-[11.5px]"
                  >
                    <Edit2 className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      onDelete(data.id);
                    }}
                    className="h-7 gap-1.5 font-sans text-[11.5px] text-pen-red hover:border-pen-red/30 hover:bg-pen-red/5 hover:text-pen-red"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="ml-1 rounded-md p-1 text-pen-muted hover:bg-pen-surface hover:text-pen-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard
                    icon={CheckCircle2}
                    label="TICKETS DONE"
                    value={`${doneTickets}/${totalTickets}`}
                  />
                  <StatCard
                    icon={Zap}
                    label="POINTS DONE"
                    value={`${donePoints}/${totalPoints}`}
                  />
                  <StatCard
                    icon={Target}
                    label="COMPLETION"
                    value={`${completionPct}%`}
                  />
                  <StatCard
                    icon={Clock}
                    label="POINTS TARGET"
                    value={data.pointsTarget ?? "—"}
                  />
                </div>

                {/* Progress bar */}
                {data.status !== "planned" && totalPoints > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-[11.5px] text-pen-muted">
                        Progress
                      </span>
                      <span className="font-mono text-[11.5px] font-semibold text-pen-foreground">
                        {completionPct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-pen-surface">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width]",
                          data.status === "completed"
                            ? "bg-pen-id"
                            : "bg-pen-blue",
                        )}
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Meta: creator + project */}
                {(data.createdBy || data.project) && (
                  <div className="flex flex-wrap gap-4">
                    {data.createdBy && (
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-[11.5px] text-pen-subtle">
                          Created by
                        </span>
                        <UserAvatar
                          name={data.createdBy.name}
                          avatarUrl={data.createdBy.avatarUrl}
                          size={18}
                        />
                        <span className="font-sans text-[12px] text-pen-foreground">
                          {data.createdBy.name}
                        </span>
                      </div>
                    )}
                    {data.project && (
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-[11.5px] text-pen-subtle">
                          Project
                        </span>
                        {data.project.color && (
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: data.project.color }}
                          />
                        )}
                        <span className="font-sans text-[12px] text-pen-foreground">
                          {data.project.name}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                {data.goal && (
                  <div className="flex flex-col gap-2">
                    <p className="font-sans text-[11.5px] font-medium tracking-wide text-pen-subtle">
                      DESCRIPTION
                    </p>
                    <div className="rounded-xl border border-pen-card-border bg-pen-surface px-4 py-3">
                      <RichTextDisplay html={data.goal} />
                    </div>
                  </div>
                )}

                {/* Ticket list */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="font-sans text-[11.5px] font-medium tracking-wide text-pen-subtle">
                      TICKETS ({totalTickets})
                    </p>
                  </div>

                  {totalTickets === 0 ? (
                    <div className="flex h-16 items-center justify-center rounded-xl border border-pen-card-border">
                      <p className="font-sans text-[12.5px] text-pen-muted">
                        No tickets assigned to this sprint yet.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-pen-card-border">
                      {data.tickets.map((ticket, i) => {
                        const isLast = i === data.tickets.length - 1;
                        return (
                          <DrawerLink
                            key={ticket.id}
                            ticketId={ticket.id}
                            href={`/tickets/${ticket.id}`}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 hover:bg-pen-surface",
                              !isLast && "border-b border-pen-card-border",
                            )}
                          >
                            {/* ID */}
                            <span className="shrink-0 font-mono text-[11.5px] text-pen-muted">
                              {ticket.subDepartment.prefix}-{ticket.ticketNumber}
                            </span>

                            {/* Status pill */}
                            {(() => {
                              const pill = TICKET_STATUS_PILL[ticket.status];
                              return (
                                <span
                                  className={cn(
                                    "hidden shrink-0 rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium sm:inline-flex items-center gap-1",
                                    pill?.bg ?? "bg-pen-surface",
                                    pill?.text ?? "text-pen-muted",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "size-1.5 rounded-full",
                                      STATUS_DOT[ticket.status] ??
                                        "bg-pen-subtle",
                                    )}
                                  />
                                  {ticket.status}
                                </span>
                              );
                            })()}

                            {/* Title */}
                            <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">
                              {ticket.title}
                            </span>

                            {/* Priority */}
                            <span
                              className={cn(
                                "hidden shrink-0 font-sans text-[11.5px] font-medium sm:block",
                                PRIORITY_COLOR[ticket.priority] ??
                                  "text-pen-muted",
                              )}
                            >
                              {ticket.priority}
                            </span>

                            {/* Story points */}
                            {ticket.storyPoints != null && (
                              <span className="hidden shrink-0 rounded-md bg-pen-surface px-1.5 py-0.5 font-mono text-[11.5px] text-pen-muted sm:block">
                                {ticket.storyPoints} pt
                              </span>
                            )}

                            {/* Assignee */}
                            {ticket.assignee ? (
                              <UserAvatar
                                name={ticket.assignee.name}
                                avatarUrl={ticket.assignee.avatarUrl}
                                size={22}
                              />
                            ) : (
                              <Circle className="size-5 shrink-0 text-pen-surface" />
                            )}
                          </DrawerLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
