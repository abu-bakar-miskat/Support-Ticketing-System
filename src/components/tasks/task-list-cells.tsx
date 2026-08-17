import { cn } from "@/lib/utils";
import { formatDateTime, formatListDateTime, isBlockedStatus } from "@/lib/format";
import { TagPill } from "@/components/board/tag-pill";
import { UserAvatar } from "@/components/ui/user-avatar";

export const LIST_TD = "py-2 align-middle";
export const LIST_TH = "py-2";

/** Column visibility — tuned for sidebar layout; scroll when wider than viewport. */
export const COL_STATUS = "hidden md:table-cell";
export const COL_ASSIGNEE = "hidden lg:table-cell";
export const COL_CREATOR = "hidden xl:table-cell";
export const COL_PROJECT = "hidden xl:table-cell";
export const COL_MODULE = "hidden xl:table-cell";
export const COL_TIME = "hidden xl:table-cell";
export const COL_CREATED = "hidden 2xl:table-cell";

export const TASK_TABLE_CLASS =
  "w-full table-auto border-collapse xl:table-fixed xl:min-w-[1040px] 2xl:min-w-[1120px]";

export const MY_TASKS_TABLE_CLASS =
  "w-full table-auto border-collapse xl:table-fixed xl:min-w-[1160px] 2xl:min-w-[1240px]";

/** Compact 5-column layout for the manager review / PR section. */
export const REVIEW_TASKS_TABLE_CLASS =
  "w-full table-fixed border-collapse min-w-[480px] sm:min-w-[560px]";

export const TITLE_CELL_CLASS = "max-w-0 overflow-hidden pr-3 pl-2";
export const TITLE_INNER_CLASS =
  "flex min-w-0 items-center gap-1.5";

