"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ProjectMembersModal } from "@/components/projects/project-members-modal";
import { ProjectModal, type ProjectRow as ModalProjectRow } from "@/components/projects/project-modal";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import Link from "next/link";
import { Search, Ticket, Pin, PinOff, MoreHorizontal, ExternalLink, UserPlus, Circle, CheckCircle, Plus, AlignJustify, LayoutGrid, Settings, FolderKanban, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { StatusFilterButton, StatusPill } from "@/components/board/status-pill";
import { toast } from "sonner";
import type { ProjectListRow } from "@/lib/projects-list-data";
import { formatDateTime } from "@/lib/format";
import { usePersistedView, VIEW_KEYS } from "@/hooks/use-persisted-view";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";

type ProjectRow = ProjectListRow;

const PROJECT_STATUS: Record<string, { label: string; shortLabel: string; color: string }> = {
  live:           { label: "Live",           shortLabel: "Live",     color: "#059669" },
  in_development: { label: "In Development", shortLabel: "In Dev",   color: "#f97316" },
  pipeline:       { label: "Pipeline",       shortLabel: "Pipeline", color: "#94a3b8" },
};

const STATUS_FILTERS = [
  { key: "all", label: "All", shortLabel: "All", color: "#0a76b9" },
  { key: "live", label: "Live", shortLabel: "Live", color: "#059669" },
  { key: "in_development", label: "In Development", shortLabel: "In Dev", color: "#f97316" },
  { key: "pipeline", label: "Pipeline", shortLabel: "Pipeline", color: "#94a3b8" },
] as const;

const STATUS_OPTIONS: { key: "pipeline" | "in_development" | "live"; label: string; dot: string }[] = [
  { key: "pipeline",       label: "Pipeline",        dot: "#94a3b8" },
  { key: "in_development", label: "In Development",  dot: "#f97316" },
  { key: "live",           label: "Live",             dot: "#059669" },
];

function projectStatusMeta(
  raw: string,
  fallback?: { label: string; color: string },
) {
  const key = raw.toLowerCase();
  if (PROJECT_STATUS[key]) return PROJECT_STATUS[key];
  if (fallback) return { label: fallback.label, shortLabel: fallback.label, color: fallback.color };
  return PROJECT_STATUS.pipeline;
}

function listRowToModalProject(project: ProjectRow): ModalProjectRow {
  const slugPrefix = project.slug.split("-")[0]?.toUpperCase() ?? "PRJ";
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    avatarUrl: project.avatarUrl ?? null,
    description: project.description,
    projectStatus: project.projectStatus,
    lifecycleStages: project.lifecycleStages,
    moduleSystemEnabled: project.moduleSystemEnabled,
    liveDomain: project.liveDomain,
    openCount: project.ticketCount,
    prefix: `${slugPrefix}-`,
    departmentId: project.departmentId,
    departmentName: project.departmentName,
    members: project.members.map((m) => ({
      id: m.id,
      name: m.name,
      avatarColor: m.avatarColor,
      avatarUrl: m.avatarUrl ?? null,
    })),
  };
}


