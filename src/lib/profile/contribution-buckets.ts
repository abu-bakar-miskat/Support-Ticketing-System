/**
 * Pure aggregation for the profile contribution heatmap. Kept free of Prisma /
 * server imports so it can be unit-tested in isolation.
 *
 * A "contribution" on a day is the sum of:
 *   - distinct commits authored that day (de-duplicated by SHA — one commit can
 *     be stored once per ticket it references),
 *   - pull requests opened that day,
 *   - pull requests merged that day.
 */

export type CommitEvent = { sha: string; at: Date };

export type ContributionInput = {
  commits: CommitEvent[];
  prsOpened: Date[];
  prsMerged: Date[];
  /** IANA timezone used to bucket events into local calendar days. */
  tz?: string;
};

/** Local calendar day (YYYY-MM-DD) for a date in the given timezone. */
export function dayKey(date: Date, tz?: string): string {
  if (!tz) return date.toISOString().slice(0, 10);
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function bucketContributions(input: ContributionInput): Record<string, number> {
  const { prsOpened, prsMerged, tz } = input;
  const counts: Record<string, number> = {};

  const bump = (date: Date) => {
    const key = dayKey(date, tz);
    counts[key] = (counts[key] ?? 0) + 1;
  };

  // De-duplicate commits by SHA, keeping the earliest recorded timestamp.
  const earliestBySha = new Map<string, Date>();
  for (const c of input.commits) {
    const existing = earliestBySha.get(c.sha);
    if (!existing || c.at < existing) earliestBySha.set(c.sha, c.at);
  }
  for (const at of earliestBySha.values()) bump(at);

  for (const at of prsOpened) bump(at);
  for (const at of prsMerged) bump(at);

  return counts;
}

/** A single event shown when a day cell is opened. */
export type ContributionItem =
  | { kind: "commit"; sha: string; message: string; url: string; at: string }
  | {
      kind: "pr_opened" | "pr_merged";
      number: number;
      title: string;
      url: string;
      at: string;
    };

export type ContributionDay = { count: number; items: ContributionItem[] };

/** { "YYYY-MM-DD": { count, items } } — count always equals items.length. */
export type ContributionCalendar = Record<string, ContributionDay>;

export type CalendarInput = {
  commits: { sha: string; message: string; url: string; at: Date }[];
  prsOpened: { number: number; title: string; url: string; at: Date }[];
  prsMerged: { number: number; title: string; url: string; at: Date }[];
  tz?: string;
};

/**
 * Like {@link bucketContributions} but keeps the underlying commit/PR details
 * per day so the UI can list them on click. Commits are de-duplicated by SHA
 * (earliest recorded timestamp wins) and items within a day are ordered by time.
 */
export function buildContributionCalendar(
  input: CalendarInput,
): ContributionCalendar {
  const cal: ContributionCalendar = {};

  const push = (at: Date, item: ContributionItem) => {
    const key = dayKey(at, input.tz);
    (cal[key] ??= { count: 0, items: [] }).items.push(item);
  };

  const earliestBySha = new Map<
    string,
    { message: string; url: string; at: Date }
  >();
  for (const c of input.commits) {
    const existing = earliestBySha.get(c.sha);
    if (!existing || c.at < existing.at) {
      earliestBySha.set(c.sha, { message: c.message, url: c.url, at: c.at });
    }
  }
  for (const [sha, c] of earliestBySha) {
    push(c.at, {
      kind: "commit",
      sha,
      message: c.message,
      url: c.url,
      at: c.at.toISOString(),
    });
  }

  for (const pr of input.prsOpened) {
    push(pr.at, {
      kind: "pr_opened",
      number: pr.number,
      title: pr.title,
      url: pr.url,
      at: pr.at.toISOString(),
    });
  }
  for (const pr of input.prsMerged) {
    push(pr.at, {
      kind: "pr_merged",
      number: pr.number,
      title: pr.title,
      url: pr.url,
      at: pr.at.toISOString(),
    });
  }

  for (const day of Object.values(cal)) {
    day.items.sort((a, b) => a.at.localeCompare(b.at));
    day.count = day.items.length;
  }

  return cal;
}
