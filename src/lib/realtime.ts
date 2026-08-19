// Pure subscription factory functions — no React, no router.
// Hooks wrap these; tests mock the Supabase-shaped interface directly.
//
// Requirements (run supabase-realtime-setup.sql in Supabase SQL Editor):
//   1. alter publication supabase_realtime add table "TableName";
//   2. alter table "TableName" enable row level security;
//   3. create policy ... for select to authenticated using (...);
//   4. alter table "TableName" replica identity full;  -- for UPDATE/DELETE payloads

// Monotonically increasing counter — ensures each subscription call gets a
// globally unique channel name even when React StrictMode double-invokes
// effects. Supabase caches channels by name; reusing a name before the old
// channel is fully removed causes "cannot add callbacks after subscribe()".
let _channelSeq = 0;

export interface ChannelLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, filter: Record<string, unknown>, callback: (payload: any) => void): any
  subscribe(callback?: (status: string, err?: Error) => void): unknown
}

export interface SupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel(name: string): any
  removeChannel(channel: unknown): unknown
}

function logStatus(name: string, status: string, err?: Error) {
  if (process.env.NODE_ENV === "development") {
    if (err) console.error(`[realtime] ${name}:`, status, err);
    else if (status !== "SUBSCRIBED") console.log(`[realtime] ${name}:`, status);
  }
}

// ── Reconnection helper ───────────────────────────────────────────────────────

const ERROR_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Wraps a channel factory with exponential-backoff reconnection.
 * When the channel reports CHANNEL_ERROR / TIMED_OUT / CLOSED the channel is
 * torn down and recreated after a delay (1 s → 2 s → 4 s … capped at 30 s).
 * Delay resets to 0 on a successful SUBSCRIBED.
 *
 * The factory receives an `attempt` counter (0-based) so it can append it to
 * channel names — this prevents Supabase from rejecting a new channel with the
 * same name as an old one that hasn't been fully removed yet.
 */
function autoReconnect(
  factory: (onStatus: (status: string, err?: Error) => void, attempt: number) => () => void,
): () => void {
  let cleanup: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let stopped = false;
  let handling = false; // re-entrancy guard — prevents removeChannel CLOSED from looping

  function connect() {
    cleanup = factory((status, err) => {
      if (stopped || handling) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        return;
      }
      if (ERROR_STATUSES.has(status)) {
        handling = true;
        const prev = cleanup;
        cleanup = null;
        // Defer teardown so we don't synchronously re-enter this callback
        // via the CLOSED event that removeChannel emits.
        setTimeout(() => {
          prev?.();
          handling = false;
        }, 0);
        const delay = Math.min(1_000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY_MS);
        attempt++;
        if (process.env.NODE_ENV === "development") {
          console.log(`[realtime] reconnecting in ${delay}ms (attempt ${attempt})`);
        }
        timer = setTimeout(() => { if (!stopped) connect(); }, delay);
      }
    }, attempt);
  }

  connect();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    cleanup?.();
  };
}

// ── Board / list view ─────────────────────────────────────────────────────────

/** Watches Ticket + TicketAssignee changes — used by board/list to trigger refresh. */
export function createTicketsSubscription(
  supabase: SupabaseLike,
  onUpdate: () => void,
): () => void {
  const seq = _channelSeq++;
  return autoReconnect((onStatus, attempt) => {
    const name = `board:tickets:${seq}:${attempt}`;
    const channel = supabase
      .channel(name)
      .on("postgres_changes", { event: "*", schema: "public", table: "Ticket" }, onUpdate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "TicketAssignee" },
        onUpdate,
      )
      .subscribe((status: string, err?: Error) => {
        logStatus(name, status, err);
        onStatus(status, err);
      });
    return () => supabase.removeChannel(channel);
  });
}

// ── Ticket detail page / drawer ───────────────────────────────────────────────

/**
 * Single channel that handles both Ticket UPDATE (status changes from other
 * users) and Comment INSERT (new comments from other users) for one ticket.
 * Per the docs, multiple .on() calls on one channel are the recommended pattern.
 *
 * Prefer ticket-activity broadcast for field patches (instant, payload-rich).
 * Use onSubTicketChange for child ticket WAL events that are not broadcast.
 */
