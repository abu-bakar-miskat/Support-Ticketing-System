import "server-only";

/**
 * Shared server → Supabase Realtime Broadcast sender (same REST call used by
 * lib/notify.ts and the join_request_resolved broadcast) — no channel setup
 * required client-side beyond subscribing to the topic.
 */
async function broadcast(messages: { topic: string; event: string; payload: unknown }[]): Promise<void> {
  if (messages.length === 0) return;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({ ...m, private: false })),
    }),
  }).catch(() => undefined);
}

/**
 * SA-03: pushed to the same `user-notifs:{userId}` channel already mounted
 * once per session by NotificationsRealtime — an already-open tab signs
 * itself out near-instantly on receipt. The client-side ~25s status poll
 * (see /api/session/status) is the guaranteed fallback for a socket that's
 * disconnected or reconnecting when this fires.
 */
export function broadcastForceLogout(userIds: string[], reason: string): Promise<void> {
  return broadcast(
    userIds.map((userId) => ({
      topic: `user-notifs:${userId}`,
      event: "force_logout",
      payload: { reason },
    })),
  );
}

/**
 * Fires when a new inbound email lands at a connected mailbox — either opening
 * a ticket or threading a reply onto an existing one. The Received-mail panel
 * (department- and sub-department-scoped) subscribes to these topics and
 * refetches so newly arrived mail shows up without a manual reload.
 *
 * Broadcasts to both the department- and sub-department-scoped topics so
 * whichever panel is open updates. Channel names must match the topic exactly
 * (see createMailboxMailSubscription).
 */
export function broadcastMailboxMail(
  departmentId: string,
  subDepartmentId: string,
): Promise<void> {
  return broadcast([
    { topic: `mailbox-mail:dept:${departmentId}`, event: "mail_received", payload: {} },
    { topic: `mailbox-mail:subdept:${subDepartmentId}`, event: "mail_received", payload: {} },
  ]);
}
