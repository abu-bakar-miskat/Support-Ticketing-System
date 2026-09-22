import { describe, expect, it } from "vitest"
import { templateRequestReviewedMessage } from "./template-request-messages"

describe("templateRequestReviewedMessage", () => {
  it("tells the tenant admin an approval activated the template", () => {
    expect(templateRequestReviewedMessage("Support", "APPROVED")).toBe(
      'Your request for the "Support" template was approved. It is now active for your organization.',
    )
  })

  it("includes the rejection reason", () => {
    expect(templateRequestReviewedMessage("Support", "REJECTED", "Not in contract")).toBe(
      'Your request for the "Support" template was rejected. Reason: Not in contract',
    )
  })
})
