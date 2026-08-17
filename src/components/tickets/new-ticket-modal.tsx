"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches";
import { teamKeys } from "@/hooks/queries/keys";
import { getTeamStatuses } from "@/lib/api/teams";
import { useSprints } from "@/hooks/queries/use-sprints";
import { useProjectModules } from "@/hooks/queries/use-modules";
import { getTemplates } from "@/lib/api/templates";
import { uploadTemplateFile, deleteTemplateFile } from "@/lib/api/template-files";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  X,
  Link2,
  Plus,
  ChevronDown,
  CornerDownLeft,
  CalendarDays,
  Search,
  Check,
  UserX,
} from "lucide-react";
import { format, isSameDay, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ExpandableDescriptionEditor } from "@/components/ui/expandable-description-editor";
import { AiComposeButton } from "@/components/tickets/ai-compose-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { extractAttachmentIdsFromHtml } from "@/lib/tiptap/attachment-utils";
import { LabelPicker, TagPill } from "@/components/tickets/label-picker";
import { useAuthStore } from "@/store";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import { AvatarVisual } from "@/components/ui/user-avatar";
import { matchesUserListSearch, type UserListPerson } from "@/lib/user-list-person";
import { getPortalRoot } from "@/lib/portal-root";

type Project = { id: string; name: string; teamId?: string | null; kind?: string };
type TeamMember = UserListPerson;
type StatusOption = { id: string; label: string; color: string };
type TicketTemplate = {
  id: string;
  name: string;
  customFields: any[];
};

const FALLBACK_STATUSES: StatusOption[] = [
  { id: "backlog", label: "Backlog", color: "#94a3b8" },
  { id: "todo", label: "Todo", color: "#60a5fa" },
  { id: "in-progress", label: "In Progress", color: "#f59e0b" },
  { id: "in-review", label: "In Review", color: "#a855f7" },
  { id: "done", label: "Done", color: "#22c55e" },
];

const PRIORITIES = ["Urgent", "Critical", "High", "Medium", "Low"] as const;
const STORY_POINT_PRESETS = [1, 2, 3, 5, 8, 13] as const;

function isMiscProjectName(name: string) {
  return name.toLowerCase() === "miscellaneous";
}

function parseTimeInput(input: string): number | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;
  const hMatch = str.match(/(\d+(?:\.\d+)?)\s*h/);
  const mMatch = str.match(/(\d+)\s*m/);
  const justNum = str.match(/^(\d+(?:\.\d+)?)$/);
  let total = 0;
  if (hMatch) total += parseFloat(hMatch[1]) * 60;
  if (mMatch) total += parseInt(mMatch[1]);
  if (justNum && !hMatch && !mMatch) total = parseFloat(justNum[1]) * 60;
  return total > 0 ? Math.round(total) : null;
}

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: "#ff4500",
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#ec4899",
  Low: "#94a3b8",
};

interface NewTicketModalProps {
  projects: Project[];
  teamMembers: TeamMember[];
  defaultProjectName?: string;
  /** Pre-select a specific project (used when opening from a project board) */
  defaultProjectId?: string;
  /** Pre-select a status (used when opening from a board column + button) */
  defaultStatus?: string;
  /** Lock the ticket to a specific team (used when opening from a team board tab) */
  defaultTeamId?: string;
  /** Default board when creating from project All tasks (must be in boardTeams) */
  defaultBoardTeamId?: string;
  /** Project board tabs — when multiple, user picks which board the task belongs to */
  boardTeams?: { id: string; name: string }[];
  /** When true, team/board cannot be changed */
  lockTeamId?: boolean;
  /**
   * When true, project is read-only. Defaults to true whenever `defaultProjectId`
   * is set (project boards). Pass `false` to preselect but still allow changing.
   */
  lockProject?: boolean;
  /** Team-specific statuses to show in the status dropdown */
  statuses?: StatusOption[];
  /** Team members to show in the assignee dropdown (overrides global teamMembers) */
  teamMembersForCreate?: UserListPerson[];
  /** When true, the assignee list is still loading — avoids a flash of "No members found" */
  membersLoading?: boolean;
  /** When set, the created ticket is linked as a sub-ticket of this parent */
  parentId?: string;
  /** Human-readable ID of the parent ticket, shown in the modal header */
  parentHumanId?: string;
  /** Called after successful creation instead of navigating away */
  onCreated?: (ticket: {
    id: string;
    title: string;
    status: string;
    priority: string;
    teamPrefix: string;
    ticketNumber: number;
    assigneeId: string | null;
    assigneeName: string | null;
    projectId: string | null;
    projectName: string | null;
  }) => void;
  onClose: () => void;
}

