import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    agreement: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    agreementDocument: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    tenant: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }))

import { prisma } from "@/lib/db"
import { recordAuditEvent } from "@/lib/audit-log"
import { createNotification } from "@/lib/notify"
import {
  createAgreement,
  updateAgreement,
  addAgreementDocument,
  deleteAgreementDocument,
  listTenantAgreementSummaries,
  sweepAgreementReminders,
} from "./agreements"

const mockCreate = vi.mocked(prisma.agreement.create)
const mockFindFirst = vi.mocked(prisma.agreement.findFirst)
const mockFindMany = vi.mocked(prisma.agreement.findMany)
const mockUpdate = vi.mocked(prisma.agreement.update)
const mockDocCreate = vi.mocked(prisma.agreementDocument.create)
const mockDocFindFirst = vi.mocked(prisma.agreementDocument.findFirst)
const mockDocDelete = vi.mocked(prisma.agreementDocument.delete)
const mockTenantFindMany = vi.mocked(prisma.tenant.findMany)
const mockProfileFindMany = vi.mocked(prisma.profile.findMany)
const mockRecordAuditEvent = vi.mocked(recordAuditEvent)
const mockCreateNotification = vi.mocked(createNotification)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createAgreement — SA-02", () => {
  it("creates the row and records an audit event, no billing fields involved", async () => {
    mockCreate.mockResolvedValue({ id: "a1", tenantId: "t1" } as never)
    const result = await createAgreement({
      tenantId: "t1",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      actorId: "u1",
    })
    expect(result).toEqual({ id: "a1", tenantId: "t1" })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          renewalStatus: "ACTIVE",
          reminderDaysBefore: [60, 30, 7],
          createdById: "u1",
        }),
      }),
    )
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "AGREEMENT_CREATED", targetType: "Agreement" }),
    )
  })
})

describe("updateAgreement", () => {
  it("returns null when the agreement doesn't belong to the tenant", async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await updateAgreement({ id: "a1", tenantId: "t1", actorId: "u1", renewalStatus: "EXPIRED" })
    expect(result).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("resets the reminder ledger when endDate changes", async () => {
    mockFindFirst.mockResolvedValue({ id: "a1", tenantId: "t1" } as never)
    mockUpdate.mockResolvedValue({ id: "a1" } as never)
    await updateAgreement({ id: "a1", tenantId: "t1", actorId: "u1", endDate: new Date("2027-01-01") })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sentReminderDays: [] }) }),
    )
  })

  it("does not touch sentReminderDays when only renewalStatus changes", async () => {
    mockFindFirst.mockResolvedValue({ id: "a1", tenantId: "t1" } as never)
    mockUpdate.mockResolvedValue({ id: "a1" } as never)
    await updateAgreement({ id: "a1", tenantId: "t1", actorId: "u1", renewalStatus: "RENEWED" })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { renewalStatus: "RENEWED" } }),
    )
  })
})

describe("agreement documents", () => {
  it("addAgreementDocument returns null for a foreign agreementId/tenantId pair", async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await addAgreementDocument({
      agreementId: "a1",
      tenantId: "t1",
      storageUrl: "https://x/y",
      fileName: "f.pdf",
      fileSize: 10,
      actorId: "u1",
    })
    expect(result).toBeNull()
    expect(mockDocCreate).not.toHaveBeenCalled()
  })

  it("addAgreementDocument creates the row and audits it when the agreement is in scope", async () => {
    mockFindFirst.mockResolvedValue({ id: "a1" } as never)
    mockDocCreate.mockResolvedValue({ id: "d1" } as never)
    const result = await addAgreementDocument({
      agreementId: "a1",
      tenantId: "t1",
      storageUrl: "https://x/y",
      fileName: "f.pdf",
      fileSize: 10,
      actorId: "u1",
    })
    expect(result).toEqual({ id: "d1" })
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "AGREEMENT_DOCUMENT_ADDED" }),
    )
  })

  it("deleteAgreementDocument returns false when not found in tenant scope", async () => {
    mockDocFindFirst.mockResolvedValue(null)
    const result = await deleteAgreementDocument({ documentId: "d1", tenantId: "t1", actorId: "u1" })
    expect(result).toBe(false)
    expect(mockDocDelete).not.toHaveBeenCalled()
  })
})

describe("listTenantAgreementSummaries — SA-05", () => {
  it("maps active-membership count and the latest agreement term per tenant", async () => {
    mockTenantFindMany.mockResolvedValue([
      {
        id: "t1",
        name: "Acme",
        status: "active",
        _count: { departments: 3 },
        memberships: [{ id: "m1" }, { id: "m2" }],
        agreements: [{ endDate: new Date("2026-12-31"), renewalStatus: "ACTIVE" }],
      },
      {
        id: "t2",
        name: "Beta",
        status: "active",
        _count: { departments: 1 },
        memberships: [],
        agreements: [],
      },
    ] as never)

    const rows = await listTenantAgreementSummaries()
    expect(rows).toEqual([
      {
        tenantId: "t1",
        tenantName: "Acme",
        tenantStatus: "active",
        agreementEndDate: new Date("2026-12-31"),
        renewalStatus: "ACTIVE",
        departmentCount: 3,
        activeUserCount: 2,
      },
      {
        tenantId: "t2",
        tenantName: "Beta",
        tenantStatus: "active",
        agreementEndDate: null,
        renewalStatus: null,
        departmentCount: 1,
        activeUserCount: 0,
      },
    ])
  })
})

describe("sweepAgreementReminders — SA-06", () => {
  const now = new Date("2026-08-18T00:00:00.000Z")

  it("notifies every super admin once a reminder day is reached and records it in the ledger", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "a1",
        tenantId: "t1",
        endDate: new Date("2026-09-17T00:00:00.000Z"), // 30 days out
        reminderDaysBefore: [60, 30, 7],
        sentReminderDays: [],
        tenant: { name: "Acme" },
      },
    ] as never)
    mockProfileFindMany.mockResolvedValue([{ id: "sa1" }, { id: "sa2" }] as never)
    mockUpdate.mockResolvedValue({} as never)

    const notified = await sweepAgreementReminders(now)

    expect(notified).toBe(1)
    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "sa1", type: "agreement_expiring" }),
    )
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { sentReminderDays: { push: 30 } },
    })
  })

  it("does not re-fire a reminder day already recorded in sentReminderDays", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "a1",
        tenantId: "t1",
        endDate: new Date("2026-09-17T00:00:00.000Z"),
        reminderDaysBefore: [60, 30, 7],
        sentReminderDays: [60, 30],
        tenant: { name: "Acme" },
      },
    ] as never)
    mockProfileFindMany.mockResolvedValue([{ id: "sa1" }] as never)

    const notified = await sweepAgreementReminders(now)

    expect(notified).toBe(0)
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("short-circuits with zero when there are no super admins", async () => {
    mockFindMany.mockResolvedValue([{ id: "a1" }] as never)
    mockProfileFindMany.mockResolvedValue([])

    const notified = await sweepAgreementReminders(now)

    expect(notified).toBe(0)
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})
