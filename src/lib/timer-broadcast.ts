/** Push timer state changes to the user's Realtime channel (same pattern as notifications). */
export async function broadcastTimerChange(profileId: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return

  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `user-timer:${profileId}`,
          event: "timer_changed",
          payload: {},
          private: false,
        },
      ],
    }),
  }).catch(() => undefined)
}