export function createTicketDetailSubscription(
  supabase: SupabaseLike,
  ticketId: string,
  {
    onStatusChange,
    onCommentInsert,
    onTicketUpdate,
    onSubTicketChange,
    onMessageInsert,
  }: {
    onStatusChange?: (newStatus: string) => void;
    onCommentInsert?: (commentId: string, parentId: string | null) => void;
    /** @deprecated Prefer activity broadcast; fires on any UPDATE to this ticket row */
    onTicketUpdate?: () => void;
    /** Fires when a child ticket of this parent is inserted/updated/deleted */
    onSubTicketChange?: () => void;
    /** Fires when a new TicketMessage row is inserted (inbound or outbound). */
    onMessageInsert?: (messageId: string) => void;
  },
): () => void {
  const seq = _channelSeq++;
  return autoReconnect((onStatus, attempt) => {
    const name = `ticket-detail:${ticketId}:${seq}:${attempt}`;
    const channel = supabase
      .channel(name)
      // Ticket row UPDATE — optimistic status change + optional full refresh
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Ticket", filter: `id=eq.${ticketId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const oldStatus = (payload?.old as Record<string, unknown>)?.status as string | undefined;
          const newStatus = (payload?.new as Record<string, unknown>)?.status as string | undefined;
          if (onStatusChange && newStatus && newStatus !== oldStatus) onStatusChange(newStatus);
          // Always fire for any field change so the drawer/page can re-fetch
          onTicketUpdate?.();
        },
      )
      // Comment INSERT → extract id + parentId
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Comment", filter: `ticketId=eq.${ticketId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (!onCommentInsert) return;
          const row = (payload?.new ?? {}) as Record<string, unknown>;
          const id = row.id as string | undefined;
          const parentId = (row.parentId as string | null | undefined) ?? null;
          if (id) onCommentInsert(id, parentId);
        },
      )
      // TicketMessage INSERT — inbound customer reply or outbound staff message
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "TicketMessage", filter: `ticketId=eq.${ticketId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (!onMessageInsert) return;
          const row = (payload?.new ?? {}) as Record<string, unknown>;
          const id = row.id as string | undefined;
          if (id) onMessageInsert(id);
        },
      )
      // Sub-ticket INSERT/UPDATE/DELETE — any child change triggers a full refresh.
      // No server-side filter: Realtime rejects filters on non-PK columns for
      // DELETE-inclusive subscriptions ("invalid column for filter parentId"),
      // which failed the whole channel and caused reconnect churn. Match
      // parentId client-side instead; DELETE payloads only carry the PK, so
      // fire unconditionally for those (deletes are rare).
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Ticket" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const notify = onSubTicketChange ?? onTicketUpdate;
          if (!notify) return;
          if (payload?.eventType === "DELETE") {
            notify();
            return;
          }
          const row = (payload?.new ?? {}) as Record<string, unknown>;
          if (row.parentId === ticketId) notify();
        },
      )
      .subscribe((status: string, err?: Error) => {
        logStatus(name, status, err);
        onStatus(status, err);
      });

    return () => supabase.removeChannel(channel);
  });
}

// ── Project boards (enabled team tabs) ────────────────────────────────────────

export function createProjectBoardsSubscription(
  supabase: SupabaseLike,
  projectId: string,
  onUpdate: () => void,
): () => void {
  return autoReconnect((onStatus) => {
    const name = `project-boards:${projectId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(name) as any;
    channel.on("broadcast", { event: "boards_changed" }, () => onUpdate());
    channel.subscribe((status: string, err?: Error) => {
      logStatus(name, status, err);
      onStatus(status, err);
    });
    return () => supabase.removeChannel(channel);
  });
}

