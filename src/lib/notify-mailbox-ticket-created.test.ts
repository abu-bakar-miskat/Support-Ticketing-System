import { beforeEach, expect, it, vi } from "vitest"
vi.mock("@/lib/db", () => ({ prisma: {
  notification: { findFirst: vi.fn().mockResolvedValue(null) }, departmentManager: { findMany: vi.fn() }, tenantMembership: { findMany: vi.fn() }, mailboxConnection: { findFirst: vi.fn() },
} }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import { notifyMailboxTicketCreated } from "./notify-mailbox-ticket-created"
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.departmentManager.findMany).mockResolvedValue([{ userId: "dept-manager" }, { userId: "both" }] as never)
  vi.mocked(prisma.tenantMembership.findMany).mockResolvedValue([{ userId: "tenant-manager" }, { userId: "both" }] as never)
  vi.mocked(prisma.mailboxConnection.findFirst).mockResolvedValue({ address: "support@example.test" } as never)
})
it("notifies department/active tenant managers once with a source and linked ticket", async () => {
  await notifyMailboxTicketCreated({ ticketId: "ticket-1", tenantId: "tenant-1", departmentId: "dept-1", mailboxConnectionId: "mailbox-1" })
  expect(prisma.tenantMembership.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", role: { in: ["admin", "manager"] }, isActive: true }, select: { userId: true } })
  expect(createNotification).toHaveBeenCalledTimes(3)
  expect(createNotification).toHaveBeenCalledWith({ recipientId: "both", type: "intake_manager_alert", ticketId: "ticket-1", message: "shared mailbox support@example.test" })
})
it("delivers a useful source label when the connection is unavailable", async () => {
  await notifyMailboxTicketCreated({ ticketId: "ticket-1", tenantId: "tenant-1", departmentId: "dept-1" })
  expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ message: "shared mailbox" }))
  expect(prisma.mailboxConnection.findFirst).not.toHaveBeenCalled()
})

it("does not duplicate arrival alerts persisted by the shared database", async () => {
  vi.mocked(prisma.notification.findFirst).mockResolvedValue({ id: "persisted" } as never)
  await notifyMailboxTicketCreated({ ticketId: "ticket-1", tenantId: "tenant-1", departmentId: "dept-1" })
  expect(createNotification).not.toHaveBeenCalled()
})
