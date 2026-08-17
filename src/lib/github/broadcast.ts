/**
 * Pushes a Supabase Realtime *broadcast* so any open ticket view refreshes its
 * Development section when a linked PR or commit changes.
 *
 * Broadcast (HTTP → /realtime/v1/api/broadcast) is used instead of
 * postgres_changes because it needs no publication / replication-slot setup and
 * is unaffected by the Realtime service's cached table list — the same reason
 * notify.ts uses it for notifications. Clients listen on `ticket-github:{id}`.
 */
export async function broadcastGithubChange(ticketIds: string[]): Promise<void> {
  const unique = [...new Set(ticketIds)]
  if (unique.length === 0) return

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return

  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: unique.map((ticketId) => ({
          topic: `ticket-github:${ticketId}`,
          event: "github_changed",
          payload: {},
          private: false,
        })),
      }),
    })
  } catch (err) {
    console.error("[github broadcast] failed:", err)
  }
}
