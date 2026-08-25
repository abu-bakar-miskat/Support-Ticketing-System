"use client";

import { useState } from "react";
import { usePersistedView, VIEW_KEYS } from "@/hooks/use-persisted-view";
import { LayoutList, CheckSquare, UserX, Plus, FilePenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import { MyTasksPage } from "@/components/tasks/my-tasks-page";
import { AllTasksPage } from "@/components/tasks/all-tasks-page";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { TasksTableSkeleton } from "@/components/skeletons/page-skeletons";
import { useMyTasks, useTasksMeta, useUnassignedCount } from "@/hooks/queries/use-tasks";
import type { MyTasksResponse, TasksMetaResponse } from "@/lib/api/tasks";

type Scope = "mine" | "all" | "unassigned" | "drafts";

const SCOPES = ["mine", "all", "unassigned", "drafts"] as const;

export function TasksPage({
  initialMyTasks,
  initialMeta,
}: {
  initialMyTasks?: MyTasksResponse;
  initialMeta?: TasksMetaResponse;
}) {
  const currentUser = useCurrentUser();
  const canSeeUnassigned = currentUser?.role === "admin" || currentUser?.role === "manager";
  const [scope, setScope] = usePersistedView(VIEW_KEYS.tasksScope, "mine", SCOPES);
  const [creating, setCreating] = useState(false);

  const { data: myData } = useMyTasks(initialMyTasks);
  const { data: meta } = useTasksMeta(true, undefined, initialMeta);
  const { data: unassignedCount } = useUnassignedCount(canSeeUnassigned);
  const metaReady = meta ?? initialMeta;
  const effectiveScope: Scope = scope === "unassigned" && !canSeeUnassigned ? "mine" : scope;
  const canRender = (effectiveScope === "mine" ? (myData ?? initialMyTasks) : true) && metaReady;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Scope toggle + New Task button */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-sts-card-border bg-sts-card px-4 py-1.5 sm:px-6 xl:px-8">
        {SCOPES.filter((s) => s !== "unassigned" || canSeeUnassigned).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-3 font-sans text-[12.5px] font-medium leading-none transition-colors",
              effectiveScope === s
                ? "bg-sts-blue text-white dark:text-gray-900"
                : "text-sts-muted hover:bg-sts-surface hover:text-sts-foreground",
            )}
          >
            {s === "mine" && <CheckSquare className="size-3.5 shrink-0" />}
            {s === "all" && <LayoutList className="size-3.5 shrink-0" />}
            {s === "unassigned" && <UserX className="size-3.5 shrink-0" />}
            {s === "drafts" && <FilePenLine className="size-3.5 shrink-0" />}
            {s === "mine"
              ? "My Tasks"
              : s === "all"
                ? "All Tasks"
                : s === "unassigned"
                  ? "Unassigned"
                  : "Drafts"}
            {s === "unassigned" && !!unassignedCount && (
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-sans text-[10.5px] font-bold leading-none",
                  effectiveScope === s
                    ? "bg-white/25 text-white dark:text-gray-900"
                    : "bg-sts-blue-tint text-sts-id",
                )}
              >
                {unassignedCount}
              </span>
            )}
          </button>
        ))}

        <span className="min-w-0 flex-1" />

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-sts-blue px-3 font-sans text-[12.5px] font-medium text-white transition-colors hover:bg-sts-blue/90 dark:text-gray-900"
        >
          <Plus className="size-3.5 shrink-0" />
          New Task
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {canRender && effectiveScope === "mine" ? (
          <MyTasksPage
            tasks={myData?.tasks ?? initialMyTasks?.tasks ?? []}
            subDepartmentStatuses={metaReady.subDepartmentStatuses}
            subDepartmentStatusMap={myData?.subDepartmentStatusMap ?? initialMyTasks?.subDepartmentStatusMap ?? {}}
            reviewTasks={myData?.reviewTasks ?? initialMyTasks?.reviewTasks ?? []}
            isManager={myData?.isManager ?? initialMyTasks?.isManager ?? false}
            subtasks={myData?.subtasks ?? initialMyTasks?.subtasks ?? []}
            hideTitleBar
          />
        ) : canRender &&
          (effectiveScope === "all" ||
            effectiveScope === "unassigned" ||
            effectiveScope === "drafts") ? (
          <AllTasksPage
            subDepartmentStatuses={metaReady.subDepartmentStatuses}
            availableProjects={metaReady.availableProjects}
            availableModules={metaReady.availableModules ?? []}
            availableMembers={metaReady.availableMembers}
            unassignedOnly={effectiveScope === "unassigned"}
            draftsOnly={effectiveScope === "drafts"}
            hideTitleBar
          />
        ) : (
          <TasksTableSkeleton />
        )}
      </div>

      {creating && metaReady && (
        <NewTicketModal
          projects={metaReady.availableProjects}
          subDepartmentMembers={metaReady.availableMembers}
          defaultSubDepartmentId={metaReady.defaultSubDepartmentId ?? undefined}
          statuses={metaReady.subDepartmentStatuses.map((s) => ({ id: s.id, label: s.label, color: s.color }))}
          onCreated={() => setCreating(false)}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
