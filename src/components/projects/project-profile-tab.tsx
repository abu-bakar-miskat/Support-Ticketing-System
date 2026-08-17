"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  GitPullRequest,
  Star,
  GitFork,
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  Image,
  AlertCircle,
  CheckCircle2,
  GitBranch,
  ChevronDown,
  Loader2,
  Check,
  Globe,
  BarChart2,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { updateAdminProject } from "@/lib/api/admin";
import { ProjectAssetManager, type AssetNode } from "@/components/projects/project-asset-manager";
import { LifecycleStepper } from "@/components/projects/lifecycle-stepper";
import {
  type LifecycleStage,
  resolveCurrentStage,
} from "@/lib/project-lifecycle";
import { projectDetailsKeys } from "@/hooks/queries/use-project-details";
import type { ProjectDetailsResponse } from "@/lib/api/projects";

// ── Types ─────────────────────────────────────────────────────────────────────

// Asset type is AssetNode from project-asset-manager
type Asset = AssetNode;

type AnalyticalLink = {
  id: string;
  name: string;
  url: string;
};

type GithubRepo = {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  default_branch: string;
};

type GithubPR = {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  user: { login: string; avatar_url: string };
  created_at: string;
  merged_at: string | null;
};


// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function assetIcon(type: Asset["type"]) {
  if (type === "image") return Image;
  if (type === "document") return FileText;
  return Link2;
}


// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
      <h3 className="mb-2.5 pen-text-section-label">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Project status + description ──────────────────────────────────────────────