export function NewTicketModal({
  projects,
  teamMembers,
  defaultProjectName,
  defaultProjectId,
  defaultStatus,
  defaultTeamId,
  defaultBoardTeamId,
  boardTeams,
  lockTeamId = false,
  lockProject,
  statuses,
  teamMembersForCreate,
  membersLoading = false,
  parentId,
  parentHumanId,
  onCreated,
  onClose,
}: NewTicketModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const effectiveMembers = teamMembersForCreate
    ? teamMembersForCreate
    : teamMembers;
  const currentUserId = useAuthStore((s) => s.user?.id ?? "");
  const [submitting, setSubmitting] = useState<"draft" | "create" | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, Record<string, boolean>>>({});
  const [deletingFiles, setDeletingFiles] = useState<Record<string, Record<string, boolean>>>({});

  // Track selected project so we can fetch its team's statuses
  // "" = Miscellaneous (no project)
  const defaultProject =
    projects.find((p) => p.id === defaultProjectId) ??
    projects.find((p) => p.name === defaultProjectName) ??
    projects.find((p) => isMiscProjectName(p.name)) ??
    null;
  const initialProjectId =
    defaultProject && !isMiscProjectName(defaultProject.name)
      ? defaultProject.id
      : "";
  const [selectedProjectId, setSelectedProjectId] =
    useState<string>(initialProjectId);
  const initialBoardTeamId =
    defaultBoardTeamId ??
    defaultTeamId ??
    boardTeams?.[0]?.id ??
    null;
  const [selectedBoardTeamId, setSelectedBoardTeamId] = useState(
    () => initialBoardTeamId,
  );
  const listedProjects = projects.filter(
    (p) => !isMiscProjectName(p.name) && p.kind !== "support",
  );
  const selectedProject =
    selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId) ?? null
      : null;
  const projectLocked =
    (lockProject ?? Boolean(defaultProjectId)) && Boolean(defaultProject);
  const activeTeamId = lockTeamId
    ? defaultTeamId ?? null
    : boardTeams && boardTeams.length > 0
      ? boardTeams.length === 1
        ? boardTeams[0].id
        : selectedBoardTeamId
      : selectedProject?.teamId ?? defaultTeamId ?? null;
  const propStatuses = statuses?.length ? statuses : undefined;

  // Fetch the real team statuses; fall back to prop or defaults while loading
  const { data: fetchedStatuses } = useQuery({
    queryKey: teamKeys.statuses(activeTeamId ?? ""),
    queryFn: () => getTeamStatuses(activeTeamId!),
    enabled: !!activeTeamId && !propStatuses,
    staleTime: 5 * 60 * 1000,
    initialData: () => {
      if (!activeTeamId) return undefined;
      return queryClient.getQueryData<Awaited<ReturnType<typeof getTeamStatuses>>>(
        teamKeys.statuses(activeTeamId),
      );
    },
  });
  const effectiveStatuses = useMemo(() => {
    const fromFetch = fetchedStatuses?.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
    }));
    const list = propStatuses ?? fromFetch ?? FALLBACK_STATUSES;
    return list.length > 0 ? list : FALLBACK_STATUSES;
  }, [propStatuses, fetchedStatuses]);

  const [selectedStatus, setSelectedStatus] = useState(
    () => defaultStatus ?? FALLBACK_STATUSES[0]?.label ?? "",
  );

  useEffect(() => {
    if (!effectiveStatuses.length) return;
    setSelectedStatus((current) => {
      if (current && effectiveStatuses.some((s) => s.label === current)) return current;
      if (defaultStatus && effectiveStatuses.some((s) => s.label === defaultStatus)) {
        return defaultStatus;
      }
      return effectiveStatuses[0]?.label ?? "";
    });
  }, [effectiveStatuses, defaultStatus]);

  // Fetch available templates
  const { data: templates = [] } = useQuery({
    queryKey: ["ticket-templates"],
    queryFn: () => getTemplates(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: allSprints } = useSprints();
  const projectSprints = selectedProjectId
    ? (allSprints ?? []).filter((s) => s.projectId === selectedProjectId)
    : [];
  const { data: projectModulesData } = useProjectModules(selectedProjectId || null);
  const moduleSystemEnabled = projectModulesData?.moduleSystemEnabled === true;
  const projectModules = moduleSystemEnabled ? projectModulesData?.modules ?? [] : [];
  const [error, setError] = useState<string | null>(null);
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<string>("Low");
  const [storyPoints, setStoryPoints] = useState<number | null>(null);
  const [estInput, setEstInput] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [assetLinks, setAssetLinks] = useState<{ label: string; url: string }[]>([]);
  const [newAssetUrl, setNewAssetUrl] = useState("");
  const [newAssetLabel, setNewAssetLabel] = useState("");
  const [addingAsset, setAddingAsset] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    // Create flow: default to today when empty (edit flows never use this modal empty-default)
    const today = startOfDay(new Date());
    return { from: today, to: today };
  });
  const [endTime, setEndTime] = useState(""); // never auto-fill time
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [keepUnassigned, setKeepUnassigned] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [fileObjectsMap, setFileObjectsMap] = useState<Record<string, Record<string, { url: string; path: string; fileName: string }>>>({});

  // Default assignee to the ticket creator when they're in the member list
  useEffect(() => {
    if (!currentUserId || keepUnassigned) return;
    setAssigneeIds((prev) => {
      if (prev.length > 0) return prev;
      if (!effectiveMembers.some((m) => m.id === currentUserId)) return prev;
      return [currentUserId];
    });
  }, [currentUserId, effectiveMembers, keepUnassigned]);

  // Auto-focus title on mount
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape — collapse description first, then close modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (descriptionExpanded) {
        setDescriptionExpanded(false);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, descriptionExpanded]);

  // Submit on Cmd/Ctrl+Enter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const form = document.getElementById(
          "new-ticket-form",
        ) as HTMLFormElement | null;
        form?.requestSubmit();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // Initialize custom field values
    const values: Record<string, string> = {};
    template.customFields.forEach((field: any) => {
      values[field.id] = "";
    });
    setCustomFieldValues(values);
  }

  async function createTicket(asDraft: boolean) {
    setError(null);
    setSubmitting(asDraft ? "draft" : "create");

    const form = document.getElementById("new-ticket-form") as HTMLFormElement | null;
    if (!form) {
      setSubmitting(null);
      setError("Form not found");
      return;
    }

    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) {
      setSubmitting(null);
      setError("Title is required");
      return;
    }

    const effectiveAssigneeIds = keepUnassigned ? [] : assigneeIds;
    const [primaryAssigneeId, ...coIds] = effectiveAssigneeIds;
    const rawProjectId = data.get("projectId") as string | null;

    // Convert customFieldValues to include file URLs instead of fileIds
    const selectedTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;
    const templateData: Record<string, any> | null = selectedTemplateId && Object.keys(customFieldValues).length > 0
      ? Object.fromEntries(
          Object.entries(customFieldValues).map(([fieldId, value]) => {
            const field = selectedTemplate?.customFields.find(f => f.id === fieldId);
            let fieldValue: any = value;
            if (field?.type === 'file' && typeof value === 'string') {
              // Convert fileIds to file metadata
              const fileIds = value.split(',').filter(Boolean);
              fieldValue = fileIds.map(fileId => {
                const fileObj = fileObjectsMap[fieldId]?.[fileId];
                return fileObj ? { url: fileObj.url, path: fileObj.path, fileName: fileObj.fileName } : null;
              }).filter(Boolean);
            }
            // Store label + type alongside the value so the detail page can render field names
            return [fieldId, { label: field?.label ?? fieldId, type: field?.type ?? 'text', value: fieldValue }];
          })
        )
      : null;
    const body = {
      title,
      description: descriptionHtml || undefined,
      priority: data.get("priority") || (asDraft ? "Low" : undefined),
      projectId: rawProjectId || null,
      assigneeId: primaryAssigneeId || undefined,
      unassigned: keepUnassigned || undefined,
      status: data.get("status"),
      sprintId: data.get("sprintId") || null,
      moduleId: data.get("moduleId") || null,
      startDate: (() => {
        const from = dateRange?.from ?? startOfDay(new Date());
        return format(from, "yyyy-MM-dd");
      })(),
      dueDate: (() => {
        const from = dateRange?.from ?? startOfDay(new Date());
        const hasRangeEnd =
          !!dateRange?.to && !isSameDay(from, dateRange.to);
        const endDay = hasRangeEnd ? dateRange!.to! : from;
        // Only attach time when the user explicitly set the time input
        return endTime
          ? `${format(endDay, "yyyy-MM-dd")}T${endTime}`
          : format(endDay, "yyyy-MM-dd");
      })(),
      labels,
      assetLinks,
      teamId: activeTeamId || defaultTeamId || undefined,
      parentId: parentId || undefined,
      storyPoints: storyPoints ?? undefined,
      estimatedTime: parseTimeInput(estInput) ?? undefined,
      ...(asDraft ? { isDraft: true } : {}),
      ...(templateData ? { templateData } : {}),
      ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
    };

    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (!res.ok) {
      setSubmitting(null);
      setError(json.error ?? (asDraft ? "Failed to save draft" : "Failed to create ticket"));
      return;
    }

    // Add co-assignees in parallel (best-effort) — drafts store them without notifying
    if (coIds.length > 0) {
      await Promise.allSettled(
        coIds.map((id) =>
          fetch(`/api/tickets/${json.id}/assignees`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: id }),
          })
        )
      );
    }

    // Extract attachment IDs from embedded file nodes in description
    const attachmentIds = extractAttachmentIdsFromHtml(descriptionHtml);
    if (attachmentIds.length > 0) {
      await fetch(`/api/tickets/${json.id}/attachments/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentIds }),
      }).catch((err) => console.error("Failed to link attachments:", err));
    }

    invalidateTaskCaches(queryClient);

    setSubmitting(null);
    onClose();
    if (onCreated) {
      const createdProject = json.project as { id?: string; name?: string } | null | undefined;
      onCreated({
        id: json.id,
        title: json.title,
        status: json.status,
        priority: json.priority,
        teamPrefix: json.team?.prefix ?? "",
        ticketNumber: json.ticketNumber ?? 0,
        assigneeId: json.assignee?.id ?? null,
        assigneeName: json.assignee?.name ?? null,
        projectId: createdProject?.id ?? (selectedProjectId || null),
        projectName:
          createdProject?.name ??
          selectedProject?.name ??
          null,
      });
    } else if (!asDraft) {
      router.push(`/tickets/${json.id}`);
    } else {
      router.push(`/tickets/${json.id}`);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await createTicket(false);
  }

  const showBoardField = Boolean(boardTeams && boardTeams.length > 0 && !lockTeamId);
  const hasSprints = projectSprints.length > 0;
  const hasModules = moduleSystemEnabled;

  return (
    /* Backdrop — click outside does NOT close */
    <div
      ref={overlayRef}
      className="pen-overlay-enter pen-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-3 py-3 sm:px-4 lg:px-5"
    >
      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="
          pen-glass-panel pen-modal-enter flex max-h-[calc(100svh/var(--pen-font-scale,1)-24px)] w-full max-w-[720px] flex-col overflow-hidden
          rounded-[14px] ring-1 ring-white/35 dark:ring-white/10
        "
      >
        {/* ── Header ── */}
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-pen-card-border pl-[22px] pr-3.5">
          <span className="font-sans text-[15px] font-semibold text-pen-blue">
            +
          </span>
          <h2
            id="modal-title"
            className="pen-text-modal-title"
          >
            {parentHumanId ? "New sub-ticket" : "New ticket"}
          </h2>
          {parentHumanId && (
            <span className="rounded-full bg-pen-surface px-[7px] py-[2px] font-sans text-[11.5px] font-medium text-pen-muted">
              sub of{" "}
              <span className="font-mono font-semibold text-pen-id">{parentHumanId}</span>
            </span>
          )}
          {!parentHumanId && defaultProjectName && (
            <span className="rounded-full bg-pen-blue-tint px-[7px] py-[2px] font-sans text-[11.5px] font-semibold text-pen-blue">
              {defaultProjectName}
            </span>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* ── Body ── */}
        <form id="new-ticket-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
            {error && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-pen-red/10 px-3 py-2 font-sans text-sm text-pen-red"
              >
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3">
            {/* Title */}
            <div className="flex flex-col gap-1">
              <label htmlFor="title" className="pen-text-label">
                Title
              </label>
              <div className="relative">
                <input
                  ref={titleRef}
                  id="title"
                  name="title"
                  required
                  placeholder="Short description of the issue"
                  className={cn(INPUT_CLASS, "pr-10")}
                />
                <AiComposeButton
                  mode="title"
                  iconOnly
                  getTitle={() => titleRef.current?.value ?? ""}
                  getDescription={() => descriptionHtml}
                  onApply={(r) => {
                    if (titleRef.current) titleRef.current.value = r.title;
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                />
              </div>
            </div>

            {/* Template Picker */}
            {templates.length > 0 && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="template"
                  className="pen-text-label"
                >
                  Template
                </label>
                <SearchableSelect
                  aria-label="Template"
                  value={selectedTemplateId}
                  onChange={handleTemplateSelect}
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Choose a template…"
                  searchPlaceholder="Search templates…"
                  size="lg"
                  className="bg-pen-bg"
                />
              </div>
            )}

            {/* Template Fields - Show instead of Description when template selected */}
            {selectedTemplateId && (templates.find((t) => t.id === selectedTemplateId)?.customFields.length ?? 0) > 0 && (
              <div className="mx-[-22px] px-[22px] border-y border-pen-card-border py-4">
                <h3 className="mb-4 text-right pen-text-section-label">
                  Template Fields
                </h3>
                <div className="space-y-3">
                  {(templates.find((t) => t.id === selectedTemplateId)?.customFields ?? []).map((field: any) => (
                      <div key={field.id} className="flex flex-col gap-[5px]">
                        <label
                          htmlFor={`custom-${field.id}`}
                          className="pen-text-label"
                        >
                          {field.label}
                          {field.required && <span className="text-pen-red"> *</span>}
                        </label>

                        {field.type === "textarea" ? (
                              <textarea
                                id={`custom-${field.id}`}
                                placeholder={field.placeholder || ""}
                                value={customFieldValues[field.id] || ""}
                                onChange={(e) =>
                                  setCustomFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]: e.target.value,
                                  }))
                                }
                                required={field.required}
                                className="
                                  min-h-[80px] w-full rounded-[6px] border border-pen-card-border
                                  bg-pen-bg px-3 py-2 font-sans text-[13px]
                                  text-pen-foreground placeholder:text-pen-subtle
                                  outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30
                                "
                              />
                            ) : field.type === "select" ? (
                              <SearchableSelect
                                aria-label={field.label}
                                value={customFieldValues[field.id] || ""}
                                onChange={(v) =>
                                  setCustomFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]: v,
                                  }))
                                }
                                options={(field.options || []).map((opt: string) => ({
                                  value: opt,
                                  label: opt,
                                }))}
                                placeholder="Select…"
                                size="lg"
                                className="bg-pen-bg"
                              />
                            ) : field.type === "file" ? (
                              <div className="space-y-2">
                                <label
                                  htmlFor={`custom-${field.id}`}
                                  className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-pen-card-border rounded-[6px] bg-pen-bg/50 hover:bg-pen-surface cursor-pointer transition-colors"
                                >
                                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <svg className="w-5 h-5 text-pen-muted mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    <span className="font-sans text-xs text-pen-muted">Click to upload or drag files</span>
                                  </div>
                                  <input
                                    id={`custom-${field.id}`}
                                    type="file"
                                    multiple
                                    onChange={async (e) => {
                                      const files = Array.from(e.target.files || []);
                                      for (const file of files) {
                                        const fileId = `${Date.now()}-${file.name}`;
                                        setUploadingFiles((prev) => ({
                                          ...prev,
                                          [field.id]: { ...(prev[field.id] || {}), [fileId]: true },
                                        }));
                                        try {
                                          const result = await uploadTemplateFile(file);
                                          setFileObjectsMap((prev) => ({
                                            ...prev,
                                            [field.id]: {
                                              ...(prev[field.id] || {}),
                                              [fileId]: result,
                                            },
                                          }));
                                          setCustomFieldValues((prev) => ({
                                            ...prev,
                                            [field.id]: (prev[field.id] ? prev[field.id] + "," : "") + fileId,
                                          }));
                                        } catch (err) {
                                          toast.error((err as Error).message);
                                        } finally {
                                          setUploadingFiles((prev) => ({
                                            ...prev,
                                            [field.id]: { ...(prev[field.id] || {}), [fileId]: false },
                                          }));
                                        }
                                      }
                                    }}
                                    className="hidden"
                                  />
                                </label>

                                {/* Display uploaded files and uploading state */}
                                {(customFieldValues[field.id] || uploadingFiles[field.id]) && (
                                  <div className="flex flex-wrap gap-3">
                                    {customFieldValues[field.id]?.split(",").filter(Boolean).map((fileId: string, fileIndex: number) => {
                                      const fileObj = fileObjectsMap[field.id]?.[fileId];
                                      if (!fileObj) return null;

                                      const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileObj.fileName);
                                      const isDeleting = deletingFiles[field.id]?.[fileId];

                                      const getFileIcon = () => {
                                        if (/\.pdf$/i.test(fileObj.fileName)) {
                                          return "📄";
                                        } else if (/\.(doc|docx|txt)$/i.test(fileObj.fileName)) {
                                          return "📝";
                                        } else if (/\.(xls|xlsx|csv)$/i.test(fileObj.fileName)) {
                                          return "📊";
                                        } else if (/\.(zip|rar|7z)$/i.test(fileObj.fileName)) {
                                          return "📦";
                                        } else {
                                          return "📎";
                                        }
                                      };

                                      return (
                                        <div key={fileIndex} className="relative group">
                                          {isImage ? (
                                            <div className="relative w-20 h-20 rounded-[6px] border border-pen-card-border overflow-hidden bg-pen-surface">
                                              <img
                                                src={fileObj.url}
                                                alt={fileObj.fileName}
                                                className="w-full h-full object-cover"
                                              />
                                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                                              {isDeleting && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><LoadingSpinner className="size-4" /></div>}
                                              <p className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] p-1 truncate">{fileObj.fileName}</p>
                                            </div>
                                          ) : (
                                            <div className="max-w-[140px] rounded-[6px] border border-pen-card-border bg-pen-surface p-2.5 flex flex-col items-center gap-2 relative">
                                              {isDeleting && <div className="absolute inset-0 bg-pen-surface/40 flex items-center justify-center rounded-[6px] z-10"><LoadingSpinner className="size-4" /></div>}
                                              <span className="text-2xl">{getFileIcon()}</span>
                                              <span className="font-sans text-[11px] text-pen-foreground text-center wrap-break-word w-full line-clamp-2">{fileObj.fileName}</span>
                                            </div>
                                          )}
                                          <button
                                            type="button"
                                            disabled={isDeleting}
                                            onClick={async () => {
                                              setDeletingFiles((prev) => ({
                                                ...prev,
                                                [field.id]: { ...(prev[field.id] || {}), [fileId]: true },
                                              }));
                                              try {
                                                await deleteTemplateFile(fileObj.path);
                                                const fileIds = customFieldValues[field.id].split(",").filter(Boolean);
                                                const newIds = fileIds.filter((id: string) => id !== fileId);
                                                setCustomFieldValues((prev) => ({
                                                  ...prev,
                                                  [field.id]: newIds.join(","),
                                                }));
                                                setFileObjectsMap((prev) => {
                                                  const updated = {...prev};
                                                  if (updated[field.id]) {
                                                    delete updated[field.id][fileId];
                                                  }
                                                  return updated;
                                                });
                                              } catch (err) {
                                                toast.error((err as Error).message);
                                              } finally {
                                                setDeletingFiles((prev) => ({
                                                  ...prev,
                                                  [field.id]: { ...(prev[field.id] || {}), [fileId]: false },
                                                }));
                                              }
                                            }}
                                            className="absolute -top-2 -right-2 bg-pen-red text-white w-5 h-5 rounded-full flex items-center justify-center transition-opacity disabled:opacity-50"
                                          >
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {uploadingFiles[field.id] && Object.entries(uploadingFiles[field.id]).filter(([_, isUploading]) => isUploading).map(([fileId]) => (
                                      <div key={fileId} className="max-w-[140px] rounded-[6px] border border-dashed border-pen-card-border bg-pen-surface/50 p-2.5 flex flex-col items-center gap-2">
                                        <LoadingSpinner className="size-4" />
                                        <span className="font-sans text-[11px] text-pen-muted">Uploading...</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : field.type === "number" ? (
                              <input
                                type="number"
                                id={`custom-${field.id}`}
                                placeholder={field.placeholder || ""}
                                value={customFieldValues[field.id] || ""}
                                onChange={(e) =>
                                  setCustomFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]: e.target.value,
                                  }))
                                }
                                required={field.required}
                                className="
                                  h-10 w-full rounded-[6px] border border-pen-card-border
                                  bg-pen-bg px-3 font-sans text-[13px]
                                  text-pen-foreground placeholder:text-pen-subtle
                                  outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30
                                "
                              />
                            ) : (
                              <input
                                type="text"
                                id={`custom-${field.id}`}
                                placeholder={field.placeholder || ""}
                                value={customFieldValues[field.id] || ""}
                                onChange={(e) =>
                                  setCustomFieldValues((prev) => ({
                                    ...prev,
                                    [field.id]: e.target.value,
                                  }))
                                }
                                required={field.required}
                                className="
                                  h-10 w-full rounded-[6px] border border-pen-card-border
                                  bg-pen-bg px-3 font-sans text-[13px]
                                  text-pen-foreground placeholder:text-pen-subtle
                                  outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30
                                "
                              />
                            )}
                        </div>
                      ))}
                </div>
              </div>
            )}

            {/* Description - Only show when NO template selected */}
            {!selectedTemplateId && (
              <ExpandableDescriptionEditor
                scopeId="new-ticket-form"
                content={descriptionHtml}
                onChange={setDescriptionHtml}
                expanded={descriptionExpanded}
                onExpandedChange={setDescriptionExpanded}
                editorAction={
                  <AiComposeButton
                    mode="description"
                    iconOnly
                    getTitle={() => titleRef.current?.value ?? ""}
                    getDescription={() => descriptionHtml}
                    onApply={(r) => setDescriptionHtml(r.description)}
                  />
                }
              />
            )}

            {/* Fields */}
            <FormGrid className="items-start">
                {projectLocked && defaultProject ? (
                  <FormField label="Project">
                    <input type="hidden" name="projectId" value={defaultProject.id} />
                    <div className={READONLY_CLASS}>
                      {defaultProject.name}
                    </div>
                  </FormField>
                ) : (
                  <StyledSelect
                    label="Project"
                    id="projectId-trigger"
                    name="projectId"
                    value={selectedProjectId}
                    onChange={setSelectedProjectId}
                    searchable
                    searchPlaceholder="Search projects…"
                    emptyLabel="No projects found"
                    options={[
                      { value: "", label: "— Miscellaneous —" },
                      ...listedProjects.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                )}

                {showBoardField ? (
                  boardTeams!.length > 1 ? (
                    <StyledSelect
                      label="Board"
                      id="boardTeamId"
                      name="boardTeamId"
                      value={selectedBoardTeamId ?? ""}
                      onChange={setSelectedBoardTeamId}
                      options={boardTeams!.map((t) => ({ value: t.id, label: t.name }))}
                    />
                  ) : (
                    <FormField label="Board">
                      <div className={READONLY_CLASS}>
                        {boardTeams![0].name}
                      </div>
                    </FormField>
                  )
                ) : (
                  <StatusField
                    effectiveStatuses={effectiveStatuses}
                    selectedStatus={selectedStatus}
                    setSelectedStatus={setSelectedStatus}
                  />
                )}

                {showBoardField && (
                  <StatusField
                    effectiveStatuses={effectiveStatuses}
                    selectedStatus={selectedStatus}
                    setSelectedStatus={setSelectedStatus}
                  />
                )}

                <PriorityField
                  selectedPriority={selectedPriority}
                  setSelectedPriority={setSelectedPriority}
                />

                <AssigneePicker
                  keepUnassigned={keepUnassigned}
                  setKeepUnassigned={setKeepUnassigned}
                  assigneeIds={assigneeIds}
                  setAssigneeIds={setAssigneeIds}
                  assigneeOpen={assigneeOpen}
                  setAssigneeOpen={setAssigneeOpen}
                  assigneeSearch={assigneeSearch}
                  setAssigneeSearch={setAssigneeSearch}
                  effectiveMembers={effectiveMembers}
                  defaultAssigneeId={currentUserId}
                  membersLoading={membersLoading}
                />

                <AssetLinksField
                  assetLinks={assetLinks}
                  setAssetLinks={setAssetLinks}
                  addingAsset={addingAsset}
                  setAddingAsset={setAddingAsset}
                  newAssetUrl={newAssetUrl}
                  setNewAssetUrl={setNewAssetUrl}
                  newAssetLabel={newAssetLabel}
                  setNewAssetLabel={setNewAssetLabel}
                />
                <LabelsField labels={labels} setLabels={setLabels} />

                <DateRangeField
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  endTime={endTime}
                  setEndTime={setEndTime}
                />

                <EstimatedTimeField
                  estInput={estInput}
                  setEstInput={setEstInput}
                  parseTimeInput={parseTimeInput}
                />

                {hasSprints && hasModules ? (
                  <>
                    <SprintField projectSprints={projectSprints} selectedProjectId={selectedProjectId} />
                    <ModuleField projectModules={projectModules} selectedProjectId={selectedProjectId} />
                    <div className="sm:col-span-2">
                      <StoryPointsField storyPoints={storyPoints} setStoryPoints={setStoryPoints} />
                    </div>
                  </>
                ) : hasSprints ? (
                  <>
                    <StoryPointsField storyPoints={storyPoints} setStoryPoints={setStoryPoints} />
                    <SprintField projectSprints={projectSprints} selectedProjectId={selectedProjectId} />
                  </>
                ) : hasModules ? (
                  <>
                    <StoryPointsField storyPoints={storyPoints} setStoryPoints={setStoryPoints} />
                    <ModuleField projectModules={projectModules} selectedProjectId={selectedProjectId} />
                  </>
                ) : (
                  <div className="sm:col-span-2">
                    <StoryPointsField storyPoints={storyPoints} setStoryPoints={setStoryPoints} />
                  </div>
                )}
              </FormGrid>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-pen-card-border bg-pen-bg px-6">
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-[78px] items-center justify-center rounded-[6px] border border-pen-card-border font-sans text-[12px] font-semibold text-pen-foreground transition-colors hover:bg-pen-card-border"
            >
              Cancel
            </button>
            {!parentHumanId && (
              <button
                type="button"
                disabled={submitting !== null}
                onClick={() => void createTicket(true)}
                className="flex h-8 items-center gap-1.5 rounded-[6px] border border-pen-card-border bg-pen-card px-3 font-sans text-[12px] font-medium text-pen-foreground transition-colors hover:bg-pen-surface disabled:opacity-50"
              >
                {submitting === "draft" ? "Saving…" : "Save draft"}
              </button>
            )}
            <button
              type="submit"
              disabled={submitting !== null}
              className="flex h-8 items-center gap-1.5 rounded-[6px] bg-pen-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting === "create" && <LoadingSpinner className="size-3.5" />}
              {submitting === "create" ? "Creating…" : "Create ticket"}
              {submitting !== "create" && (
                <span className="flex size-4 items-center justify-center rounded-[3px] bg-pen-brand/35 dark:bg-pen-foreground/35">
                  <CornerDownLeft size={9} strokeWidth={2.5} />
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Layout helpers ── */
const INPUT_CLASS =
  "h-10 w-full rounded-[6px] border border-pen-card-border bg-pen-bg px-3 font-sans text-[13px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30";
const READONLY_CLASS =
  "flex h-10 items-center rounded-[6px] border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground";

function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  labelExtra,
  footer,
  children,
}: {
  label: string;
  htmlFor?: string;
  labelExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-[20px] items-center justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="pen-text-label">
            {label}
          </label>
        ) : (
          <span className="pen-text-label">{label}</span>
        )}
        {labelExtra}
      </div>
      <div>{children}</div>
      {footer ? <div className="font-sans text-[11.5px] leading-tight">{footer}</div> : null}
    </div>
  );
}

function StatusField({
  effectiveStatuses,
  selectedStatus,
  setSelectedStatus,
}: {
  effectiveStatuses: StatusOption[];
  selectedStatus: string;
  setSelectedStatus: (value: string) => void;
}) {
  return (
    <StyledSelect
      label="Status"
      id="status"
      name="status"
      value={selectedStatus}
      onChange={setSelectedStatus}
      leadingDot
      options={effectiveStatuses.map((s) => ({ value: s.label, label: s.label, color: s.color }))}
    />
  );
}

function PriorityField({
  selectedPriority,
  setSelectedPriority,
}: {
  selectedPriority: string;
  setSelectedPriority: (value: string) => void;
}) {
  return (
    <StyledSelect
      label="Priority"
      id="priority"
      name="priority"
      value={selectedPriority}
      onChange={setSelectedPriority}
      leadingDot
      options={PRIORITIES.map((p) => ({ value: p, label: p, color: PRIORITY_COLORS[p] }))}
    />
  );
}

function DateRangeField({
  dateRange,
  setDateRange,
  endTime,
  setEndTime,
}: {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  endTime: string;
  setEndTime: (v: string) => void;
}) {
  const [showTimeInput, setShowTimeInput] = useState(false);
  function clearAll(e: React.SyntheticEvent) {
    e.stopPropagation();
    setDateRange(undefined);
    setEndTime("");
    setShowTimeInput(false);
  }
  return (
    <FormField label="Date range">
      <Popover>
        <PopoverTrigger
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-[6px] border border-pen-card-border",
            "bg-pen-bg px-3 font-sans text-[13px] text-pen-foreground",
            "outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30",
          )}
        >
          <CalendarDays size={13} strokeWidth={2} className="shrink-0 text-pen-muted" />
          {dateRange?.from ? (
            <span className="truncate">
              {dateRange.to && !isSameDay(dateRange.from, dateRange.to) ? (
                <>
                  {format(dateRange.from, "MMM d, yyyy")}
                  {" → "}
                  {format(dateRange.to, "MMM d, yyyy")}
                  {endTime && ` ${endTime}`}
                </>
              ) : (
                <>
                  {format(dateRange.from, "MMM d, yyyy")}
                  {endTime && ` ${endTime}`}
                </>
              )}
            </span>
          ) : (
            <span className="text-pen-subtle">Pick a date</span>
          )}
          {dateRange?.from && (
            <span
              role="button"
              tabIndex={0}
              onClick={clearAll}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") clearAll(e); }}
              className="ml-auto cursor-pointer text-pen-muted hover:text-pen-foreground"
              aria-label="Clear dates"
            >
              <X size={11} strokeWidth={2.5} />
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => setDateRange(range)}
            numberOfMonths={2}
          />
          {dateRange?.from && (
            <div className="flex items-center gap-3 border-t border-pen-card-border px-3 py-2.5">
              {endTime || showTimeInput ? (
                <>
                  <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                    End time
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="pen-date-input-native h-7 rounded-md border border-pen-card-border bg-pen-bg px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEndTime("");
                      setShowTimeInput(false);
                    }}
                    className="ml-auto font-sans text-[11px] text-pen-subtle hover:text-pen-foreground"
                  >
                    Clear time
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTimeInput(true)}
                  className="font-sans text-[11.5px] text-pen-blue hover:underline"
                >
                  Add end time
                </button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </FormField>
  );
}

function EstimatedTimeField({
  estInput,
  setEstInput,
  parseTimeInput,
}: {
  estInput: string;
  setEstInput: (value: string) => void;
  parseTimeInput: (input: string) => number | null;
}) {
  const parsed = estInput ? parseTimeInput(estInput) : null;
  return (
    <FormField
      label="Estimated time"
      footer={
        parsed !== null ? (
          <span className="font-sans text-[11.5px] text-pen-blue">
            = {(() => {
              const m = parsed;
              const h = Math.floor(m / 60);
              const min = m % 60;
              return h > 0 && min > 0 ? `${h}h ${min}m` : h > 0 ? `${h}h` : `${min}m`;
            })()}
          </span>
        ) : null
      }
    >
      <input
        type="text"
        value={estInput}
        onChange={(e) => setEstInput(e.target.value)}
        placeholder="e.g. 2h 30m or 1.5h"
        className={INPUT_CLASS}
      />
    </FormField>
  );
}

function StoryPointsField({
  storyPoints,
  setStoryPoints,
}: {
  storyPoints: number | null;
  setStoryPoints: (value: number | null) => void;
}) {
  return (
    <FormField label="Story points">
      <div className="flex h-10 items-center gap-1">
        {STORY_POINT_PRESETS.map((pt) => (
          <button
            key={pt}
            type="button"
            onClick={() => setStoryPoints(storyPoints === pt ? null : pt)}
            className={cn(
              "flex size-8 items-center justify-center rounded-[5px] border font-sans text-[12px] font-semibold transition-colors",
              storyPoints === pt
                ? "border-pen-blue bg-pen-blue text-white dark:text-gray-900"
                : "border-pen-card-border bg-pen-bg text-pen-muted hover:border-pen-blue/40 hover:text-pen-foreground",
            )}
          >
            {pt}
          </button>
        ))}
      </div>
    </FormField>
  );
}

function SprintField({
  projectSprints,
  selectedProjectId,
}: {
  projectSprints: { id: string; name: string }[];
  selectedProjectId: string;
}) {
  return (
    <StyledSelect
      key={selectedProjectId}
      label="Sprint"
      id="sprintId"
      name="sprintId"
      defaultValue=""
      searchPlaceholder="Search sprints…"
      emptyLabel="No sprint found"
      options={[
        { value: "", label: "No sprint" },
        ...projectSprints.map((s) => ({ value: s.id, label: s.name })),
      ]}
    />
  );
}

function ModuleField({
  projectModules,
  selectedProjectId,
}: {
  projectModules: { id: string; name: string }[];
  selectedProjectId: string;
}) {
  return (
    <StyledSelect
      key={selectedProjectId}
      label="Module"
      id="moduleId"
      name="moduleId"
      defaultValue=""
      searchPlaceholder="Search modules…"
      emptyLabel="No modules found"
      options={[
        { value: "", label: "Module 0 (General)" },
        ...projectModules.map((m) => ({ value: m.id, label: m.name })),
      ]}
    />
  );
}

function AssetLinksField({
  assetLinks,
  setAssetLinks,
  addingAsset,
  setAddingAsset,
  newAssetUrl,
  setNewAssetUrl,
  newAssetLabel,
  setNewAssetLabel,
}: {
  assetLinks: { url: string; label: string }[];
  setAssetLinks: Dispatch<SetStateAction<{ url: string; label: string }[]>>;
  addingAsset: boolean;
  setAddingAsset: (value: boolean) => void;
  newAssetUrl: string;
  setNewAssetUrl: (value: string) => void;
  newAssetLabel: string;
  setNewAssetLabel: (value: string) => void;
}) {
  return (
    <FormField
      label="Asset links"
      labelExtra={
        !addingAsset ? (
          <button
            type="button"
            onClick={() => setAddingAsset(true)}
            className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-pen-blue/10 px-2 font-sans text-[10.5px] font-semibold text-pen-blue transition-colors hover:bg-pen-blue/20"
          >
            <Plus className="size-3" /> Add
          </button>
        ) : null
      }
    >
      {assetLinks.length > 0 ? (
        <div className="flex max-h-20 flex-col gap-1 overflow-y-auto rounded-[6px] border border-pen-blue/20 bg-pen-blue/4 p-1.5">
          {assetLinks.map((link, i) => (
            <div key={i} className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-pen-blue/6">
              <Link2 className="size-3 shrink-0 text-pen-blue" />
              <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] font-medium text-pen-blue">
                {link.label || link.url}
              </span>
              <button
                type="button"
                onClick={() => setAssetLinks((prev) => prev.filter((_, j) => j !== i))}
                className="shrink-0 text-pen-subtle hover:text-pen-red"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : addingAsset ? (
        <div className="flex flex-col gap-1 rounded-[6px] border border-pen-blue/25 bg-pen-blue/4 p-2">
          <input
            autoFocus
            value={newAssetUrl}
            onChange={(e) => setNewAssetUrl(e.target.value)}
            placeholder="https://…"
            className="h-7 w-full rounded-[6px] border border-pen-card-border bg-pen-bg px-2 font-sans text-[11.5px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue/60"
          />
          <input
            value={newAssetLabel}
            onChange={(e) => setNewAssetLabel(e.target.value)}
            placeholder="Label (optional)"
            className="h-7 w-full rounded-[6px] border border-pen-card-border bg-pen-bg px-2 font-sans text-[11.5px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue/60"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                if (!newAssetUrl.trim()) return;
                setAssetLinks((prev) => [...prev, { url: newAssetUrl.trim(), label: newAssetLabel.trim() }]);
                setNewAssetUrl(""); setNewAssetLabel(""); setAddingAsset(false);
              }}
              className="flex h-6 items-center rounded-md bg-pen-blue px-2.5 font-sans text-[11px] font-medium text-white dark:text-gray-900"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setAddingAsset(false); setNewAssetUrl(""); setNewAssetLabel(""); }}
              className="flex h-6 items-center rounded-md border border-pen-card-border px-2.5 font-sans text-[11px] text-pen-muted hover:text-pen-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-10 items-center rounded-[6px] border border-dashed border-pen-card-border bg-pen-bg/40 px-3 font-sans text-[12px] text-pen-subtle">
          No links added
        </div>
      )}
    </FormField>
  );
}

function LabelsField({
  labels,
  setLabels,
}: {
  labels: string[];
  setLabels: Dispatch<SetStateAction<string[]>>;
}) {
  return (
    <FormField label="Labels">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[6px] border border-dashed border-pen-card-border bg-pen-bg/40 px-3 py-2">
        {labels.map((lbl) => (
          <button
            key={lbl}
            type="button"
            onClick={() => setLabels((prev) => prev.filter((l) => l !== lbl))}
            className="group relative inline-flex"
          >
            <TagPill label={lbl} size="sm" />
            <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-pen-red text-white opacity-0 transition-opacity group-hover:opacity-100">
              <X size={8} />
            </span>
          </button>
        ))}
        <LabelPicker current={labels} onChange={setLabels} />
      </div>
    </FormField>
  );
}

type StyledSelectOption = { value: string; label: string; color?: string };

function StyledSelect({
  label,
  id,
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  leadingDot = false,
  searchable,
  searchPlaceholder = "Search…",
  emptyLabel = "No options found",
  placeholder = "Select…",
}: {
  label: string;
  id: string;
  name: string;
  options: StyledSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  leadingDot?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const current = isControlled ? value : internal;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === current) ?? null;
  const showSearch = searchable ?? options.length > 8;

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setDropPos(null);
    setSearch("");
  }, []);

  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const DROPDOWN_HEIGHT = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= DROPDOWN_HEIGHT || spaceBelow >= rect.top
      ? rect.bottom + 6
      : rect.top - DROPDOWN_HEIGHT - 6;
    setDropPos({ top, left: rect.left, width: rect.width });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, closeDropdown]);

  function pick(v: string) {
    if (!isControlled) setInternal(v);
    onChange?.(v);
    closeDropdown();
  }

  const q = search.trim().toLowerCase();
  const filtered = showSearch && q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={current} />
      <FormField label={label} htmlFor={id}>
        <div className="relative">
          {leadingDot && (
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-[7px] -translate-y-1/2 rounded-full"
              style={{ background: selected?.color ?? "#94a3b8" }}
            />
          )}
          <button
            ref={triggerRef}
            id={id}
            type="button"
            onClick={() => (open ? closeDropdown() : openDropdown())}
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-[6px] border border-pen-card-border bg-pen-bg px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30",
              leadingDot && "pl-[26px]",
            )}
          >
            <span className={cn("truncate", !selected && "text-pen-subtle")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronDown size={10} strokeWidth={2} className="ml-auto shrink-0 text-pen-muted" />
          </button>
        </div>
      </FormField>
      {open && dropPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-9999 overflow-hidden rounded-[8px] border border-pen-card-border bg-pen-bg shadow-xl"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          {showSearch && (
            <div className="border-b border-pen-card-border p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-pen-subtle" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-7 w-full rounded-md border border-pen-card-border bg-pen-surface pl-6 pr-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
                />
              </div>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.map((o) => {
              const isSel = o.value === current;
              return (
                <button
                  key={o.value || "__empty"}
                  type="button"
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-sans text-[12.5px] transition-colors",
                    isSel ? "bg-pen-blue-tint text-pen-blue" : "text-pen-foreground hover:bg-pen-surface",
                  )}
                >
                  {leadingDot && (
                    <span
                      className="size-[7px] shrink-0 rounded-full"
                      style={{ background: o.color ?? "#94a3b8" }}
                    />
                  )}
                  <span className="truncate">{o.label}</span>
                  {isSel && <Check size={12} strokeWidth={2.5} className="ml-auto shrink-0 text-pen-blue" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-3 text-center font-sans text-[11.5px] text-pen-subtle">{emptyLabel}</p>
            )}
          </div>
        </div>,
        getPortalRoot() ?? document.body,
      )}
    </div>
  );
}

function AssigneePicker({
  keepUnassigned,
  setKeepUnassigned,
  assigneeIds,
  setAssigneeIds,
  assigneeOpen,
  setAssigneeOpen,
  assigneeSearch,
  setAssigneeSearch,
  effectiveMembers,
  defaultAssigneeId,
  membersLoading = false,
}: {
  keepUnassigned: boolean;
  setKeepUnassigned: Dispatch<SetStateAction<boolean>>;
  assigneeIds: string[];
  setAssigneeIds: Dispatch<SetStateAction<string[]>>;
  assigneeOpen: boolean;
  setAssigneeOpen: Dispatch<SetStateAction<boolean>>;
  assigneeSearch: string;
  setAssigneeSearch: (value: string) => void;
  effectiveMembers: TeamMember[];
  defaultAssigneeId?: string;
  membersLoading?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const canDefaultAssign =
    Boolean(defaultAssigneeId) &&
    effectiveMembers.some((m) => m.id === defaultAssigneeId);

  const closeDropdown = useCallback(() => {
    setAssigneeOpen(false);
    setDropPos(null);
  }, [setAssigneeOpen]);

  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const DROPDOWN_HEIGHT = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= DROPDOWN_HEIGHT || spaceBelow >= rect.top
      ? rect.bottom + 6
      : rect.top - DROPDOWN_HEIGHT - 6;
    setDropPos({ top, left: rect.left, width: rect.width });
    setAssigneeOpen(true);
  }, [setAssigneeOpen]);

  useEffect(() => {
    if (!assigneeOpen) return;
    function h(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [assigneeOpen, closeDropdown]);

  return (
    <div className="relative">
      <FormField
        label="Assignee"
        labelExtra={
          <button
            type="button"
            role="switch"
            aria-checked={keepUnassigned}
            onClick={() => {
              setKeepUnassigned((active) => {
                const next = !active;
                if (next) {
                  setAssigneeIds([]);
                  closeDropdown();
                } else if (canDefaultAssign) {
                  setAssigneeIds([defaultAssigneeId!]);
                }
                return next;
              });
            }}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[10.5px] transition-all",
              keepUnassigned
                ? "border-pen-blue bg-pen-blue font-medium text-white dark:text-gray-900"
                : "border-pen-card-border bg-transparent text-pen-muted hover:border-pen-blue/40 hover:text-pen-id",
            )}
          >
            <UserX
              className={cn(
                "size-3 shrink-0 transition-colors",
                keepUnassigned ? "text-white dark:text-gray-900" : "text-pen-subtle",
              )}
              strokeWidth={2}
            />
            Leave unassigned
          </button>
        }
      >
        <button
          ref={triggerRef}
          type="button"
          disabled={keepUnassigned}
          onClick={() => {
            if (keepUnassigned) return;
            if (assigneeOpen) closeDropdown();
            else openDropdown();
          }}
          className={cn(
            "flex h-10 w-full flex-wrap items-center gap-1.5 rounded-[6px] border border-pen-card-border bg-pen-bg px-3 py-2 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30",
            keepUnassigned && "cursor-not-allowed opacity-50",
          )}
        >
          {assigneeIds.length === 0 ? (
            <span className="text-pen-subtle">Unassigned</span>
          ) : (
            assigneeIds.map((id) => {
              const member = effectiveMembers.find((m) => m.id === id);
              if (!member) return null;
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 rounded-full bg-pen-blue/15 px-2 py-0.5 font-sans text-[11.5px] font-semibold text-pen-blue"
                >
                  <AvatarVisual name={member.name} avatarUrl={member.avatarUrl} size={16} />
                  {member.name}
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setAssigneeIds((prev) => prev.filter((i) => i !== id)); }}
                    className="cursor-pointer opacity-60 hover:opacity-100"
                  >
                    <X size={9} strokeWidth={3} />
                  </span>
                </span>
              );
            })
          )}
          <ChevronDown size={10} strokeWidth={2} className="ml-auto shrink-0 text-pen-muted" />
        </button>
      </FormField>
      {assigneeOpen && dropPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-9999 overflow-hidden rounded-[8px] border border-pen-card-border bg-pen-bg shadow-xl"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          <div className="border-b border-pen-card-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-pen-subtle" />
              <input
                autoFocus
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                placeholder="Search members…"
                className="h-7 w-full rounded-md border border-pen-card-border bg-pen-surface pl-6 pr-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
              />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto p-1">
            {membersLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner className="size-4 text-pen-subtle" />
              </div>
            ) : (
              <>
                {effectiveMembers
                  .filter((m) => matchesUserListSearch(m, assigneeSearch))
                  .map((m) => {
                    const selected = assigneeIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAssigneeIds((prev) =>
                          prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                        )}
                        className={cn(
                          userListPickerButtonClass,
                          "rounded-md px-2 py-1.5 transition-colors",
                          selected ? "bg-pen-blue-tint" : "hover:bg-pen-surface",
                        )}
                      >
                        <UserListItem
                          person={m}
                          avatarSize={22}
                          trailing={
                            selected ? <Check size={12} strokeWidth={2.5} className="shrink-0 text-pen-blue" /> : null
                          }
                        />
                      </button>
                    );
                  })}
                {effectiveMembers.filter((m) => matchesUserListSearch(m, assigneeSearch)).length === 0 && (
                  <p className="py-3 text-center font-sans text-[11.5px] text-pen-subtle">No members found</p>
                )}
              </>
            )}
          </div>
          {assigneeIds.length > 0 && (
            <div className="border-t border-pen-card-border px-2 py-1.5">
              <button type="button" onClick={() => setAssigneeIds([])} className="font-sans text-[11.5px] text-pen-subtle hover:text-pen-foreground">
                Clear all
              </button>
            </div>
          )}
        </div>,
        getPortalRoot() ?? document.body,
      )}
    </div>
  );
}
