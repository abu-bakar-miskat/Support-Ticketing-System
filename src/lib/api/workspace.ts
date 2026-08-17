export type UpdateWorkspaceBody = Record<string, unknown>

export async function updateWorkspace(body: UpdateWorkspaceBody) {
  const res = await fetch("/api/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update workspace")
  return res.json()
}
