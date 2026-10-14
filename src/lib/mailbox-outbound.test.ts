import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    mailboxConnection: { findFirst: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
    department: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/request-scope", () => ({ runAsSystem: (fn: () => unknown) => fn() }))
vi.mock("@/lib/mailbox-connection", () => ({
  pullContextFor: vi.fn(() => ({ credentials: { account: "a@x.com" }, saveCredentials: vi.fn() })),
}))
vi.mock("@/lib/mail-providers/m365-provider", () => ({ sendMimeAsMailbox: vi.fn() }))
vi.mock("@/lib/email-transport", () => ({
  isOutboundEmailDevMode: vi.fn(async () => false),
  sendOutboundEmail: vi.fn(async () => ({ ok: true, id: "mp-1", via: "mailpit" })),
}))

import { prisma } from "@/lib/db"
import { sendMimeAsMailbox } from "@/lib/mail-providers/m365-provider"
import { isOutboundEmailDevMode, sendOutboundEmail } from "@/lib/email-transport"
import { resolveReplyMailbox, resolveSenderMailbox, sendViaReplyMailbox } from "./mailbox-outbound"

const mockFindFirst = vi.mocked(prisma.mailboxConnection.findFirst)
const sub = { id: "mc-sub", address: "admissions@esl.ac.uk", credentialsRef: "enc" }
const dept = { id: "mc-dept", address: "support@esl.ac.uk", credentialsRef: "enc" }
const tenant = { id: "mc-tenant", address: "noreply@esl.ac.uk", credentialsRef: "enc" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.subDepartment.findUnique).mockResolvedValue({ departmentId: "dept-1", tenantId: "tenant-1" } as never)
  vi.mocked(prisma.department.findUnique).mockResolvedValue({ tenantId: "tenant-1" } as never)
})

describe("resolveReplyMailbox", () => {
  it("prefers the sub-department's own mailbox", async () => {
    mockFindFirst.mockResolvedValueOnce(sub as never)
    expect(await resolveReplyMailbox("dept-1", "sub-1")).toEqual(sub)
    expect(mockFindFirst).toHaveBeenCalledTimes(1)
    expect(mockFindFirst.mock.calls[0][0]?.where).toMatchObject({ scopeType: "SUB_DEPARTMENT", subDepartmentId: "sub-1" })
  })

  it("falls back to the department mailbox", async () => {
    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(dept as never)
    expect(await resolveReplyMailbox("dept-1", "sub-1")).toEqual(dept)
    expect(mockFindFirst.mock.calls[1][0]?.where).toMatchObject({ scopeType: "DEPARTMENT", departmentId: "dept-1" })
  })

  it("falls back to the tenant mailbox when neither the sub-department nor department has one", async () => {
    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(tenant as never)
    expect(await resolveReplyMailbox("dept-1", "sub-1")).toEqual(tenant)
    expect(mockFindFirst.mock.calls[2][0]?.where).toMatchObject({ scopeType: "TENANT", tenantId: "tenant-1" })
  })

  it("returns null when no mailbox is connected at any level (→ platform sender)", async () => {
    mockFindFirst.mockResolvedValue(null)
    expect(await resolveReplyMailbox("dept-1", "sub-1")).toBeNull()
  })

  it("uses the tenant mailbox for tenant-wide email with no department", async () => {
    mockFindFirst.mockResolvedValueOnce(tenant as never)
    expect(await resolveSenderMailbox({ tenantId: "tenant-1" })).toEqual(tenant)
    expect(mockFindFirst).toHaveBeenCalledTimes(1)
  })
})

describe("sendViaReplyMailbox", () => {
  const message = {
    from: "Abu Bakar (ESL Admissions) <noreply@platform.com>",
    to: "jane@example.com",
    subject: "Re: [SUP-42] Help",
    html: "<p>Hi</p>",
    text: "Hi",
    headers: { "In-Reply-To": "<orig@example.com>", References: "<orig@example.com>" },
  }

  it("sends MIME as the mailbox with its address as From and Reply-To and keeps threading headers", async () => {
    const result = await sendViaReplyMailbox(dept, message)
    expect(result).toMatchObject({ ok: true, fromEmail: "support@esl.ac.uk" })
    const mime = vi.mocked(sendMimeAsMailbox).mock.calls[0][1].toString()
    expect(mime).toMatch(/^From: "?Abu Bakar \(ESL Admissions\)"? <support@esl\.ac\.uk>/m)
    expect(mime).toMatch(/^Reply-To: support@esl\.ac\.uk/m)
    expect(mime).toMatch(/^In-Reply-To: <orig@example\.com>/m)
    expect(mime).toContain(`Message-ID: ${result.ok ? result.messageId : ""}`)
    expect(mime).not.toContain("noreply@platform.com")
  })

  it("routes to Mailpit in dev mode instead of the real mailbox", async () => {
    vi.mocked(isOutboundEmailDevMode).mockResolvedValueOnce(true)
    const result = await sendViaReplyMailbox(dept, message)
    expect(result.ok).toBe(true)
    expect(sendMimeAsMailbox).not.toHaveBeenCalled()
    expect(sendOutboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "Abu Bakar (ESL Admissions) <support@esl.ac.uk>",
      replyTo: "support@esl.ac.uk",
    }))
  })

  it("reports a Graph failure instead of throwing", async () => {
    vi.mocked(sendMimeAsMailbox).mockRejectedValueOnce(new Error("Couldn't send as support@esl.ac.uk: Access denied"))
    expect(await sendViaReplyMailbox(dept, message)).toEqual({
      ok: false,
      error: "Couldn't send as support@esl.ac.uk: Access denied",
    })
  })
})
