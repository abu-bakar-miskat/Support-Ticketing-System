"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BoardCardData,
  normalizeStatus,
  UI_STATUS_DOT,
  UI_PRIORITY_DOT_HEX,
} from "@/components/board/board-types";
import { StatusPill } from "@/components/board/status-pill";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  InlineStatusPicker,
  InlineAssigneePicker,
} from "@/components/ui/inline-pickers";
import { useSubDepartmentStatuses } from "@/hooks/queries/use-sub-department-statuses";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import { useSubDepartmentMembers } from "@/hooks/queries/use-board";
import { moveTicket, updateTicket } from "@/lib/api/tickets";
import { toast } from "sonner";
import { TaskTimeCell } from "@/components/tasks/task-time-cell";
import { ModuleCell } from "@/components/board/module-label";
import { AssigneeAvatars, AllTasksHeadRow, ALL_TASKS_COLGROUP, COL_ASSIGNEE, COL_CREATED, COL_MODULE, COL_PROJECT, COL_STATUS, COL_TIME, ListDueCell, ListCreatedCell, TASK_TABLE_CLASS, TaskListLabels, TITLE_CELL_CLASS, TITLE_INNER_CLASS } from "@/components/tasks/task-list-cells";

function truncateTitle(title: string, maxWords = 6): string {
  const words = title.trim().split(/\s+/);
  if (words.length <= maxWords) return title;
  return words.slice(0, maxWords).join(" ") + "…";
}

