import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), assertTicketAccess: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/db", () => ({ prisma: { ticket: { findUnique: vi.fn() } } }))
vi.mock("@/lib/request-scope", () => ({ runAsSystem: (fn: () => unknown) => fn() }))
vi.mock("@/lib/manual-resolution", () => ({ getManualResolutionView: vi.fn().mockResolvedValue({ estimatedMins: 5, trackedSecs: 496 }) }))
vi.mock("@/lib/mailbox-sla-recovery", () => ({ recoverMailboxSla: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/sla-engine", () => ({ getSlaIndicatorViewForTicket: vi.fn() }))
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getManualResolutionView } from "@/lib/manual-resolution"
import { recoverMailboxSla } from "@/lib/mailbox-sla-recovery"
import { getSlaIndicatorViewForTicket } from "@/lib/sla-engine"
import { GET } from "./route"
const request = new NextRequest("http://localhost/api/tickets/manual-1/sla")
const context = { params: Promise.resolve({ id: "manual-1" }) }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ id: "manual-1", tenantId: "tenant-1", subDepartment: { departmentId: "dept-1" } } as never)
})
it.each([
  { isSuperAdmin: true, role: "admin" },
  { role: "manager", tenantMemberships: [{ tenantId: "tenant-1", role: "manager" }] },
  { role: "manager", managedDepartmentIds: ["dept-1"] },
])("includes resolution overview details for authorized manager/admin %j", async (profile) => {
  vi.mocked(requireAuth).mockResolvedValue({ profile, error: null } as never)
  const response = await GET(request, context)
  expect(response.status).toBe(200)
  expect(getManualResolutionView).toHaveBeenCalledWith("manual-1", expect.any(Date), true)
  expect(await response.json()).toMatchObject({ indicator: null, manualResolution: { estimatedMins: 5, trackedSecs: 496 } })
})
it("does not grant details from a manager role in another tenant", async () => {
  vi.mocked(requireAuth).mockResolvedValue({ profile: { role: "manager", tenantMemberships: [{ tenantId: "tenant-2", role: "manager" }] }, error: null } as never)
  await GET(request, context)
  expect(getManualResolutionView).toHaveBeenCalledWith("manual-1", expect.any(Date), false)
})
it("retains the existing ticket-access gate before reading SLA details", async () => {
  vi.mocked(requireAuth).mockResolvedValue({ profile: { role: "agent" }, error: null } as never)
  vi.mocked(assertTicketAccess).mockResolvedValueOnce(new Response(null, { status: 403 }) as never)
  expect((await GET(request, context)).status).toBe(403)
  expect(getManualResolutionView).not.toHaveBeenCalled()
  expect(recoverMailboxSla).not.toHaveBeenCalled()
})

it("recovers mailbox targets before returning the manager overview", async () => {
  vi.mocked(requireAuth).mockResolvedValue({ profile: { isSuperAdmin: true, role: "admin" }, error: null } as never)
  vi.mocked(getManualResolutionView).mockResolvedValueOnce(null)
  vi.mocked(getSlaIndicatorViewForTicket).mockResolvedValueOnce({ source: "mailbox", details: { firstResponseTargetMins: 60, resolutionTargetMins: 120 } } as never)
  const response = await GET(request, context)
  expect(recoverMailboxSla).toHaveBeenCalledWith("manual-1")
  expect(getSlaIndicatorViewForTicket).toHaveBeenCalledWith("manual-1", expect.any(Date), { includeDetails: true })
  expect(vi.mocked(recoverMailboxSla).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getSlaIndicatorViewForTicket).mock.invocationCallOrder[0])
  expect(await response.json()).toMatchObject({ indicator: { source: "mailbox", details: { firstResponseTargetMins: 60, resolutionTargetMins: 120 } } })
})
