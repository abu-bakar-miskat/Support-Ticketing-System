/** Notifies open project views when project fields (status, lifecycle, etc.) change. */
export async function broadcastProjectChange(projectId: string): Promise<void> {
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
            topic: `project:${projectId}`,
            event: "project_changed",
            payload: {},
            private: false,
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[project broadcast] failed:", err);
  }
}