function ProjectMenu({
  project,
  onStatusChange,
  onManageMembers,
  onEditSettings,
  canEditStatus,
}: {
  project: ProjectRow;
  onStatusChange: (id: string, status: string) => void;
  onManageMembers: () => void;
  onEditSettings?: () => void;
  canEditStatus: boolean;
}) {
  const statusOptions =
    project.lifecycleStages.length > 0
      ? project.lifecycleStages.map((s) => ({
          key: s.id,
          label: s.label,
          dot: s.color,
        }))
      : STATUS_OPTIONS;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const MENU_H = 340;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= MENU_H
      ? (rect.bottom + 6) / zoom
      : (rect.top - MENU_H - 6) / zoom;
    setCoords({ top, right: (window.innerWidth - rect.right) / zoom });
    setOpen((v) => !v);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleStatusChange(status: string) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectStatus: status }),
      });
      if (!res.ok) throw new Error();
      onStatusChange(project.id, status);
      toast.success(
        `Status updated to ${statusOptions.find((s) => s.key === status)?.label ?? status}`,
      );
    } catch {
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  const currentStatus = project.projectStatus ?? "pipeline";

  const dropdown = open ? (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: coords.top,
        right: coords.right,
        zIndex: 9999,
        background: "var(--pen-card-solid)",
      }}
      className="w-56 max-h-[340px] overflow-y-auto overflow-x-hidden rounded-xl border border-pen-card-border shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Overview */}
      <div className="border-b border-pen-card-border px-3 py-2.5">
        <p className="pen-text-section-label">
          {project.name}
        </p>
        <div className="mt-1 flex items-center gap-2 text-pen-muted">
          <span className="font-sans text-[11.5px]">{project.members.length} member{project.members.length !== 1 ? "s" : ""}</span>
          <span className="text-pen-card-border">·</span>
          <span className="font-sans text-[11.5px]">{project.ticketCount} ticket{project.ticketCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="py-1">
        <Link
          href={`/projects/${project.slug}`}
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 px-3 py-2 font-sans text-[12.5px] text-pen-foreground transition-colors hover:bg-pen-surface"
        >
          <ExternalLink className="size-3.5 shrink-0 text-pen-muted" />
          Open project
        </Link>
        <button
          type="button"
          onClick={() => { setOpen(false); onManageMembers(); }}
          className="flex w-full items-center gap-2.5 px-3 py-2 font-sans text-[12.5px] text-pen-foreground transition-colors hover:bg-pen-surface"
        >
          <UserPlus className="size-3.5 shrink-0 text-pen-muted" />
          Manage members
        </button>
        {onEditSettings ? (
          <button
            type="button"
            onClick={() => { setOpen(false); onEditSettings(); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 font-sans text-[12.5px] text-pen-foreground transition-colors hover:bg-pen-surface"
          >
            <Settings className="size-3.5 shrink-0 text-pen-muted" />
            Project settings
          </button>
        ) : null}
      </div>

      {/* Status — managers/admins only, not for support projects */}
      {canEditStatus && project.kind !== "support" && (
        <div className="border-t border-pen-card-border py-1">
          <p className="px-3 py-1 pen-text-section-label">
            Set status
          </p>
          {statusOptions.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => handleStatusChange(s.key)}
              disabled={saving}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 font-sans text-[12.5px] transition-colors hover:bg-pen-surface disabled:cursor-wait",
                currentStatus === s.key ? "text-pen-foreground font-semibold" : "text-pen-muted",
              )}
            >
              {currentStatus === s.key
                ? <CheckCircle className="size-3.5 shrink-0 text-pen-blue" />
                : <Circle className="size-3.5 shrink-0 text-pen-card-border" />}
              <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-colors",
          open
            ? "bg-pen-surface text-pen-foreground"
            : "text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground",
        )}
        title="Quick actions"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {typeof window !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}

function SprintIndicator({
  activeSprintCount,
  plannedSprintCount,
  size = "sm",
}: {
  activeSprintCount: number;
  plannedSprintCount: number;
  size?: "sm" | "md";
}) {
  if (activeSprintCount === 0 && plannedSprintCount === 0) return null;

  const running = activeSprintCount > 0;
  const label = running
    ? activeSprintCount > 1
      ? `${activeSprintCount} sprints running`
      : "Sprint running"
    : "Sprint available";

  return (
    <span
      title={
        running
          ? `${activeSprintCount} active sprint${activeSprintCount !== 1 ? "s" : ""}`
          : `${plannedSprintCount} planned sprint${plannedSprintCount !== 1 ? "s" : ""} ready to start`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-sans font-medium",
        size === "md" ? "px-2 py-0.5 text-[11.5px]" : "px-1.5 py-0.5 text-[11px]",
        running
          ? "bg-[#e7f7ec] text-pen-green dark:bg-[#26352b]"
          : "bg-pen-surface text-pen-muted",
      )}
    >
      <Zap
        className={cn(
          "size-3 shrink-0",
          running && "fill-current",
        )}
      />
      {label}
    </span>
  );
}