/** Refreshes open project views when status / lifecycle / other fields change. */
export function createProjectSubscription(
  supabase: SupabaseLike,
  projectId: string,
  onUpdate: () => void,
): () => void {
  return autoReconnect((onStatus) => {
    const name = `project:${projectId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(name) as any;
    channel.on("broadcast", { event: "project_changed" }, () => onUpdate());
    channel.subscribe((status: string, err?: Error) => {
      logStatus(name, status, err);
      onStatus(status, err);
    });
    return () => supabase.removeChannel(channel);
  });
}

// ── Ticket GitHub activity (PRs + commits) ────────────────────────────────────

/**
 * Refreshes the Development section for one ticket when a linked PR or commit
 * changes (e.g. a PR flipping to "merged", a new commit, a newly linked PR).
 *
 * Uses Supabase Realtime *broadcast* rather than postgres_changes: the GitHub
 * webhook pushes to topic `ticket-github:{ticketId}` (see lib/github/broadcast.ts).
 * Broadcast needs no supabase_realtime publication / replication-slot setup and
 * is unaffected by the Realtime service's cached table list — the same reason
 * notifications use broadcast. The channel name MUST equal the topic exactly, so
 * unlike the postgres_changes channels we do NOT append `:attempt` here.
 */
export function createTicketGithubSubscription(
  supabase: SupabaseLike,
  ticketId: string,
  onUpdate: () => void,
): () => void {
  return autoReconnect((onStatus) => {
    const name = `ticket-github:${ticketId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(name) as any;
    channel.on("broadcast", { event: "github_changed" }, () => onUpdate());
    channel.subscribe((status: string, err?: Error) => {
      logStatus(name, status, err);
      onStatus(status, err);
    });
    return () => supabase.removeChannel(channel);
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

/**
 * Watches Notification INSERTs for a specific recipient via Postgres WAL.
 * Requires the supabase_realtime publication to include the Notification table
 * (run supabase-realtime-setup.sql). channelSuffix allows multiple subscribers
 * to coexist without Supabase rejecting a double-subscribe.
 */
export function createNotificationsSubscription(
  supabase: SupabaseLike,
  recipientId: string,
  onInsert: (payload: unknown) => void,
  channelSuffix = "global",
): () => void {
  const seq = _channelSeq++;
  return autoReconnect((onStatus, attempt) => {
    const name = `notifications:${recipientId}:${channelSuffix}:${seq}:${attempt}`;
    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Notification",
          filter: `recipientId=eq.${recipientId}`,
        },
        onInsert,
      )
      .subscribe((status: string, err?: Error) => {
        logStatus(name, status, err);
        onStatus(status, err);
      });
    return () => supabase.removeChannel(channel);
  });
}

/**
 * Subscribes to Supabase Realtime Broadcast events pushed by the server
 * (notify.ts → HTTP POST /realtime/v1/api/broadcast) using service role key.
 *
 * Unlike postgres_changes this requires NO SQL publication setup.
 * Mount this ONCE per user session — typically only in NotificationsRealtime
 * in the dashboard layout — because the channel topic must be globally unique
 * per Supabase client instance.
 *
 * Note: broadcast channel names must exactly match the topic the server
 * broadcasts to. Do NOT append :seq/:attempt — that would break delivery.
 */
export type NotificationBroadcastPayload = {
  id: string
  type: string
  /** Pre-built toast title — e.g. "Abu Bakar commented on Fix login bug" */
  title: string
  /** Optional second line — e.g. comment excerpt */
  body?: string | null
  /** Ticket to open — present for ticket-related notifications */
  ticketDbId?: string | null
  /** Join request — routes to team settings when present */
  joinRequestId?: string | null
}

export type JoinRequestResolvedPayload = {
  requestId: string
  status: "approved" | "rejected"
}

export function createNotificationsBroadcastSubscription(
  supabase: SupabaseLike,
  recipientId: string,
  onInsert: (payload: NotificationBroadcastPayload) => void,
  onResolved?: (payload: JoinRequestResolvedPayload) => void,
  // SA-03: fires when this user or their tenant is suspended/restricted/
  // soft-deleted — see lib/realtime-broadcast.ts. `reason` is the
  // user-facing explanatory message.
  onForceLogout?: (reason: string) => void,
): () => void {
  return autoReconnect((onStatus) => {
    // Broadcast routing requires the channel name to exactly match the topic
    // the server broadcasts to (`user-notifs:{recipientId}`). Do NOT append
    // `:attempt` here — that would break broadcast delivery.
    const name = `user-notifs:${recipientId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(name) as any;
    channel.on("broadcast", { event: "new_notification" }, (raw: any) => {
      const p = raw?.payload ?? {};
      if (p.id) onInsert({
        id: p.id,
        type: p.type ?? "",
        title: p.title ?? "New notification",
        body: p.body ?? null,
        ticketDbId: p.ticketDbId ?? null,
        joinRequestId: p.joinRequestId ?? null,
      });
    });
    if (onResolved) {
      channel.on("broadcast", { event: "join_request_resolved" }, (raw: any) => {
        const p = raw?.payload ?? {};
        if (p.requestId) onResolved({ requestId: p.requestId, status: p.status });
      });
    }
    if (onForceLogout) {
      channel.on("broadcast", { event: "force_logout" }, (raw: any) => {
        const p = raw?.payload ?? {};
        onForceLogout(p.reason ?? "Your access has been revoked.");
      });
    }
    channel.subscribe((status: string, err?: Error) => {
      logStatus(name, status, err);
      onStatus(status, err);
    });
    return () => supabase.removeChannel(channel);
  });
}

// ── Timer (user-scoped broadcast from /api/time) ──────────────────────────────

/**
 * Subscribes to broadcast events on `ticket-chat:{ticketId}`.
 * Fires whenever the server pushes a `new_message` event — no Supabase
 * publication setup required (broadcast bypasses postgres_changes entirely).
 *
 * Channel name MUST match the broadcast topic exactly — do NOT append
 * :seq/:attempt as that would break server-to-client broadcast delivery.
 */
export type ChatMessagePayload = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  body: string;
  fromName: string;
  fromEmail: string;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  attachments: { id: string; storageUrl: string; fileName: string; fileSize: number }[];
}

export function createTicketChatSubscription(
  supabase: SupabaseLike,
  ticketId: string,
  onNewMessage: (message: ChatMessagePayload, direction: "inbound" | "outbound") => void,
): () => void {
  const name = `ticket-chat:${ticketId}`;
  return autoReconnect((onStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(name) as any;
    channel.on("broadcast", { event: "new_message" }, (raw: any) => {
      const p = raw?.payload;
      if (!p?.id) return;
      const direction = p.direction === "outbound" ? "outbound" : "inbound";
      onNewMessage(p as ChatMessagePayload, direction);
    });
    channel.subscribe((status: string, err?: Error) => {
      logStatus(name, status, err);
      onStatus(status, err);
    });
    return () => supabase.removeChannel(channel);
  });
}

/** Sync running timer when another tab or component starts/stops time. */
export function createTimerBroadcastSubscription(
  supabase: SupabaseLike,
  profileId: string,
  onChange: () => void,
): () => void {
  const name = `user-timer:${profileId}`;
  return autoReconnect((onStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(name) as any;
    channel.on("broadcast", { event: "timer_changed" }, () => {
      onChange();
    });
    channel.subscribe((status: string, err?: Error) => {
      logStatus(name, status, err);
      onStatus(status, err);
    });
    return () => supabase.removeChannel(channel);
  });
}

// ── Ticket activity (event-sourcing broadcast) ────────────────────────────────

export type TicketActivityEvent = {
  activityId: string
  ticketId: string
  action: string
  actorId: string
  payload: Record<string, unknown>
  createdAt: string
}

/**
 * Subscribes to the `ticket-activity:{ticketId}` broadcast channel.
 * The server broadcasts one event per ActivityLog write via appendTicketEvent(),
 * so every field change, comment, co-assignee add/remove, etc. arrives here in
 * real-time without WAL polling or table-level publications.
 */
export function createTicketActivitySubscription(
  supabase: SupabaseLike,
  ticketId: string,
  onActivity: (event: TicketActivityEvent) => void,
): () => void {
  // Broadcast delivery matches on the channel name (= topic). Unlike
  // postgres_changes channels, appending :seq:attempt here would make the name
  // diverge from the server's broadcast topic and messages would never arrive.
  const topic = `ticket-activity:${ticketId}`;
  return autoReconnect((onStatus) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase.channel(topic) as any;
    channel.on("broadcast", { event: "activity_added" }, ({ payload }: { payload: TicketActivityEvent }) => {
      onActivity(payload);
    });
    channel.subscribe((status: string, err?: Error) => {
      logStatus(topic, status, err);
      onStatus(status, err);
    });
    return () => supabase.removeChannel(channel);
  });
}