export function TaskListRow({
  task,
  colorMap,
  isSelected,
  onToggleSelect,
}: {
  task: BoardCardData;
  colorMap: Record<string, string>;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = task.subTicketCards.length > 0;
  const [liveStatus, setLiveStatus] = useState(task.status);
  const [liveAssigneeId, setLiveAssigneeId] = useState(task.assigneeId ?? null);
  const [liveAssigneeName, setLiveAssigneeName] = useState(
    task.assigneeName ?? null,
  );
  const [liveAssigneeAvatarUrl, setLiveAssigneeAvatarUrl] = useState(
    task.assigneeAvatarUrl ?? null,
  );

  const { data: statuses = [] } = useSubDepartmentStatuses(task.subDepartmentId);
  const { data: members = [] } = useSubDepartmentMembers(task.subDepartmentId);
  const liveIsComplete =
    statuses.find((s) => s.label === liveStatus)?.isComplete === true ||
    liveStatus === "Live";

  async function handleStatusChange(newStatus: string, chosenLabel?: string) {
    const prev = liveStatus;
    setLiveStatus(newStatus);
    try {
      await moveTicket(task.dbId, { status: newStatus, chosenLabel });
    } catch {
      setLiveStatus(prev);
      toast.error("Failed to update status");
    }
  }

  async function handleAssigneeChange(
    member: { id: string; name: string; avatarUrl?: string | null } | null,
  ) {
    const [pId, pName, pUrl] = [
      liveAssigneeId,
      liveAssigneeName,
      liveAssigneeAvatarUrl,
    ];
    setLiveAssigneeId(member?.id ?? null);
    setLiveAssigneeName(member?.name ?? null);
    setLiveAssigneeAvatarUrl(member?.avatarUrl ?? null);
    try {
      await updateTicket(task.dbId, { assigneeId: member?.id ?? null });
    } catch {
      setLiveAssigneeId(pId);
      setLiveAssigneeName(pName);
      setLiveAssigneeAvatarUrl(pUrl);
      toast.error("Failed to update assignee");
    }
  }

  const statusColor = colorMap[liveStatus] ?? "#94a3b8";
  const priorityColor = UI_PRIORITY_DOT_HEX[task.priority] ?? "#94a3b8";
  const pulseCritical = task.priority === "critical" || task.priority === "urgent";

  return (
    <>
      <tr className="group border-b border-[#f0f4f8] transition-colors hover:bg-pen-bg dark:border-[#3a3a37]">
        {onToggleSelect && (
          <td className="w-9 py-2.5 pl-4 align-middle">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={isSelected ?? false}
                onChange={() => onToggleSelect(task.dbId)}
                onClick={(e) => e.stopPropagation()}
                className="size-3.5 shrink-0 rounded border-pen-card-border accent-pen-blue cursor-pointer"
              />
            </div>
          </td>
        )}
        <td className={cn("w-[80px] py-2.5", onToggleSelect ? "pl-2" : "pl-4")}>
          <Link
            href={`/tickets/${task.dbId}`}
            className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline"
          >
            {task.humanId}
          </Link>
        </td>
        <td className={cn(TITLE_CELL_CLASS, "py-2.5")}>
          <div className={TITLE_INNER_CLASS}>
            {hasChildren && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex shrink-0 items-center justify-center text-pen-muted hover:text-pen-foreground"
                aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
              >
                <ChevronRight
                  className={cn(
                    "size-[13px] transition-transform",
                    expanded && "rotate-90",
                  )}
                />
              </button>
            )}
            <Link
              href={`/tickets/${task.dbId}`}
              className="flex min-w-0 items-center gap-1.5"
              title={task.title}
            >
              <span
                className={cn("block size-[7px] shrink-0 rounded-full", pulseCritical && "pen-critical-breathe")}
                style={{ backgroundColor: priorityColor }}
              />
              <span className="min-w-0 truncate font-sans text-[13px] text-pen-foreground group-hover:text-pen-id">
                {truncateTitle(task.title)}
              </span>
              <TaskListLabels labels={task.labels} />
              {hasChildren && (
                <span className="shrink-0 rounded-full bg-pen-surface px-1.5 py-px font-sans text-[11.5px] text-pen-subtle">
                  {task.subTicketCards.length}
                </span>
              )}
            </Link>
            {task.lastMessageDirection && !liveIsComplete && (
              <span
                className={cn(
                  "hidden shrink-0 items-center whitespace-nowrap py-[2px] font-sans text-[9.5px] font-medium ring-1 ring-inset ring-black/4 xl:inline-flex dark:ring-white/10",
                  task.lastMessageDirection === "outbound"
                    ? "bg-[#fffbeb] text-[#b45309] dark:bg-[#3a3018] dark:text-[#fcd34d]"
                    : "bg-[#ecfeff] text-[#0e7490] dark:bg-[#143038] dark:text-[#67e8f9]",
                )}
                style={{
                  clipPath: "polygon(0 0, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0 100%, 3px 50%)",
                  paddingLeft: "7px",
                  paddingRight: "9px",
                }}
              >
                {task.lastMessageDirection === "outbound" ? "Waiting for customer" : "Waiting for assignee"}
              </span>
            )}
          </div>
        </td>
        <td className={cn(COL_STATUS, "overflow-hidden py-2.5")}>
          <InlineStatusPicker
            subDepartmentId={task.subDepartmentId}
            statuses={statuses}
            current={liveStatus}
            onSelect={handleStatusChange}
          >
            {({ ref, onClick }) => (
              <button
                ref={ref}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="rounded transition-opacity hover:opacity-80"
              >
                <StatusPill status={liveStatus} color={statusColor} size="sm" />
              </button>
            )}
          </InlineStatusPicker>
        </td>
        <td className={cn(COL_ASSIGNEE, "overflow-hidden py-2.5")}>
          <InlineAssigneePicker
            members={members}
            currentId={liveAssigneeId}
            onSelect={handleAssigneeChange}
          >
            {({ ref, onClick }) => (
              <button
                ref={ref}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="rounded px-1 py-0.5 transition-colors hover:bg-pen-surface"
              >
                <AssigneeAvatars
                  assigneeId={liveAssigneeId}
                  assigneeName={liveAssigneeName}
                  assigneeAvatarUrl={liveAssigneeAvatarUrl}
                  coAssignees={task.coAssignees}
                />
              </button>
            )}
          </InlineAssigneePicker>
        </td>
        <td className={cn(COL_PROJECT, "overflow-hidden py-2.5")}>
          <div className="flex min-w-0 items-center gap-2" title={task.project}>
            <ProjectAvatar
              color={task.projectColor ?? "#0a76b9"}
              avatarUrl={task.projectAvatarUrl}
              name={task.project}
              size={22}
            />
            <span className="min-w-0 truncate font-sans text-[11.5px] text-pen-muted">
              {task.project}
            </span>
          </div>
        </td>
        <td className={cn(COL_MODULE, "overflow-hidden py-2.5")}>
          <ModuleCell moduleName={task.moduleName} />
        </td>
        <td className={cn(COL_TIME, "overflow-hidden py-2.5")}>
          <TaskTimeCell
            ticketDbId={task.dbId}
            humanId={task.humanId}
            title={task.title}
            status={liveStatus}
            assigneeId={liveAssigneeId}
            coAssigneeIds={task.coAssignees.map((a) => a.id)}
            userLoggedSecs={task.userLoggedSecs}
            estimatedTime={task.estimatedTime}
          />
        </td>
        <td className={cn(COL_CREATED, "overflow-hidden py-2.5")}>
          <ListCreatedCell iso={task.createdIso} />
        </td>
        <td className="whitespace-nowrap py-2.5 pr-4 text-right">
          <ListDueCell
            due={task.due}
            dueOverdue={task.dueOverdue}
            dueUrgent={task.dueUrgent}
            status={liveStatus}
          />
        </td>
      </tr>
      {expanded &&
        hasChildren &&
        task.subTicketCards.map((sub, idx) => {
          const subColor =
            colorMap[sub.status] ??
            UI_STATUS_DOT[normalizeStatus(sub.status)] ??
            "#94a3b8";
          const subPriorityColor = UI_PRIORITY_DOT_HEX[sub.priority] ?? "#94a3b8";
          const subPulseCritical = sub.priority === "critical" || sub.priority === "urgent";
          return (
            <tr
              key={sub.dbId}
              className="border-b border-[#f0f4f8] bg-pen-bg transition-colors hover:bg-pen-surface dark:border-[#3a3a37]"
            >
              {onToggleSelect && <td className="w-9 py-2 pl-4" />}
              <td className={cn("w-[80px] py-2", onToggleSelect ? "pl-2" : "pl-4")}>
                <Link
                  href={`/tickets/${sub.dbId}`}
                  className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline"
                >
                  {sub.humanId}
                </Link>
              </td>
              <td className="max-w-0 py-2 pr-3 pl-5">
                <Link
                  href={`/tickets/${sub.dbId}`}
                  className="flex min-w-0 items-center gap-2"
                >
                  <span
                    className={cn("block size-[6px] shrink-0 rounded-full", subPulseCritical && "pen-critical-breathe")}
                    style={{ backgroundColor: subPriorityColor }}
                  />
                  <span className="truncate font-sans text-[12px] text-pen-foreground">
                    {sub.title}
                  </span>
                </Link>
              </td>
              <td className={cn(COL_STATUS, "py-2")}>
                <StatusPill status={sub.status} color={subColor} size="sm" />
              </td>
              <td className={cn(COL_ASSIGNEE, "py-2")}>
                {sub.assigneeName ? (
                  <UserAvatar
                    name={sub.assigneeName}
                    avatarUrl={sub.assigneeAvatarUrl}
                    userId={sub.assigneeId}
                    size={20}
                    meta={{}}
                  />
                ) : (
                  <span
                    className="block size-5 shrink-0 rounded-full border border-dashed border-pen-subtle"
                    title="Unassigned"
                  />
                )}
              </td>
              <td className={cn(COL_PROJECT, "py-2")} />
              <td className={cn(COL_MODULE, "py-2")} />
              <td className={cn(COL_TIME, "py-2")} />
              <td className={cn(COL_CREATED, "py-2")} />
              <td className="py-2 pr-4" />
            </tr>
          );
        })}
    </>
  );
}

export function TaskListHead({
  showCheckbox = false,
  allSelected = false,
  onToggleAll,
}: {
  showCheckbox?: boolean;
  allSelected?: boolean;
  onToggleAll?: () => void;
} = {}) {
  return (
    <thead className="sticky top-0 z-10 bg-pen-card">
      <AllTasksHeadRow
        showCheckbox={showCheckbox}
        allSelected={allSelected}
        onToggleAll={onToggleAll}
      />
    </thead>
  );
}

export function TaskListTable({
  tasks,
  colorMap,
  emptyMessage = "No tickets match the current filters.",
}: {
  tasks: BoardCardData[];
  colorMap: Record<string, string>;
  emptyMessage?: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
      <table className={TASK_TABLE_CLASS}>
        {ALL_TASKS_COLGROUP}
        <TaskListHead />
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="py-20 text-center font-sans text-[13px] text-pen-subtle"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            tasks.map((task) => (
              <TaskListRow key={task.dbId} task={task} colorMap={colorMap} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
