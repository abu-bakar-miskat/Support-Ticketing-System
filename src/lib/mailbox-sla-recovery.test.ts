import { beforeEach, expect, it, vi } from "vitest"
const m = vi.hoisted(() => ({ ticket: vi.fn(), origin: vi.fn(), timer: vi.fn(), update: vi.fn(), create: vi.fn(), lock: vi.fn(), prepare: vi.fn(), message: vi.fn(), mailbox: vi.fn() }))
vi.mock("@/lib/db", () => {
  const db = { ticket: { findUnique: m.ticket }, activityLog: { findFirst: m.origin }, ticketMessage: { findFirst: m.message }, mailboxConnection: { findFirst: m.mailbox }, slaTimer: { findUnique: m.timer, update: m.update, create: m.create }, $queryRaw: m.lock }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})
vi.mock("@/lib/sla-engine", () => ({ prepareMailboxSla: m.prepare }))
import { recoverMailboxSla } from "./mailbox-sla-recovery"
const createdAt = new Date("2026-10-09T14:29:05Z")
const ticket = { tenantId: "tenant-1", createdAt, assigneeId: "agent-1", subDepartmentId: "team-1", closedAt: null, deletedAt: null, isDraft: false, intake: null, subDepartment: { departmentId: "dept-1" }, slaTimer: { source: null } }
const plan = { tenantId: "tenant-1", source: "mailbox", firstResponseTargetMins: 60, resolutionTargetMins: 120, firstResponseStartedAt: createdAt, resolutionStartedAt: createdAt, mailboxConfig: { targetSource: "mailbox" } }
beforeEach(() => {
  vi.resetAllMocks()
  m.ticket.mockResolvedValue(ticket)
  m.origin.mockResolvedValue({ metadata: { source: "email", rawPayload: { mailboxConnectionId: "connection-1" } } })
  m.prepare.mockResolvedValue(plan)
  m.timer.mockResolvedValue({ source: null })
})
it("replaces legacy issue targets with mailbox targets without resetting clocks or history", async () => {
  await recoverMailboxSla("email-1")
  expect(m.prepare).toHaveBeenCalledWith("tenant-1", "dept-1", { mailboxConnectionId: "connection-1", subDepartmentId: "team-1", assigneeId: "agent-1", now: createdAt })
  expect(m.update).toHaveBeenCalledWith({ where: { ticketId: "email-1" }, data: { source: "mailbox", mailboxConfig: plan.mailboxConfig, policyId: null, firstResponseTargetMins: 60, resolutionTargetMins: 120 } })
  expect(m.create).not.toHaveBeenCalled()
})
it("creates a missing timer from the original ticket creation time", async () => {
  m.timer.mockResolvedValue(null)
  await recoverMailboxSla("email-1")
  expect(m.create).toHaveBeenCalledWith({ data: { ticketId: "email-1", ...plan } })
})
it.each([{ closedAt: createdAt }, { deletedAt: createdAt }, { isDraft: true }, { intake: { id: "intake-1" } }, { slaTimer: { source: "mailbox" } }])("leaves ineligible/history tickets untouched: %j", async (override) => {
  m.ticket.mockResolvedValue({ ...ticket, ...override })
  await recoverMailboxSla("email-1")
  expect(m.origin).not.toHaveBeenCalled()
  expect(m.update).not.toHaveBeenCalled()
})
it("does not turn manual tickets into mailbox tickets", async () => {
  m.origin.mockResolvedValue(null)
  await recoverMailboxSla("manual-1")
  expect(m.prepare).not.toHaveBeenCalled()
})
it("does not invent targets when no mailbox/department/tenant target is configured", async () => {
  m.prepare.mockResolvedValue(null)
  await recoverMailboxSla("email-1")
  expect(m.lock).not.toHaveBeenCalled()
})
it("leaves a timer repaired by another concurrent request untouched", async () => {
  m.timer.mockResolvedValue({ source: "mailbox" })
  await recoverMailboxSla("email-1")
  expect(m.update).not.toHaveBeenCalled()
  expect(m.create).not.toHaveBeenCalled()
})
it("rechecks completion after acquiring the ticket lock", async () => {
  m.ticket.mockResolvedValueOnce(ticket).mockResolvedValueOnce({ ...ticket, closedAt: createdAt })
  await recoverMailboxSla("email-1")
  expect(m.timer).not.toHaveBeenCalled()
  expect(m.update).not.toHaveBeenCalled()
})

it("uses the scoped legacy email envelope to recover per-mailbox overrides", async () => {
  m.origin.mockResolvedValue({ metadata: { source: "email" } })
  m.message.mockResolvedValue({ rawPayload: { to: ["Support <SUPPORT@example.com>"] } })
  m.mailbox.mockResolvedValue({ id: "legacy-mailbox" })
  await recoverMailboxSla("email-1")
  expect(m.mailbox).toHaveBeenCalledWith({ where: { tenantId: "tenant-1", departmentId: "dept-1", address: { in: ["support@example.com"] } }, select: { id: true } })
  expect(m.prepare).toHaveBeenCalledWith("tenant-1", "dept-1", expect.objectContaining({ mailboxConnectionId: "legacy-mailbox" }))
})
it("falls back to department/tenant defaults when legacy routing is absent", async () => {
  m.origin.mockResolvedValue({ metadata: { source: "email" } })
  m.message.mockResolvedValue(null)
  await recoverMailboxSla("email-1")
  expect(m.prepare).toHaveBeenCalledWith("tenant-1", "dept-1", expect.objectContaining({ mailboxConnectionId: null }))
})