export function ProjectProfileTab({
  projectId,
  detailsQueryKey,
  initialStatus,
  initialDescription,
  initialLifecycleStages,
  canEdit,
  canManageLifecycle = false,
  supportProject = false,
}: {
  projectId: string;
  detailsQueryKey?: string;
  initialStatus: string;
  initialDescription: string | null;
  initialLifecycleStages: LifecycleStage[];
  canEdit: boolean;
  canManageLifecycle?: boolean;
  supportProject?: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [status, setStatus] = useState<string>(initialStatus);
  const [stages, setStages] = useState<LifecycleStage[]>(initialLifecycleStages);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);

  const [description, setDescription] = useState(initialDescription ?? "");
  const [draftDescription, setDraftDescription] = useState(initialDescription ?? "");
  const [descSaving, setDescSaving] = useState(false);
  const [descSaved, setDescSaved] = useState(false);
  const descDirty = draftDescription !== description;

  // Keep local stepper in sync when details query / RSC refresh updates props.
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setStages(initialLifecycleStages);
  }, [initialLifecycleStages]);

  function flashSaved() {
    setStatusSaving(false);
    setStatusSaved(true);
    setTimeout(() => setStatusSaved(false), 2000);
  }

  function syncProjectDetailsCache(patch: {
    projectStatus?: string;
    lifecycleStages?: LifecycleStage[];
  }) {
    if (!detailsQueryKey) return;
    const queryKey = projectDetailsKeys.detail(detailsQueryKey);
    queryClient.setQueryData<ProjectDetailsResponse>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        project: {
          ...old.project,
          ...(patch.projectStatus !== undefined
            ? { projectStatus: patch.projectStatus }
            : {}),
          ...(patch.lifecycleStages !== undefined
            ? { lifecycleStages: patch.lifecycleStages }
            : {}),
        },
      };
    });
  }

  function refreshProjectViews() {
    if (detailsQueryKey) {
      void queryClient.invalidateQueries({
        queryKey: projectDetailsKeys.detail(detailsQueryKey),
      });
    }
    startTransition(() => router.refresh());
  }

  async function saveStatus(s: string) {
    setStatus(s);
    setStatusSaving(true);
    syncProjectDetailsCache({ projectStatus: s });
    await updateAdminProject(projectId, { projectStatus: s } as never);
    refreshProjectViews();
    flashSaved();
  }

  // Persist the full stage list. When a stage is deleted we also repoint the
  // current status to the first remaining stage so it never dangles.
  async function commitStages(next: LifecycleStage[]) {
    setStages(next);
    const nextStatus = next.some((s) => s.id === status) ? status : next[0]?.id;
    if (nextStatus && nextStatus !== status) setStatus(nextStatus);
    setStatusSaving(true);
    syncProjectDetailsCache({
      lifecycleStages: next,
      ...(nextStatus && nextStatus !== status ? { projectStatus: nextStatus } : {}),
    });
    await updateAdminProject(projectId, {
      lifecycleStages: next,
      ...(nextStatus && nextStatus !== status ? { projectStatus: nextStatus } : {}),
    } as never);
    refreshProjectViews();
    flashSaved();
  }

  function updateStage(id: string, patch: Partial<LifecycleStage>) {
    commitStages(stages.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addStage(input: {
    label: string;
    color: string;
    startDate: string | null;
    endDate: string | null;
  }) {
    const newStage: LifecycleStage = {
      id: `stage-${Date.now()}`,
      label: input.label,
      color: input.color,
      startDate: input.startDate,
      endDate: input.endDate,
    };
    commitStages([...stages, newStage]);
  }

  function deleteStage(id: string) {
    commitStages(stages.filter((s) => s.id !== id));
  }

  function moveStage(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    commitStages(next);
  }

  async function saveDescription() {
    setDescSaving(true);
    await updateAdminProject(projectId, {
      description: draftDescription || null,
    } as never);
    setDescription(draftDescription);
    setDescSaving(false);
    setDescSaved(true);
    setTimeout(() => setDescSaved(false), 2000);
  }

  function cancelDescription() {
    setDraftDescription(description);
  }

  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="pen-text-section-label">
          Project details
        </h3>
        <div className="flex items-center gap-1.5">
          {!supportProject && statusSaving && (
            <span className="font-sans text-[11.5px] text-pen-subtle">Saving…</span>
          )}
          {!supportProject && statusSaved && (
            <span className="flex items-center gap-1 font-sans text-[11.5px] text-[#059669]">
              <CheckCircle2 className="size-3" /> Saved
            </span>
          )}
        </div>
      </div>

      {!supportProject && (
        <LifecycleStepper
          stages={stages}
          status={resolveCurrentStage(stages, status)?.id ?? status}
          canEdit={canManageLifecycle}
          onSelectStatus={(id) => {
            if (id !== status) void saveStatus(id);
          }}
          onUpdateStage={updateStage}
          onMoveStage={moveStage}
          onDeleteStage={deleteStage}
          onAddStage={addStage}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <h4 className="pen-text-section-label">
          Description
        </h4>
        {canEdit && descSaving && (
          <span className="font-sans text-[11.5px] text-pen-subtle">Saving…</span>
        )}
        {canEdit && descSaved && !descDirty && (
          <span className="flex items-center gap-1 font-sans text-[11.5px] text-[#059669]">
            <CheckCircle2 className="size-3" /> Saved
          </span>
        )}
      </div>
      <textarea
        value={draftDescription}
        onChange={(e) => setDraftDescription(e.target.value)}
        disabled={!canEdit}
        rows={4}
        placeholder="Describe the project goals, scope, and context…"
        className="mt-1.5 w-full resize-none rounded-lg border border-pen-card-border bg-pen-surface px-2.5 py-2 font-sans text-[12px] leading-relaxed text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id disabled:opacity-60 dark:bg-white/5"
      />
      {canEdit && descDirty && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancelDescription}
            className="h-7 rounded-lg border border-pen-card-border px-3 font-sans text-[11.5px] text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveDescription}
            disabled={descSaving}
            className="flex h-7 items-center gap-1.5 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
          >
            {descSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Save
          </button>
        </div>
      )}
    </div>
  );
}

// ── Integration brand icons ────────────────────────────────────────────────────

function GithubSvgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function VercelSvgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 22.525H0l12-21.05 12 21.05z"/>
    </svg>
  );
}

function SlackSvgIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  );
}

function FigmaSvgIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 38 57" fill="currentColor" aria-hidden="true">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/>
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 0 1-19 0z"/>
      <path d="M19 0v19h9.5a9.5 9.5 0 0 0 0-19H19z"/>
      <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/>
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/>
    </svg>
  );
}

// ── Integration card shell ─────────────────────────────────────────────────────

