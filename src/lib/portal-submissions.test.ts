import { describe, expect, it } from "vitest"
import { latestPortalActivityAt, toSubmissionJson } from "./portal-submissions"

describe("portal submission presentation", () => {
  it("returns the tracking fields required by the external portal", () => {
    const updatedAt = new Date("2026-10-06T10:00:00.000Z")
    const activityAt = new Date("2026-10-06T10:05:00.000Z")

    const result = toSubmissionJson({
      id: "submission-1",
      submitterName: "Amira Khan",
      submitterEmail: "amira@example.com",
      responses: [{ fieldId: "field-1", value: "Help" }, { _ikey: "secret" }],
      createdAt: new Date("2026-10-06T09:00:00.000Z"),
      formConfig: { id: "form-1", name: "Customer support" },
      ticket: {
        id: "ticket-1",
        ticketNumber: 184,
        title: "Unable to access my account",
        category: "TechnicalIssue",
        status: "In Progress",
        updatedAt,
        subDepartment: {
          id: "sub-1",
          name: "Service Desk",
          prefix: "IT",
          department: { id: "dept-1", name: "Technical Support" },
        },
        activityLogs: [{ createdAt: activityAt }],
      },
    })

    expect(result.responses).toEqual([{ fieldId: "field-1", value: "Help" }])
    expect(result.ticket).toMatchObject({
      reference: "IT-184",
      category: "TechnicalIssue",
      department: { id: "dept-1", name: "Technical Support" },
      subDepartment: { id: "sub-1", name: "Service Desk" },
      updatedAt,
      lastActivityAt: activityAt,
    })
  })

  it("uses the ticket timestamp when there is no newer activity", () => {
    const updatedAt = new Date("2026-10-06T10:00:00.000Z")
    expect(latestPortalActivityAt(updatedAt, new Date("2026-10-06T09:00:00.000Z"))).toBe(updatedAt)
    expect(latestPortalActivityAt(updatedAt)).toBe(updatedAt)
  })
})
