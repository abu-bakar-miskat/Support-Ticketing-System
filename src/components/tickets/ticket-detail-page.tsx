"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ticketKeys } from "@/hooks/queries/keys";
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches";
import { useTicketDetail } from "@/hooks/queries/use-ticket-detail";
import { useCurrentUser } from "@/hooks/use-current-user";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useBreadcrumbStore, useDrawerStore, useTimerStore } from "@/store";
import { useTimerActions } from "@/hooks/use-timer-actions";
import { createClient } from "@/lib/supabase/client";
import {
  createTicketDetailSubscription,
  createTicketChatSubscription,
  createTicketGithubSubscription,
  createTicketActivitySubscription,
  type TicketActivityEvent,
} from "@/lib/realtime";
import {
  ACTIVITY_NEEDS_REFETCH,
  activityEntryFromEvent,
  applyTimerEventToEntries,
  patchTicketDetailFromActivity,
  resolveActivityActorName,
} from "@/lib/apply-ticket-activity";
import {
  Copy,
  Clock,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Trash2,
  Plus,
  X,
  Play,
  Pause,
  RotateCcw,
  Square,
  Timer,
  CalendarDays,
  Pencil,
  Check,
  Loader2,
  Link2,
  Unlink,
  CheckSquare,
  LayoutTemplate,
  Download,
  ExternalLink,
  Maximize2,
  RefreshCw,
  MessageSquare,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { MentionableUser } from "@/lib/mentionable-users";
import {
  updateTicket,
  createTicket,
  deleteTicket,
  getComment,
  getTicketDetail,
  listProjectTickets,
  setPersonalEstimate,
  clearPersonalEstimate,
  type ProjectTicketSummary,
} from "@/lib/api/tickets";
import { extractAttachmentIdsFromHtml } from "@/lib/tiptap/attachment-utils";
import { CommentInput } from "@/components/tickets/comment-input";
import { CommentItem } from "@/components/tickets/comment-item";
import {
  CustomerReplyComposer,
  CustomerMessageItem,
  type MessageData,
  type MessageNote,
} from "@/components/tickets/customer-reply";
import {
  TicketTabContentHydrating,
  DescriptionHydrating,
} from "@/components/skeletons/page-skeletons";
import { AssigneeSelect } from "@/components/tickets/assignee-select";
import { PrioritySelect } from "@/components/tickets/priority-select";
import { ModuleSelect } from "@/components/tickets/module-select";
import { SprintSelect } from "@/components/tickets/sprint-select";
import { StatusSelect } from "@/components/tickets/status-select";
import { useTeamStatuses } from "@/hooks/queries/use-team-statuses";
import { useLabels } from "@/hooks/queries/use-labels";
import { buildLinkedLabelOptions } from "@/lib/status-label-choice";
import {
  normalizeStatus,
  uiPriorityFromDb,
} from "@/components/board/board-types";
import type {
  TeamStatusConfig,
  UiPriority,
} from "@/components/board/board-types";
import { PriorityPill } from "@/components/board/priority-indicator";
import { SlaIndicatorBadge } from "@/components/tickets/sla-indicator-badge";
import { StatusPill as SharedStatusPill } from "@/components/board/status-pill";
import { TagPill } from "@/components/board/tag-pill";
import type { UserListPerson } from "@/lib/user-list-person";
import { CoAssigneeSelect } from "@/components/tickets/co-assignee-select";
import { QaAssigneeSelect } from "@/components/tickets/qa-assignee-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isSameDay } from "date-fns";
import {
  parseCalendarDate,
  formatCalendarDate,
  isSameCalendarDay,
} from "@/lib/ticket-datetime";
import type { DateRange as DayPickerDateRange } from "react-day-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { RichTextDisplay } from "@/components/ui/rich-text-editor";
import { ExpandableDescriptionEditor } from "@/components/ui/expandable-description-editor";
import {
  ExpandableDescriptionViewer,
  ExpandDescriptionButton,
} from "@/components/ui/expandable-description-viewer";
import { IntakeCard } from "@/components/tickets/intake-card";
import type { IntakeData } from "@/components/tickets/intake-card";
import { TicketAssistPanel } from "@/components/tickets/ticket-assist-panel";
import { AiComposeButton } from "@/components/tickets/ai-compose-button";
import { LabelPicker } from "@/components/tickets/label-picker";
import {
  GitHubDevSection,
  type GitHubDevData,
} from "@/components/tickets/github-dev-section";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="pen-text-label">{children}</p>;
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-pen-surface">
      <div
        className="h-full rounded-[3px] bg-pen-green transition-all"
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

function Avatar({
  name,
  src,
  size,
}: {
  name: string;
  src?: string | null;
  size: number; // px
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const style = { width: size, height: size, minWidth: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        style={style}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ ...style, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-pen-blue font-medium text-white dark:text-gray-900"
    >
      {initials}
    </div>
  );
}

function DateRangeEditor({
  ticketId,
  startDateIso,
  dueDateIso,
  canEdit,
  onDatesChange,
  fallbackStartIso = null,
}: {
  ticketId: string;
  startDateIso: string | null;
  dueDateIso: string | null;
  canEdit: boolean;
  onDatesChange?: (startIso: string | null, dueIso: string | null) => void;
  /** When the ticket has no start date, show this date as the range start by
   * default (e.g. the created date for support tickets). Presentational only —
   * not persisted unless the user edits the range. */
  fallbackStartIso?: string | null;
}) {
  const toDate = (iso: string | null) =>
    iso ? parseCalendarDate(iso) : undefined;

  /** Only treat our explicit save format as a user-set time: `yyyy-MM-ddTHH:mm` (no seconds/Z). */
  const endTimeFrom = (iso: string | null) => {
    if (!iso) return "";
    const m = iso.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})$/);
    if (!m) return "";
    const [h, min] = m[1].split(":").map(Number);
    if ((h === 0 && min === 0) || (h === 23 && min === 59)) return "";
    return m[1];
  };

  const rangeFromProps = (): DayPickerDateRange | undefined => {
    const from = toDate(startDateIso) ?? toDate(fallbackStartIso);
    if (!from) return undefined;
    const due = toDate(dueDateIso);
    // Same calendar day (incl. start + end-of-day due) → single-day, not a range
    if (!due || isSameCalendarDay(startDateIso, dueDateIso)) {
      return { from };
    }
    return { from, to: due };
  };

  const [range, setRange] = useState<DayPickerDateRange | undefined>(
    rangeFromProps,
  );
  const [endTime, setEndTime] = useState(() => endTimeFrom(dueDateIso));
  const [showTime, setShowTime] = useState(() => !!endTimeFrom(dueDateIso));
  const [open, setOpen] = useState(false);

  // Refs so close-handler always sees the latest draft (avoids stale state)
  const rangeRef = useRef(range);
  const endTimeRef = useRef(endTime);
  const touchedRef = useRef(false);
  rangeRef.current = range;
  endTimeRef.current = endTime;

  // Sync from server/realtime only while the picker is closed
  useEffect(() => {
    if (open) return;
    const next = rangeFromProps();
    setRange(next);
    rangeRef.current = next;
    const t = endTimeFrom(dueDateIso);
    setEndTime(t);
    endTimeRef.current = t;
    setShowTime(!!t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateIso, dueDateIso, open]);

  function persist(next: DayPickerDateRange, eTime: string) {
    if (!next.from) return;
    const startIso = formatCalendarDate(next.from);
    const hasRangeEnd = !!next.to && !isSameDay(next.from, next.to);
    const endDay = hasRangeEnd ? next.to! : next.from;
    // Time only when explicitly set — never invent one
    const duePayload =
      eTime && eTime.length === 5
        ? `${formatCalendarDate(endDay)}T${eTime}`
        : formatCalendarDate(endDay);

    onDatesChange?.(startIso, duePayload);

    void updateTicket(ticketId, {
      startDate: startIso,
      dueDate: duePayload,
    }).catch(() => {
      onDatesChange?.(startDateIso, dueDateIso);
      const restored = rangeFromProps();
      setRange(restored);
      rangeRef.current = restored;
      const t = endTimeFrom(dueDateIso);
      setEndTime(t);
      endTimeRef.current = t;
      setShowTime(!!t);
    });
  }

  function handleSelect(next: DayPickerDateRange | undefined) {
    if (!next?.from) {
      // DayPicker clears mid-reselect — ignore; keep current draft until a real pick
      if (startDateIso || dueDateIso) {
        touchedRef.current = true;
        return;
      }
      setRange(undefined);
      rangeRef.current = undefined;
      return;
    }
    touchedRef.current = true;
    setRange(next);
    rangeRef.current = next;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      touchedRef.current = false;
      setOpen(true);
      return;
    }

    // Save on close if the user changed the selection
    const draft = rangeRef.current;
    if (touchedRef.current && draft?.from) {
      // Single-day when only `from` is set, or when `to` is the same day
      const singleDay = !draft.to || isSameDay(draft.from, draft.to);
      const toSave: DayPickerDateRange = singleDay
        ? { from: draft.from }
        : { from: draft.from, to: draft.to! };
      setRange(toSave);
      rangeRef.current = toSave;
      persist(
        singleDay ? { from: draft.from, to: draft.from } : toSave,
        endTimeRef.current,
      );
    } else {
      // Revert any half-finished pick
      const restored = rangeFromProps();
      setRange(restored);
      rangeRef.current = restored;
      const t = endTimeFrom(dueDateIso);
      setEndTime(t);
      endTimeRef.current = t;
      setShowTime(!!t);
    }

    touchedRef.current = false;
    setOpen(false);
  }

  const isMultiDay = !!(
    range?.from &&
    range.to &&
    !isSameDay(range.from, range.to)
  );
  const label = range?.from
    ? isMultiDay
      ? `${format(range.from, "dd/MM/yyyy")} → ${format(range.to!, "dd/MM/yyyy")}${endTime ? ` ${endTime}` : ""}`
      : `${format(range.from, "dd/MM/yyyy")}${endTime ? ` ${endTime}` : ""}`
    : "Pick a date";

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Date range</SectionLabel>
      {canEdit ? (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-[6px] border border-pen-card-border bg-pen-bg px-2.5 text-left font-sans text-[12px] outline-none transition-colors",
              "hover:border-pen-blue/40 focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30",
            )}
          >
            <CalendarDays
              size={13}
              strokeWidth={2}
              className="shrink-0 text-pen-muted"
            />
            <span
              className={
                range?.from ? "text-pen-foreground" : "text-pen-subtle"
              }
            >
              {label}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={range}
              onSelect={handleSelect}
              numberOfMonths={2}
            />
            {range?.from && (
              <div className="flex items-center gap-3 border-t border-pen-card-border px-3 py-2.5">
                {showTime ? (
                  <>
                    <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                      End time
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEndTime(v);
                          endTimeRef.current = v;
                          touchedRef.current = true;
                        }}
                        className="pen-date-input-native h-7 rounded-md border border-pen-card-border bg-pen-bg px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setEndTime("");
                        endTimeRef.current = "";
                        setShowTime(false);
                        touchedRef.current = true;
                      }}
                      className="ml-auto font-sans text-[11px] text-pen-subtle hover:text-pen-foreground"
                    >
                      Clear time
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTime(true)}
                    className="font-sans text-[11.5px] text-pen-blue hover:underline"
                  >
                    Add end time
                  </button>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <div className="flex h-9 items-center gap-2 rounded-[6px] border border-pen-card-border bg-pen-bg px-2.5 font-sans text-[12px]">
          <CalendarDays
            size={13}
            strokeWidth={2}
            className="shrink-0 text-pen-muted"
          />
          <span
            className={range?.from ? "text-pen-foreground" : "text-pen-subtle"}
          >
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

const ACTIVITY_TEXT: Record<string, (meta: Record<string, unknown>) => string> =
  {
    STATUS_CHANGED: (m) =>
      m.source === "github"
        ? `moved this ticket to ${m.to ?? "?"} · PR merged to ${m.base ?? "main"}`
        : `moved this ticket from ${m.from ?? "?"} to ${m.to ?? "?"}`,
    ASSIGNED: (m) =>
      m.toName
        ? `assigned this ticket to ${m.toName}`
        : "unassigned this ticket",
    CO_ASSIGNEE_ADDED: (m) => `added ${m.userName ?? "someone"} as co-assignee`,
    CO_ASSIGNEE_REMOVED: (m) =>
      `removed ${m.userName ?? "someone"} as co-assignee`,
    COMMENT_ADDED: () => "commented",
    ATTACHMENT_ADDED: (m) => `attached ${m.fileName ?? "a file"}`,
    MENTION: () => "mentioned someone",
    TICKET_CREATED: () => "created this ticket",
    TITLE_CHANGED: (m) => `renamed this ticket to "${m.to ?? "?"}"`,
    PRIORITY_CHANGED: (m) =>
      `changed priority from ${m.from ?? "?"} to ${m.to ?? "?"}`,
    DESCRIPTION_CHANGED: () => "updated the description",
    STORY_POINTS_CHANGED: (m) => `set story points to ${m.to ?? "none"}`,
    ESTIMATED_TIME_CHANGED: () => "updated estimated time",
    PERSONAL_ESTIMATE_CHANGED: (m) => {
      const who = (m.userName as string | undefined) ?? "someone";
      const mins = m.estimatedMinutes as number | null | undefined;
      if (mins == null) return `cleared the estimate for ${who}`;
      return `set ${who}'s estimate to ${formatMins(mins)}`;
    },
    SPRINT_CHANGED: (m) =>
      m.toName ? `moved to sprint ${m.toName}` : "removed from sprint",
    PROJECT_CHANGED: (m) =>
      m.toName ? `moved to project ${m.toName}` : "updated project",
    MODULE_CHANGED: (m) =>
      m.toName ? `moved to module ${m.toName}` : "cleared module",
    SUBTICKET_ADDED: (m) =>
      m.humanId ? `added sub-ticket ${m.humanId}` : "added a sub-ticket",
    LABELS_CHANGED: () => "updated labels",
    TIMER_RESET: () => "manually reset their development timer",
    QA_TIME_LOGGED: (m) => {
      const secs = typeof m.durationSecs === "number" ? m.durationSecs : 0;
      if (secs <= 0) return "logged QA time";
      if (secs < 60) return `logged ${secs}s of QA time`;
      const mins = Math.round(secs / 60);
      return mins >= 60
        ? `logged ${Math.floor(mins / 60)}h ${mins % 60}m of QA time`
        : `logged ${mins}m of QA time`;
    },
    DATE_CHANGED: (m) => {
      const fmt = (d: unknown) => (typeof d === "string" && d ? d : null);
      const toStart = fmt(m.toStart);
      const toEnd = fmt(m.toEnd);
      if (toStart && toEnd) return `set date range to ${toStart} → ${toEnd}`;
      if (toStart) return `set start date to ${toStart}`;
      return "updated dates";
    },
  };

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatSecs(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  return `${m}m`;
}

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function parseTimeInput(input: string): number | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;
  const hMatch = str.match(/(\d+)\s*h/);
  const mMatch = str.match(/(\d+)\s*m/);
  const justNum = str.match(/^(\d+)$/);
  let total = 0;
  if (hMatch) total += parseInt(hMatch[1]) * 60;
  if (mMatch) total += parseInt(mMatch[1]);
  if (justNum && !hMatch && !mMatch) total = parseInt(justNum[1]) * 60;
  return total > 0 ? total : null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubTicketData = {
  dbId: string;
  humanId: string;
  title: string;
  status: string;
  done: boolean;
  priority: UiPriority;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  canDelete: boolean;
};

export type CommentAttachment = {
  id: string;
  storageUrl: string;
  fileName: string;
  fileSize: number;
};

export type CommentData = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  attachments: CommentAttachment[];
  replies: CommentData[];
  /** Set when this comment is an internal note attached to a customer message. */
  messageId?: string | null;
};

export type ActivityData = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type TimeLogSession = {
  id: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO, null if running
  durationSecs: number | null;
};

export type TimeEntrySummary = {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  totalSecs: number; // completed entries only
  isRunning: boolean;
  runningStartedAt: string | null; // ISO string, null unless running
  sessions: TimeLogSession[]; // individual work sessions, newest first
};

export type PersonalEstimate = {
  userId: string;
  estimatedMinutes: number | null;
  targetDateIso: string | null;
};

export type SubTicketTimeData = {
  totalSecs: number;
  perTicket: {
    dbId: string;
    humanId: string;
    title: string;
    totalSecs: number;
  }[];
  sessions: {
    id: string;
    subTicketDbId: string;
    subTicketHumanId: string;
    subTicketTitle: string;
    userName: string;
    avatarUrl: string | null;
    startedAt: string;
    endedAt: string | null;
    durationSecs: number;
    kind: string;
  }[];
};

export type TicketDetailProps = {
  dbId: string;
  ticketId: string;
  projectId: string;
  teamId: string;
  projectName: string;
  projectColor: string;
  /** Project kind — "support" tickets hide sub-tickets, story points, asset links. */
  projectKind?: string;
  projectModuleSystemEnabled?: boolean;
  moduleId?: string | null;
  moduleName?: string | null;
  sprintId?: string | null;
  sprintName?: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: UiPriority;
  labels: string[];
  openedBy: string;
  openedDaysAgo: number;
  createdAtIso: string | null;
  creatorName: string;
  creatorAvatarUrl: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  coAssignees?: { id: string; name: string; avatarUrl: string | null }[];
  qaAssignees?: { id: string; name: string; avatarUrl: string | null }[];
  startDateIso: string | null;
  dueDateIso: string | null;
  dueDate: string | null;
  closedAtIso: string | null;
  dueOverdue: boolean;
  canEditDates: boolean;
  canChangeStatus?: boolean;
  canEditTicket?: boolean;
  canEditDescription?: boolean;
  teamMembers: UserListPerson[];
  mentionableUsers: MentionableUser[];
  teamStatuses: TeamStatusConfig[];
  subTickets: SubTicketData[];
  comments: CommentData[];
  messages?: MessageData[];
  customerReply?: {
    enabled: boolean;
    customerName: string | null;
    customerEmail: string | null;
  };
  activity: ActivityData[];
  canDelete?: boolean;
  parentTicket?: { dbId: string; humanId: string; title: string } | null;
  isDrawer?: boolean;
  onClose?: () => void;
  storyPoints?: number | null;
  estimatedTime?: number | null;
  personalEstimates?: PersonalEstimate[];
  timeEntries?: TimeEntrySummary[];
  qaTimeEntries?: TimeEntrySummary[];
  subTicketTime?: SubTicketTimeData | null;
  myActiveTimerId?: string | null;
  myActiveTimerStartedAt?: string | null;
  isCurrentUserAssignee?: boolean;
  isCurrentUserQa?: boolean;
  intake?: IntakeData | null;
  assetLinks?: { label: string; url: string }[];
  github?: GitHubDevData | null;
  templateData?: Record<string, any> | null;
  /** True while placeholder shell is shown and full detail is still loading. */
  isHydrating?: boolean;
  /** Personal draft — show draft banner + Publish action. */
  isDraft?: boolean;
};