function IntegrationCardShell({
  icon,
  iconBg,
  title,
  subtitle,
  description,
  badge,
  footer,
  disabled,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  description: string;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card transition-shadow hover:shadow-sm", disabled && "opacity-50")}>
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="pen-text-card-title">{title}</p>
            {badge}
          </div>
          <p className="mt-0.5 truncate font-sans text-[11.5px] text-pen-muted">
            {subtitle ?? description}
          </p>
        </div>
      </div>
      {footer && (
        <div className="border-t border-pen-card-border/70 bg-pen-surface/40 px-4 py-3 dark:bg-white/3">
          {footer}
        </div>
      )}
    </div>
  );
}

// ── Status badges ──────────────────────────────────────────────────────────────

function ConnectedBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#05966915] px-2 py-0.5 font-sans text-[11.5px] font-medium text-[#059669]">
      <span className="size-1.5 rounded-full bg-[#059669]" />
      Connected
    </span>
  );
}

function NotConnectedBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-pen-card-border bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] font-medium text-pen-muted">
      <span className="size-1.5 rounded-full bg-pen-subtle" />
      Not connected
    </span>
  );
}

function ComingSoonBadge() {
  return (
    <span className="flex shrink-0 items-center rounded-full border border-pen-card-border bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] font-medium text-pen-subtle">
      Coming soon
    </span>
  );
}

// ── Detect analytics icon from URL ─────────────────────────────────────────────

function analyticsIconMeta(url: string): { iconEl: React.ReactNode; bg: string } {
  const u = url.toLowerCase();
  if (u.includes("vercel.com"))
    return { iconEl: <VercelSvgIcon className="size-[15px]" />, bg: "#00000018" };
  if (u.includes("analytics.google.com") || u.includes("tagmanager.google"))
    return { iconEl: <BarChart2 className="size-4" style={{ color: "#e37400" }} />, bg: "#e3740018" };
  if (u.includes("mixpanel.com"))
    return { iconEl: <BarChart2 className="size-4" style={{ color: "#7c3aed" }} />, bg: "#7c3aed18" };
  if (u.includes("plausible.io"))
    return { iconEl: <BarChart2 className="size-4" style={{ color: "#5850ec" }} />, bg: "#5850ec18" };
  if (u.includes("posthog.com"))
    return { iconEl: <BarChart2 className="size-4" style={{ color: "#f97316" }} />, bg: "#f9731618" };
  return { iconEl: <BarChart2 className="size-4" style={{ color: "#6b7280" }} />, bg: "#6b728018" };
}

// ── GitHub integration card ────────────────────────────────────────────────────

