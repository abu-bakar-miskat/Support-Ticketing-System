/** Notifies open project views when enabled boards change (add/remove). */
export async function broadcastProjectBoardsChange(projectId: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
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
            topic: `project-boards:${projectId}`,
            event: "boards_changed",
            payload: {},
            private: false,
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[project-boards broadcast] failed:", err);
  }
}