/** Stacked assignee + co-assignee avatars for list tables. */
export function AssigneeAvatars({
  assigneeId,
  assigneeName,
  assigneeAvatarUrl,
  coAssignees,
  size = 22,
}: {
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarUrl?: string | null;
  coAssignees: { id: string; name: string; avatarUrl?: string | null }[];
  size?: number;
}) {
  const extra = coAssignees.filter((a) => a.id !== assigneeId);
  const visible = extra.slice(0, 3);
  const overflow = extra.length - visible.length;
  const names = [assigneeName, ...extra.map((a) => a.name)].filter(Boolean);

  return (
    <div
      className="flex items-center -space-x-1.5"
      title={names.length > 0 ? names.join(", ") : "Unassigned"}
    >
      {assigneeName ? (
        <UserAvatar
          name={assigneeName}
          avatarUrl={assigneeAvatarUrl}
          size={size}
          className="ring-1 ring-pen-card"
          meta={{}}
        />
      ) : (
        <span
          className="block shrink-0 rounded-full border border-dashed border-pen-subtle ring-1 ring-pen-card"
          style={{ width: size, height: size }}
        />
      )}
      {visible.map((a) => (
        <UserAvatar
          key={a.id}
          name={a.name}
          avatarUrl={a.avatarUrl}
          size={size}
          className="ring-1 ring-pen-card"
          meta={{}}
        />
      ))}
      {overflow > 0 && (
        <span
          className="flex shrink-0 items-center justify-center rounded-full bg-pen-surface font-sans text-pen-subtle ring-1 ring-pen-card"
          style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** Inline label pills for list/table title rows. */
export function TaskListLabels({
  labels,
  className,
}: {
  labels: string[];
  className?: string;
}) {
  if (labels.length === 0) return null;
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {labels.slice(0, 3).map((lbl) => (
        <TagPill key={lbl} label={lbl} size="sm" />
      ))}
      {labels.length > 3 && (
        <span className="shrink-0 font-sans text-[10px] text-pen-subtle">
          +{labels.length - 3}
        </span>
      )}
    </div>
  );
}

type DueProps = {
  due: string | null;
  dueOverdue: boolean;
  dueUrgent: boolean;
  status?: string;
  className?: string;
  align?: "left" | "right";
};

/** Single-line due cell — prevents "Overdue · 00:59" wrapping in narrow columns. */
export function ListDueCell({
  due,
  dueOverdue,
  dueUrgent,
  status,
  className,
  align = "right",
}: DueProps) {
  if (!due) {
    // Blocked tickets with no due date show nothing — no deadline to track.
    if (isBlockedStatus(status)) return null;
    return (
      <span className={cn("font-sans text-[11.5px] text-pen-subtle", className)}>
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "whitespace-nowrap font-sans text-[11.5px]",
        due === "Complete"
          ? "font-medium text-pen-green"
          : dueOverdue
            ? "font-semibold text-pen-red"
            : dueUrgent
              ? "font-semibold text-amber-500"
              : "text-pen-muted",
        align === "right" && "block text-right",
        className,
      )}
      title={due}
    >
      {due}
    </span>
  );
}

/** Single-line created-at cell for dense list tables. */
export function ListCreatedCell({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const date = new Date(iso);
  return (
    <span
      className={cn(
        "whitespace-nowrap font-sans text-[11.5px] text-pen-muted",
        className,
      )}
      title={formatDateTime(date)}
    >
      {formatListDateTime(date)}
    </span>
  );
}

/** 9-column layout for All Tasks. Hidden below xl — table-auto handles sizing there. */
export const ALL_TASKS_COLGROUP = (
  <colgroup className="max-xl:hidden">
    <col style={{ width: 72 }} />
    <col />
    <col style={{ width: 118 }} />
    <col style={{ width: 88 }} />
    <col style={{ width: 140 }} />
    <col style={{ width: 108 }} />
    <col style={{ width: 84 }} />
    <col style={{ width: 104 }} />
    <col style={{ width: 108 }} />
  </colgroup>
);

/** 10-column layout for My Tasks (includes Creator). Hidden below xl — table-auto handles sizing there. */
export const MY_TASKS_COLGROUP = (
  <colgroup className="max-xl:hidden">
    <col style={{ width: 72 }} />
    <col />
    <col style={{ width: 118 }} />
    <col style={{ width: 116 }} />
    <col style={{ width: 88 }} />
    <col style={{ width: 140 }} />
    <col style={{ width: 108 }} />
    <col style={{ width: 84 }} />
    <col style={{ width: 104 }} />
    <col style={{ width: 108 }} />
  </colgroup>
);

/** @deprecated Use MY_TASKS_COLGROUP */
export const TASK_LIST_COLGROUP = MY_TASKS_COLGROUP;

const TABLE_HEAD = "pen-text-table-head max-xl:tracking-[0.4px] max-xl:normal-case";

export function ReviewTaskHeadRow() {
  return (
    <tr className="border-b border-pen-card-border">
      <th className={cn("w-[68px] pl-4 text-left", TABLE_HEAD, LIST_TH)}>ID</th>
      <th className={cn("text-left", TABLE_HEAD, LIST_TH)}>Title</th>
      <th className={cn("hidden w-[160px] text-left sm:table-cell", TABLE_HEAD, LIST_TH)}>Project</th>
      <th className={cn(COL_STATUS, "w-[108px] text-left", TABLE_HEAD, LIST_TH)}>Status</th>
      <th className={cn(COL_ASSIGNEE, "w-[72px] text-left", TABLE_HEAD, LIST_TH)}>Assignee</th>
      <th className={cn("w-[100px] pr-4 text-right", TABLE_HEAD, LIST_TH)}>Due</th>
    </tr>
  );
}

export function TaskListHeadRow({
  creatorLabel = "Creator",
}: {
  creatorLabel?: string;
}) {
  return (
    <tr className="border-b border-pen-card-border">
      <th className={cn("w-[72px] pl-4 text-left", TABLE_HEAD, LIST_TH)}>ID</th>
      <th className={cn("text-left", TABLE_HEAD, LIST_TH)}>Title</th>
      <th className={cn(COL_STATUS, "w-[118px] text-left", TABLE_HEAD, LIST_TH)}>Status</th>
      <th className={cn(COL_CREATOR, "w-[116px] text-left", TABLE_HEAD, LIST_TH)}>{creatorLabel}</th>
      <th className={cn(COL_ASSIGNEE, "w-[88px] text-left", TABLE_HEAD, LIST_TH)}>Assignee</th>
      <th className={cn(COL_PROJECT, "w-[140px] text-left", TABLE_HEAD, LIST_TH)}>Project</th>
      <th className={cn(COL_MODULE, "w-[108px] text-left", TABLE_HEAD, LIST_TH)}>Module</th>
      <th className={cn(COL_TIME, "w-[84px] text-left", TABLE_HEAD, LIST_TH)}>Time</th>
      <th className={cn(COL_CREATED, "w-[104px] text-left", TABLE_HEAD, LIST_TH)}>Created</th>
      <th className={cn("w-[108px] pr-4 text-right", TABLE_HEAD, LIST_TH)}>Due</th>
    </tr>
  );
}

export function AllTasksHeadRow({
  showCheckbox = false,
  allSelected = false,
  onToggleAll,
}: {
  showCheckbox?: boolean;
  allSelected?: boolean;
  onToggleAll?: () => void;
} = {}) {
  return (
    <tr className="border-b border-pen-card-border">
      {showCheckbox && (
        <th className="w-9 py-2.5 pl-4 align-middle">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onToggleAll?.()}
              className="size-3.5 shrink-0 rounded border-pen-card-border accent-pen-blue cursor-pointer"
              aria-label="Select all"
            />
          </div>
        </th>
      )}
      <th className={cn("w-[72px] text-left", TABLE_HEAD, LIST_TH, showCheckbox ? "pl-2" : "pl-4")}>ID</th>
      <th className={cn("text-left", TABLE_HEAD, LIST_TH)}>Title</th>
      <th className={cn(COL_STATUS, "w-[118px] text-left", TABLE_HEAD, LIST_TH)}>Status</th>
      <th className={cn(COL_ASSIGNEE, "w-[88px] text-left", TABLE_HEAD, LIST_TH)}>Assignee</th>
      <th className={cn(COL_PROJECT, "w-[140px] text-left", TABLE_HEAD, LIST_TH)}>Project</th>
      <th className={cn(COL_MODULE, "w-[108px] text-left", TABLE_HEAD, LIST_TH)}>Module</th>
      <th className={cn(COL_TIME, "w-[84px] text-left", TABLE_HEAD, LIST_TH)}>Time</th>
      <th className={cn(COL_CREATED, "w-[104px] text-left", TABLE_HEAD, LIST_TH)}>Created</th>
      <th className={cn("w-[108px] pr-4 text-right", TABLE_HEAD, LIST_TH)}>Due</th>
    </tr>
  );
}