function GitHubCard({
  projectId,
  initialGithubRepo,
  canEdit,
}: {
  projectId: string;
  initialGithubRepo: string | null;
  canEdit: boolean;
}) {
  const [githubInput, setGithubInput] = useState(initialGithubRepo ?? "");
  const [githubSaving, setGithubSaving] = useState(false);
  const [githubData, setGithubData] = useState<GithubRepo | null>(null);
  const [githubPRs, setGithubPRs] = useState<GithubPR[]>([]);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);

  useEffect(() => {
    if (initialGithubRepo) fetchGithub(initialGithubRepo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchGithub(repo: string) {
    const clean = repo.trim().replace(/^https?:\/\/github\.com\//, "");
    if (!clean || !clean.includes("/")) {
      setGithubError("Enter a valid repo like owner/repo");
      return;
    }
    setGithubLoading(true);
    setGithubError(null);
    try {
      const [repoRes, prRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${clean}`),
        fetch(
          `https://api.github.com/repos/${clean}/pulls?state=all&per_page=5`,
        ),
      ]);
      if (!repoRes.ok) throw new Error("Repository not found or private");
      setGithubData(await repoRes.json());
      if (prRes.ok) setGithubPRs(await prRes.json());
    } catch (e: unknown) {
      setGithubError(e instanceof Error ? e.message : "Failed to fetch");
      setGithubData(null);
    } finally {
      setGithubLoading(false);
    }
  }

  async function saveGithub() {
    setGithubSaving(true);
    const clean = githubInput.trim().replace(/^https?:\/\/github\.com\//, "");
    await updateAdminProject(projectId, { githubRepo: clean } as never);
    await fetchGithub(clean);
    setGithubSaving(false);
  }

  const [showPRs, setShowPRs] = useState(false);

  return (
    <IntegrationCardShell
      icon={<GithubSvgIcon className="size-[18px]" />}
      iconBg="#24292e20"
      title="GitHub"
      subtitle={githubData?.full_name ?? (initialGithubRepo || undefined)}
      description={githubData?.description ?? "Connect your repository to link commits and PRs"}
      badge={githubData ? <ConnectedBadge /> : <NotConnectedBadge />}
      footer={
        <div className="flex flex-col gap-2">
          {canEdit && (
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <GitBranch className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
                <input
                  value={githubInput}
                  onChange={(e) => setGithubInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveGithub()}
                  placeholder="owner/repo or full GitHub URL"
                  className="h-9 w-full rounded-xl border border-pen-card-border bg-pen-card pl-9 pr-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                />
              </div>
              <button
                type="button"
                onClick={saveGithub}
                disabled={githubSaving || githubLoading}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-pen-blue px-4 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
              >
                {(githubSaving || githubLoading) ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {githubData ? "Update" : "Connect"}
              </button>
            </div>
          )}
          {githubError && (
            <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-2 font-sans text-[11.5px] text-red-500">
              <AlertCircle className="size-3.5 shrink-0" />
              {githubError}
            </div>
          )}
          {githubData && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                {githubData.language && (
                  <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                    <span className="size-2 rounded-full bg-pen-blue" />
                    {githubData.language}
                  </span>
                )}
                <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                  <Star className="size-3" /> {githubData.stargazers_count}
                </span>
                <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                  <GitFork className="size-3" /> {githubData.forks_count}
                </span>
                <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted">
                  <AlertCircle className="size-3" /> {githubData.open_issues_count}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {githubPRs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPRs((v) => !v)}
                    className="flex items-center gap-1 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground"
                  >
                    <GitPullRequest className="size-3.5" />
                    {githubPRs.length} PRs
                    <ChevronDown className={cn("size-3 transition-transform", showPRs && "rotate-180")} />
                  </button>
                )}
                <Link
                  href={githubData.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-sans text-[11.5px] text-pen-id hover:underline"
                >
                  View repo <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
          )}
          {showPRs && githubPRs.length > 0 && (
            <div className="mt-1 flex flex-col gap-1 rounded-lg border border-pen-card-border bg-pen-card p-1.5">
              {githubPRs.map((pr) => (
                <Link
                  key={pr.number}
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-pen-surface"
                >
                  <GitPullRequest
                    className={cn(
                      "size-3.5 shrink-0",
                      pr.merged_at ? "text-[#7c3aed]" : pr.state === "open" ? "text-[#059669]" : "text-[#dc2626]",
                    )}
                  />
                  <p className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-foreground">{pr.title}</p>
                  <span className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 font-sans text-[11.5px] font-medium",
                    pr.merged_at ? "bg-[#7c3aed20] text-[#7c3aed]" : pr.state === "open" ? "bg-[#05966920] text-[#059669]" : "bg-[#dc262620] text-[#dc2626]",
                  )}>
                    {pr.merged_at ? "Merged" : pr.state === "open" ? "Open" : "Closed"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}

// ── Live site card ─────────────────────────────────────────────────────────────

function LiveSiteCard({
  projectId,
  initialProjectUrl,
  canEdit,
}: {
  projectId: string;
  initialProjectUrl: string | null;
  canEdit: boolean;
}) {
  const [url, setUrl] = useState(initialProjectUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await updateAdminProject(projectId, { projectUrl: url || null } as never);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const displayUrl = url.trim();

  return (
    <IntegrationCardShell
      icon={<Globe className="size-[18px]" style={{ color: "#0ea5e9" }} />}
      iconBg="#0ea5e918"
      title="Live Site"
      subtitle={displayUrl || undefined}
      description="Staging or production deployment URL"
      badge={displayUrl ? <ConnectedBadge /> : <NotConnectedBadge />}
      footer={
        <div className="flex flex-col gap-2">
          {canEdit && (
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Globe className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  placeholder="https://your-project.com"
                  className="h-9 w-full rounded-xl border border-pen-card-border bg-pen-card pl-9 pr-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                />
              </div>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-pen-blue px-4 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
                {saved ? "Saved" : "Save"}
              </button>
            </div>
          )}
          {displayUrl && (
            <Link
              href={displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-id hover:underline"
            >
              <ExternalLink className="size-3.5" /> Open site
            </Link>
          )}
        </div>
      }
    />
  );
}

// ── Analytics link card ────────────────────────────────────────────────────────

function AnalyticsLinkCard({
  link,
  onRemove,
  canEdit,
}: {
  link: AnalyticalLink;
  onRemove: (id: string) => void;
  canEdit: boolean;
}) {
  const { iconEl, bg } = analyticsIconMeta(link.url);
  return (
    <IntegrationCardShell
      icon={iconEl}
      iconBg={bg}
      title={link.name}
      subtitle={link.url}
      description="Analytics dashboard"
      badge={<ConnectedBadge />}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Link
            href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-sans text-[11.5px] text-pen-id hover:underline"
          >
            Open dashboard <ExternalLink className="size-3" />
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={() => onRemove(link.id)}
              className="flex items-center gap-1 font-sans text-[11.5px] text-pen-subtle transition-colors hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
              Remove
            </button>
          )}
        </div>
      }
    />
  );
}

// ── Add analytics inline form ──────────────────────────────────────────────────

function AddAnalyticsInline({ onAdd }: { onAdd: (link: AnalyticalLink) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim() || !addUrl.trim()) return;
    setSaving(true);
    await onAdd({ id: Math.random().toString(36).slice(2), name: name.trim(), url: addUrl.trim() });
    setName("");
    setAddUrl("");
    setSaving(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-pen-card-border bg-pen-card px-4 font-sans text-[12px] font-medium text-pen-muted transition-colors hover:border-pen-id/60 hover:text-pen-foreground"
      >
        <Plus className="size-3.5 shrink-0" />
        Add analytics dashboard
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-pen-card-border bg-pen-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart2 className="size-4 text-pen-id" />
        <p className="font-sans text-[13px] font-semibold text-pen-foreground">Add analytics dashboard</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Vercel Analytics)"
            className="h-9 min-w-0 flex-1 rounded-xl border border-pen-card-border bg-pen-surface px-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id dark:bg-white/5"
          />
          <input
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="https://…"
            className="h-9 min-w-0 flex-1 rounded-xl border border-pen-card-border bg-pen-surface px-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id dark:bg-white/5"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-9 rounded-xl border border-pen-card-border px-4 font-sans text-[12px] text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !name.trim() || !addUrl.trim()}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-pen-blue px-4 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:text-gray-900"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Coming soon integrations ───────────────────────────────────────────────────

const COMING_SOON_INTEGRATIONS = [
  {
    id: "webhooks",
    icon: <Webhook className="size-3.5" style={{ color: "#7c3aed" }} />,
    iconBg: "#7c3aed18",
    title: "Webhooks",
  },
  {
    id: "slack",
    icon: <SlackSvgIcon className="size-3.5" style={{ color: "#4a154b" }} />,
    iconBg: "#4a154b18",
    title: "Slack",
  },
  {
    id: "figma",
    icon: <FigmaSvgIcon className="size-3.5" style={{ color: "#f24e1e" }} />,
    iconBg: "#f24e1e18",
    title: "Figma",
  },
  {
    id: "vercel-deploy",
    icon: <VercelSvgIcon className="size-[13px]" />,
    iconBg: "#00000018",
    title: "Vercel Deploy",
  },
];

// ── Integration tab ───────────────────────────────────────────────────────────

export function ProjectIntegrationTab({
  projectId,
  initialGithubRepo,
  initialProjectUrl,
  initialAnalyticalLinks,
  canEdit,
}: {
  projectId: string;
  initialGithubRepo: string | null;
  initialProjectUrl: string | null;
  initialAnalyticalLinks: AnalyticalLink[];
  canEdit: boolean;
}) {
  const [links, setLinks] = useState<AnalyticalLink[]>(initialAnalyticalLinks);

  async function addLink(link: AnalyticalLink) {
    const updated = [...links, link];
    setLinks(updated);
    await updateAdminProject(projectId, { analyticalLinks: updated } as never);
  }

  async function removeLink(id: string) {
    const updated = links.filter((l) => l.id !== id);
    setLinks(updated);
    await updateAdminProject(projectId, { analyticalLinks: updated } as never);
  }

  const connectedCount =
    (initialGithubRepo ? 1 : 0) + (initialProjectUrl ? 1 : 0) + links.length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">

      {/* Section: Active integrations */}
      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <div className="h-px flex-1 bg-pen-card-border/60" />
          <div className="flex items-center gap-2">
            <span className="pen-text-label">
              Connected integrations
            </span>
            {connectedCount > 0 && (
              <span className="rounded-full bg-[#05966915] px-2 py-0.5 font-sans text-[11.5px] font-semibold text-[#059669]">
                {connectedCount} active
              </span>
            )}
          </div>
          <div className="h-px flex-1 bg-pen-card-border/60" />
        </div>

        <div className="flex flex-col gap-3">
          <GitHubCard
            projectId={projectId}
            initialGithubRepo={initialGithubRepo}
            canEdit={canEdit}
          />
          <LiveSiteCard
            projectId={projectId}
            initialProjectUrl={initialProjectUrl}
            canEdit={canEdit}
          />
          {links.map((l) => (
            <AnalyticsLinkCard key={l.id} link={l} onRemove={removeLink} canEdit={canEdit} />
          ))}
        </div>

        {canEdit && (
          <div className="mt-3">
            <AddAnalyticsInline onAdd={addLink} />
          </div>
        )}
      </div>

      {/* Section: Coming soon */}
      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <div className="h-px flex-1 bg-pen-card-border/60" />
          <span className="pen-text-label">
            More integrations
          </span>
          <div className="h-px flex-1 bg-pen-card-border/60" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {COMING_SOON_INTEGRATIONS.map((c) => (
            <div
              key={c.id}
              className="flex flex-col items-center gap-2 rounded-2xl border border-pen-card-border bg-pen-card px-3 py-4 opacity-50"
            >
              <div
                className="flex size-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: c.iconBg }}
              >
                {c.icon}
              </div>
              <div className="text-center">
                <p className="font-sans text-[12px] font-semibold text-pen-foreground">{c.title}</p>
                <p className="font-sans text-[11.5px] text-pen-subtle">Coming soon</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Exported legacy wrappers ───────────────────────────────────────────────────

export function ProjectGithubSection(props: { projectId: string; initialGithubRepo: string | null; canEdit: boolean }) {
  return <GitHubCard {...props} />;
}

export function ProjectUrlSection(props: { projectId: string; initialProjectUrl: string | null; canEdit: boolean }) {
  return <LiveSiteCard {...props} />;
}

// ── Guidelines ────────────────────────────────────────────────────────────────

export function ProjectGuidelinesSection({
  projectId,
  initialGuidelines,
  canEdit,
}: {
  projectId: string;
  initialGuidelines: string | null;
  canEdit: boolean;
}) {
  const [guidelines, setGuidelines] = useState(initialGuidelines ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await updateAdminProject(projectId, { guidelines: guidelines || null } as never);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Section title="Guidelines">
      <div className="mb-2 flex items-center justify-end gap-2">
        {canEdit && saving && (
          <span className="font-sans text-[11.5px] text-pen-subtle">Saving…</span>
        )}
        {canEdit && saved && (
          <span className="flex items-center gap-1 font-sans text-[11.5px] text-[#059669]">
            <CheckCircle2 className="size-3" /> Saved
          </span>
        )}
      </div>
      <textarea
        value={guidelines}
        onChange={(e) => setGuidelines(e.target.value)}
        onBlur={canEdit ? save : undefined}
        disabled={!canEdit}
        rows={6}
        placeholder="Brand guidelines, file naming conventions, review checklists, design tokens…"
        className="w-full resize-y rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2.5 font-sans text-[12.5px] leading-relaxed text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id disabled:opacity-60 dark:bg-white/5"
      />
      {!canEdit && !guidelines.trim() && (
        <p className="mt-2 font-sans text-[12px] text-pen-subtle">No guidelines added yet.</p>
      )}
    </Section>
  );
}

// ── Assets tab ────────────────────────────────────────────────────────────────

export function ProjectAssetsTab({
  projectId,
  initialAssets,
  canAdd,
  canDelete,
}: {
  projectId: string;
  initialAssets: AssetNode[];
  canAdd: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <ProjectAssetManager
        projectId={projectId}
        initialNodes={initialAssets}
        canAdd={canAdd}
        canDelete={canDelete}
      />
    </div>
  );
}
