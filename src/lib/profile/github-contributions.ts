import "server-only";
import { prisma } from "@/lib/db";
import {
  buildContributionCalendar,
  type ContributionCalendar,
} from "./contribution-buckets";

/** Number of days back the heatmap covers (~53 weeks, GitHub-style). */
export const CONTRIBUTION_WINDOW_DAYS = 371;

/**
 * Builds a { "YYYY-MM-DD": count } map of a user's contributions to the tracked
 * repos over the trailing ~year, matched on their GitHub username.
 *
 * Scope note: only ticket-referencing commits are stored, and commit day is the
 * webhook-receipt time (no true commit date is available), so this reflects
 * tracked work — not a user's full GitHub activity.
 */
export async function fetchContributionsByDay(opts: {
  githubUsername: string;
  tz?: string;
  now?: Date;
}): Promise<ContributionCalendar> {
  const login = opts.githubUsername.trim();
  if (!login) return {};

  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - CONTRIBUTION_WINDOW_DAYS * 86400_000);

  const [commits, prs] = await Promise.all([
    prisma.gitHubCommit.findMany({
      where: {
        authorLogin: { equals: login, mode: "insensitive" },
        createdAt: { gte: since },
      },
      select: { sha: true, message: true, url: true, createdAt: true },
    }),
    prisma.gitHubPullRequest.findMany({
      where: { authorLogin: { equals: login, mode: "insensitive" } },
      select: {
        number: true,
        title: true,
        url: true,
        ghCreatedAt: true,
        createdAt: true,
        mergedAt: true,
      },
    }),
  ]);

  const prsOpened: {
    number: number;
    title: string;
    url: string;
    at: Date;
  }[] = [];
  const prsMerged: {
    number: number;
    title: string;
    url: string;
    at: Date;
  }[] = [];
  for (const pr of prs) {
    const base = { number: pr.number, title: pr.title, url: pr.url };
    const opened = pr.ghCreatedAt ?? pr.createdAt;
    if (opened >= since) prsOpened.push({ ...base, at: opened });
    if (pr.mergedAt && pr.mergedAt >= since)
      prsMerged.push({ ...base, at: pr.mergedAt });
  }

  return buildContributionCalendar({
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      url: c.url,
      at: c.createdAt,
    })),
    prsOpened,
    prsMerged,
    tz: opts.tz,
  });
}
