import type {
  TicketDetailProps,
  SubTicketData,
  CommentData,
  ActivityData,
} from "@/components/tickets/ticket-detail-page";
import type { SubDepartmentStatusConfig } from "@/components/board/board-types";

export type { TicketDetailProps, SubTicketData, CommentData, ActivityData };

export type CreateTicketBody = {
  title: string;
  type?: string;
  priority: string;
  status?: string;
  projectId: string;
  assigneeId?: string;
  startDate?: string;
  dueDate?: string;
  parentId?: string;
  subDepartmentId?: string;
};

export type UpdateTicketBody = {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  moduleId?: string | null;
  sprintId?: string | null;
  parentId?: string | null;
  [key: string]: unknown;
};

export type ProjectTicketSummary = {
  id: string;
  title: string;
  ticketNumber: number;
  status: string;
  priority: string;
  parentId: string | null;
  assignee: { name: string; avatarUrl: string | null } | null;
  subDepartment: { prefix: string };
};

export type MoveTicketBody = {
  status: string
  chosenLabel?: string
}

export type AddCommentBody = {
  body: string;
  parentId?: string;
  attachments?: string[];
  hasAttachment?: boolean;
};

function combineAbortSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal | undefined {
  const active = signals.filter((s): s is AbortSignal => !!s);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

export async function getTicketDetail(
  id: string,
  signal?: AbortSignal,
): Promise<TicketDetailProps> {
  // Detail payloads can take 10–15s under load; a 12s cap caused false failures.
  // Still bound hung PWA fetches with a generous timeout.
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(45_000)
      : undefined;

  const res = await fetch(`/api/tickets/${id}/detail`, {
    signal: combineAbortSignals(signal, timeoutSignal),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to fetch ticket detail");
  }
  return res.json();
}

export async function createTicket(body: CreateTicketBody) {
  const res = await fetch("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create ticket");
  return res.json();
}

export async function updateTicket(id: string, body: UpdateTicketBody) {
  const res = await fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? "Failed to update ticket");
  }
}

export async function listProjectTickets(
  projectId: string,
): Promise<ProjectTicketSummary[]> {
  const res = await fetch(`/api/tickets?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error("Failed to load tickets");
  return res.json();
}

async function isTicketDeleted(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/tickets/${id}/detail`);
    return res.status === 404;
  } catch {
    return false;
  }
}

export async function deleteTicket(id: string) {
  try {
    const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (res.ok) return;
    if (await isTicketDeleted(id)) return;
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to delete ticket");
  } catch (err) {
    // Realtime router.refresh() can abort the DELETE fetch after the DB commit.
    if (await isTicketDeleted(id)) return;
    if (err instanceof Error) throw err;
    throw new Error("Failed to delete ticket");
  }
}

export class MoveTicketError extends Error {
  constructor(public readonly apiError: string, message: string) {
    super(message)
  }
}

export async function moveTicket(id: string, body: MoveTicketBody) {
  const res = await fetch(`/api/tickets/${id}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new MoveTicketError(json.error ?? "", "Failed to move ticket");
  }
  // Auto-start/stop runs in after() on the server — refresh the global timer shortly after
  if (typeof window !== "undefined") {
    const { useTimerStore } = await import("@/store")
    window.setTimeout(() => {
      void useTimerStore.getState().syncFromServer()
    }, 400)
  }
}

export async function addComment(ticketId: string, body: AddCommentBody) {
  const res = await fetch(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to add comment");
  return res.json();
}

export async function sendCustomerMessage(ticketId: string, body: string, attachmentIds: string[] = []) {
  const res = await fetch(`/api/tickets/${ticketId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, attachmentIds }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to send reply");
  }
  return res.json();
}

export async function updateTicketAssignee(
  ticketId: string,
  assigneeId: string | null,
) {
  const res = await fetch(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigneeId }),
  });
  if (!res.ok) throw new Error("Failed to update assignee");
}

export async function addCoAssignee(ticketId: string, userId: string) {
  const res = await fetch(`/api/tickets/${ticketId}/assignees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to add co-assignee");
}

export async function getComment(commentId: string): Promise<CommentData> {
  const res = await fetch(`/api/comments/${commentId}`);
  if (!res.ok) throw new Error("Failed to fetch comment");
  return res.json();
}

export async function removeCoAssignee(ticketId: string, userId: string) {
  const res = await fetch(`/api/tickets/${ticketId}/assignees`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to remove co-assignee");
}

export async function setPersonalEstimate(
  ticketId: string,
  input: { userId?: string; estimatedMinutes: number | null; targetDate: string | null },
) {
  const res = await fetch(`/api/tickets/${ticketId}/estimates`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? "Failed to save estimate");
  }
}

export async function clearPersonalEstimate(ticketId: string, userId?: string) {
  const res = await fetch(`/api/tickets/${ticketId}/estimates`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to clear estimate");
}

export async function addQaAssignee(ticketId: string, userId: string) {
  const res = await fetch(`/api/tickets/${ticketId}/qa-assignees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to add QA assignee");
}

export async function removeQaAssignee(ticketId: string, userId: string) {
  const res = await fetch(`/api/tickets/${ticketId}/qa-assignees`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error("Failed to remove QA assignee");
}
