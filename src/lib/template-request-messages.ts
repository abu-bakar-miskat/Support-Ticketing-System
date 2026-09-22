/** In-app copy for a Super Admin decision on a template enablement request. */
export function templateRequestReviewedMessage(
  templateName: string,
  decision: "APPROVED" | "REJECTED",
  reviewNote?: string,
): string {
  if (decision === "APPROVED") {
    return `Your request for the "${templateName}" template was approved. It is now active for your organization.`
  }
  const reason = reviewNote?.trim()
  return reason
    ? `Your request for the "${templateName}" template was rejected. Reason: ${reason}`
    : `Your request for the "${templateName}" template was rejected.`
}
