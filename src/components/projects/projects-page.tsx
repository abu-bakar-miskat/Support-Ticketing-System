"use client";

import { usePersistedView, VIEW_KEYS } from "@/hooks/use-persisted-view";
import { FolderKanban, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectsListPage } from "@/components/projects/projects-list-page";
import type { ProjectListRow } from "@/lib/projects-list-data";

type Scope = "mine" | "all";

type Props = {
  myProjects: ProjectListRow[];
  allProjects: ProjectListRow[];
  canCreate: boolean;
  canEdit: boolean;
  canEditStatus?: boolean;
  createDepartments?: { id: string; name: string }[];
  lockedDepartment?: { id: string; name: string } | null;
  pinnedProjectIds: string[];
  isCrossAccess?: boolean;
};

export function ProjectsPage({
  myProjects,
  allProjects,
  canCreate,
  canEdit,
  canEditStatus = false,
  createDepartments = [],
  lockedDepartment = null,
  pinnedProjectIds,
  isCrossAccess = false,
}: Props) {
  const [scope, setScope] = usePersistedView(VIEW_KEYS.projectsScope, "mine", ["mine", "all"] as const);
  const projects = scope === "mine" ? myProjects : allProjects;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-b border-pen-card-border bg-pen-card px-4 py-1.5 sm:px-6 xl:px-8">
        {(["mine", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-3 font-sans text-[12.5px] font-medium leading-none transition-colors",
              scope === s
                ? "bg-pen-blue text-white dark:text-gray-900"
                : "text-pen-muted hover:bg-pen-surface hover:text-pen-foreground",
            )}
          >
            {s === "mine"
              ? <FolderKanban className="size-3.5 shrink-0" />
              : <LayoutGrid className="size-3.5 shrink-0" />}
            {s === "mine" ? "My Projects" : "All Projects"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ProjectsListPage
          projects={projects}
          totalProjects={projects.length}
          scope={scope}
          canCreate={canCreate}
          canEdit={canEdit}
          canEditStatus={canEditStatus}
          createDepartments={createDepartments}
          lockedDepartment={lockedDepartment}
          pinnedProjectIds={pinnedProjectIds}
          isCrossAccess={isCrossAccess}
          hideTitleBar
        />
      </div>
    </div>
  );
}