function ProjectListHead() {
  return (
    <thead className="sticky top-0 z-10 bg-pen-card">
      <tr className="border-b border-pen-card-border">
        <th className="py-2.5 pl-4 text-left pen-text-table-head">Project</th>
        <th className="hidden w-[140px] py-2.5 text-left pen-text-table-head md:table-cell">Status</th>
        <th className="hidden w-[80px] py-2.5 text-left pen-text-table-head sm:table-cell">Tickets</th>
        <th className="hidden w-[150px] py-2.5 text-left pen-text-table-head lg:table-cell">Members</th>
        <th className="hidden w-[150px] py-2.5 text-left pen-text-table-head xl:table-cell">Live domain</th>
        <th className="hidden w-[130px] py-2.5 text-left pen-text-table-head 2xl:table-cell">Created</th>
        <th className="hidden w-[110px] py-2.5 text-left pen-text-table-head 2xl:table-cell">Project ID</th>
        <th className="w-[72px] py-2.5 pr-4 text-right pen-text-table-head" />
      </tr>
    </thead>
  );
}

function ProjectListRow({
  project,
  rawStatus,
  isPinned,
  canEditStatus,
  onTogglePin,
  onStatusChange,
  onManageMembers,
  onEditSettings,
}: {
  project: ProjectRow;
  rawStatus: string;
  isPinned: boolean;
  canEditStatus: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  onStatusChange: (id: string, status: string) => void;
  onManageMembers: () => void;
  onEditSettings?: () => void;
}) {
  const status = projectStatusMeta(rawStatus, {
    label: project.statusLabel,
    color: project.statusColor,
  });
  const isSupport = project.kind === "support";
  const shown = project.members.slice(0, 4);
  const extra = Math.max(0, project.members.length - 4);

  return (
    <tr
      className={cn(
        "group border-b border-[#f0f4f8] transition-colors hover:bg-pen-bg dark:border-[#3a3a37]",
        isPinned && "bg-pen-blue/3 dark:bg-pen-blue/6",
      )}
    >
      <td className="py-2.5 pl-4">
        <Link href={`/projects/${project.slug}`} className="flex min-w-0 items-center gap-3">
          <ProjectAvatar name={project.name} color={project.color ?? "#0a76b9"} avatarUrl={project.avatarUrl} size={32} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              {isPinned && <Pin className="size-3 shrink-0 text-pen-blue" />}
              <span className="truncate font-sans text-[13px] font-semibold text-pen-foreground group-hover:text-pen-id">
                {project.name}
              </span>
            </div>
            <p className="mt-0.5 truncate font-sans text-[11.5px] text-pen-subtle">
              {project.departmentName ?? "No department"}
              {project.subDepartmentName ? ` · ${project.subDepartmentName}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 md:hidden">
              {!isSupport && <StatusPill status={status.label} color={status.color} size="sm" />}
              <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                <Ticket className="size-3" />
                {project.ticketCount}
              </span>
            </div>
          </div>
        </Link>
      </td>

      <td className="hidden py-2.5 md:table-cell">
        {isSupport ? (
          <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <StatusPill status={status.label} color={status.color} size="md" />
            {project.statusRange && (
              <span className="font-mono text-[11px] text-pen-muted">
                {project.statusRange}
              </span>
            )}
            <SprintIndicator
              activeSprintCount={project.activeSprintCount}
              plannedSprintCount={project.plannedSprintCount}
              size="sm"
            />
          </div>
        )}
      </td>

      <td className="hidden py-2.5 sm:table-cell">
        <div className="flex items-center gap-1.5 text-pen-muted">
          <Ticket className="size-3.5 shrink-0 text-pen-subtle" />
          <span className="font-sans text-[12px] tabular-nums">{project.ticketCount}</span>
        </div>
      </td>

      <td className="hidden py-2.5 lg:table-cell">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center -space-x-1.5">
            {shown.map((m) => (
              <UserAvatar
                key={m.id}
                name={m.name}
                avatarUrl={m.avatarUrl}
                size={24}
                className="ring-2 ring-pen-card"
                meta={{ role: m.role ?? undefined, email: m.email ?? undefined }}
              />
            ))}
            {extra > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-pen-surface font-sans text-[8.5px] text-pen-subtle ring-2 ring-pen-card">
                +{extra}
              </span>
            )}
            {project.members.length === 0 && (
              <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onManageMembers(); }}
            title="Add members"
            className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-pen-card-border text-pen-subtle transition-colors hover:border-pen-id hover:text-pen-id"
          >
            <UserPlus className="size-3" />
          </button>
        </div>
      </td>

      <td className="hidden py-2.5 xl:table-cell">
        {project.liveDomain ? (
          <a
            href={project.liveDomain}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] font-medium text-pen-id transition-colors hover:text-pen-blue"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="max-w-[110px] truncate">
              {project.liveDomain.replace(/^https?:\/\//, "")}
            </span>
          </a>
        ) : (
          <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
        )}
      </td>

      <td className="hidden py-2.5 2xl:table-cell">
        <span className="whitespace-nowrap font-sans text-[11.5px] text-pen-muted">
          {formatDateTime(new Date(project.createdAt))}
        </span>
      </td>

      <td className="hidden py-2.5 2xl:table-cell">
        <button
          type="button"
          title="Click to copy"
          onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(project.id).then(() => toast.success("Project ID copied")); }}
          className="max-w-[100px] truncate rounded bg-pen-surface px-1.5 py-0.5 font-mono text-[10.5px] text-pen-muted transition-colors hover:bg-pen-card-border hover:text-pen-foreground"
        >
          {project.id}
        </button>
      </td>

      <td className="py-2.5 pr-4">
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={onTogglePin}
            title={isPinned ? "Unpin project" : "Pin project"}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              isPinned
                ? "text-pen-blue hover:bg-pen-blue/10"
                : "text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground",
            )}
          >
            {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <ProjectMenu
            project={{ ...project, projectStatus: rawStatus }}
            onStatusChange={onStatusChange}
            onManageMembers={onManageMembers}
            onEditSettings={onEditSettings}
            canEditStatus={canEditStatus}
          />
        </div>
      </td>
    </tr>
  );
}

function ProjectCard({
  project,
  rawStatus,
  isPinned,
  canEditStatus,
  onTogglePin,
  onStatusChange,
  onManageMembers,
  onEditSettings,
}: {
  project: ProjectRow;
  rawStatus: string;
  isPinned: boolean;
  canEditStatus: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  onStatusChange: (id: string, status: string) => void;
  onManageMembers: () => void;
  onEditSettings?: () => void;
}) {
  const status = projectStatusMeta(rawStatus, {
    label: project.statusLabel,
    color: project.statusColor,
  });
  const isSupport = project.kind === "support";
  const shown = project.members.slice(0, 4);
  const extra = Math.max(0, project.members.length - 4);

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-pen-card-border bg-pen-card p-4 transition-colors hover:border-pen-id/30 hover:bg-pen-surface/40",
        isPinned && "border-pen-blue/25 bg-pen-blue/3 dark:bg-pen-blue/6",
      )}
    >
      <div className="flex items-start gap-3">
        <Link href={`/projects/${project.slug}`} className="flex min-w-0 flex-1 items-start gap-3">
          <ProjectAvatar
            name={project.name}
            color={project.color ?? "#0a76b9"}
            avatarUrl={project.avatarUrl}
            size={40}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {isPinned && <Pin className="size-3 shrink-0 text-pen-blue" />}
              <h3 className="truncate font-sans text-[13.5px] font-semibold text-pen-foreground group-hover:text-pen-id">
                {project.name}
              </h3>
            </div>
            <p className="mt-0.5 truncate font-sans text-[11.5px] text-pen-subtle">
              {project.departmentName ?? "No department"}
              {project.subDepartmentName ? ` · ${project.subDepartmentName}` : ""}
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onTogglePin}
            title={isPinned ? "Unpin project" : "Pin project"}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              isPinned
                ? "text-pen-blue hover:bg-pen-blue/10"
                : "text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground",
            )}
          >
            {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <ProjectMenu
            project={{ ...project, projectStatus: rawStatus }}
            onStatusChange={onStatusChange}
            onManageMembers={onManageMembers}
            onEditSettings={onEditSettings}
            canEditStatus={canEditStatus}
          />
        </div>
      </div>

      {project.description ? (
        <p className="line-clamp-2 font-sans text-[12px] leading-relaxed text-pen-muted">
          {project.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {!isSupport && <StatusPill status={status.label} color={status.color} size="sm" />}
        {!isSupport && project.statusRange && (
          <span className="font-mono text-[11px] text-pen-muted">
            {project.statusRange}
          </span>
        )}
        {!isSupport && (
          <SprintIndicator
            activeSprintCount={project.activeSprintCount}
            plannedSprintCount={project.plannedSprintCount}
            size="sm"
          />
        )}
        <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
          <Ticket className="size-3 shrink-0 text-pen-subtle" />
          {project.ticketCount} ticket{project.ticketCount !== 1 ? "s" : ""}
        </span>
        {project.liveDomain && (
          <a
            href={project.liveDomain}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] font-medium text-pen-id transition-colors hover:text-pen-blue"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="max-w-[120px] truncate">
              {project.liveDomain.replace(/^https?:\/\//, "")}
            </span>
          </a>
        )}
        <span className="font-sans text-[11.5px] text-pen-subtle">
          {formatDateTime(new Date(project.createdAt))}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-pen-card-border pt-3">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center -space-x-1.5">
            {shown.map((m) => (
              <UserAvatar
                key={m.id}
                name={m.name}
                avatarUrl={m.avatarUrl}
                size={24}
                className="ring-2 ring-pen-card"
                meta={{ role: m.role ?? undefined, email: m.email ?? undefined }}
              />
            ))}
            {extra > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-pen-surface font-sans text-[8.5px] text-pen-subtle ring-2 ring-pen-card">
                +{extra}
              </span>
            )}
            {project.members.length === 0 && (
              <span className="font-sans text-[11.5px] text-pen-subtle">No members</span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onManageMembers();
            }}
            title="Add members"
            className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-pen-card-border text-pen-subtle transition-colors hover:border-pen-id hover:text-pen-id"
          >
            <UserPlus className="size-3" />
          </button>
        </div>

        <button
          type="button"
          title="Click to copy project ID"
          onClick={() =>
            navigator.clipboard
              .writeText(project.id)
              .then(() => toast.success("Project ID copied"))
          }
          className="max-w-[120px] truncate rounded bg-pen-surface px-1.5 py-0.5 font-mono text-[10px] text-pen-muted transition-colors hover:bg-pen-card-border hover:text-pen-foreground"
        >
          {project.id}
        </button>
      </div>
    </article>
  );
}

export function ProjectsListPage({
  projects,
  totalProjects,
  scope = "all",
  canCreate,
  canEdit = false,
  canEditStatus = false,
  createDepartments = [],
  lockedDepartment = null,
  pinnedProjectIds: _initialPins = [],
  hideTitleBar = false,
  isCrossAccess = false,
}: {
  projects: ProjectRow[];
  totalProjects?: number;
  scope?: "mine" | "all";
  canCreate: boolean;
  canEdit?: boolean;
  canEditStatus?: boolean;
  createDepartments?: { id: string; name: string }[];
  lockedDepartment?: { id: string; name: string } | null;
  pinnedProjectIds?: string[];
  hideTitleBar?: boolean;
  isCrossAccess?: boolean;
}) {
  const router = useRouter();
  const { pinnedProjectIds } = useDashboardContext();
  const { pins, togglePin } = usePinnedProjects(pinnedProjectIds);
  const [liveStatuses, setLiveStatuses] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const [layout, setLayout] = usePersistedView(VIEW_KEYS.projectsLayout, "cards", ["list", "cards"] as const);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [membersModal, setMembersModal] = useState<{ id: string; name: string } | null>(null);
  const [editProject, setEditProject] = useState<ProjectRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  function handleStatusChange(id: string, status: string) {
    setLiveStatuses((prev) => ({ ...prev, [id]: status }));
    startTransition(() => router.refresh());
  }

  const filtered = projects.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase());
    const effectiveStatus = liveStatuses[p.id] ?? p.projectStatus ?? "pipeline";
    const matchStatus =
      filterStatus === "all" || effectiveStatus === filterStatus;
    return matchSearch && matchStatus;
  });

  const pinned = filtered.filter((p) => pins.has(p.id));
  const unpinned = filtered.filter((p) => !pins.has(p.id));
  const sorted = [...pinned, ...unpinned];
  const total = totalProjects ?? projects.length;

  const statusCounts = useMemo(() => {
    const counts = { all: projects.length, live: 0, in_development: 0, pipeline: 0 };
    for (const p of projects) {
      const s = (liveStatuses[p.id] ?? p.projectStatus ?? "pipeline").toLowerCase();
      if (s === "live") counts.live++;
      else if (s === "in_development") counts.in_development++;
      else counts.pipeline++;
    }
    return counts;
  }, [projects, liveStatuses]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {createOpen && (
        <ProjectModal
          mode={{ type: "create" }}
          departments={createDepartments}
          lockedDepartment={lockedDepartment}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {editProject && canEdit && (
        <ProjectModal
          mode={{ type: "edit", project: listRowToModalProject(editProject) }}
          departments={createDepartments}
          lockedDepartment={lockedDepartment}
          onClose={() => setEditProject(null)}
          onSuccess={() => {
            setEditProject(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {/* Header */}
      <div className={cn(
        "shrink-0 border-b border-pen-card-border bg-pen-card",
        hideTitleBar ? "px-4 py-2 sm:px-6 xl:px-8" : "pen-page-header",
      )}>
        {!hideTitleBar && (
          <PageHeader
            title="Projects"
            icon={FolderKanban}
            iconClassName="text-pen-blue"
            badge={
              <span className="shrink-0 rounded-full bg-pen-surface px-2.5 py-0.5 font-sans text-[11.5px] text-pen-subtle">
                {projects.length}
              </span>
            }
            className="pb-3"
          />
        )}

        {/* Toolbar — filters beside search on sm+ */}
        <div className={cn(
          "flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3",
          hideTitleBar ? "mb-0" : "pb-3",
        )}>
          {hideTitleBar && (
            <p className="shrink-0 font-sans text-[12px] text-pen-muted sm:text-[12.5px]">
              <span className="font-semibold text-pen-foreground">{sorted.length}</span>
              {" of "}
              <span className="font-semibold text-pen-foreground">{total}</span>
              {" project"}{total === 1 ? "" : "s"}
              {scope === "mine" && (
                <span className="ml-1.5 rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] text-pen-subtle">
                  assigned to you
                </span>
              )}
            </p>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full sm:max-w-[200px] sm:shrink-0">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="h-8 w-full rounded-lg border border-pen-card-border bg-transparent pl-8 pr-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
            />
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto pb-1 scrollbar-none max-lg:-mx-4 max-lg:px-4 sm:max-lg:-mx-6 sm:max-lg:px-6 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max items-center gap-2 lg:w-full lg:flex-wrap">
              {STATUS_FILTERS.map((f) => (
                <StatusFilterButton
                  key={f.key}
                  status={f.label}
                  color={f.color}
                  count={statusCounts[f.key]}
                  active={filterStatus === f.key}
                  onClick={() => setFilterStatus(f.key)}
                />
              ))}

              {!isCrossAccess && pins.size > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-pen-blue/20 bg-pen-blue/10 px-2.5 py-1 font-sans text-[11.5px] font-medium whitespace-nowrap text-pen-blue">
                  <Pin className="size-3" />
                  {pins.size} pinned
                </span>
              )}

              {canCreate && createDepartments.length > 0 && (
                <Button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="ml-auto h-8 shrink-0 gap-1.5 rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90 dark:text-gray-900"
                >
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  New project
                </Button>
              )}

              <div className={cn(
                "flex h-8 shrink-0 overflow-hidden rounded-md border border-pen-card-border bg-pen-card",
                isCrossAccess && "ml-auto",
              )}>
                <button
                  type="button"
                  onClick={() => setLayout("list")}
                  aria-label="List view"
                  className={cn(
                    "flex h-full items-center gap-1.5 px-2.5 font-sans text-[11.5px] font-medium transition-colors sm:px-3",
                    layout === "list"
                      ? "bg-pen-blue-tint font-semibold text-pen-id"
                      : "text-pen-muted hover:text-pen-foreground",
                  )}
                >
                  <AlignJustify className="size-3" />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayout("cards")}
                  aria-label="Card view"
                  className={cn(
                    "flex h-full items-center gap-1.5 px-2.5 font-sans text-[11.5px] font-medium transition-colors sm:px-3",
                    layout === "cards"
                      ? "bg-pen-blue-tint font-semibold text-pen-id"
                      : "text-pen-muted hover:text-pen-foreground",
                  )}
                >
                  <LayoutGrid className="size-3" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Projects */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="py-20 text-center font-sans text-[13px] text-pen-subtle">
            <p className="text-pen-muted">No projects found</p>
            <p className="mt-1 text-[12px]">
              {search
                ? "Try a different search term"
                : scope === "mine"
                  ? "You are not assigned to any projects in this department"
                  : "No projects match the current filter"}
            </p>
          </div>
        ) : layout === "cards" ? (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 xl:px-8">
            {sorted.map((p) => {
              const rawStatus = liveStatuses[p.id] ?? p.projectStatus ?? "pipeline";
              return (
                <ProjectCard
                  key={p.id}
                  project={p}
                  rawStatus={rawStatus}
                  isPinned={pins.has(p.id)}
                  canEditStatus={canEditStatus}
                  onTogglePin={(e) => togglePin(e, p.id)}
                  onStatusChange={handleStatusChange}
                  onManageMembers={() => setMembersModal({ id: p.id, name: p.name })}
                  onEditSettings={canEdit ? () => setEditProject(p) : undefined}
                />
              );
            })}
          </div>
        ) : (
          <table className="w-full min-w-[640px] border-collapse">
            <ProjectListHead />
            <tbody>
              {sorted.map((p) => {
                const rawStatus = liveStatuses[p.id] ?? p.projectStatus ?? "pipeline";
                return (
                  <ProjectListRow
                    key={p.id}
                    project={p}
                    rawStatus={rawStatus}
                    isPinned={pins.has(p.id)}
                    canEditStatus={canEditStatus}
                    onTogglePin={(e) => togglePin(e, p.id)}
                    onStatusChange={handleStatusChange}
                    onManageMembers={() => setMembersModal({ id: p.id, name: p.name })}
                    onEditSettings={canEdit ? () => setEditProject(p) : undefined}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {membersModal && (
        <ProjectMembersModal
          projectId={membersModal.id}
          projectName={membersModal.name}
          onClose={() => setMembersModal(null)}
          onChanged={() => startTransition(() => router.refresh())}
        />
      )}
    </div>
  );
}
