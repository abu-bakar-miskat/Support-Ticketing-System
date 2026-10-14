import type { NotificationBroadcastPayload } from "@/lib/realtime";

export function getNotificationHref(
  payload: Pick<
    NotificationBroadcastPayload,
    "type" | "ticketDbId" | "joinRequestId"
  >,
): string {
  if (payload.type === "feature_request_submitted") return "/platform/feature-approvals";
  if (payload.ticketDbId) return `/tickets/${payload.ticketDbId}`;
  if (payload.joinRequestId || payload.type === "join_request") {
    return "/settings/sub-departments";
  }
  return "/inbox";
}
