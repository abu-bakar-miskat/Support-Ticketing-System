import type { NotificationBroadcastPayload } from "@/lib/realtime";

export function getNotificationHref(
  payload: Pick<
    NotificationBroadcastPayload,
    "type" | "ticketDbId" | "joinRequestId"
  >,
): string {
  if (payload.ticketDbId) return `/tickets/${payload.ticketDbId}`;
  if (payload.joinRequestId || payload.type === "join_request") {
    return "/settings/teams";
  }
  return "/inbox";
}
