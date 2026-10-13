/**
 * Cursor shared by the M365 and Gmail providers: the receive timestamp of the
 * newest processed message, plus the ids already processed *at* that exact
 * timestamp. Queries use "received >= since" and skip those ids, so two
 * messages landing in the same second can never straddle a batch boundary and
 * get lost (a strict ">" would drop the second one).
 */
export type TimeCursor = { since: string; ids: string[] };

export function initialTimeCursor(now: Date = new Date()): TimeCursor {
  return { since: now.toISOString(), ids: [] };
}

export function readTimeCursor(value: unknown): TimeCursor {
  const cursor = value as Partial<TimeCursor> | null;
  if (cursor && typeof cursor.since === "string" && !Number.isNaN(Date.parse(cursor.since))) {
    return { since: cursor.since, ids: Array.isArray(cursor.ids) ? cursor.ids.filter((id) => typeof id === "string") : [] };
  }
  return initialTimeCursor();
}

export type TimedRef = { id: string; receivedAt: string };

/** Drops already-processed refs, sorts oldest first and caps at `limit`. */
export function selectNewRefs(cursor: TimeCursor, refs: TimedRef[], limit: number): TimedRef[] {
  const sinceMs = Date.parse(cursor.since);
  const seen = new Set(cursor.ids);
  return refs
    .filter((ref) => {
      const at = Date.parse(ref.receivedAt);
      return at > sinceMs || (at === sinceMs && !seen.has(ref.id));
    })
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
    .slice(0, limit);
}

/** The cursor to persist once `ref` has been processed. */
export function advanceTimeCursor(cursor: TimeCursor, ref: TimedRef): TimeCursor {
  const at = new Date(ref.receivedAt).toISOString();
  return Date.parse(at) === Date.parse(cursor.since)
    ? { since: cursor.since, ids: [...cursor.ids, ref.id] }
    : { since: at, ids: [ref.id] };
}
