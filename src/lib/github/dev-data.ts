import { getCheckState } from "./checks";
import { repoFromGitHubUrl } from "./repo-from-url";
import type { GitHubDevData } from "@/components/tickets/github-dev-section";

type PullRequestRow = {
  repository?: string | null;
  number: number;
  title: string;
  url: string;
  branch: string;
  baseBranch: string | null;
  authorLogin: string;
  state: "draft" | "open" | "merged" | "closed";
  mergedAt: Date | null;
  ghCreatedAt: Date | null;
};

type CommitRow = {
  sha: string;
  message: string;
  url: string;
  authorLogin: string;
};

/** Maps a ticket's GitHub relations to the Development-section prop shape. */
export async function buildGitHubDevData(ticket: {
  pullRequests: Array<{ pr: PullRequestRow }>;
  commits: CommitRow[];
}): Promise<GitHubDevData> {
  return {
    pullRequests: await Promise.all(
      ticket.pullRequests.map(async ({ pr }) => ({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        branch: pr.branch,
        baseBranch: pr.baseBranch,
        authorLogin: pr.authorLogin,
        state: pr.state,
        createdAtIso: pr.ghCreatedAt?.toISOString() ?? null,
        mergedAtIso: pr.mergedAt?.toISOString() ?? null,
        checkState:
          pr.state === "open" || pr.state === "draft"
            ? await getCheckState(
                pr.branch,
                pr.repository ?? repoFromGitHubUrl(pr.url),
              )
            : null,
      })),
    ),
    commits: ticket.commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      url: c.url,
      authorLogin: c.authorLogin,
    })),
  };
}
