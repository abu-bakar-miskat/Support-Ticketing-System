import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: { department: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock("@/lib/tenant-config", () => ({ tenantEmailConfigForDepartment: vi.fn().mockResolvedValue(null) }))

import { prisma } from "@/lib/db"
import {
  readIdentityOverride,
  saveDepartmentEmailSenders,
  resolveDepartmentSender,
  getDepartmentEmailIdentity,
} from "./email-config"

const mockFindUnique = vi.mocked(prisma.department.findUnique)
const mockUpdate = vi.mocked(prisma.department.update)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("readIdentityOverride — DS-02 multi-sender", () => {
  it("returns senders as-is when exactly one is marked default", () => {
    const result = readIdentityOverride({
      identity: {
        senders: [
          { id: "s1", name: "Support", email: "support@x.com", isDefault: true },
          { id: "s2", name: "Billing", email: "billing@x.com", isDefault: false },
        ],
      },
    })
    expect(result.senders).toHaveLength(2)
    expect(result.fromEmail).toBe("support@x.com")
    expect(result.fromName).toBe("Support")
  })

  it("promotes the first sender to default when none are marked", () => {
    const result = readIdentityOverride({
      identity: { senders: [{ id: "s1", name: "A", email: "a@x.com" }, { id: "s2", name: "B", email: "b@x.com" }] },
    })
    expect(result.senders?.find((s) => s.isDefault)?.id).toBe("s1")
  })

  it("collapses multiple defaults to just the first one marked", () => {
    const result = readIdentityOverride({
      identity: {
        senders: [
          { id: "s1", name: "A", email: "a@x.com", isDefault: true },
          { id: "s2", name: "B", email: "b@x.com", isDefault: true },
        ],
      },
    })
    expect(result.senders?.filter((s) => s.isDefault)).toHaveLength(1)
    expect(result.senders?.find((s) => s.isDefault)?.id).toBe("s1")
  })

  it("falls back to legacy fromName/fromEmail as a single synthesized default sender", () => {
    const result = readIdentityOverride({ identity: { fromName: "Legacy", fromEmail: "legacy@x.com" } })
    expect(result.senders).toEqual([{ id: "legacy", name: "Legacy", email: "legacy@x.com", isDefault: true }])
    expect(result.fromEmail).toBe("legacy@x.com")
  })

  it("returns nothing when there is no identity override at all", () => {
    expect(readIdentityOverride({})).toEqual({})
    expect(readIdentityOverride(null)).toEqual({})
  })
})

describe("saveDepartmentEmailSenders", () => {
  it("normalizes, lowercases emails, and ensures exactly one default", async () => {
    mockFindUnique.mockResolvedValue({ emailConfig: null } as never)
    mockUpdate.mockResolvedValue({} as never)

    const result = await saveDepartmentEmailSenders("dept-1", [
      { name: "Support", email: "Support@X.com" },
      { name: "Billing", email: "billing@x.com", isDefault: true },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].email).toBe("support@x.com")
    expect(result.filter((s) => s.isDefault)).toHaveLength(1)
    expect(result.find((s) => s.isDefault)?.email).toBe("billing@x.com")
  })

  it("drops legacy fromName/fromEmail so a later read can't resurrect a stale default", async () => {
    mockFindUnique.mockResolvedValue({ emailConfig: { identity: { fromName: "Old", fromEmail: "old@x.com" } } } as never)
    mockUpdate.mockResolvedValue({} as never)

    await saveDepartmentEmailSenders("dept-1", [{ name: "New", email: "new@x.com" }])

    const savedConfig = mockUpdate.mock.calls[0][0].data.emailConfig as { identity: Record<string, unknown> }
    expect(savedConfig.identity.fromName).toBeUndefined()
    expect(savedConfig.identity.fromEmail).toBeUndefined()
  })

  it("filters out senders with no email", async () => {
    mockFindUnique.mockResolvedValue({ emailConfig: null } as never)
    mockUpdate.mockResolvedValue({} as never)

    const result = await saveDepartmentEmailSenders("dept-1", [{ name: "No email", email: "" }])
    expect(result).toEqual([])
  })
})

describe("resolveDepartmentSender", () => {
  it("returns the explicitly requested sender when it exists", async () => {
    mockFindUnique.mockResolvedValue({
      emailConfig: {
        identity: {
          senders: [
            { id: "s1", name: "Support", email: "support@x.com", isDefault: true },
            { id: "s2", name: "Billing", email: "billing@x.com", isDefault: false },
          ],
        },
      },
    } as never)

    expect(await resolveDepartmentSender("dept-1", "s2")).toEqual({ name: "Billing", email: "billing@x.com" })
  })

  it("falls back to the default when the requested sender id doesn't exist", async () => {
    mockFindUnique.mockResolvedValue({
      emailConfig: { identity: { senders: [{ id: "s1", name: "Support", email: "support@x.com", isDefault: true }] } },
    } as never)

    expect(await resolveDepartmentSender("dept-1", "nope")).toEqual({ name: "Support", email: "support@x.com" })
  })

  it("returns null when the department has no senders configured", async () => {
    mockFindUnique.mockResolvedValue({ emailConfig: null } as never)
    expect(await resolveDepartmentSender("dept-1")).toBeNull()
  })
})

describe("getDepartmentEmailIdentity", () => {
  it("returns {} for a department with no emailConfig row", async () => {
    mockFindUnique.mockResolvedValue(undefined as never)
    expect(await getDepartmentEmailIdentity("dept-1")).toEqual({})
  })
})
