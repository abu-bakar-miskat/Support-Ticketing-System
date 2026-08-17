"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deleteAdminProject } from "@/lib/api/admin";
import { ProjectModal, type ProjectRow, type ModalMode } from "@/components/projects/project-modal";
import { ProjectAvatar } from "@/components/projects/project-avatar";

type DepartmentOption = { id: string; name: string };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
      {children}
    </span>
  );
}

function MemberAvatar({
  name,
  color,
  avatarUrl,
  size = 6,
}: {
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  // Map Tailwind size units (4 = 16px, 5 = 20px, 6 = 24px) to pixels
  const px = size * 4;
  return <UserAvatar name={name} avatarUrl={avatarUrl} size={px} />;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function SettingsProjectsPage({
  projects,
  departments,
  lockedDepartment = null,
  isAdmin,
  canDeleteProjects = false,
}: {
  projects: ProjectRow[];
  departments: DepartmentOption[];
  lockedDepartment?: { id: string; name: string } | null;
  isAdmin: boolean;
  canDeleteProjects?: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<ProjectRow | null>(null);

  function refresh() {
    setModal(null);
    startTransition(() => router.refresh());
  }

  async function doDeleteProject(project: ProjectRow) {
    await deleteAdminProject(project.id);
    startTransition(() => router.refresh());
    setConfirmDelete(null);
  }

  return (
    <>
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title="Delete project"
        description={confirmDelete ? `Delete "${confirmDelete.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        successMessage={confirmDelete ? `"${confirmDelete.name}" deleted` : undefined}
        onConfirm={async () => { if (confirmDelete) await doDeleteProject(confirmDelete); }}
      />
      {modal && (
        <ProjectModal
          mode={modal}
          departments={departments}
          lockedDepartment={lockedDepartment}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}

      <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="pen-text-admin-title">
              Projects
            </h1>
            <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
              Workstreams assigned to people across teams.
            </p>
          </div>
          <Button
            onClick={() => setModal({ type: "create" })}
            disabled={isPending}
            className="h-[34px] w-full shrink-0 gap-1.5 rounded-[7px] bg-pen-blue px-0 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90 sm:w-[140px]"
          >
            <Plus className="size-[13px]" strokeWidth={2.5} />
            New project
          </Button>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                <TableHead className="h-8 w-[30%]">
                  <SectionLabel>Project</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[18%]">
                  <SectionLabel>Department</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[18%]">
                  <SectionLabel>Members</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[16%]">
                  <SectionLabel>Live domain</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[10%]">
                  <SectionLabel>Open</SectionLabel>
                </TableHead>
                <TableHead className="h-8 w-[5%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow className="border-[#f0f4f8] hover:bg-transparent dark:border-[#3a3a37]">
                  <TableCell colSpan={6} className="py-0">
                    <div className="flex h-[52px] items-center">
                      <span className="font-sans text-[11.5px] text-pen-muted">No projects yet</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
              {projects.map((project) => (
                <TableRow
                  key={project.id}
                  className="border-[#f0f4f8] hover:bg-pen-bg/40 dark:border-[#3a3a37]"
                >
                  {/* Name */}
                  <TableCell className="py-0">
                    <div className="flex h-[52px] items-center gap-2.5">
                      <ProjectAvatar name={project.name} color={project.color} avatarUrl={project.avatarUrl} size={24} />
                      <span className="truncate font-sans text-[13px] font-semibold text-pen-foreground">
                        {project.name}
                      </span>
                    </div>
                  </TableCell>

                  {/* Department */}
                  <TableCell className="py-0">
                    <div className="flex h-[52px] items-center">
                      {project.departmentName ? (
                        <span className="inline-flex items-center rounded-full bg-pen-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-pen-muted">
                          {project.departmentName}
                        </span>
                      ) : (
                        <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Members */}
                  <TableCell className="py-0">
                    <div className="flex h-[52px] items-center">
                      {project.members.length === 0 ? (
                        <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
                      ) : (
                        <div className="flex items-center -space-x-1.5">
                          {project.members.slice(0, 5).map((m) => (
                            <MemberAvatar key={m.id} name={m.name} color={m.avatarColor} avatarUrl={m.avatarUrl} size={6} />
                          ))}
                          {project.members.length > 5 && (
                            <span className="flex size-6 items-center justify-center rounded-full bg-pen-surface font-sans text-[8.5px] text-pen-subtle ring-2 ring-pen-card">
                              +{project.members.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Live domain */}
                  <TableCell className="py-0">
                    <div className="flex h-[52px] items-center">
                      {project.liveDomain ? (
                        <a
                          href={project.liveDomain}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-full bg-pen-surface px-[7px] py-0.5 font-sans text-[11.5px] font-medium text-pen-id transition-colors hover:text-pen-blue"
                        >
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="max-w-[110px] truncate">
                            {project.liveDomain.replace(/^https?:\/\//, "")}
                          </span>
                        </a>
                      ) : (
                        <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Open count */}
                  <TableCell className="py-0">
                    <div className="flex h-[52px] items-center">
                      <span className="font-mono text-xs font-semibold text-pen-foreground">
                        {project.openCount}
                      </span>
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="py-0 text-right">
                    <div className="flex h-[52px] items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
                          aria-label={`Actions for ${project.name}`}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-36">
                          <DropdownMenuItem
                            className="font-sans text-xs"
                            onClick={() => setModal({ type: "edit", project })}
                          >
                            Edit project
                          </DropdownMenuItem>
                          {canDeleteProjects && (
                            <DropdownMenuItem
                              variant="destructive"
                              className="font-sans text-xs"
                              onClick={() => setConfirmDelete(project)}
                            >
                              Delete project
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
