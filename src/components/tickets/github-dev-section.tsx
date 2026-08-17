"use client";

import {
  ChevronRight,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { formatDateTime, timeAgo } from "@/lib/format";

export type DevPullRequest = {
  number: number;
  title: string;
  url: string;
  branch: string;
  baseBranch: string | null;
  authorLogin: string;
  state: "draft" | "open" | "merged" | "closed";
  createdAtIso: string | null;
  mergedAtIso: string | null;
  checkState: "pending" | "passing" | "failing" | null;
};

export type DevCommit = {
  sha: string;
  message: string;
  url: string;
  authorLogin: string;
};

export type GitHubDevData = {
  pullRequests: DevPullRequest[];
  commits: DevCommit[];
};

const STATE_ICON: Record<DevPullRequest["state"], LucideIcon> = {
  draft: GitPullRequestDraft,
  open: GitPullRequest,
  merged: GitMerge,
  closed: GitPullRequestClosed,
};

const STATE_ICON_STYLES: Record<DevPullRequest["state"], string> = {
  draft: "bg-pen-surface text-pen-subtle",
  open: "bg-pen-green/10 text-pen-green",
  merged: "bg-[#f3e8ff] text-[#7c3aed] dark:bg-[#3a2a54] dark:text-[#c4b5fd]",
  closed: "bg-pen-red/10 text-pen-red",
};

const CHECK_STYLES: Record<
  NonNullable<DevPullRequest["checkState"]>,
  string
> = {
  passing: "text-pen-green",
  failing: "text-pen-red",
  pending: "text-amber-600 dark:text-amber-400",
};

const CHECK_LABELS: Record<
  NonNullable<DevPullRequest["checkState"]>,
  string
> = {
  passing: "✓ checks",
  failing: "✗ checks",
  pending: "● checks",
};

export function GitHubDevSection({ data }: { data: GitHubDevData }) {
  const hasPr = data.pullRequests.length > 0;
  const [commitsOpen, setCommitsOpen] = useState(!hasPr);

  if (data.pullRequests.length === 0 && data.commits.length === 0) return null;

  const commitRail = (
    <div className="relative ml-4 flex flex-col before:absolute before:bottom-4 before:left-2 before:top-4 before:w-px before:bg-pen-card-border">
      {data.commits.map((commit) => (
        <a
          key={commit.sha}
          href={commit.url}
          target="_blank"
          rel="noreferrer"
          className="group relative flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 transition-colors hover:bg-pen-blue-tint/30"
        >
          <span className="absolute left-2 top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pen-bg text-pen-subtle transition-colors group-hover:text-pen-blue">
            <GitCommitHorizontal className="h-3.5 w-3.5" />
          </span>
          <span className="shrink-0 font-mono text-[11px] text-pen-subtle">
            {commit.sha.slice(0, 7)}
          </span>
          <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">
            {commit.message.split("\n")[0]}
          </span>
          <span className="ml-auto shrink-0 font-sans text-[11.5px] text-pen-muted">
            {commit.authorLogin}
          </span>
        </a>
      ))}
    </div>
  );

  return (
    <div>
      <p className="pen-text-label mb-2">Development</p>
      <div className="flex flex-col gap-1.5">
        {data.pullRequests.map((pr) => {
          const merged = pr.state === "merged";
          const eventIso = merged ? pr.mergedAtIso : pr.createdAtIso;
          const StateIcon = STATE_ICON[pr.state];
          return (
            <a
              key={pr.number}
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2.5 rounded-lg border border-pen-card-border bg-pen-bg px-3 py-2.5 transition-colors hover:border-pen-blue/50 hover:bg-pen-blue-tint/30"
            >
              <span
                className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${STATE_ICON_STYLES[pr.state]}`}
              >
                <StateIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                    {pr.title}
                  </span>
                  <span className="shrink-0 font-sans text-[11.5px] text-pen-subtle">
                    #{pr.number}
                  </span>
                  {pr.checkState && (
                    <span
                      className={`shrink-0 font-sans text-[11px] font-medium ${CHECK_STYLES[pr.checkState]}`}
                    >
                      {CHECK_LABELS[pr.checkState]}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-sans text-[11px] text-pen-muted">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span className="max-w-40 truncate rounded bg-pen-surface px-1 py-px font-mono text-[10.5px] text-pen-subtle">
                      {pr.branch}
                    </span>
                    {pr.baseBranch && (
                      <>
                        <span aria-hidden className="text-pen-subtle">
                          →
                        </span>
                        <span className="max-w-40 truncate rounded bg-pen-surface px-1 py-px font-mono text-[10.5px] text-pen-subtle">
                          {pr.baseBranch}
                        </span>
                      </>
                    )}
                  </span>
                  <span aria-hidden className="text-pen-card-border">
                    ·
                  </span>
                  <span className="shrink-0">{pr.authorLogin}</span>
                  {eventIso && (
                    <>
                      <span aria-hidden className="text-pen-card-border">
                        ·
                      </span>
                      <span
                        className="shrink-0"
                        title={formatDateTime(new Date(eventIso))}
                      >
                        {merged ? "merged" : "opened"}{" "}
                        {timeAgo(new Date(eventIso))}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </a>
          );
        })}
        {data.commits.length > 0 &&
          (hasPr ? (
            <div className="mt-0.5 flex flex-col">
              <button
                type="button"
                onClick={() => setCommitsOpen((open) => !open)}
                aria-expanded={commitsOpen}
                className="flex items-center gap-1 self-start rounded-md py-1 pl-1.5 pr-2 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground"
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${commitsOpen ? "rotate-90" : ""}`}
                />
                {data.commits.length} commit
                {data.commits.length === 1 ? "" : "s"}
              </button>
              {commitsOpen && commitRail}
            </div>
          ) : (
            commitRail
          ))}
      </div>
    </div>
  );
}