// Stable defaults for optional props — inline literals (`= []`) would mint a
// new identity every render, and the prop-sync effects below would then fire
// on each render and setState in a loop ("Maximum update depth exceeded").
const EMPTY_CO_ASSIGNEES: {
  id: string;
  name: string;
  avatarUrl: string | null;
}[] = [];
const EMPTY_MESSAGES: MessageData[] = [];
const EMPTY_PERSONAL_ESTIMATES: PersonalEstimate[] = [];
const EMPTY_TIME_ENTRIES: TimeEntrySummary[] = [];
const EMPTY_ASSET_LINKS: { label: string; url: string }[] = [];
const DEFAULT_CUSTOMER_REPLY = {
  enabled: false,
  customerName: null,
  customerEmail: null,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TicketDetailPage({
  dbId,
  ticketId,
  projectId,
  teamId,
  projectName,
  projectColor,
  projectKind = "standard",
  projectModuleSystemEnabled = false,
  moduleId = null,
  moduleName = null,
  sprintId = null,
  sprintName = null,
  title,
  description,
  status,
  priority,
  labels,
  createdAtIso,
  creatorName,
  creatorAvatarUrl,
  assigneeId,
  assigneeName,
  assigneeAvatarUrl,
  coAssignees = EMPTY_CO_ASSIGNEES,
  qaAssignees = EMPTY_CO_ASSIGNEES,
  startDateIso,
  dueDateIso,
  dueDate,
  closedAtIso,
  dueOverdue,
  canEditDates,
  canChangeStatus = true,
  canEditTicket = false,
  canEditDescription = false,
  teamMembers,
  mentionableUsers,
  teamStatuses,
  subTickets: initialSubTickets,
  comments,
  messages = EMPTY_MESSAGES,
  customerReply = DEFAULT_CUSTOMER_REPLY,
  activity,
  canDelete,
  parentTicket,
  isDrawer = false,
  onClose,
  storyPoints: initialStoryPoints = null,
  estimatedTime: initialEstimatedTime = null,
  personalEstimates: initialPersonalEstimates = EMPTY_PERSONAL_ESTIMATES,
  timeEntries: initialTimeEntries = EMPTY_TIME_ENTRIES,
  qaTimeEntries: initialQaTimeEntries = EMPTY_TIME_ENTRIES,
  subTicketTime = null,
  myActiveTimerId: initialActiveTimerId = null,
  myActiveTimerStartedAt = null,
  isCurrentUserAssignee = false,
  isCurrentUserQa = false,
  intake = null,
  assetLinks = EMPTY_ASSET_LINKS,
  github = null,
  templateData = null,
  isHydrating = false,
  isDraft = false,
}: TicketDetailProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser?.id ?? "";
  const currentUserName = currentUser?.name ?? "";
  const [publishingDraft, setPublishingDraft] = useState(false);
  const [draftBannerVisible, setDraftBannerVisible] = useState(isDraft);
  useEffect(() => {
    setDraftBannerVisible(isDraft);
  }, [isDraft]);
  const [activeTab, setActiveTab] = useState<
    "comments" | "customer-chat" | "activity"
  >("comments");
  const [activityLimit, setActivityLimit] = useState(10);
  const [copied, setCopied] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const [descValue, setDescValue] = useState(description ?? "");
  const [descExpanded, setDescExpanded] = useState(true);
  const [descEditing, setDescEditing] = useState(false);
  const [descEditorExpanded, setDescEditorExpanded] = useState(false);
  const [descViewExpanded, setDescViewExpanded] = useState(false);
  const [descSaving, setDescSaving] = useState(false);
  const [templateFieldValues, setTemplateFieldValues] = useState<
    Record<string, any>
  >(templateData ?? {});
  const [committedTemplateData, setCommittedTemplateData] = useState<Record<
    string,
    any
  > | null>(templateData ?? null);
  useEffect(() => {
    setTemplateFieldValues(templateData ?? {});
    setCommittedTemplateData(templateData ?? null);
  }, [templateData]);
  const [templateEditing, setTemplateEditing] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [subTickets, setSubTickets] =
    useState<SubTicketData[]>(initialSubTickets);
  const [subModalId, setSubModalId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(status);
  const [liveAssigneeId, setLiveAssigneeId] = useState(assigneeId);
  const [liveAssigneeName, setLiveAssigneeName] = useState(assigneeName);
  const [liveAssigneeAvatarUrl, setLiveAssigneeAvatarUrl] = useState(
    assigneeAvatarUrl ?? null,
  );
  const [liveCoAssignees, setLiveCoAssignees] = useState(coAssignees);
  const [liveQaAssignees, setLiveQaAssignees] = useState(qaAssignees);
  const [liveLabels, setLiveLabels] = useState<string[]>(labels);
  const [livePriority, setLivePriority] = useState(priority);
  const [liveModuleId, setLiveModuleId] = useState(moduleId ?? null);
  const [liveModuleName, setLiveModuleName] = useState(moduleName ?? null);
  const [liveSprintId, setLiveSprintId] = useState(sprintId ?? null);
  const [liveSprintName, setLiveSprintName] = useState(sprintName ?? null);
  const [liveStartDateIso, setLiveStartDateIso] = useState(startDateIso);
  const [liveDueDateIso, setLiveDueDateIso] = useState(dueDateIso);
  const [liveStoryPoints, setLiveStoryPoints] = useState(initialStoryPoints);
  const [liveEstimatedTime, setLiveEstimatedTime] =
    useState(initialEstimatedTime);
  const [liveActivity, setLiveActivity] = useState(activity);
  const [liveTimeEntries, setLiveTimeEntries] = useState(initialTimeEntries);
  const [liveQaTimeEntries, setLiveQaTimeEntries] =
    useState(initialQaTimeEntries);
  const [liveComments, setLiveComments] = useState<CommentData[]>(comments);
  const knownCommentIds = useRef(new Set(comments.map((c) => c.id)));
  const knownActivityIds = useRef(new Set(activity.map((a) => a.id)));
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const commentsBottomRef = useRef<HTMLDivElement>(null);
  const [liveMessages, setLiveMessages] = useState<MessageData[]>(messages);
  const [refreshingMessages, setRefreshingMessages] = useState(false);
  const pushSub = useDrawerStore((s) => s.pushSub);
  const replaceSub = useDrawerStore((s) => s.replaceSub);

  // Publish human ticket id (e.g. WEB-192) to the top-bar breadcrumb.
  useEffect(() => {
    if (isDrawer || !ticketId.trim()) return;
    useBreadcrumbStore.getState().setTicketBreadcrumb(dbId, ticketId);
    return () => {
      useBreadcrumbStore.getState().clearTicketBreadcrumb(dbId);
    };
  }, [isDrawer, dbId, ticketId]);

  // Sync state when the underlying data changes (React Query re-fetch or board move)
  useEffect(() => {
    setLiveStatus(status);
  }, [status]);

  const { data: cachedTeamStatuses } = useTeamStatuses(teamId);
  const effectiveTeamStatuses = useMemo(
    () => (cachedTeamStatuses?.length ? cachedTeamStatuses : teamStatuses),
    [cachedTeamStatuses, teamStatuses],
  );
  useEffect(() => {
    setLiveAssigneeId(assigneeId);
  }, [assigneeId]);
  useEffect(() => {
    setLiveAssigneeName(assigneeName);
  }, [assigneeName]);
  useEffect(() => {
    setLiveAssigneeAvatarUrl(assigneeAvatarUrl ?? null);
  }, [assigneeAvatarUrl]);
  useEffect(() => {
    setLiveCoAssignees(coAssignees);
  }, [coAssignees]);
  useEffect(() => {
    setLiveQaAssignees(qaAssignees);
  }, [qaAssignees]);
  useEffect(() => {
    setLiveLabels(labels);
  }, [labels]);
  useEffect(() => {
    setLivePriority(priority);
  }, [priority]);
  useEffect(() => {
    setLiveModuleId(moduleId ?? null);
  }, [moduleId]);
  useEffect(() => {
    setLiveModuleName(moduleName ?? null);
  }, [moduleName]);
  useEffect(() => {
    setLiveSprintId(sprintId ?? null);
  }, [sprintId]);
  useEffect(() => {
    setLiveSprintName(sprintName ?? null);
  }, [sprintName]);
  useEffect(() => {
    setLiveStartDateIso((prev) =>
      prev === startDateIso ? prev : startDateIso,
    );
  }, [startDateIso]);
  useEffect(() => {
    setLiveDueDateIso((prev) => (prev === dueDateIso ? prev : dueDateIso));
  }, [dueDateIso]);
  useEffect(() => {
    setLiveStoryPoints(initialStoryPoints);
  }, [initialStoryPoints]);
  useEffect(() => {
    setLiveEstimatedTime(initialEstimatedTime);
  }, [initialEstimatedTime]);
  useEffect(() => {
    setLiveActivity(activity);
    knownActivityIds.current = new Set(activity.map((a) => a.id));
  }, [activity]);
  useEffect(() => {
    setLiveTimeEntries(initialTimeEntries);
  }, [initialTimeEntries]);
  useEffect(() => {
    setLiveQaTimeEntries(initialQaTimeEntries);
  }, [initialQaTimeEntries]);
  useEffect(() => {
    setLiveComments(comments);
    knownCommentIds.current = new Set(comments.map((c) => c.id));
  }, [comments]);
  useEffect(() => {
    setLiveMessages(messages);
  }, [messages]);

  // Customer chat messages sorted oldest-first — chronological, with the
  // newest message nearest the composer pinned at the bottom of the thread.
  const sortedMessages = useMemo(
    () =>
      [...liveMessages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [liveMessages],
  );

  // Jump to the newest message (bottom, by the sticky composer) whenever the
  // chat tab opens or a message arrives.
  useEffect(() => {
    if (activeTab !== "customer-chat") return;
    const id = requestAnimationFrame(() =>
      chatBottomRef.current?.scrollIntoView({ block: "end" }),
    );
    return () => cancelAnimationFrame(id);
  }, [activeTab, sortedMessages.length]);

  // "inbound" = last message from submitter → waiting for assignee
  // "outbound" = last message from assignee → waiting for customer
  // Hidden when the ticket status is marked complete (e.g. Live / Done).
  const chatReplyStatus = useMemo<
    "awaiting-assignee" | "awaiting-customer" | null
  >(() => {
    if (liveMessages.length === 0) return null;
    const statusConfig = effectiveTeamStatuses.find(
      (s) => s.label === liveStatus,
    );
    if (statusConfig?.isComplete || liveStatus === "Live") return null;
    const last = [...liveMessages].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    return last.direction === "inbound"
      ? "awaiting-assignee"
      : "awaiting-customer";
  }, [liveMessages, liveStatus, effectiveTeamStatuses]);

  // Unified conversation: top-level comments and their replies flattened into
  // one chronological timeline (oldest first, newest nearest the composer pinned
  // at the bottom). Each reply keeps a reference to the comment it answers so
  // responses stay linked for full traceability.
  const flatComments = useMemo(() => {
    const snippet = (body: string) => {
      const clean = body
        .replace(/@([\w.-]+)/g, (_, h: string) => `@${h.replace(/_/g, " ")}`)
        .replace(/\s+/g, " ")
        .trim();
      return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
    };
    const items: {
      comment: CommentData;
      parentRef: {
        id: string;
        authorName: string;
        snippet: string;
        isDeleted: boolean;
      } | null;
    }[] = [];
    for (const c of liveComments) {
      items.push({ comment: c, parentRef: null });
      for (const r of c.replies ?? []) {
        items.push({
          comment: r,
          parentRef: {
            id: c.id,
            authorName: c.authorName,
            snippet: c.deletedAt ? "" : snippet(c.body),
            isDeleted: !!c.deletedAt,
          },
        });
      }
    }
    return items.sort(
      (a, b) =>
        new Date(a.comment.createdAt).getTime() -
        new Date(b.comment.createdAt).getTime(),
    );
  }, [liveComments]);

  // Jump to the newest comment (bottom, by the sticky composer) whenever the
  // comments tab opens or a comment arrives.
  useEffect(() => {
    if (activeTab !== "comments") return;
    const id = requestAnimationFrame(() =>
      commentsBottomRef.current?.scrollIntoView({ block: "end" }),
    );
    return () => cancelAnimationFrame(id);
  }, [activeTab, flatComments.length]);

  useEffect(() => {
    setTitleValue(title);
  }, [title]);
  useEffect(() => {
    setDescValue(description ?? "");
  }, [description]);
  useEffect(() => {
    setSubTickets(initialSubTickets);
  }, [initialSubTickets]);

  // Stable callbacks — not recreated on every render, prevents child re-renders
  const handleAssigneeChange = useCallback(
    (
      member: { id: string; name: string; avatarUrl?: string | null } | null,
    ) => {
      setLiveAssigneeId(member?.id ?? null);
      setLiveAssigneeName(member?.name ?? null);
      setLiveAssigneeAvatarUrl(member?.avatarUrl ?? null);
    },
    [],
  );

  const handleCoAssigneesChange = useCallback(
    (list: { id: string; name: string; avatarUrl?: string | null }[]) => {
      setLiveCoAssignees(
        list.map((m) => ({
          id: m.id,
          name: m.name,
          avatarUrl: m.avatarUrl ?? null,
        })),
      );
    },
    [],
  );

  const handleQaAssigneesChange = useCallback(
    (list: { id: string; name: string; avatarUrl?: string | null }[]) => {
      setLiveQaAssignees(
        list.map((m) => ({
          id: m.id,
          name: m.name,
          avatarUrl: m.avatarUrl ?? null,
        })),
      );
    },
    [],
  );

  function handleLabelsChange(newLabels: string[]) {
    const previous = liveLabels;
    setLiveLabels(newLabels);
    queryClient.setQueryData<TicketDetailProps>(
      ticketKeys.detail(dbId),
      (prev) => (prev ? { ...prev, labels: newLabels } : prev),
    );
    void fetch(`/api/tickets/${dbId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels: newLabels }),
    })
      .then((res) => {
        if (!res.ok) {
          setLiveLabels(previous);
          queryClient.setQueryData<TicketDetailProps>(
            ticketKeys.detail(dbId),
            (prev) => (prev ? { ...prev, labels: previous } : prev),
          );
        }
      })
      .catch(() => {
        setLiveLabels(previous);
        queryClient.setQueryData<TicketDetailProps>(
          ticketKeys.detail(dbId),
          (prev) => (prev ? { ...prev, labels: previous } : prev),
        );
      });
  }

  const handleIncomingComment = useCallback(
    async (commentId: string, parentId: string | null) => {
      if (knownCommentIds.current.has(commentId)) return;
      knownCommentIds.current.add(commentId);
      try {
        const comment: CommentData = await getComment(commentId);
        if (comment.messageId) {
          // Internal note attached to a customer message — route to that message.
          const targetMessageId = comment.messageId;
          setLiveMessages((prev) =>
            prev.map((m) =>
              m.id === targetMessageId
                ? {
                    ...m,
                    notes: (m.notes ?? []).some((n) => n.id === comment.id)
                      ? m.notes
                      : [
                          ...(m.notes ?? []),
                          {
                            id: comment.id,
                            body: comment.body,
                            authorId: comment.authorId,
                            authorName: comment.authorName,
                            authorAvatarUrl: comment.authorAvatarUrl,
                            createdAt: comment.createdAt,
                            editedAt: comment.editedAt,
                          },
                        ],
                  }
                : m,
            ),
          );
        } else if (parentId) {
          // It's a reply — attach it to the parent comment
          setLiveComments((prev) =>
            prev.map((c) =>
              c.id === parentId
                ? { ...c, replies: [...c.replies, comment] }
                : c,
            ),
          );
        } else {
          setLiveComments((prev) =>
            prev.some((c) => c.id === comment.id) ? prev : [...prev, comment],
          );
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // A reply posted from a CommentItem — attach it to its parent in state so the
  // flattened timeline shows it immediately, and dedupe against the realtime feed.
  const handleReplyAdded = useCallback(
    (parentId: string, reply: CommentData) => {
      knownCommentIds.current.add(reply.id);
      setLiveComments((prev) =>
        prev.map((c) =>
          c.id === parentId ? { ...c, replies: [...c.replies, reply] } : c,
        ),
      );
    },
    [],
  );

  // Internal notes attached to a specific customer message. Kept in liveMessages
  // so optimistic edits and the realtime Comment feed share one source of truth.
  const handleNoteAdded = useCallback(
    (messageId: string, note: MessageNote) => {
      knownCommentIds.current.add(note.id);
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, notes: [...(m.notes ?? []), note] } : m,
        ),
      );
    },
    [],
  );
  const handleNoteChanged = useCallback(
    (messageId: string, noteId: string, body: string, editedAt: string) => {
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                notes: (m.notes ?? []).map((n) =>
                  n.id === noteId ? { ...n, body, editedAt } : n,
                ),
              }
            : m,
        ),
      );
    },
    [],
  );
  const handleNoteRemoved = useCallback(
    (messageId: string, noteId: string) => {
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, notes: (m.notes ?? []).filter((n) => n.id !== noteId) }
            : m,
        ),
      );
    },
    [],
  );

  // Optimistic date-range update from the editor (also patches the detail cache + activity)
  const handleDatesChange = useCallback(
    (startIso: string | null, dueIso: string | null) => {
      const fromStart = liveStartDateIso;
      const fromEnd = liveDueDateIso;
      setLiveStartDateIso(startIso);
      setLiveDueDateIso(dueIso);

      // Optimistic activity feed entry (like comments) so the actor sees it instantly
      const activityId = `DATE_CHANGED:optimistic:${Date.now()}:${currentUserId}`;
      if (!knownActivityIds.current.has(activityId)) {
        knownActivityIds.current.add(activityId);
        setLiveActivity((prev) => [
          {
            id: activityId,
            action: "DATE_CHANGED",
            actorName: currentUserName || "You",
            createdAt: new Date().toISOString(),
            metadata: {
              fromStart,
              fromEnd,
              toStart: startIso,
              toEnd: dueIso,
            },
          },
          ...prev,
        ]);
      }

      queryClient.setQueryData<TicketDetailProps>(
        ticketKeys.detail(dbId),
        (prev) =>
          prev
            ? {
                ...prev,
                startDateIso: startIso,
                dueDateIso: dueIso,
                dueDate: dueIso,
              }
            : prev,
      );
    },
    [
      queryClient,
      dbId,
      currentUserId,
      currentUserName,
      liveStartDateIso,
      liveDueDateIso,
    ],
  );

  // Soft background reconcile — never blocks the instant local/cache patch.
  // Full ticket detail can take 10–15s under load; notifications feel instant
  // because they apply the broadcast payload directly. Mirror that here.
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSoftReconcile = useCallback(
    (opts?: { force?: boolean }) => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(
        () => {
          queryClient.invalidateQueries({ queryKey: ticketKeys.detail(dbId) });
          // RSC full-page props need a refresh; drawer is Query-driven so skip.
          if (!isDrawer) router.refresh();
        },
        opts?.force ? 0 : 1_200,
      );
    },
    [queryClient, dbId, isDrawer, router],
  );

  useEffect(() => {
    return () => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
    };
  }, []);

  // Sub-ticket / github / rare WAL events still need a refresh, but debounce
  // and never invalidate every task/board cache from the detail page.
  const handleTicketUpdate = useCallback(() => {
    scheduleSoftReconcile();
  }, [scheduleSoftReconcile]);

  const applyActivityLocally = useCallback(
    (event: TicketActivityEvent) => {
      const people = [...teamMembers, ...mentionableUsers];
      const actorName = resolveActivityActorName(
        event.actorId,
        currentUserId,
        currentUserName,
        people,
      );

      // Timers stay out of the activity feed
      const isTimer =
        event.action === "TIMER_STARTED" || event.action === "TIMER_STOPPED";
      if (!isTimer) {
        const entry = activityEntryFromEvent(event, actorName);
        if (event.action === "DATE_CHANGED") {
          // Replace optimistic self-entry with the confirmed broadcast (dedupe like comments)
          setLiveActivity((prev) => {
            const withoutOptimistic = prev.filter(
              (a) => !String(a.id).startsWith("DATE_CHANGED:optimistic:"),
            );
            if (withoutOptimistic.some((a) => a.id === entry.id)) {
              return withoutOptimistic;
            }
            knownActivityIds.current.add(entry.id);
            return [entry, ...withoutOptimistic];
          });
        } else if (!knownActivityIds.current.has(entry.id)) {
          knownActivityIds.current.add(entry.id);
          setLiveActivity((prev) =>
            prev.some((a) => a.id === entry.id) ? prev : [entry, ...prev],
          );
        }
      }

      const payload = event.payload ?? {};
      switch (event.action) {
        case "STATUS_CHANGED": {
          const to = payload.to as string | undefined;
          if (to) setLiveStatus(to);
          break;
        }
        case "ASSIGNED": {
          const toId = (payload.toId as string | null | undefined) ?? null;
          const toName = (payload.toName as string | null | undefined) ?? null;
          const member = toId
            ? teamMembers.find((m) => m.id === toId)
            : undefined;
          setLiveAssigneeId(toId);
          setLiveAssigneeName(toName);
          setLiveAssigneeAvatarUrl(member?.avatarUrl ?? null);
          break;
        }
        case "CO_ASSIGNEE_ADDED": {
          const userId = payload.userId as string | undefined;
          const userName =
            (payload.userName as string | undefined) ?? "Unknown";
          if (!userId) break;
          const member = teamMembers.find((m) => m.id === userId);
          setLiveCoAssignees((prev) =>
            prev.some((c) => c.id === userId)
              ? prev
              : [
                  ...prev,
                  {
                    id: userId,
                    name: userName,
                    avatarUrl: member?.avatarUrl ?? null,
                  },
                ],
          );
          break;
        }
        case "CO_ASSIGNEE_REMOVED": {
          const userId = payload.userId as string | undefined;
          if (userId) {
            setLiveCoAssignees((prev) => prev.filter((c) => c.id !== userId));
          }
          break;
        }
        case "QA_ASSIGNEE_ADDED": {
          const userId = payload.userId as string | undefined;
          const userName =
            (payload.userName as string | undefined) ?? "Unknown";
          if (!userId) break;
          const member = teamMembers.find((m) => m.id === userId);
          setLiveQaAssignees((prev) =>
            prev.some((c) => c.id === userId)
              ? prev
              : [
                  ...prev,
                  {
                    id: userId,
                    name: userName,
                    avatarUrl: member?.avatarUrl ?? null,
                  },
                ],
          );
          break;
        }
        case "QA_ASSIGNEE_REMOVED": {
          const userId = payload.userId as string | undefined;
          if (userId) {
            setLiveQaAssignees((prev) => prev.filter((c) => c.id !== userId));
          }
          break;
        }
        case "TITLE_CHANGED": {
          const to = payload.to as string | undefined;
          if (to) setTitleValue(to);
          break;
        }
        case "PRIORITY_CHANGED": {
          const to = payload.to as string | undefined;
          if (to) setLivePriority(uiPriorityFromDb(to));
          break;
        }
        case "DESCRIPTION_CHANGED": {
          if ("to" in payload) {
            setDescValue((payload.to as string | null | undefined) ?? "");
          } else {
            scheduleSoftReconcile();
          }
          break;
        }
        case "STORY_POINTS_CHANGED": {
          setLiveStoryPoints((payload.to as number | null | undefined) ?? null);
          break;
        }
        case "ESTIMATED_TIME_CHANGED": {
          setLiveEstimatedTime(
            (payload.to as number | null | undefined) ?? null,
          );
          break;
        }
        case "DATE_CHANGED": {
          setLiveStartDateIso(
            (payload.toStart as string | null | undefined) ?? null,
          );
          setLiveDueDateIso(
            (payload.toEnd as string | null | undefined) ?? null,
          );
          break;
        }
        case "SPRINT_CHANGED": {
          setLiveSprintId((payload.toId as string | null | undefined) ?? null);
          setLiveSprintName(
            (payload.toName as string | null | undefined) ?? null,
          );
          break;
        }
        case "MODULE_CHANGED": {
          setLiveModuleId((payload.toId as string | null | undefined) ?? null);
          setLiveModuleName(
            (payload.toName as string | null | undefined) ?? null,
          );
          break;
        }
        case "LABELS_CHANGED": {
          const added = (payload.added as string[] | undefined) ?? [];
          const removed = new Set(
            (payload.removed as string[] | undefined) ?? [],
          );
          setLiveLabels((prev) => [
            ...prev.filter((l) => !removed.has(l)),
            ...added.filter((l) => !prev.includes(l)),
          ]);
          break;
        }
        case "COMMENT_ADDED":
        case "MENTION": {
          const commentId = payload.commentId as string | undefined;
          const parentId =
            (payload.parentId as string | null | undefined) ?? null;
          if (commentId) void handleIncomingComment(commentId, parentId);
          break;
        }
        case "TIMER_STARTED":
        case "TIMER_STOPPED": {
          const timerKind = payload.kind === "QA" ? "QA" : "DEVELOPMENT";
          if (timerKind === "QA") {
            setLiveQaTimeEntries((prev) =>
              applyTimerEventToEntries(prev, event),
            );
          } else {
            setLiveTimeEntries((prev) => applyTimerEventToEntries(prev, event));
          }
          // Keep the actor's global timer indicator in sync with auto-start/stop
          if (
            event.actorId === currentUserId ||
            (payload.userId as string) === currentUserId
          ) {
            void useTimerStore.getState().syncFromServer();
          }
          break;
        }
        case "TIMER_RESET": {
          const actorId = event.actorId;
          if (actorId) {
            setLiveTimeEntries((prev) =>
              prev.filter((e) => e.userId !== actorId),
            );
          }
          if (actorId === currentUserId) {
            void useTimerStore.getState().syncFromServer();
          }
          break;
        }
        case "QA_TIME_LOGGED": {
          const durationSecs =
            (payload.durationSecs as number | undefined) ?? 0;
          const entryId =
            (payload.entryId as string | undefined) ?? `qa-${event.createdAt}`;
          const actorId = event.actorId;
          if (actorId && durationSecs > 0) {
            const nowIso = event.createdAt;
            const startedAt = new Date(
              new Date(nowIso).getTime() - durationSecs * 1000,
            ).toISOString();
            setLiveQaTimeEntries((prev) => {
              const existing = prev.find((e) => e.userId === actorId);
              const session = {
                id: entryId,
                startedAt,
                endedAt: nowIso,
                durationSecs,
              };
              if (existing) {
                return prev.map((e) =>
                  e.userId === actorId
                    ? {
                        ...e,
                        totalSecs: e.totalSecs + durationSecs,
                        sessions: [session, ...e.sessions],
                      }
                    : e,
                );
              }
              return [
                ...prev,
                {
                  userId: actorId,
                  userName: actorName,
                  avatarUrl: null,
                  totalSecs: durationSecs,
                  isRunning: false,
                  runningStartedAt: null,
                  sessions: [session],
                },
              ];
            });
          }
          break;
        }
        default:
          break;
      }

      // Patch React Query cache (drawer / client consumers) immediately.
      queryClient.setQueryData<TicketDetailProps>(
        ticketKeys.detail(dbId),
        (prev) => {
          if (!prev) return prev;
          return patchTicketDetailFromActivity(prev, event, actorName);
        },
      );

      // Only soft-refetch when the payload can't fully update the UI.
      if (ACTIVITY_NEEDS_REFETCH.has(event.action)) {
        scheduleSoftReconcile();
      }
    },
    [
      teamMembers,
      mentionableUsers,
      currentUserId,
      currentUserName,
      handleIncomingComment,
      queryClient,
      dbId,
      scheduleSoftReconcile,
    ],
  );

  // Full list refetch — used only for reconciliation (tab open, recovery).
  const refreshMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${dbId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setLiveMessages(data);
    } catch {
      // silently ignore — next manual refresh will catch it
    }
  }, [dbId]);

  // Append a message that arrived via broadcast — no fetch needed, data is in the payload.
  const appendMessage = useCallback(
    (msg: { id: string } & Record<string, unknown>) => {
      setLiveMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev
          : [...prev, msg as unknown as MessageData],
      );
    },
    [],
  );

  useEffect(() => {
    const supabase = createClient();
    const unsub = createTicketDetailSubscription(supabase, dbId, {
      onStatusChange: (s) => setLiveStatus(s),
      onCommentInsert: handleIncomingComment,
      // Field edits arrive via activity broadcast; only soft-reconcile sub-tickets.
      onSubTicketChange: handleTicketUpdate,
      // Messages are handled exclusively by createTicketChatSubscription below.
      // Keeping onMessageInsert here too causes duplicate appends + double toasts.
    });
    return unsub;
  }, [dbId, handleIncomingComment, handleTicketUpdate]);

  // Ticket activity broadcast — same transport as notifications. Apply payload
  // to local state + Query cache instantly; never block on a full detail refetch.
  useEffect(() => {
    const supabase = createClient();
    return createTicketActivitySubscription(
      supabase,
      dbId,
      applyActivityLocally,
    );
  }, [dbId, applyActivityLocally]);

  // Realtime chat — broadcast-based, sole handler for new messages.
  // Full message data is in the payload — appended to state instantly, zero fetch.
  // Outbound messages sent by this client are already in state via onSent,
  // so appendMessage's dedup (prev.some) silently skips them.
  useEffect(() => {
    const supabase = createClient();
    return createTicketChatSubscription(
      supabase,
      dbId,
      (message, direction) => {
        appendMessage(message);
        if (direction === "inbound") {
          try {
            const audio = new Audio("/sounds/notification.mp3");
            audio.volume = 0.5;
            audio.play().catch(() => undefined);
          } catch {
            /* ignore */
          }
          toast("Submitter replied", {
            description: "A new reply arrived — check the Reply to User tab.",
            icon: <MessageSquare className="size-4 text-pen-blue" />,
            action: {
              label: "View",
              onClick: () => setActiveTab("customer-chat"),
            },
          });
        }
      },
    );
  }, [dbId, appendMessage, refreshMessages]);

  // Poll for new messages only when the chat tab is open AND the browser tab is
  // visible. Broadcast handles the fast path; this catches emails that arrive
  // before Resend fires the webhook. 20s interval — low enough to catch stragglers,
  // high enough not to hammer the DB.
  useEffect(() => {
    if (activeTab !== "customer-chat") return;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/tickets/${dbId}/messages`);
        if (!res.ok) return;
        const fresh: MessageData[] = await res.json();
        setLiveMessages((prev) => {
          const knownIds = new Set(prev.map((m) => m.id));
          const incoming = fresh.filter(
            (m) => !knownIds.has(m.id) && !m.id.startsWith("pending-"),
          );
          return incoming.length > 0 ? [...prev, ...incoming] : prev;
        });
      } catch {
        /* silently ignore */
      }
    };
    const interval = setInterval(poll, 20_000);
    return () => clearInterval(interval);
  }, [activeTab, dbId]);

  // Reconciliation: ask the server to check Resend for any emails the webhook
  // may have missed. Runs immediately when the Chat tab opens, then repeats
  // every 30s while the tab stays open and visible — so a missed webhook
  // self-heals without the user needing to close/reopen the ticket. If any
  // are recovered the broadcast fires automatically, but we also refresh here
  // as a belt-and-suspenders measure.
  useEffect(() => {
    if (activeTab !== "customer-chat") return;
    let cancelled = false;
    const reconcile = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/tickets/${dbId}/messages/reconcile`, {
          method: "POST",
        });
        if (!res.ok || cancelled) return;
        const { reconciled } = await res.json();
        if (reconciled > 0 && !cancelled) await refreshMessages();
      } catch {
        // best-effort — silently ignore
      }
    };
    reconcile();
    const interval = setInterval(reconcile, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab, dbId, refreshMessages]);

  // Live GitHub Development section — the webhook broadcasts to
  // `ticket-github:{dbId}` when a linked PR changes state (e.g. merged), a new
  // PR is linked, or a commit lands; refresh to pull the updated data.
  useEffect(() => {
    const supabase = createClient();
    return createTicketGithubSubscription(supabase, dbId, handleTicketUpdate);
  }, [dbId, handleTicketUpdate]);

  // Auto-stop DEVELOPMENT timers when the ticket leaves In Progress.
  // QA timers are allowed in Review and later stages — do not stop those here.
  const { stopTimer: stopTimerAction } = useTimerActions();
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerKind = useTimerStore((s) => s.kind);
  const isTimerRunningHere = timerTicketDbId === dbId;
  useEffect(() => {
    if (!isTimerRunningHere) return;
    if (timerKind === "QA") return;
    if (normalizeStatus(liveStatus) !== "In Progress") {
      stopTimerAction(timerEntryId).catch(() => undefined);
    }
  }, [
    liveStatus,
    isTimerRunningHere,
    timerEntryId,
    timerKind,
    stopTimerAction,
  ]);

  const stackLen = useDrawerStore((s) => s.stack.length);
  const popDrawer = useDrawerStore((s) => s.pop);

  function openSubInDrawer(subId: string) {
    if (!isDrawer) return;
    if (stackLen >= 2) {
      replaceSub(subId);
    } else {
      pushSub(subId);
    }
  }
  const [addingSubTicket, setAddingSubTicket] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subSaving, setSubSaving] = useState(false);
  const [subsCollapsed, setSubsCollapsed] = useState(false);
  const subTitleRef = useRef<HTMLInputElement>(null);

  // Linking an existing ticket as a sub-ticket
  const [linking, setLinking] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<ProjectTicketSummary[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSavingId, setLinkSavingId] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [subToDelete, setSubToDelete] = useState<{
    id: string;
    humanId: string;
  } | null>(null);
  const [subToUnlink, setSubToUnlink] = useState<{
    id: string;
    humanId: string;
  } | null>(null);

  async function doDeleteSubTicket() {
    if (!subToDelete) return;
    const { id } = subToDelete;
    await deleteTicket(id);
    setSubTickets((prev) => prev.filter((s) => s.dbId !== id));
  }

  async function createSubTicket(e: React.FormEvent) {
    e.preventDefault();
    const t = subTitle.trim();
    if (!t) return;
    setSubSaving(true);
    try {
      const created = await createTicket({
        title: t,
        priority: "Low",
        projectId,
        teamId,
        parentId: dbId,
      });
      setSubTickets((prev) => [
        ...prev,
        {
          dbId: created.id,
          humanId: `${created.team?.prefix ?? "?"}-${created.ticketNumber}`,
          title: created.title,
          status: created.status ?? "To Do",
          done: false,
          priority: "low" as const,
          assigneeName: null,
          assigneeAvatarUrl: null,
          canDelete: true,
        },
      ]);
      setSubTitle("");
      setAddingSubTicket(false);
    } catch {
      /* silently ignore */
    }
    setSubSaving(false);
  }

  function openLinkPicker() {
    setSubsCollapsed(false);
    setAddingSubTicket(false);
    setLinking(true);
    setLinkError(null);
    setTimeout(() => linkInputRef.current?.focus(), 0);
    if (!projectId) return;
    setLinkLoading(true);
    listProjectTickets(projectId)
      .then(setLinkResults)
      .catch(() => setLinkError("Could not load tickets"))
      .finally(() => setLinkLoading(false));
  }

  function closeLinkPicker() {
    setLinking(false);
    setLinkQuery("");
    setLinkError(null);
  }

  const existingSubIds = useMemo(
    () => new Set(subTickets.map((s) => s.dbId)),
    [subTickets],
  );

  const linkCandidates = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    return linkResults
      .filter((t) => t.id !== dbId && !existingSubIds.has(t.id))
      .filter((t) => {
        if (!q) return true;
        const human = `${t.team.prefix}-${t.ticketNumber}`.toLowerCase();
        return human.includes(q) || t.title.toLowerCase().includes(q);
      })
      .slice(0, 20);
  }, [linkResults, linkQuery, dbId, existingSubIds]);

  async function linkSubTicket(candidate: ProjectTicketSummary) {
    setLinkSavingId(candidate.id);
    setLinkError(null);
    try {
      await updateTicket(candidate.id, { parentId: dbId });
      setSubTickets((prev) => [
        ...prev,
        {
          dbId: candidate.id,
          humanId: `${candidate.team.prefix}-${candidate.ticketNumber}`,
          title: candidate.title,
          status: candidate.status,
          done: false,
          priority: uiPriorityFromDb(candidate.priority),
          assigneeName: candidate.assignee?.name ?? null,
          assigneeAvatarUrl: candidate.assignee?.avatarUrl ?? null,
          canDelete: true,
        },
      ]);
      closeLinkPicker();
    } catch (err) {
      setLinkError(
        err instanceof Error ? err.message : "Failed to link ticket",
      );
    }
    setLinkSavingId(null);
  }

  async function doUnlinkSubTicket() {
    if (!subToUnlink) return;
    const { id } = subToUnlink;
    const prev = subTickets;
    setSubTickets((cur) => cur.filter((s) => s.dbId !== id));
    try {
      await updateTicket(id, { parentId: null });
    } catch {
      setSubTickets(prev);
    }
  }

  async function doDeleteTicket() {
    await deleteTicket(dbId);
    if (isDrawer && onClose) {
      onClose();
      router.refresh();
    } else {
      router.push(backHref ?? "/board");
      router.refresh();
    }
  }

  async function saveTitle() {
    const t = titleValue.trim();
    if (!t || t === title) {
      setTitleEditing(false);
      return;
    }
    setTitleSaving(true);
    await updateTicket(dbId, { title: t }).catch(() => null);
    setTitleSaving(false);
    setTitleEditing(false);
  }

  async function saveDescription() {
    setDescSaving(true);
    const ok = await updateTicket(dbId, {
      description: descValue || null,
    }).catch(() => null);
    if (ok !== null) {
      const attachmentIds = extractAttachmentIdsFromHtml(descValue);
      if (attachmentIds.length > 0) {
        await fetch(`/api/tickets/${dbId}/attachments/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachmentIds }),
        }).catch(() => null);
      }
    }
    setDescSaving(false);
    setDescEditing(false);
    setDescEditorExpanded(false);
    setDescViewExpanded(false);
  }

  function cancelDescription() {
    setDescValue(description ?? "");
    setDescEditing(false);
    setDescEditorExpanded(false);
    setDescViewExpanded(false);
  }

  function startDescriptionEdit() {
    setDescViewExpanded(false);
    setDescExpanded(true);
    setDescEditing(true);
  }

  async function saveTemplateFields() {
    setTemplateSaving(true);
    try {
      const next =
        Object.keys(templateFieldValues).length > 0
          ? templateFieldValues
          : null;
      await updateTicket(dbId, { templateData: next });
      setCommittedTemplateData(next);
      setTemplateEditing(false);
      toast.success("Template fields saved");
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(dbId) });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save template fields",
      );
    } finally {
      setTemplateSaving(false);
    }
  }

  function cancelTemplateFields() {
    setTemplateFieldValues(committedTemplateData ?? {});
    setTemplateEditing(false);
  }

  const hasTemplateData =
    !!committedTemplateData && Object.keys(committedTemplateData).length > 0;

  // Support-project tickets hide features that don't apply to support work:
  // sub-tickets, story points, and asset links.
  const isSupport = projectKind === "support";

  const isImageFile = (fileName: string | undefined | null) =>
    /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(fileName ?? "");

  // templateData entries are either wrapped ({ label, type, value }) on newer
  // tickets, or bare values keyed by field id on older ones.
  const normalizeTemplateEntry = ([fieldId, raw]: [string, any]) => {
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      "value" in raw
    ) {
      return {
        fieldId,
        label: raw.label || fieldId,
        type: raw.type || "text",
        value: raw.value,
      };
    }
    const isFiles =
      Array.isArray(raw) &&
      raw.length > 0 &&
      typeof raw[0] === "object" &&
      raw[0] &&
      "url" in raw[0];
    return {
      fieldId,
      label: fieldId,
      type: isFiles ? "file" : "text",
      value: raw,
    };
  };

  const setTemplateFieldValue = (fieldId: string, newValue: any) => {
    setTemplateFieldValues((prev) => {
      const existing = prev[fieldId];
      const wrapped =
        existing &&
        typeof existing === "object" &&
        !Array.isArray(existing) &&
        "value" in existing;
      return {
        ...prev,
        [fieldId]: wrapped ? { ...existing, value: newValue } : newValue,
      };
    });
  };

  const searchParams = useSearchParams();
  const fromCtx = searchParams.get("from");
  const backProjectId = searchParams.get("projectId");
  const backProjectSlug = searchParams.get("projectSlug");
  const backProjectName = searchParams.get("projectName");
  const backTab = searchParams.get("tab");
  const backTeamName = searchParams.get("teamName");
  const backTeamId = searchParams.get("teamId");

  type Crumb = { label: string; href: string };
  const crumbs: Crumb[] = [];

  if (fromCtx === "board") {
    crumbs.push({ label: "Board", href: "/board" });
  } else if (fromCtx === "project" && backProjectSlug) {
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({
      label: backProjectName ?? "Project",
      href: `/projects/${backProjectSlug}`,
    });
    if (backTab === `team:${backTeamId}` && backTeamName) {
      crumbs.push({
        label: backTeamName,
        href: `/projects/${backProjectSlug}?tab=${encodeURIComponent(backTab)}`,
      });
    } else if (backTab === "tickets") {
      crumbs.push({
        label: "All tasks",
        href: `/projects/${backProjectSlug}?tab=tickets`,
      });
    } else if (backTab === "overview") {
      crumbs.push({
        label: backProjectName ?? "Project",
        href: `/projects/${backProjectSlug}`,
      });
    }
  }

  const backHref = crumbs[crumbs.length - 1]?.href ?? null;

  const { data: departmentLabelOptions } = useLabels();

  const statusColorMap = Object.fromEntries(
    effectiveTeamStatuses.map((s) => [s.label, s.color]),
  );

  const currentStatusAllowedLabels = useMemo(() => {
    const linked = effectiveTeamStatuses.find(
      (s) => s.label === liveStatus,
    )?.allowedLabels;
    const labels = Array.isArray(departmentLabelOptions)
      ? departmentLabelOptions
      : [];
    return buildLinkedLabelOptions(linked, labels).map((option) => option.name);
  }, [effectiveTeamStatuses, liveStatus, departmentLabelOptions]);

  // Time tracking is only available when the ticket is actively being worked on ("In Progress").
  const isTicketActive = normalizeStatus(liveStatus) === "In Progress";

  const doneSubs = subTickets.filter((s) => s.done).length;
  const subPercent = subTickets.length
    ? (doneSubs / subTickets.length) * 100
    : 0;

  async function copyLink() {
    const ticketUrl = `${window.location.origin}/tickets/${dbId}`;
    await navigator.clipboard.writeText(ticketUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }


  async function publishDraft() {
    if (publishingDraft) return;
    setPublishingDraft(true);
    try {
      const res = await fetch(`/api/tickets/${dbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDraft: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Failed to publish draft");
        return;
      }
      setDraftBannerVisible(false);
      invalidateTaskCaches(queryClient);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(dbId) });
      toast.success("Draft published");
      router.refresh();
    } finally {
      setPublishingDraft(false);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete ticket"
        description={`Delete ticket ${ticketId}? This cannot be undone.`}
        confirmLabel="Delete"
        successMessage={`Ticket ${ticketId} deleted`}
        onConfirm={doDeleteTicket}
      />
      <ConfirmDialog
        open={!!subToDelete}
        onOpenChange={(open) => {
          if (!open) setSubToDelete(null);
        }}
        title="Delete sub-ticket"
        description={`Delete sub-ticket ${subToDelete?.humanId ?? ""}? This cannot be undone.`}
        confirmLabel="Delete"
        successMessage={`Sub-ticket ${subToDelete?.humanId ?? ""} deleted`}
        onConfirm={doDeleteSubTicket}
      />
      <ConfirmDialog
        open={!!subToUnlink}
        onOpenChange={(open) => {
          if (!open) setSubToUnlink(null);
        }}
        title="Unlink sub-ticket"
        description={`Remove ${subToUnlink?.humanId ?? ""} from this ticket's sub-tickets? The ticket itself won't be deleted.`}
        confirmLabel="Unlink"
        successMessage={`${subToUnlink?.humanId ?? ""} unlinked`}
        onConfirm={doUnlinkSubTicket}
      />
      <div
        className={cn(
          "flex min-h-0 w-full overflow-hidden bg-pen-bg",
          isDrawer ? "h-full" : "h-[calc(100dvh-3rem)]",
        )}
      >
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pt-[22px]",
            // Comments + chat pin the composer to the bottom, so they need
            // almost no trailing padding; other tabs keep breathing room.
            activeTab === "customer-chat" || activeTab === "comments"
              ? "pb-2"
              : "pb-16",
          )}
        >
          <div className="w-full space-y-3.5 px-8">
            {draftBannerVisible && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-950/40">
                <span className="font-sans text-[12.5px] text-amber-900 dark:text-amber-100">
                  This is a personal draft. Only you
                  {currentUser?.role === "admin" ? " (and admins)" : ""} can see
                  it until you publish.
                </span>
                <span className="min-w-0 flex-1" />
                {(canEditTicket || isDraft) && (
                  <button
                    type="button"
                    disabled={publishingDraft}
                    onClick={() => void publishDraft()}
                    className="flex h-7 items-center rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
                  >
                    {publishingDraft ? "Publishing…" : "Publish draft"}
                  </button>
                )}
              </div>
            )}
            {/* Breadcrumb + back */}
            {crumbs.length > 0 && !isDrawer && (
              <div className="flex items-center gap-1.5">
                {backHref && (
                  <Link
                    href={backHref}
                    className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                    aria-label="Go back"
                  >
                    <ArrowLeft className="size-3.5" strokeWidth={2} />
                  </Link>
                )}
                {crumbs.map((c, i) => (
                  <span key={c.href} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <ChevronRight
                        className="size-3 shrink-0 text-pen-subtle"
                        strokeWidth={1.5}
                      />
                    )}
                    <Link
                      href={c.href}
                      className={cn(
                        "font-sans text-[11.5px] transition-colors hover:text-pen-foreground",
                        i === crumbs.length - 1
                          ? "font-semibold text-pen-foreground"
                          : "text-pen-muted",
                      )}
                    >
                      {c.label}
                    </Link>
                  </span>
                ))}
              </div>
            )}

            {/* Ticket ID + project + actions */}
            <div className="flex min-w-0 items-center gap-2">
              <span
                title={`Ticket number ${ticketId}`}
                className="shrink-0 whitespace-nowrap font-mono text-[11.5px] font-semibold text-pen-id"
              >
                {ticketId}
              </span>
              {projectName &&
                (projectId ? (
                  <Link
                    href={`/projects/${projectId}`}
                    onClick={isDrawer ? onClose : undefined}
                    title={`Go to ${projectName}`}
                    className="group/proj flex min-w-0 items-center gap-1.5 transition-colors hover:text-pen-blue"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: projectColor || "#0a76b9" }}
                    />
                    <span className="truncate font-sans text-[12px] font-semibold text-pen-foreground group-hover/proj:text-pen-blue">
                      {projectName}
                    </span>
                  </Link>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: projectColor || "#0a76b9" }}
                    />
                    <span className="truncate font-sans text-[12px] font-semibold text-pen-foreground">
                      {projectName}
                    </span>
                  </div>
                ))}
              <span className="flex-1" />
              {isDrawer && (
                <Link
                  href={`/tasks/${dbId}`}
                  title="Open this ticket as a full page"
                  onClick={onClose}
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap font-sans text-[11.5px] font-semibold text-pen-foreground transition-opacity hover:opacity-70"
                >
                  <Maximize2 className="size-3" />
                  Open full page
                </Link>
              )}
              <button
                type="button"
                onClick={copyLink}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap font-sans text-[11.5px] font-semibold text-pen-foreground hover:opacity-70"
              >
                <Copy className="size-3" />
                {copied ? "Copied" : "Copy link"}
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete ticket"
                  className="flex size-6 items-center justify-center rounded-md text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>

            {/* Parent ticket link */}
            {parentTicket && (
              <div className="flex items-center gap-1.5">
                {isDrawer ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center gap-1.5 rounded-md bg-pen-surface px-2 py-1 font-sans text-[11.5px] text-pen-muted transition-colors hover:bg-pen-card-border hover:text-pen-foreground"
                  >
                    <ChevronRight className="size-3 shrink-0 rotate-180" />
                    <span className="font-mono font-semibold text-pen-id">
                      {parentTicket.humanId}
                    </span>
                    <span className="truncate max-w-50">
                      {parentTicket.title}
                    </span>
                  </button>
                ) : (
                  <Link
                    href={`/tickets/${parentTicket.dbId}`}
                    className="flex items-center gap-1.5 rounded-md bg-pen-surface px-2 py-1 font-sans text-[11.5px] text-pen-muted transition-colors hover:bg-pen-card-border hover:text-pen-foreground"
                  >
                    <ChevronRight className="size-3 shrink-0 rotate-180" />
                    <span className="font-mono font-semibold text-pen-id">
                      {parentTicket.humanId}
                    </span>
                    <span className="truncate max-w-50">
                      {parentTicket.title}
                    </span>
                  </Link>
                )}
              </div>
            )}

            {/* Title */}
            <div className="group flex items-start gap-2">
              {titleEditing ? (
                <>
                  <textarea
                    ref={titleInputRef}
                    value={titleValue}
                    onChange={(e) => {
                      setTitleValue(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveTitle();
                      }
                      if (e.key === "Escape") {
                        setTitleValue(title);
                        setTitleEditing(false);
                      }
                    }}
                    disabled={titleSaving}
                    rows={1}
                    className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent font-sans text-[21px] font-semibold leading-6.75 text-pen-foreground outline-none disabled:opacity-60"
                    style={{ minHeight: "36px" }}
                    autoFocus
                    onFocus={(e) => {
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                  />
                  <div className="mt-1 flex shrink-0 items-center gap-1">
                    <AiComposeButton
                      mode="title"
                      iconOnly
                      getTitle={() => titleValue}
                      getDescription={() => descValue}
                      onApply={(r) => setTitleValue(r.title)}
                      className="size-6"
                    />
                    <button
                      type="button"
                      onClick={saveTitle}
                      disabled={titleSaving}
                      title="Save"
                      className="flex size-6 items-center justify-center rounded-md bg-pen-id text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {titleSaving ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTitleValue(title);
                        setTitleEditing(false);
                      }}
                      disabled={titleSaving}
                      title="Cancel"
                      className="flex size-6 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-60"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="min-w-0 flex-1 pen-text-title-lg leading-[27px]">
                    {titleValue}
                  </h1>
                  {canEditTicket && (
                    <button
                      type="button"
                      onClick={() => {
                        setTitleValue(title);
                        setTitleEditing(true);
                      }}
                      className="mt-1 shrink-0 rounded-md p-1 text-pen-subtle transition-opacity hover:bg-pen-surface hover:text-pen-foreground"
                      title="Edit title"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Status + labels row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <SharedStatusPill
                status={liveStatus}
                color={statusColorMap[liveStatus]}
                size="md"
              />

              <PriorityPill
                priority={livePriority}
                status={liveStatus}
                size="md"
              />

              <SlaIndicatorBadge ticketId={dbId} size="md" />

              {/* Label pills */}
              {liveLabels.map((lbl) => (
                <span key={lbl} className="group relative inline-flex">
                  <TagPill label={lbl} size="md" />
                  <button
                    type="button"
                    onClick={() =>
                      handleLabelsChange(liveLabels.filter((l) => l !== lbl))
                    }
                    className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-pen-red text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-2" />
                  </button>
                </span>
              ))}
              <LabelPicker
                current={liveLabels}
                onChange={handleLabelsChange}
                allowedLabels={currentStatusAllowedLabels}
              />

              {/* Chat reply-awaiting status — only for intake tickets with messages */}
              {chatReplyStatus && (
                <span
                  className={cn(
                    "inline-flex items-center whitespace-nowrap py-0.5 font-sans text-[11.5px] font-medium ring-1 ring-inset ring-black/4 dark:ring-white/10",
                    chatReplyStatus === "awaiting-customer"
                      ? "bg-[#fffbeb] text-[#b45309] dark:bg-[#3a3018] dark:text-[#fcd34d]"
                      : "bg-[#ecfeff] text-[#0e7490] dark:bg-[#143038] dark:text-[#67e8f9]",
                  )}
                  style={{
                    clipPath:
                      "polygon(0 0, calc(100% - 7px) 0%, 100% 50%, calc(100% - 7px) 100%, 0 100%, 5px 50%)",
                    paddingLeft: "9px",
                    paddingRight: "11px",
                  }}
                >
                  {chatReplyStatus === "awaiting-customer"
                    ? "Waiting for customer"
                    : "Waiting for assignee"}
                </span>
              )}
            </div>

            {/* Date range + metrics */}
            {/* {(startDateIso || dueDateIso || closedAtIso) && (() => {
              const now = new Date();
              const start = startDateIso ? new Date(startDateIso) : null;
              const due = dueDateIso ? new Date(dueDateIso) : null;
              const closed = closedAtIso ? new Date(closedAtIso) : null;

              const MS_PER_HOUR = 3_600_000;
              const MS_PER_DAY = 86_400_000;


              const fmtDuration = (ms: number) => {
                const totalMins = Math.round(Math.abs(ms) / 60_000);
                const d = Math.floor(totalMins / 1440);
                const h = Math.floor((totalMins % 1440) / 60);
                const m = totalMins % 60;
                if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
                if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
                return `${m}m`;
              };

              const fmtDate = (d: Date) =>
                d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

              const fmtDateTime = (d: Date) =>
                d.toLocaleString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                });

          
              const plannedMs = start && due ? due.getTime() - start.getTime() : null;

       
              const remainingMs = !closed && due ? due.getTime() - now.getTime() : null;

           
              const overdueMs = !closed && due && due < now ? now.getTime() - due.getTime() : null;

     
              const cycleMs = closed && start ? closed.getTime() - start.getTime() : null;

      
              const earlyLateMs = closed && due ? due.getTime() - closed.getTime() : null;

 
              const elapsedPct =
                !closed && start && due && due > start
                  ? Math.min(100, Math.max(0, Math.round(
                      ((now.getTime() - start.getTime()) / (due.getTime() - start.getTime())) * 100,
                    )))
                  : null;

              return (
                <div className="flex flex-col gap-2">
     
                  <div className="flex items-center gap-1.5 font-sans text-[12px] text-pen-muted">
                    <Clock className="size-[13px] shrink-0 text-pen-subtle" />
                    {start ? (
                      <span>{fmtDate(start)}</span>
                    ) : (
                      <span className="text-pen-subtle">No start</span>
                    )}
                    <ArrowRight size={11} strokeWidth={2} className="shrink-0 text-pen-subtle" />
                    {due ? (
                      <span className={cn("font-semibold", dueOverdue ? "text-pen-red" : "text-pen-foreground")}>
                        {fmtDate(due)}
                      </span>
                    ) : (
                      <span className="text-pen-subtle">No due date</span>
                    )}
                    {dueOverdue && !closed && (
                      <span className="rounded-full bg-pen-red/10 px-[7px] py-[2px] font-sans text-[11.5px] font-semibold text-pen-red">
                        Overdue
                      </span>
                    )}
                  </div>

            
                  <div className="flex flex-wrap gap-1.5">
   
                    {plannedMs !== null && (
                      <span className="rounded-full bg-pen-surface px-[8px] py-[3px] font-sans text-[11px] text-pen-muted">
                        {fmtDuration(plannedMs)} planned
                      </span>
                    )}

                
                    {remainingMs !== null && remainingMs > 0 && (
                      <span className="rounded-full bg-pen-surface px-[8px] py-[3px] font-sans text-[11px] text-pen-muted">
                        {fmtDuration(remainingMs)} remaining
                      </span>
                    )}

           
                    {overdueMs !== null && overdueMs > 0 && (
                      <span className="rounded-full bg-pen-red/10 px-[8px] py-[3px] font-sans text-[11px] font-semibold text-pen-red">
                        {fmtDuration(overdueMs)} overdue
                      </span>
                    )}

                
                    {closed && (
                      <span className="rounded-full bg-pen-green/10 px-[8px] py-[3px] font-sans text-[11px] text-pen-green">
                        Closed {fmtDateTime(closed)}
                      </span>
                    )}

               
                    {cycleMs !== null && (
                      <span className="rounded-full bg-pen-surface px-[8px] py-[3px] font-sans text-[11px] text-pen-muted">
                        {fmtDuration(cycleMs)} cycle time
                      </span>
                    )}

              
                    {earlyLateMs !== null && (
                      <span
                        className={cn(
                          "rounded-full px-[8px] py-[3px] font-sans text-[11px] font-semibold",
                          earlyLateMs >= 0 ? "bg-pen-green/10 text-pen-green" : "bg-pen-red/10 text-pen-red",
                        )}
                      >
                        {earlyLateMs >= 0
                          ? `${fmtDuration(earlyLateMs)} early`
                          : `${fmtDuration(earlyLateMs)} late`}
                      </span>
                    )}
                  </div>

            
                  {elapsedPct !== null && (
                    <div className="flex items-center gap-2">
                      <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-pen-surface">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            elapsedPct >= 90 ? "bg-pen-red" : elapsedPct >= 70 ? "bg-yellow-400" : "bg-pen-blue",
                          )}
                          style={{ width: `${elapsedPct}%` }}
                        />
                      </div>
                      <span className="shrink-0 font-sans text-[10.5px] text-pen-subtle">{elapsedPct}%</span>
                    </div>
                  )}
                </div>
              );
            })()} */}

            {/* Description — hidden for intake-form tickets and template-based tickets */}
            {!intake && !hasTemplateData && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => !descEditing && setDescExpanded((v) => !v)}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 text-left",
                      descEditing ? "cursor-default" : "cursor-pointer",
                    )}
                    aria-expanded={descExpanded}
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-pen-muted transition-transform duration-200",
                        !descExpanded && "-rotate-90",
                        descEditing && "opacity-40",
                      )}
                    />
                    <span className="font-sans text-[13px] font-semibold uppercase tracking-wide text-pen-foreground">
                      Description
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {!descEditing && !isHydrating && descValue ? (
                      <ExpandDescriptionButton
                        onClick={() => {
                          setDescExpanded(true);
                          setDescViewExpanded(true);
                        }}
                      />
                    ) : null}
                    {!descEditing && canEditDescription && !isHydrating ? (
                      <button
                        type="button"
                        onClick={startDescriptionEdit}
                        className="font-sans text-[13px] font-medium text-pen-muted hover:text-pen-id"
                      >
                        {descValue ? "Edit" : "Add"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {(descExpanded || descEditing) && (
                  <>
                    {descEditing ? (
                      <ExpandableDescriptionEditor
                        scopeId="ticket-description-editor"
                        content={descValue}
                        onChange={setDescValue}
                        expanded={descEditorExpanded}
                        onExpandedChange={setDescEditorExpanded}
                        showLabel={false}
                        placeholder="Add a description… use the toolbar for formatting."
                        inlineClassName="min-h-[160px]"
                        editorAction={
                          <AiComposeButton
                            mode="description"
                            iconOnly
                            getTitle={() => titleValue}
                            getDescription={() => descValue}
                            onApply={(r) => setDescValue(r.description)}
                          />
                        }
                        footer={
                          <>
                            <button
                              type="button"
                              onClick={cancelDescription}
                              className="h-7 rounded-md border border-pen-card-border px-3 font-sans text-[12px] text-pen-muted hover:bg-pen-surface"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={descSaving}
                              onClick={saveDescription}
                              className="h-7 rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
                            >
                              {descSaving ? "Saving…" : "Save"}
                            </button>
                          </>
                        }
                      />
                    ) : isHydrating ? (
                      <DescriptionHydrating />
                    ) : descValue ? (
                      <>
                        <RichTextDisplay html={descValue} />
                        <ExpandableDescriptionViewer
                          html={descValue}
                          expanded={descViewExpanded}
                          onExpandedChange={setDescViewExpanded}
                        />
                      </>
                    ) : canEditDescription ? (
                      <p className="font-sans text-[12.5px] text-pen-subtle">
                        No description
                      </p>
                    ) : (
                      <p className="font-sans text-[12.5px] text-pen-subtle">
                        No description
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Template Fields — shown in place of the description for template-based tickets */}
            {hasTemplateData && (
              <div className="flex flex-col rounded-xl border border-pen-card-border bg-pen-card">
                <div className="flex items-center justify-between border-b border-pen-card-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-pen-blue-tint text-pen-id">
                      <LayoutTemplate className="size-3.5" />
                    </span>
                    <SectionLabel>Template Fields</SectionLabel>
                  </div>
                  {!templateEditing && canEditTicket && (
                    <button
                      type="button"
                      onClick={() => setTemplateEditing(true)}
                      className="font-sans text-[11.5px] text-pen-subtle hover:text-pen-id"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {templateEditing ? (
                  <div className="space-y-3 px-4 py-4">
                    {Object.entries(committedTemplateData!).map((entry) => {
                      const { fieldId, label, type } =
                        normalizeTemplateEntry(entry);
                      const currentValue = normalizeTemplateEntry([
                        fieldId,
                        templateFieldValues[fieldId] ?? entry[1],
                      ]).value;

                      // File fields aren't editable here — just show the attached files
                      if (type === "file") {
                        return (
                          <div key={fieldId} className="space-y-1">
                            <label className="font-sans text-[12px] font-medium text-pen-foreground">
                              {label}
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {(Array.isArray(currentValue)
                                ? currentValue
                                : []
                              ).map((file: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 rounded-md bg-pen-surface px-2.5 py-1.5"
                                >
                                  <span className="font-sans text-[12px] text-pen-foreground">
                                    {file.fileName || "File"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={fieldId} className="space-y-1">
                          <label className="font-sans text-[12px] font-medium text-pen-foreground">
                            {label}
                          </label>
                          {type === "textarea" ||
                          (typeof currentValue === "string" &&
                            currentValue.includes("\n")) ? (
                            <textarea
                              value={currentValue ?? ""}
                              onChange={(e) =>
                                setTemplateFieldValue(fieldId, e.target.value)
                              }
                              className="min-h-24 w-full rounded-md border border-pen-card-border bg-pen-bg px-3 py-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30"
                            />
                          ) : (
                            <input
                              type="text"
                              value={currentValue ?? ""}
                              onChange={(e) =>
                                setTemplateFieldValue(fieldId, e.target.value)
                              }
                              className="w-full rounded-md border border-pen-card-border bg-pen-bg px-3 py-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30"
                            />
                          )}
                        </div>
                      );
                    })}
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelTemplateFields}
                        className="h-7 rounded-md border border-pen-card-border px-3 font-sans text-[12px] text-pen-muted hover:bg-pen-surface"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={templateSaving}
                        onClick={saveTemplateFields}
                        className="h-7 rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
                      >
                        {templateSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 px-4 py-4">
                    {Object.entries(committedTemplateData!).map((entry) => {
                      const { fieldId, label, type, value } =
                        normalizeTemplateEntry(entry);

                      // Handle file fields — image previews + download tiles for the rest
                      if (type === "file") {
                        const files = Array.isArray(value) ? value : [];
                        const images = files.filter((f: any) =>
                          isImageFile(f?.fileName),
                        );
                        const others = files.filter(
                          (f: any) => !isImageFile(f?.fileName),
                        );
                        return (
                          <div
                            key={fieldId}
                            className="rounded-lg border border-pen-card-border bg-pen-surface px-3.5 py-3"
                          >
                            <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                              {label}
                            </p>
                            {files.length === 0 && (
                              <p className="font-sans text-[12.5px] text-pen-subtle">
                                No files
                              </p>
                            )}
                            {images.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {images.map((file: any, idx: number) => (
                                  <a
                                    key={idx}
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group relative block overflow-hidden rounded-lg border border-pen-card-border bg-pen-bg"
                                    title={file.fileName}
                                  >
                                    <img
                                      src={file.url}
                                      alt={file.fileName || "Image"}
                                      className="block h-28 w-auto max-w-56 object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                                      <ExternalLink className="size-3 shrink-0 text-white" />
                                      <span className="truncate font-sans text-[10.5px] text-white">
                                        {file.fileName || "View image"}
                                      </span>
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}
                            {others.length > 0 && (
                              <div
                                className={cn(
                                  "flex flex-wrap gap-2",
                                  images.length > 0 && "mt-2",
                                )}
                              >
                                {others.map((file: any, idx: number) => (
                                  <a
                                    key={idx}
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-bg px-3 py-2 transition-colors hover:border-pen-blue/50 hover:bg-pen-blue-tint/30"
                                    title={file.fileName}
                                  >
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-pen-blue-tint text-pen-id">
                                      <Download className="size-3.5" />
                                    </span>
                                    <span className="max-w-48 truncate font-sans text-[12px] font-medium text-pen-foreground">
                                      {file.fileName || "File"}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Handle text fields
                      return (
                        <div
                          key={fieldId}
                          className="rounded-lg border border-pen-card-border bg-pen-surface px-3.5 py-3"
                        >
                          <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                            {label}
                          </p>
                          <p className="font-sans text-[12.5px] text-pen-foreground whitespace-pre-wrap wrap-break-word">
                            {value || "-"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Intake */}
            {intake && <IntakeCard intake={intake} />}

            {/* AI assist */}
            <TicketAssistPanel dbId={dbId} isIntake={!!intake} />

            {/* GitHub development activity */}
            {github && <GitHubDevSection data={github} />}

            {/* Sub-tickets — not shown for support tickets */}
            {!isSupport && (
              <div className="rounded-lg border border-pen-card-border/70 bg-pen-surface/40">
                {/* Header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setSubsCollapsed((v) => !v)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    {subsCollapsed ? (
                      <ChevronRight className="size-3.5 shrink-0 text-pen-subtle" />
                    ) : (
                      <ChevronDown className="size-3.5 shrink-0 text-pen-subtle" />
                    )}
                    <SectionLabel>Sub-tickets</SectionLabel>
                    {subTickets.length > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-px font-sans text-[11.5px] font-medium",
                          subPercent === 100
                            ? "bg-pen-green/10 text-pen-green"
                            : "bg-pen-surface text-pen-subtle",
                        )}
                      >
                        {doneSubs}/{subTickets.length}
                      </span>
                    )}
                    {subsCollapsed && subTickets.length > 0 && (
                      <span className="h-[3px] w-16 overflow-hidden rounded-full bg-pen-surface">
                        <span
                          className="block h-full rounded-full bg-pen-green"
                          style={{ width: `${subPercent}%` }}
                        />
                      </span>
                    )}
                    <span className="flex-1" />
                    {subTickets.length === 0 && (
                      <span className="font-sans text-[11.5px] text-pen-subtle">
                        None
                      </span>
                    )}
                  </button>
                  {/* Actions in header (kept reachable while collapsed) */}
                  {canEditTicket && subsCollapsed && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSubsCollapsed(false);
                          setLinking(false);
                          setAddingSubTicket(true);
                          setTimeout(() => subTitleRef.current?.focus(), 0);
                        }}
                        className="flex shrink-0 items-center gap-1 font-sans text-[11.5px] font-medium text-pen-subtle transition-colors hover:text-pen-blue"
                      >
                        <Plus className="size-3.5" />
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={openLinkPicker}
                        className="flex shrink-0 items-center gap-1 font-sans text-[11.5px] font-medium text-pen-subtle transition-colors hover:text-pen-blue"
                      >
                        <Link2 className="size-3.5" />
                        Link
                      </button>
                    </>
                  )}
                </div>

                {!subsCollapsed && (
                  <div className="px-3 pb-2.5">
                    {/* Slim progress bar */}
                    {subTickets.length > 0 && (
                      <div className="mb-2.5 h-[3px] w-full overflow-hidden rounded-full bg-pen-surface">
                        <div
                          className="h-full rounded-full bg-pen-green transition-all duration-500"
                          style={{ width: `${subPercent}%` }}
                        />
                      </div>
                    )}

                    {/* Sub-ticket rows — checklist */}
                    {subTickets.length > 0 && (
                      <div className="flex flex-col gap-px">
                        {subTickets.map((st) => (
                          <Link
                            key={st.dbId}
                            href={`/tickets/${st.dbId}`}
                            onClick={
                              isDrawer
                                ? (e) => {
                                    e.preventDefault();
                                    setSubModalId(st.dbId);
                                  }
                                : undefined
                            }
                            className="group/sub flex min-h-[34px] items-center gap-2.5 rounded-md px-2 py-1 transition-colors hover:bg-pen-surface"
                          >
                            {/* Completion checkbox (reflects status.isComplete) */}
                            {st.done ? (
                              <CheckSquare className="size-4 shrink-0 text-pen-green" />
                            ) : (
                              <Square className="size-4 shrink-0 text-pen-subtle" />
                            )}
                            {/* ID */}
                            <span className="font-mono text-[11.5px] font-semibold text-pen-id shrink-0">
                              {st.humanId}
                            </span>
                            {/* Title */}
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate font-sans text-[12.5px]",
                                st.done
                                  ? "text-pen-subtle line-through decoration-pen-subtle/50"
                                  : "text-pen-foreground",
                              )}
                            >
                              {st.title}
                            </span>
                            {/* Priority indicator */}
                            {st.priority === "urgent" && !st.done && (
                              <span className="shrink-0 rounded-full bg-[#ff4500]/10 px-1.5 py-px font-sans text-[9.5px] font-semibold text-[#dd3300] dark:text-[#ff9466]">
                                Urgent
                              </span>
                            )}
                            {st.priority === "critical" && !st.done && (
                              <span className="shrink-0 rounded-full bg-pen-red/10 px-1.5 py-px font-sans text-[9.5px] font-semibold text-pen-red">
                                Critical
                              </span>
                            )}
                            {st.priority === "high" && !st.done && (
                              <span className="shrink-0 rounded-full bg-[#fff7ed] px-1.5 py-px font-sans text-[9.5px] font-medium text-[#c2410c] dark:bg-[#3a2818] dark:text-[#fdba74]">
                                High
                              </span>
                            )}
                            {/* Assignee */}
                            {st.assigneeName ? (
                              <Avatar
                                name={st.assigneeName}
                                src={st.assigneeAvatarUrl}
                                size={18}
                              />
                            ) : (
                              <span className="block size-[18px] shrink-0 rounded-full border border-dashed border-pen-card-border" />
                            )}
                            {/* Unlink (detach from parent, keep the ticket) */}
                            {canEditTicket && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSubToUnlink({
                                    id: st.dbId,
                                    humanId: st.humanId,
                                  });
                                }}
                                title={`Remove ${st.humanId} from sub-tickets`}
                                className="shrink-0 rounded p-1 text-pen-subtle transition-colors hover:bg-pen-blue/10 hover:text-pen-blue"
                              >
                                <Unlink className="size-3.5" />
                              </button>
                            )}
                            {/* Delete */}
                            {st.canDelete && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSubToDelete({
                                    id: st.dbId,
                                    humanId: st.humanId,
                                  });
                                }}
                                title={`Delete ${st.humanId}`}
                                className="shrink-0 rounded p-1 text-pen-subtle transition-colors hover:bg-pen-red/10 hover:text-pen-red"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Empty note */}
                    {subTickets.length === 0 &&
                      !addingSubTicket &&
                      !linking && (
                        <p className="px-2 py-1 font-sans text-[12px] text-pen-subtle">
                          No sub-tickets yet.
                        </p>
                      )}

                    {/* Link-existing picker */}
                    {linking && (
                      <div
                        className={cn(
                          "rounded-md border border-pen-blue/40 bg-pen-surface",
                          subTickets.length > 0 && "mt-1",
                        )}
                      >
                        <div className="flex items-center gap-2 border-b border-pen-card-border px-3 py-2 focus-within:border-pen-blue">
                          <Link2 className="size-3.5 shrink-0 text-pen-subtle" />
                          <input
                            ref={linkInputRef}
                            value={linkQuery}
                            onChange={(e) => setLinkQuery(e.target.value)}
                            placeholder={
                              projectName
                                ? `Search ${projectName} tickets…`
                                : "Search tickets by ID or title…"
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") closeLinkPicker();
                            }}
                            className="min-w-0 flex-1 bg-transparent font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle"
                          />
                          <button
                            type="button"
                            onClick={closeLinkPicker}
                            className="shrink-0 text-pen-subtle hover:text-pen-muted"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {linkLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4 text-pen-subtle">
                              <Loader2 className="size-3.5 animate-spin" />
                              <span className="font-sans text-[11.5px]">
                                Loading…
                              </span>
                            </div>
                          ) : linkError ? (
                            <p className="px-3 py-3 font-sans text-[11.5px] text-pen-red">
                              {linkError}
                            </p>
                          ) : linkCandidates.length === 0 ? (
                            <p className="px-3 py-3 font-sans text-[11.5px] text-pen-subtle">
                              {linkQuery.trim()
                                ? "No matching tickets"
                                : "No other tickets in this project"}
                            </p>
                          ) : (
                            linkCandidates.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                disabled={linkSavingId !== null}
                                onClick={() => linkSubTicket(c)}
                                className="flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-pen-card-border/40 disabled:opacity-50"
                              >
                                <span className="shrink-0 font-mono text-[11.5px] font-semibold text-pen-id">
                                  {c.team.prefix}-{c.ticketNumber}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">
                                  {c.title}
                                </span>
                                {linkSavingId === c.id ? (
                                  <Loader2 className="size-3.5 shrink-0 animate-spin text-pen-subtle" />
                                ) : (
                                  <span className="shrink-0 font-sans text-[11px] text-pen-subtle">
                                    {c.status}
                                  </span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Inline creation form */}
                    {addingSubTicket && (
                      <form
                        onSubmit={createSubTicket}
                        className={cn(subTickets.length > 0 && "mt-1")}
                      >
                        <div className="flex items-center gap-2 rounded-md border border-pen-blue/40 bg-pen-surface px-3 py-2 focus-within:border-pen-blue">
                          <span className="block size-1.75 shrink-0 rounded-full bg-pen-subtle" />
                          <input
                            ref={subTitleRef}
                            value={subTitle}
                            onChange={(e) => setSubTitle(e.target.value)}
                            placeholder="Sub-ticket title…"
                            disabled={subSaving}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setAddingSubTicket(false);
                                setSubTitle("");
                              }
                            }}
                            className="min-w-0 flex-1 bg-transparent font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle"
                          />
                          <button
                            type="submit"
                            disabled={subSaving || !subTitle.trim()}
                            className="h-6 shrink-0 rounded bg-pen-blue px-2.5 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-40"
                          >
                            {subSaving ? "…" : "Create"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingSubTicket(false);
                              setSubTitle("");
                            }}
                            className="shrink-0 text-pen-subtle hover:text-pen-muted"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Footer actions */}
                    {canEditTicket && !addingSubTicket && !linking && (
                      <div className="mt-1.5 flex items-center gap-4 border-t border-pen-card-border/60 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setLinking(false);
                            setAddingSubTicket(true);
                            setTimeout(() => subTitleRef.current?.focus(), 0);
                          }}
                          className="flex items-center gap-1 font-sans text-[11.5px] font-medium text-pen-subtle transition-colors hover:text-pen-blue"
                        >
                          <Plus className="size-3.5" />
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={openLinkPicker}
                          className="flex items-center gap-1 font-sans text-[11.5px] font-medium text-pen-subtle transition-colors hover:text-pen-blue"
                        >
                          <Link2 className="size-3.5" />
                          Link existing
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="relative border-b border-pen-card-border">
              <div className="flex items-center">
                {[
                  {
                    key: "comments" as const,
                    label: "Comments",
                    count: flatComments.length,
                    show: true,
                  },
                  {
                    key: "customer-chat" as const,
                    label: "Reply to User",
                    count: liveMessages.length,
                    show: !!intake,
                  },
                  {
                    key: "activity" as const,
                    label: "Activity",
                    count: liveActivity.length,
                    show: true,
                  },
                ]
                  .filter((tab) => tab.show)
                  .map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "relative flex h-[30px] items-center gap-[5px] pr-[16px] font-sans text-[12px]",
                        activeTab === tab.key
                          ? "font-semibold text-pen-foreground"
                          : "text-pen-muted hover:text-pen-foreground",
                      )}
                    >
                      {tab.label}
                      <span className="font-sans text-[11.5px] text-pen-subtle">
                        {tab.count}
                      </span>
                      {activeTab === tab.key && (
                        <span className="absolute bottom-0 left-0 right-[16px] h-[2px] rounded-full bg-pen-blue" />
                      )}
                    </button>
                  ))}
                <span className="flex-1" />
                {activeTab === "customer-chat" && (
                  <button
                    type="button"
                    onClick={async () => {
                      setRefreshingMessages(true);
                      await refreshMessages();
                      setRefreshingMessages(false);
                    }}
                    disabled={refreshingMessages}
                    title="Refresh messages"
                    className="mb-0.5 flex items-center justify-center rounded-md p-1 text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn(
                        "size-[11px]",
                        refreshingMessages && "animate-spin",
                      )}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* Tab content */}
            {isHydrating ? (
              <TicketTabContentHydrating activeTab={activeTab} />
            ) : activeTab === "customer-chat" ? (
              <div className="flex flex-col">
                {/* Message thread — oldest first, newest nearest the composer */}
                {sortedMessages.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-pen-card-border py-8 text-center">
                    <Mail className="size-5 text-pen-subtle/50" />
                    <p className="font-sans text-[12.5px] font-medium text-pen-foreground">
                      No messages yet
                    </p>
                    <p className="font-sans text-[11.5px] text-pen-subtle">
                      Send the first reply below.
                    </p>
                  </div>
                ) : (
                  // Even vertical breathing room top and bottom of every message,
                  // with a hairline divider between them.
                  <div className="divide-y divide-pen-card-border">
                    {sortedMessages.map((m) => (
                      <div key={m.id} className="py-8">
                        <CustomerMessageItem
                          message={m}
                          ticketId={dbId}
                          teamMembers={mentionableUsers}
                          onNoteAdded={handleNoteAdded}
                          onNoteChanged={handleNoteChanged}
                          onNoteRemoved={handleNoteRemoved}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Composer pinned to the bottom, chat-style */}
                {customerReply.enabled && customerReply.customerEmail ? (
                  <div className="sticky bottom-0 z-10 -mx-1 border-t border-pen-card-border bg-pen-bg px-1 pb-2 pt-3">
                    <CustomerReplyComposer
                      ticketId={dbId}
                      customerName={customerReply.customerName}
                      customerEmail={customerReply.customerEmail}
                      onSent={(m) => setLiveMessages((prev) => [...prev, m])}
                      onSentConfirmed={(tempId, real) =>
                        setLiveMessages((prev) =>
                          prev.some((m) => m.id === real.id)
                            ? prev.filter((m) => m.id !== tempId)
                            : prev.map((m) => (m.id === tempId ? real : m)),
                        )
                      }
                      onSentFailed={(tempId) =>
                        setLiveMessages((prev) =>
                          prev.filter((m) => m.id !== tempId),
                        )
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-pen-card-border bg-pen-surface px-4 py-3">
                    <p className="font-sans text-[12.5px] text-pen-subtle">
                      Submitter replies are not enabled for this ticket.
                    </p>
                  </div>
                )}

                {/* Bottom anchor — scrolled into view to reveal the newest message */}
                <div ref={chatBottomRef} />
              </div>
            ) : activeTab === "comments" ? (
              <div className="flex flex-col">
                {/* Unified conversation — comments and their replies, oldest first */}
                {flatComments.length === 0 ? (
                  <p className="py-2 font-sans text-[12px] text-pen-subtle">
                    No comments yet. Be the first to comment.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {flatComments.map(({ comment: c, parentRef }) => (
                      <CommentItem
                        key={c.id}
                        comment={c}
                        ticketId={dbId}
                        teamMembers={mentionableUsers}
                        parentRef={parentRef}
                        onReplySubmitted={(reply) => handleReplyAdded(c.id, reply)}
                      />
                    ))}
                  </div>
                )}

                {/* Comment input — internal notes, pinned to the bottom */}
                <div className="sticky bottom-0 z-10 -mx-1 mt-4 border-t border-pen-card-border bg-pen-bg px-1 pb-2 pt-3">
                  <CommentInput
                    ticketId={dbId}
                    teamMembers={mentionableUsers}
                    onCommentAdded={(comment) => {
                      knownCommentIds.current.add(comment.id);
                      setLiveComments((prev) => {
                        const idx = prev.findIndex((c) => c.id === comment.id);
                        if (idx === -1) return [...prev, comment];
                        const next = [...prev];
                        next[idx] = comment;
                        return next;
                      });
                    }}
                  />
                </div>

                {/* Bottom anchor — scrolled into view to reveal the newest comment */}
                <div ref={commentsBottomRef} />
              </div>
            ) : (
              <div className="space-y-1">
                {liveActivity.length === 0 && (
                  <p className="py-2 font-sans text-[12px] text-pen-subtle">
                    No activity yet.
                  </p>
                )}
                {liveActivity.slice(0, activityLimit).map((a) => (
                  <div key={a.id} className="flex h-7 items-center gap-2">
                    <Clock className="size-3 shrink-0 text-pen-subtle" />
                    <span className="truncate font-sans text-[12px] text-pen-foreground">
                      <span className="font-semibold">
                        {a.metadata.source === "github"
                          ? "PR merge"
                          : a.actorName}
                      </span>{" "}
                      {(
                        ACTIVITY_TEXT[a.action] ??
                        (() => a.action.toLowerCase())
                      )(a.metadata)}
                    </span>
                    <span className="flex-1" />
                    <span className="shrink-0 font-sans text-[11.5px] text-pen-subtle">
                      {timeAgo(a.createdAt)}
                    </span>
                  </div>
                ))}
                {liveActivity.length > activityLimit && (
                  <button
                    type="button"
                    onClick={() => setActivityLimit((n) => n + 10)}
                    className="mt-1 w-full rounded-md py-1.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                  >
                    See more ({liveActivity.length - activityLimit} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ────────────────────────────────────────────────── */}
        <aside className="relative hidden w-[300px] shrink-0 flex-col overflow-hidden border-l border-pen-card-border bg-pen-card lg:flex">
          {/* X close button — overlay so content can start higher */}
          {isDrawer && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-2.5 right-3 z-10 flex size-7 items-center justify-center rounded-full bg-pen-surface ring-1 ring-pen-card-border transition-colors hover:bg-pen-card-border"
            >
              <X className="size-[14px] text-pen-foreground" />
            </button>
          )}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[20px] pb-[18px] pt-6",
              isDrawer && onClose && "pr-12",
            )}
          >
            {/* Created by */}
            {creatorName && (
              <div className="flex flex-col gap-1.5">
                <SectionLabel>Created by</SectionLabel>
                <div className="flex items-center gap-2">
                  {creatorAvatarUrl ? (
                    <img
                      src={creatorAvatarUrl}
                      alt={creatorName}
                      className="size-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pen-blue/15 font-sans text-[10px] font-semibold text-pen-blue">
                      {creatorName
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span className="min-w-0 truncate font-sans text-[13px] font-medium text-pen-foreground">
                      {creatorName}
                    </span>
                    {createdAtIso && (
                      <span className="font-sans text-[11.5px] text-pen-subtle">
                        {formatDateTime(new Date(createdAtIso))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Status</SectionLabel>
              <StatusSelect
                ticketId={dbId}
                currentStatus={liveStatus}
                statuses={effectiveTeamStatuses}
                onStatusChange={setLiveStatus}
                disabled={!canChangeStatus}
              />
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Priority</SectionLabel>
              <PrioritySelect
                ticketId={dbId}
                priority={livePriority}
                disabled={!canEditTicket}
                onPriorityChange={setLivePriority}
              />
            </div>

            {/* Date range — support tickets default the start to the created date */}
            <DateRangeEditor
              ticketId={dbId}
              startDateIso={liveStartDateIso}
              dueDateIso={liveDueDateIso}
              canEdit={canEditDates}
              onDatesChange={handleDatesChange}
              fallbackStartIso={
                isSupport && createdAtIso
                  ? formatCalendarDate(new Date(createdAtIso))
                  : null
              }
            />

            {/* Assignees */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Assignees</SectionLabel>
              <AssigneeSelect
                ticketId={dbId}
                assigneeId={liveAssigneeId}
                assigneeName={liveAssigneeName}
                assigneeAvatarUrl={liveAssigneeAvatarUrl}
                teamMembers={teamMembers}
                onAssigneeChange={handleAssigneeChange}
                disabled={!canEditTicket}
              />
              <CoAssigneeSelect
                ticketId={dbId}
                coAssignees={liveCoAssignees}
                teamMembers={teamMembers}
                primaryAssigneeId={liveAssigneeId}
                onCoAssigneesChange={handleCoAssigneesChange}
                disabled={!canEditTicket}
              />
            </div>

            {/* QA */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>QA</SectionLabel>
              <QaAssigneeSelect
                ticketId={dbId}
                qaAssignees={liveQaAssignees}
                teamMembers={teamMembers}
                onQaAssigneesChange={handleQaAssigneesChange}
                disabled={!canEditTicket}
              />
            </div>

            {/* Module */}
            {projectModuleSystemEnabled && (
              <div className="flex flex-col gap-1.5">
                <SectionLabel>Module</SectionLabel>
                <ModuleSelect
                  ticketId={dbId}
                  projectId={projectId}
                  moduleId={liveModuleId}
                  moduleName={liveModuleName}
                  disabled={!canEditTicket}
                />
              </div>
            )}

            {/* Sprint — not shown for support tickets */}
            {!isSupport && (
              <SprintSelect
                ticketId={dbId}
                projectId={projectId}
                sprintId={liveSprintId}
                sprintName={liveSprintName}
                disabled={!canEditTicket}
              />
            )}

            {/* Story Points — not shown for support tickets */}
            {!isSupport && (
              <StoryPointsEditor
                ticketId={dbId}
                storyPoints={liveStoryPoints}
                canEdit={canEditDates}
              />
            )}

            {/* Asset Links — not shown for support tickets */}
            {!isSupport && (
              <AssetLinksEditor
                ticketId={dbId}
                initialLinks={assetLinks}
                canEdit={!!canEditTicket}
              />
            )}

            {/* Time Tracking */}
            <TimeTrackingSection
              ticketId={dbId}
              ticketHumanId={ticketId}
              ticketTitle={titleValue}
              estimatedTime={liveEstimatedTime}
              timeEntries={liveTimeEntries}
              qaTimeEntries={liveQaTimeEntries}
              myActiveTimerId={initialActiveTimerId}
              myActiveTimerStartedAt={myActiveTimerStartedAt}
              canStart={isCurrentUserAssignee && isTicketActive}
              isAssignee={isCurrentUserAssignee}
              isQa={isCurrentUserQa}
              estimateEditable={isSupport}
              canEditEstimate={canEditDates}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatarUrl={null}
            />

            {/* Personal estimates — per-assignee estimate + target date */}
            {!isSupport &&
              (() => {
                const people: EstimatePerson[] = [];
                const seen = new Set<string>();
                const push = (
                  id: string | null | undefined,
                  name: string | null | undefined,
                  avatarUrl: string | null | undefined,
                  role: EstimatePerson["role"],
                ) => {
                  if (!id || seen.has(id)) return;
                  seen.add(id);
                  people.push({ id, name: name ?? "Unknown", avatarUrl: avatarUrl ?? null, role });
                };
                push(liveAssigneeId, liveAssigneeName, liveAssigneeAvatarUrl, "Assignee");
                liveCoAssignees.forEach((a) => push(a.id, a.name, a.avatarUrl, "Co-assignee"));
                liveQaAssignees.forEach((a) => push(a.id, a.name, a.avatarUrl, "QA"));
                return (
                  <PersonalEstimatesSection
                    ticketId={dbId}
                    people={people}
                    estimates={initialPersonalEstimates}
                    currentUserId={currentUserId}
                    canEditOthers={!!canEditTicket}
                  />
                );
              })()}

            {/* Sub-ticket time roll-up */}
            {subTicketTime && subTicketTime.perTicket.length > 0 && (
              <SubTicketTimeSection data={subTicketTime} />
            )}
          </div>
        </aside>
      </div>

      {/* Sub-ticket modal */}
      <SubTicketModal
        ticketId={subModalId}
        onClose={() => setSubModalId(null)}
      />
    </>
  );
}

// ── Asset Links Editor ────────────────────────────────────────────────────────

function AssetLinksEditor({
  ticketId,
  initialLinks,
  canEdit,
}: {
  ticketId: string;
  initialLinks: { label: string; url: string }[];
  canEdit: boolean;
}) {
  const [links, setLinks] =
    useState<{ label: string; url: string }[]>(initialLinks);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function patchLinks(nextLinks: { label: string; url: string }[]) {
    setSaving(true);
    await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetLinks: nextLinks }),
    });
    setSaving(false);
  }

  async function handleAdd() {
    if (!newUrl.trim()) return;
    const next = [...links, { url: newUrl.trim(), label: newLabel.trim() }];
    await patchLinks(next);
    setLinks(next);
    setNewUrl("");
    setNewLabel("");
    setAdding(false);
  }

  async function handleRemove(index: number) {
    const next = links.filter((_, i) => i !== index);
    await patchLinks(next);
    setLinks(next);
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center gap-2">
        <SectionLabel>Asset Links</SectionLabel>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded text-pen-subtle hover:bg-pen-surface hover:text-pen-blue"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {links.length > 0 && (
        <div className="flex flex-col gap-1">
          {links.map((link, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1"
            >
              <Link2
                size={12}
                className="shrink-0"
                style={{ color: "#0a76b9" }}
              />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-sans text-[12px] text-pen-foreground hover:text-pen-blue hover:underline"
              >
                {link.label || link.url}
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="shrink-0 text-pen-subtle hover:text-pen-red"
                  disabled={saving}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://…"
              className="h-8 flex-1 rounded-md border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue/60"
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label"
              className="h-8 w-28 rounded-md border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue/60"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !newUrl.trim()}
              className="flex h-7 items-center rounded-md bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewUrl("");
                setNewLabel("");
              }}
              className="flex h-7 items-center rounded-md border border-pen-card-border px-3 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Story Points Editor ───────────────────────────────────────────────────────

function StoryPointsEditor({
  ticketId,
  storyPoints: initialSp,
  canEdit,
}: {
  ticketId: string;
  storyPoints: number | null;
  canEdit: boolean;
}) {
  const [sp, setSp] = useState(initialSp);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(initialSp?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSp(initialSp);
    if (!editing) setInputVal(initialSp?.toString() ?? "");
  }, [initialSp, editing]);

  async function save() {
    const num = inputVal.trim() === "" ? null : parseInt(inputVal, 10);
    if (num !== null && (isNaN(num) || num < 0)) return;
    setSaving(true);
    await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyPoints: num }),
    });
    setSp(num);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2">
      <SectionLabel>Story Points</SectionLabel>
      <span className="flex-1" />
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="1"
            max="999"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditing(false);
                setInputVal(sp?.toString() ?? "");
              }
            }}
            autoFocus
            placeholder="pts"
            className="h-6 w-[52px] rounded-md border border-pen-blue/50 bg-transparent px-2 text-center font-sans text-[11.5px] text-pen-foreground outline-none focus:border-pen-blue"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-6 rounded-md bg-pen-blue px-2 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setInputVal(sp?.toString() ?? "");
            }}
            className="flex size-5 items-center justify-center rounded text-pen-subtle hover:text-pen-muted"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={
            canEdit
              ? () => {
                  setEditing(true);
                  setInputVal(sp?.toString() ?? "");
                }
              : undefined
          }
          disabled={!canEdit}
          className={cn(
            "flex h-6 min-w-11 items-center justify-center rounded-md px-2.5 font-sans text-[11.5px] font-semibold transition-colors",
            sp != null
              ? "bg-pen-blue/10 text-pen-blue hover:bg-pen-blue/15"
              : canEdit
                ? "border border-dashed border-pen-card-border text-pen-subtle hover:border-pen-blue/50 hover:text-pen-blue"
                : "text-pen-subtle",
          )}
        >
          {sp != null ? `${sp} pts` : canEdit ? "Set" : "—"}
        </button>
      )}
    </div>
  );
}

// ── Time Tracking Section ─────────────────────────────────────────────────────

function TimerToggleButton({
  running,
  starting,
  stopping,
  onToggle,
  idleClassName,
}: {
  running: boolean;
  starting: boolean;
  stopping: boolean;
  onToggle: () => void;
  idleClassName: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={starting || stopping}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-[7px] px-3 py-[6px] font-sans text-[11.5px] font-medium transition-all disabled:opacity-50",
        running
          ? "bg-pen-red/10 text-pen-red ring-1 ring-pen-red/20 hover:bg-pen-red/15"
          : idleClassName,
      )}
    >
      {running ? (
        <>
          <Pause className="size-[11px] fill-current" />
          {stopping ? "Pausing…" : "Pause"}
        </>
      ) : starting ? (
        <>
          <Play className="size-[11px] fill-current" />
          Starting…
        </>
      ) : (
        <>
          <Play className="size-[11px] fill-current" />
          Start Timer
        </>
      )}
    </button>
  );
}

function SubTicketTimeSection({ data }: { data: SubTicketTimeData }) {
  const [showLog, setShowLog] = useState(false);
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-1.5">
        <SectionLabel>Sub-ticket time</SectionLabel>
        <span className="ml-auto font-mono text-[11.5px] font-semibold text-pen-foreground">
          {formatSecs(data.totalSecs)}
        </span>
      </div>

      <div className="rounded-[8px] border border-pen-card-border bg-pen-surface/60 px-[11px] py-[9px] space-y-[8px]">
        {/* Per sub-ticket totals */}
        <div className="flex flex-col gap-[6px]">
          {data.perTicket.map((t) => (
            <Link
              key={t.dbId}
              href={`/tickets/${t.dbId}`}
              className="flex items-center gap-2 leading-none hover:opacity-80"
            >
              <span className="shrink-0 font-mono text-[11.5px] font-semibold text-pen-id">
                {t.humanId}
              </span>
              <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-muted">
                {t.title}
              </span>
              <span className="shrink-0 font-mono text-[11.5px] font-semibold text-pen-foreground">
                {formatSecs(t.totalSecs)}
              </span>
            </Link>
          ))}
        </div>

        {/* Combined session log across sub-tickets */}
        {data.sessions.length > 0 && (
          <div className="border-t border-pen-card-border/60 pt-[7px]">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="flex w-full items-center gap-1 font-sans text-[11.5px] text-pen-subtle transition-colors hover:text-pen-muted"
            >
              {showLog ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              <span>Time log</span>
              <span className="text-pen-subtle/60">({data.sessions.length})</span>
            </button>
            {showLog && (
              <div className="mt-[6px] space-y-[5px]">
                {data.sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5 leading-none">
                    <Avatar name={s.userName} src={s.avatarUrl} size={14} />
                    <span className="shrink-0 font-mono text-[11px] text-pen-id">
                      {s.subTicketHumanId}
                    </span>
                    <span className="font-sans text-[11.5px] text-pen-muted">
                      {format(parseISO(s.startedAt), "d MMM")}
                    </span>
                    {s.kind === "QA" && (
                      <span className="rounded bg-pen-surface px-1 font-sans text-[9.5px] text-pen-subtle">
                        QA
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[11.5px] font-semibold text-pen-foreground">
                      {formatSecs(s.durationSecs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type EstimatePerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: "Assignee" | "Co-assignee" | "QA";
};

function PersonalEstimatesSection({
  ticketId,
  people,
  estimates,
  currentUserId,
  canEditOthers,
}: {
  ticketId: string;
  people: EstimatePerson[];
  estimates: PersonalEstimate[];
  currentUserId: string;
  canEditOthers: boolean;
}) {
  const router = useRouter();
  if (people.length === 0) return null;
  const byUser = new Map(estimates.map((e) => [e.userId, e]));
  return (
    <div className="flex flex-col gap-[8px]">
      <SectionLabel>Personal estimates</SectionLabel>
      <div className="space-y-[6px] rounded-[8px] border border-pen-card-border bg-pen-surface/60 px-[11px] py-[9px]">
        {people.map((p) => (
          <PersonalEstimateRow
            key={p.id}
            ticketId={ticketId}
            person={p}
            estimate={byUser.get(p.id) ?? null}
            canEdit={canEditOthers || p.id === currentUserId}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function PersonalEstimateRow({
  ticketId,
  person,
  estimate,
  canEdit,
  onSaved,
}: {
  ticketId: string;
  person: EstimatePerson;
  estimate: PersonalEstimate | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState<PersonalEstimate | null>(estimate);
  const [mins, setMins] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync from server props while the editor is closed (other viewers / refresh).
  useEffect(() => {
    if (!editing) {
      setLocal(estimate);
      setMins(estimate?.estimatedMinutes ? formatMins(estimate.estimatedMinutes) : "");
      setDate(estimate?.targetDateIso ? estimate.targetDateIso.slice(0, 10) : "");
    }
  }, [estimate, editing]);

  async function save() {
    const next: PersonalEstimate = {
      userId: person.id,
      estimatedMinutes: parseTimeInput(mins),
      targetDateIso: date || null,
    };
    // Optimistic: close the editor and show the new value/date immediately.
    setLocal(next);
    setEditing(false);
    setSaving(true);
    try {
      await setPersonalEstimate(ticketId, {
        userId: person.id,
        estimatedMinutes: next.estimatedMinutes,
        targetDate: date || null,
      });
      onSaved();
    } catch {
      setLocal(estimate); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setLocal(null);
    setEditing(false);
    setSaving(true);
    try {
      await clearPersonalEstimate(ticketId, person.id);
      onSaved();
    } catch {
      setLocal(estimate);
    } finally {
      setSaving(false);
    }
  }

  const hasEstimate =
    !!local && (local.estimatedMinutes != null || !!local.targetDateIso);

  return (
    <div className="border-b border-pen-card-border/50 pb-[6px] last:border-0 last:pb-0">
      <div className="flex items-center gap-1.5">
        <Avatar name={person.name} src={person.avatarUrl} size={16} />
        <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-muted">
          {person.name.split(" ")[0]}
          <span className="ml-1 text-pen-subtle/60">{person.role}</span>
        </span>
        {!editing && hasEstimate && (
          <span className="shrink-0 font-sans text-[11.5px] text-pen-foreground">
            <span className="font-semibold">
              {local!.estimatedMinutes != null
                ? formatMins(local!.estimatedMinutes)
                : "—"}
            </span>
            {local!.targetDateIso && (
              <span className="ml-1 font-normal text-pen-subtle">
                · {format(parseCalendarDate(local!.targetDateIso), "d MMM yyyy")}
              </span>
            )}
          </span>
        )}
        {!editing && canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-1 shrink-0 font-sans text-[11.5px] text-pen-subtle transition-colors hover:text-pen-blue"
          >
            {hasEstimate ? "Edit" : "Set"}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-[6px] space-y-[5px] pl-[22px]">
          <div className="flex items-center gap-1">
            <input
              value={mins}
              onChange={(e) => setMins(e.target.value)}
              placeholder="e.g. 4h 30m"
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="h-6 min-w-0 flex-1 rounded-md border border-pen-blue/50 bg-pen-card px-2 font-sans text-[11.5px] text-pen-foreground outline-none focus:border-pen-blue"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-6 shrink-0 rounded-md border border-pen-card-border bg-pen-card px-1.5 font-sans text-[11.5px] text-pen-foreground outline-none focus:border-pen-blue"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-6 rounded-md bg-pen-blue px-2 font-sans text-[11.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
            >
              {saving ? "…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-6 rounded-md px-2 font-sans text-[11.5px] text-pen-subtle hover:text-pen-muted"
            >
              Cancel
            </button>
            {hasEstimate && (
              <button
                type="button"
                onClick={clear}
                disabled={saving}
                className="ml-auto h-6 rounded-md px-2 font-sans text-[11.5px] text-pen-red/80 hover:text-pen-red disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeTrackingSection({
  ticketId,
  ticketHumanId,
  ticketTitle,
  estimatedTime: initialEstimatedTime,
  timeEntries: initialEntries,
  qaTimeEntries: initialQaEntries,
  myActiveTimerId,
  myActiveTimerStartedAt,
  canStart,
  isAssignee,
  isQa,
  estimateEditable,
  canEditEstimate,
  currentUserId,
  currentUserName,
  currentUserAvatarUrl,
}: {
  ticketId: string;
  ticketHumanId: string;
  ticketTitle: string;
  estimatedTime: number | null;
  timeEntries: TimeEntrySummary[];
  qaTimeEntries: TimeEntrySummary[];
  myActiveTimerId: string | null;
  myActiveTimerStartedAt: string | null;
  canStart: boolean;
  isAssignee: boolean;
  isQa: boolean;
  /** Support tickets edit the ticket-wide estimate directly; others roll it up per-person. */
  estimateEditable: boolean;
  canEditEstimate: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarUrl: string | null;
}) {
  const [estimatedTime, setEstimatedTime] = useState(initialEstimatedTime);
  const [editingEst, setEditingEst] = useState(false);
  const [estInput, setEstInput] = useState(
    initialEstimatedTime ? formatMins(initialEstimatedTime) : "",
  );
  const [savingEst, setSavingEst] = useState(false);
  const [entries, setEntries] = useState<TimeEntrySummary[]>(initialEntries);
  const [qaEntries, setQaEntries] =
    useState<TimeEntrySummary[]>(initialQaEntries);
  const [, setTick] = useState(0);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showQaLog, setShowQaLog] = useState(false);
  const [startingQa, setStartingQa] = useState(false);
  const [stoppingQa, setStoppingQa] = useState(false);
  const router = useRouter();
  const {
    startTimer: startTimerAction,
    stopTimer: stopTimerAction,
    clearRunning,
  } = useTimerActions();
  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerKind = useTimerStore((s) => s.kind);
  const prevTimerTicketRef = useRef<string | null>(timerTicketDbId);
  const timerStartedAtMs = useTimerStore((s) => s.startedAtMs);
  const isRunningHere = timerTicketDbId === ticketId && !!timerEntryId;
  // Store kind is the source of truth. Null kind on a running timer is treated as DEVELOPMENT
  // (legacy / hydrating) unless we just started QA and the store already says QA.
  const isQaRunningHere = isRunningHere && timerKind === "QA";
  const isDevRunningHere = isRunningHere && timerKind !== "QA";
  const activeTimerId = isDevRunningHere ? timerEntryId : null;
  const activeQaTimerId = isQaRunningHere ? timerEntryId : null;

  // Keep in sync with parent live patches (other users' timer / estimate changes)
  useEffect(() => {
    setEstimatedTime(initialEstimatedTime);
    if (!editingEst) {
      setEstInput(initialEstimatedTime ? formatMins(initialEstimatedTime) : "");
    }
  }, [initialEstimatedTime, editingEst]);
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);
  useEffect(() => {
    setQaEntries(initialQaEntries);
  }, [initialQaEntries]);

  const myEntry = entries.find((e) => e.userId === currentUserId);
  const myQaEntry = qaEntries.find((e) => e.userId === currentUserId);
  const runningStartedAt =
    isDevRunningHere && timerStartedAtMs
      ? new Date(timerStartedAtMs).toISOString()
      : null;
  const qaRunningStartedAt =
    isQaRunningHere && timerStartedAtMs
      ? new Date(timerStartedAtMs).toISOString()
      : null;

  // Tick every second while any timer is running
  const hasRunning =
    !!activeTimerId ||
    !!activeQaTimerId ||
    entries.some((e) => e.isRunning && e.userId !== currentUserId) ||
    qaEntries.some((e) => e.isRunning && e.userId !== currentUserId);
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  // When the running timer moves to another ticket, clear local running state and refresh totals.
  useEffect(() => {
    setEntries((prev) =>
      prev.map((e) =>
        e.userId === currentUserId
          ? {
              ...e,
              isRunning: isDevRunningHere,
              runningStartedAt: isDevRunningHere ? runningStartedAt : null,
            }
          : e,
      ),
    );
  }, [isDevRunningHere, runningStartedAt, currentUserId]);

  useEffect(() => {
    setQaEntries((prev) =>
      prev.map((e) =>
        e.userId === currentUserId
          ? {
              ...e,
              isRunning: isQaRunningHere,
              runningStartedAt: isQaRunningHere ? qaRunningStartedAt : null,
            }
          : e,
      ),
    );
  }, [isQaRunningHere, qaRunningStartedAt, currentUserId]);

  useEffect(() => {
    const prev = prevTimerTicketRef.current;
    if (prev === ticketId && timerTicketDbId !== ticketId) {
      router.refresh();
    }
    prevTimerTicketRef.current = timerTicketDbId;
  }, [timerTicketDbId, ticketId, router]);

  function getEntrySecs(entry: TimeEntrySummary): number {
    if (!entry.isRunning || !entry.runningStartedAt) return entry.totalSecs;
    const elapsed = Math.floor(
      (Date.now() - new Date(entry.runningStartedAt).getTime()) / 1000,
    );
    return entry.totalSecs + elapsed;
  }

  const myElapsed =
    activeTimerId && runningStartedAt
      ? Math.floor((Date.now() - new Date(runningStartedAt).getTime()) / 1000)
      : 0;

  const myQaElapsed =
    activeQaTimerId && qaRunningStartedAt
      ? Math.floor((Date.now() - new Date(qaRunningStartedAt).getTime()) / 1000)
      : 0;

  const myTotalSecs = (myEntry?.totalSecs ?? 0) + myElapsed;
  const myQaTotalSecs = (myQaEntry?.totalSecs ?? 0) + myQaElapsed;

  const othersTotalSecs = entries
    .filter((e) => e.userId !== currentUserId)
    .reduce((sum, e) => sum + getEntrySecs(e), 0);

  const totalSecs = myTotalSecs + othersTotalSecs;
  const estimatedSecs = estimatedTime ? estimatedTime * 60 : null;
  const pct = estimatedSecs
    ? Math.min(100, (totalSecs / estimatedSecs) * 100)
    : null;
  const overrunSecs = estimatedSecs
    ? Math.max(0, totalSecs - estimatedSecs)
    : 0;

  const othersQaTotalSecs = qaEntries
    .filter((e) => e.userId !== currentUserId)
    .reduce((sum, e) => sum + getEntrySecs(e), 0);
  const qaTotalSecs = myQaTotalSecs + othersQaTotalSecs;
  const canReset = isAssignee && (myTotalSecs > 0 || !!activeTimerId);

  useEffect(() => {
    if (!isDevRunningHere || !timerStartedAtMs) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.userId === currentUserId
          ? {
              ...e,
              isRunning: true,
              runningStartedAt: new Date(timerStartedAtMs).toISOString(),
            }
          : e,
      ),
    );
  }, [isDevRunningHere, timerStartedAtMs, currentUserId]);

  useEffect(() => {
    if (!isQaRunningHere || !timerStartedAtMs) return;
    setQaEntries((prev) =>
      prev.map((e) =>
        e.userId === currentUserId
          ? {
              ...e,
              isRunning: true,
              runningStartedAt: new Date(timerStartedAtMs).toISOString(),
            }
          : e,
      ),
    );
  }, [isQaRunningHere, timerStartedAtMs, currentUserId]);

  async function startTimer() {
    if (starting || activeTimerId) return;
    setStarting(true);
    try {
      const entry = await startTimerAction({
        ticketDbId: ticketId,
        humanId: ticketHumanId,
        title: ticketTitle,
        kind: "DEVELOPMENT",
      });
      const nowIso = new Date(entry.startedAt).toISOString();
      const newSession = {
        id: entry.id,
        startedAt: nowIso,
        endedAt: null,
        durationSecs: null,
      };
      // Starting dev closes any running QA timer on this user
      setQaEntries((prev) =>
        prev.map((e) =>
          e.userId === currentUserId
            ? {
                ...e,
                isRunning: false,
                runningStartedAt: null,
                sessions: e.sessions.map((s) =>
                  s.endedAt
                    ? s
                    : {
                        ...s,
                        endedAt: nowIso,
                        durationSecs: Math.max(
                          0,
                          Math.floor(
                            (Date.now() - new Date(s.startedAt).getTime()) /
                              1000,
                          ),
                        ),
                      },
                ),
              }
            : e,
        ),
      );
      setEntries((prev) => {
        const exists = prev.find((e) => e.userId === currentUserId);
        if (exists) {
          return prev.map((e) =>
            e.userId === currentUserId
              ? {
                  ...e,
                  isRunning: true,
                  runningStartedAt: nowIso,
                  sessions: [
                    newSession,
                    ...e.sessions.filter((s) => s.endedAt !== null),
                  ],
                }
              : e,
          );
        }
        return [
          ...prev,
          {
            userId: currentUserId,
            userName: currentUserName,
            avatarUrl: currentUserAvatarUrl,
            totalSecs: 0,
            isRunning: true,
            runningStartedAt: nowIso,
            sessions: [newSession],
          },
        ];
      });
    } finally {
      setStarting(false);
    }
  }

  async function pauseTimer() {
    if (stopping) return;
    setStopping(true);
    try {
      await stopTimerAction(activeTimerId);
      const nowIso = new Date().toISOString();
      setEntries((prev) =>
        prev.map((e) => {
          if (e.userId !== currentUserId) return e;
          let addSecs = 0;
          const sessions = e.sessions.map((s) => {
            if (s.endedAt !== null) return s;
            const dur = Math.max(
              0,
              Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000),
            );
            addSecs += dur;
            return { ...s, endedAt: nowIso, durationSecs: dur };
          });
          return {
            ...e,
            isRunning: false,
            runningStartedAt: null,
            totalSecs: e.totalSecs + addSecs,
            sessions,
          };
        }),
      );
      router.refresh();
    } finally {
      setStopping(false);
    }
  }

  async function resetMyTime() {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", ticketId }),
      });
      if (!res.ok) throw new Error("Failed to reset timer");
      if (activeTimerId) clearRunning();
      setEntries((prev) => prev.filter((e) => e.userId !== currentUserId));
      router.refresh();
    } catch {
      toast.error("Could not reset timer");
    } finally {
      setResetting(false);
    }
  }

  async function startQaTimer() {
    if (startingQa || activeQaTimerId) return;
    setStartingQa(true);
    try {
      const entry = await startTimerAction({
        ticketDbId: ticketId,
        humanId: ticketHumanId,
        title: ticketTitle,
        kind: "QA",
      });
      const nowIso = new Date(entry.startedAt).toISOString();
      const newSession = {
        id: entry.id,
        startedAt: nowIso,
        endedAt: null,
        durationSecs: null,
      };
      // Starting QA closes any running dev timer on this user
      setEntries((prev) =>
        prev.map((e) =>
          e.userId === currentUserId
            ? {
                ...e,
                isRunning: false,
                runningStartedAt: null,
                sessions: e.sessions.map((s) =>
                  s.endedAt
                    ? s
                    : {
                        ...s,
                        endedAt: nowIso,
                        durationSecs: Math.max(
                          0,
                          Math.floor(
                            (Date.now() - new Date(s.startedAt).getTime()) /
                              1000,
                          ),
                        ),
                      },
                ),
              }
            : e,
        ),
      );
      setQaEntries((prev) => {
        const exists = prev.find((e) => e.userId === currentUserId);
        if (exists) {
          return prev.map((e) =>
            e.userId === currentUserId
              ? {
                  ...e,
                  isRunning: true,
                  runningStartedAt: nowIso,
                  sessions: [
                    newSession,
                    ...e.sessions.filter((s) => s.endedAt !== null),
                  ],
                }
              : e,
          );
        }
        return [
          ...prev,
          {
            userId: currentUserId,
            userName: currentUserName,
            avatarUrl: currentUserAvatarUrl,
            totalSecs: 0,
            isRunning: true,
            runningStartedAt: nowIso,
            sessions: [newSession],
          },
        ];
      });
    } finally {
      setStartingQa(false);
    }
  }

  async function pauseQaTimer() {
    if (stoppingQa) return;
    setStoppingQa(true);
    try {
      await stopTimerAction(activeQaTimerId);
      const nowIso = new Date().toISOString();
      setQaEntries((prev) =>
        prev.map((e) => {
          if (e.userId !== currentUserId) return e;
          let addSecs = 0;
          const sessions = e.sessions.map((s) => {
            if (s.endedAt !== null) return s;
            const dur = Math.max(
              0,
              Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000),
            );
            addSecs += dur;
            return { ...s, endedAt: nowIso, durationSecs: dur };
          });
          return {
            ...e,
            isRunning: false,
            runningStartedAt: null,
            totalSecs: e.totalSecs + addSecs,
            sessions,
          };
        }),
      );
      router.refresh();
    } finally {
      setStoppingQa(false);
    }
  }

  async function saveEstimate() {
    const mins = parseTimeInput(estInput);
    setSavingEst(true);
    await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedTime: mins }),
    });
    setEstimatedTime(mins);
    setSavingEst(false);
    setEditingEst(false);
  }

  const displayEntries = entries.slice().sort((a, b) => {
    const aSecs = a.userId === currentUserId ? myTotalSecs : getEntrySecs(a);
    const bSecs = b.userId === currentUserId ? myTotalSecs : getEntrySecs(b);
    return bSecs - aSecs;
  });

  const allSessions = entries
    .flatMap((e) =>
      e.sessions.map((s) => ({
        ...s,
        userId: e.userId,
        userName: e.userName,
        avatarUrl: e.avatarUrl,
      })),
    )
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

  const qaSessions = qaEntries
    .flatMap((e) =>
      e.sessions.map((s) => ({
        ...s,
        userId: e.userId,
        userName: e.userName,
        avatarUrl: e.avatarUrl,
      })),
    )
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

  const displayQaEntries = qaEntries.slice().sort((a, b) => {
    const aSecs = a.userId === currentUserId ? myQaTotalSecs : getEntrySecs(a);
    const bSecs = b.userId === currentUserId ? myQaTotalSecs : getEntrySecs(b);
    return bSecs - aSecs;
  });

  function isMineDevSessionRunning(session: {
    id: string;
    endedAt: string | null;
    userId: string;
  }) {
    if (session.endedAt !== null) return false;
    if (session.userId !== currentUserId) return true;
    // Own open sessions only count as running when the store says this DEV timer is active
    return isDevRunningHere && session.id === activeTimerId;
  }

  function isMineQaSessionRunning(session: {
    id: string;
    endedAt: string | null;
    userId: string;
  }) {
    if (session.endedAt !== null) return false;
    if (session.userId !== currentUserId) return true;
    return isQaRunningHere && session.id === activeQaTimerId;
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {/* Label row */}
      <div className="flex items-center gap-1.5">
        <SectionLabel>Time Tracking</SectionLabel>
        {overrunSecs > 0 && (
          <span className="ml-auto rounded-full bg-pen-red/10 px-[6px] py-[1.5px] font-sans text-[11.5px] font-semibold text-pen-red">
            +{formatSecs(overrunSecs)} over
          </span>
        )}
      </div>

      {/* Stats card */}
      <div className="rounded-[8px] border border-pen-card-border bg-pen-surface/60 px-[11px] py-[9px] space-y-[8px]">
        {/* Progress bar + estimate row */}
        <div className="flex flex-col gap-[5px]">
          {/* Logged / estimated summary */}
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "font-mono text-[14px] font-semibold leading-none",
                totalSecs > 0 ? "text-pen-foreground" : "text-pen-subtle",
              )}
            >
              {totalSecs > 0 ? formatSecs(totalSecs) : "0s"}
            </span>
            {estimatedTime ? (
              <span className="font-sans text-[11.5px] text-pen-muted">
                / {formatMins(estimatedTime)} est.
              </span>
            ) : (
              <span className="font-sans text-[11.5px] text-pen-subtle/60">
                logged
              </span>
            )}
            {activeTimerId && (
              <span className="ml-auto flex items-center gap-1 font-sans text-[11.5px] text-pen-green">
                <span className="block size-[5px] rounded-full bg-pen-green animate-pulse" />
                {formatSecs(myElapsed)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {estimatedSecs !== null ? (
            <div className="h-[4px] w-full overflow-hidden rounded-full bg-pen-card-border">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  overrunSecs > 0
                    ? "bg-pen-red"
                    : pct! > 75
                      ? "bg-amber-400"
                      : "bg-pen-blue",
                )}
                style={{ width: `${Math.max(2, pct!)}%` }}
              />
            </div>
          ) : (
            <div className="h-[4px] w-full rounded-full bg-pen-card-border" />
          )}
        </div>

        {/* Per-user breakdown */}
        {displayEntries.length > 0 && (
          <div className="space-y-[5px] border-t border-pen-card-border/60 pt-[7px]">
            {displayEntries.map((entry) => {
              const secs =
                entry.userId === currentUserId
                  ? myTotalSecs
                  : getEntrySecs(entry);
              const running =
                entry.userId === currentUserId
                  ? !!activeTimerId
                  : entry.isRunning;
              return (
                <div key={entry.userId} className="flex items-center gap-1.5">
                  <Avatar
                    name={entry.userName}
                    src={entry.avatarUrl}
                    size={16}
                  />
                  <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-muted">
                    {entry.userName.split(" ")[0]}
                  </span>
                  {running && (
                    <span className="block size-[5px] shrink-0 rounded-full bg-pen-green animate-pulse" />
                  )}
                  <span className="font-mono text-[11.5px] font-semibold text-pen-foreground">
                    {formatSecs(secs)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Session log */}
        {allSessions.length > 0 && (
          <div className="border-t border-pen-card-border/60 pt-[7px]">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="flex w-full items-center gap-1 font-sans text-[11.5px] text-pen-subtle transition-colors hover:text-pen-muted"
            >
              {showLog ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              <span>Time log</span>
              <span className="text-pen-subtle/60">({allSessions.length})</span>
            </button>
            {showLog && (
              <div className="mt-[6px] space-y-[5px]">
                {allSessions.map((s) => {
                  const running = isMineDevSessionRunning(s);
                  const durSecs = running
                    ? Math.max(
                        0,
                        Math.floor(
                          (Date.now() - new Date(s.startedAt).getTime()) / 1000,
                        ),
                      )
                    : (s.durationSecs ??
                      (s.endedAt
                        ? Math.max(
                            0,
                            Math.floor(
                              (new Date(s.endedAt).getTime() -
                                new Date(s.startedAt).getTime()) /
                                1000,
                            ),
                          )
                        : 0));
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-1.5 leading-none"
                    >
                      <Avatar name={s.userName} src={s.avatarUrl} size={14} />
                      <span className="font-sans text-[11.5px] text-pen-muted">
                        {format(parseISO(s.startedAt), "d MMM")}
                      </span>
                      <span className="font-mono text-[11.5px] text-pen-subtle">
                        {format(parseISO(s.startedAt), "HH:mm")}
                        {" – "}
                        {running ? (
                          <span className="text-pen-green">running</span>
                        ) : (
                          format(parseISO(s.endedAt!), "HH:mm")
                        )}
                      </span>
                      <span
                        className={cn(
                          "ml-auto font-mono text-[11.5px] font-semibold",
                          running ? "text-pen-green" : "text-pen-foreground",
                        )}
                      >
                        {formatSecs(durSecs)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Estimate row — editable for support tickets, roll-up otherwise */}
        <div className="border-t border-pen-card-border/60 pt-[7px]">
          {estimateEditable && editingEst ? (
            <div className="flex items-center gap-1">
              <input
                value={estInput}
                onChange={(e) => setEstInput(e.target.value)}
                placeholder="e.g. 4h"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEstimate();
                  if (e.key === "Escape") setEditingEst(false);
                }}
                autoFocus
                className="h-6 min-w-0 flex-1 rounded-md border border-pen-blue/50 bg-pen-card px-2 font-sans text-[11.5px] text-pen-foreground outline-none focus:border-pen-blue"
              />
              <button
                type="button"
                onClick={saveEstimate}
                disabled={savingEst}
                className="h-6 shrink-0 rounded-md bg-pen-blue px-2 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
              >
                {savingEst ? "…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditingEst(false)}
                className="flex size-5 shrink-0 items-center justify-center rounded text-pen-subtle hover:text-pen-muted"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Timer className="size-[11px] shrink-0 text-pen-subtle" />
              <span className="font-sans text-[11.5px] text-pen-subtle">
                Estimate
              </span>
              <span
                className={cn(
                  "font-sans text-[11.5px]",
                  estimatedTime
                    ? "font-semibold text-pen-foreground"
                    : "font-medium text-pen-subtle/60",
                )}
              >
                {estimatedTime ? formatMins(estimatedTime) : "—"}
              </span>
              {estimateEditable ? (
                canEditEstimate && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEst(true);
                      setEstInput(
                        estimatedTime ? formatMins(estimatedTime) : "",
                      );
                    }}
                    className="ml-auto font-sans text-[11.5px] text-pen-subtle transition-colors hover:text-pen-blue"
                  >
                    {estimatedTime ? "Edit" : "Set"}
                  </button>
                )
              ) : (
                <span className="ml-auto font-sans text-[11px] text-pen-subtle/60">
                  rolled up
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timer controls — same Start/Pause control as QA */}
      {canStart || activeTimerId ? (
        <div className="flex gap-1.5">
          <div className="min-w-0 flex-1">
            <TimerToggleButton
              running={!!activeTimerId}
              starting={starting}
              stopping={stopping}
              onToggle={() => {
                void (activeTimerId ? pauseTimer() : startTimer());
              }}
              idleClassName="bg-pen-blue/10 text-pen-blue ring-1 ring-pen-blue/20 hover:bg-pen-blue/15"
            />
          </div>
          {canReset && (
            <button
              type="button"
              onClick={resetMyTime}
              disabled={resetting}
              title="Reset your time on this ticket to 0"
              className="flex shrink-0 items-center justify-center gap-1 rounded-[7px] px-2.5 py-[6px] font-sans text-[11.5px] font-medium text-pen-muted ring-1 ring-pen-card-border transition-all hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
            >
              <RotateCcw className="size-[11px]" />
              {resetting ? "…" : "Reset"}
            </button>
          )}
        </div>
      ) : isAssignee ? (
        <div className="space-y-1.5">
          <p className="rounded-[7px] bg-pen-surface px-3 py-[7px] text-center font-sans text-[11.5px] text-pen-muted">
            Timer auto-starts when status is{" "}
            <span className="font-semibold text-pen-foreground">
              In Progress
            </span>
            . Move there to track time.
          </p>
          {canReset && (
            <button
              type="button"
              onClick={resetMyTime}
              disabled={resetting}
              className="flex w-full items-center justify-center gap-1.5 rounded-[7px] px-3 py-[6px] font-sans text-[11.5px] font-medium text-pen-muted ring-1 ring-pen-card-border transition-all hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
            >
              <RotateCcw className="size-[11px]" />
              {resetting ? "Resetting…" : "Reset my time to 0"}
            </button>
          )}
        </div>
      ) : null}

      {/* QA time tracking — same Start/Pause + session log pattern */}
      {(isQa || qaEntries.length > 0) && (
        <div className="mt-1 flex flex-col gap-[8px]">
          <SectionLabel>QA Time Log</SectionLabel>
          <div className="rounded-[8px] border border-pen-card-border bg-pen-surface/60 px-[11px] py-[9px] space-y-[8px]">
            <div className="flex items-baseline gap-1">
              <span
                className={cn(
                  "font-mono text-[14px] font-semibold leading-none",
                  qaTotalSecs > 0 ? "text-pen-foreground" : "text-pen-subtle",
                )}
              >
                {qaTotalSecs > 0 ? formatSecs(qaTotalSecs) : "0s"}
              </span>
              <span className="font-sans text-[11.5px] text-pen-subtle/60">
                logged
              </span>
              {activeQaTimerId && (
                <span className="ml-auto flex items-center gap-1 font-sans text-[11.5px] text-teal-600">
                  <span className="block size-[5px] rounded-full bg-teal-600 animate-pulse" />
                  {formatSecs(myQaElapsed)}
                </span>
              )}
            </div>

            {displayQaEntries.length > 0 && (
              <div className="space-y-[5px] border-t border-pen-card-border/60 pt-[7px]">
                {displayQaEntries.map((entry) => {
                  const secs =
                    entry.userId === currentUserId
                      ? myQaTotalSecs
                      : getEntrySecs(entry);
                  const running =
                    entry.userId === currentUserId
                      ? !!activeQaTimerId
                      : entry.isRunning;
                  return (
                    <div
                      key={entry.userId}
                      className="flex items-center gap-1.5"
                    >
                      <Avatar
                        name={entry.userName}
                        src={entry.avatarUrl}
                        size={16}
                      />
                      <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-muted">
                        {entry.userName.split(" ")[0]}
                      </span>
                      {running && (
                        <span className="block size-[5px] shrink-0 rounded-full bg-teal-600 animate-pulse" />
                      )}
                      <span className="font-mono text-[11.5px] font-semibold text-pen-foreground">
                        {formatSecs(secs)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {qaSessions.length > 0 && (
              <div className="border-t border-pen-card-border/60 pt-[7px]">
                <button
                  type="button"
                  onClick={() => setShowQaLog((v) => !v)}
                  className="flex w-full items-center gap-1 font-sans text-[11.5px] text-pen-subtle transition-colors hover:text-pen-muted"
                >
                  {showQaLog ? (
                    <ChevronDown className="size-3 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" />
                  )}
                  <span>Time log</span>
                  <span className="text-pen-subtle/60">
                    ({qaSessions.length})
                  </span>
                </button>
                {showQaLog && (
                  <div className="mt-[6px] space-y-[5px]">
                    {qaSessions.map((s) => {
                      const running = isMineQaSessionRunning(s);
                      const durSecs = running
                        ? Math.max(
                            0,
                            Math.floor(
                              (Date.now() - new Date(s.startedAt).getTime()) /
                                1000,
                            ),
                          )
                        : (s.durationSecs ??
                          (s.endedAt
                            ? Math.max(
                                0,
                                Math.floor(
                                  (new Date(s.endedAt).getTime() -
                                    new Date(s.startedAt).getTime()) /
                                    1000,
                                ),
                              )
                            : 0));
                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-1.5 leading-none"
                        >
                          <Avatar
                            name={s.userName}
                            src={s.avatarUrl}
                            size={14}
                          />
                          <span className="font-sans text-[11.5px] text-pen-muted">
                            {format(parseISO(s.startedAt), "d MMM")}
                          </span>
                          <span className="font-mono text-[11.5px] text-pen-subtle">
                            {format(parseISO(s.startedAt), "HH:mm")}
                            {" – "}
                            {running ? (
                              <span className="text-teal-600">running</span>
                            ) : s.endedAt ? (
                              format(parseISO(s.endedAt), "HH:mm")
                            ) : (
                              format(parseISO(s.startedAt), "HH:mm")
                            )}
                          </span>
                          <span
                            className={cn(
                              "ml-auto font-mono text-[11.5px] font-semibold",
                              running ? "text-teal-600" : "text-pen-foreground",
                            )}
                          >
                            {formatSecs(durSecs)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {isQa && (
            <TimerToggleButton
              running={!!activeQaTimerId}
              starting={startingQa}
              stopping={stoppingQa}
              onToggle={() => {
                void (activeQaTimerId ? pauseQaTimer() : startQaTimer());
              }}
              idleClassName="bg-teal-600/10 text-teal-700 ring-1 ring-teal-600/20 hover:bg-teal-600/15 dark:text-teal-400"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-ticket modal ──────────────────────────────────────────────────────────

type DrawerData = Omit<TicketDetailProps, "isDrawer" | "onClose">;

// Inner panel — separated so hooks only run when a sub-ticket is actually open
function SubTicketPanel({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useTicketDetail(ticketId);
  return isLoading || !data ? (
    <div className="flex flex-1 items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-pen-card-border border-t-pen-blue" />
    </div>
  ) : (
    <TicketDetailPage {...data} isDrawer onClose={onClose} />
  );
}

function SubTicketModal({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={!!ticketId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] pen-overlay-backdrop transition-opacity duration-200" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[61] w-[min(900px,95vw)] h-[calc(90dvh/var(--pen-font-scale,1))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl flex flex-col">
          {ticketId && <SubTicketPanel ticketId={ticketId} onClose={onClose} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
