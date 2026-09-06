import { beforeEach, describe, expect, it, vi } from "vitest"
import { getRequestScope } from "@/lib/request-scope"

const m = vi.hoisted(() => ({
  auth: vi.fn(), scope: vi.fn(), projectScope: vi.fn(), subScope: vi.fn(), deptScope: vi.fn(),
  setup: vi.fn(), after: vi.fn(), email: vi.fn(), notify: vi.fn(), event: vi.fn(), members: vi.fn(),
  ticket: { create: vi.fn(), findUnique: vi.fn() }, project: { findUnique: vi.fn() },
  subDepartment: { findUnique: vi.fn() }, profile: { findUnique: vi.fn(), findMany: vi.fn() },
  attachment: { updateMany: vi.fn() }, transaction: vi.fn(),
}))
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: m.after }))
vi.mock("@/lib/db", () => ({ prisma: { ticket: m.ticket, project: m.project, subDepartment: m.subDepartment,
  profile: m.profile, attachment: m.attachment, $transaction: m.transaction } }))
vi.mock("@/lib/auth", () => ({ requireAuth: m.auth, assertTicketEditAccess: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/prisma-scope", () => ({ resolveProfileTicketScope: m.scope }))
vi.mock("@/lib/dept-scope", () => ({ projectInScope: m.projectScope, subDepartmentInScope: m.subScope, getProfileDeptScope: m.deptScope }))
vi.mock("@/lib/cross-access", () => ({
  resolveSubDepartmentIdForProject: vi.fn().mockResolvedValue("sub-1"),
  resolveBoardSubDepartmentForProjectTicket: vi.fn().mockResolvedValue("sub-1"),
  isProjectMember: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/lib/department-setup", () => ({ assertDepartmentOperational: m.setup }))
vi.mock("@/lib/misc-project", () => ({ resolveMiscProjectForSubDepartment: vi.fn().mockResolvedValue("misc-1") }))
vi.mock("@/lib/ensure-project-members", () => ({ ensureProjectMembers: m.members }))
vi.mock("@/lib/email", () => ({ sendAssignmentEmail: m.email }))
vi.mock("@/lib/notify", () => ({ createNotification: m.notify }))
vi.mock("@/lib/ticket-events", () => ({ appendTicketEvent: m.event }))
vi.mock("@/lib/sla-engine", () => ({ startSlaTimers: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/rule-executor", () => ({ applyRulesToTicket: vi.fn().mockResolvedValue(undefined) }))
import { POST } from "./route"

const profile = { id: "user-1", name: "Creator", role: "agent", tenantIds: ["tenant-1"],
  subDepartmentId: "sub-1", subDepartmentIds: ["sub-1"], memberships: [] }
const created = { id: "ticket-1", title: "Fix login", ticketNumber: 7, status: "To Do", createdAt: new Date(),
  assignee: { id: "user-1", name: "Creator", email: "creator@example.test" },
  subDepartment: { id: "sub-1", prefix: "DEV", departmentId: "dept-1" }, project: { id: "project-1", name: "Project" } }
const valid = { title: "Fix login", priority: "High", projectId: "project-1" }
const request = (body: unknown) => new Request("http://localhost/api/tickets", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
})
const tx = { ticket: m.ticket, attachment: m.attachment }

beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ profile, error: null })
  m.scope.mockResolvedValue({ kind: "tenant", tenantIds: ["tenant-1"], subDepartmentTeamIds: ["sub-1"], grantedTicketIds: ["granted"] })
  m.projectScope.mockResolvedValue(true)
  m.subScope.mockResolvedValue(true)
  m.deptScope.mockResolvedValue({ activeDeptId: "dept-1", subDepartmentIds: ["sub-1"] })
  m.setup.mockResolvedValue({ ok: true })
  m.project.findUnique.mockResolvedValue({ kind: "standard", subDepartmentId: "sub-1", departmentId: "dept-1" })
  m.subDepartment.findUnique.mockResolvedValue({ id: "sub-1", departmentId: "dept-1", tenantId: "tenant-1" })
  m.profile.findUnique.mockResolvedValue({ id: "user-1" })
  m.profile.findMany.mockResolvedValue([{ id: "user-2", name: "Agent", email: "agent@example.test" }])
  m.ticket.create.mockResolvedValue(created)
  m.attachment.updateMany.mockResolvedValue({ count: 1 })
  m.transaction.mockImplementation(async fn => fn(tx))
  for (const fn of [m.members, m.event, m.notify, m.email]) fn.mockResolvedValue(undefined)
})

describe("POST /api/tickets", () => {
  it("returns the saved ticket without waiting for external delivery", async () => {
    const response = await POST(request(valid))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ id: "ticket-1", ticketNumber: 7 })
    expect(m.transaction).not.toHaveBeenCalled()
    expect(m.after).toHaveBeenCalledOnce()
    expect(m.email).not.toHaveBeenCalled()
    expect(m.event).not.toHaveBeenCalled()
    expect(response.headers.get("Server-Timing")).toMatch(/auth;dur=.*scope;dur=.*create;dur=/)
  })

  it("resolves scope once and preserves all restrictions, including in deferred work", async () => {
    m.ticket.create.mockImplementationOnce(async () => {
      expect(getRequestScope()).toEqual({ tenantIds: ["tenant-1"], isPlatformAdmin: false,
        subDepartmentTeamIds: ["sub-1"], grantedTicketIds: ["granted"] })
      return created
    })
    await POST(request(valid))
    expect(m.auth).toHaveBeenCalledOnce()
    expect(m.scope).toHaveBeenCalledExactlyOnceWith(profile)
    expect(getRequestScope()).toBeNull()
    m.event.mockImplementationOnce(async () => { expect(getRequestScope()?.tenantIds).toEqual(["tenant-1"]) })
    await m.after.mock.calls[0][0]()
    expect(getRequestScope()).toBeNull()
  })

  it("saves co-assignees, memberships and owned attachments in one transaction", async () => {
    const response = await POST(request({ ...valid, coAssigneeIds: ["user-1", "user-2", "user-2"], attachmentIds: ["upload-1", "upload-1"] }))
    expect(response.status).toBe(201)
    expect(m.transaction).toHaveBeenCalledOnce()
    expect(m.ticket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      tenant: { connect: { id: "tenant-1" } }, assignees: { createMany: { data: [{ userId: "user-2" }] } },
    }) }))
    expect(m.attachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["upload-1"] }, uploaderProfileId: "user-1", status: "temporary", ticketId: null },
      data: { ticketId: "ticket-1", status: "attached" },
    })
    expect(m.members).toHaveBeenCalledWith("project-1", ["user-1", "user-2"], tx)
    expect(m.email).not.toHaveBeenCalled()
    await m.after.mock.calls[0][0]()
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: "user-2" }))
    expect(m.members).toHaveBeenCalledOnce()
  })

  it("rejects ineligible co-assignees before saving", async () => {
    m.profile.findMany.mockResolvedValue([])
    expect((await POST(request({ ...valid, coAssigneeIds: ["outside"] }))).status).toBe(400)
    expect(m.profile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: { in: ["outside"] }, deletedAt: null, OR: expect.any(Array),
    }) }))
    expect(m.ticket.create).not.toHaveBeenCalled()
  })

  it("rejects the transaction when an upload is foreign, already claimed or missing", async () => {
    m.attachment.updateMany.mockResolvedValue({ count: 0 })
    let rejected = false
    m.transaction.mockImplementation(async fn => {
      try { return await fn(tx) } catch (error) { rejected = true; throw error }
    })
    expect((await POST(request({ ...valid, attachmentIds: ["foreign-upload"] }))).status).toBe(403)
    expect(rejected).toBe(true)
    expect(m.after).not.toHaveBeenCalled()
  })

  it("stores draft assignments without sending notifications", async () => {
    expect((await POST(request({ ...valid, isDraft: true, coAssigneeIds: ["user-2"] }))).status).toBe(201)
    await m.after.mock.calls[0][0]()
    expect(m.notify).not.toHaveBeenCalled()
    expect(m.email).not.toHaveBeenCalled()
  })

  it.each([{ title: "" }, { priority: "" }, { type: "Invalid" }, { priority: "Invalid" },
    { coAssigneeIds: "user-2" }, { attachmentIds: [null] }])("rejects invalid fields: %j", async fields => {
    expect((await POST(request({ ...valid, ...fields }))).status).toBe(400)
    expect(m.ticket.create).not.toHaveBeenCalled()
  })
  it("defaults omitted type to Task", async () => {
    expect((await POST(request(valid))).status).toBe(201)
    expect(m.ticket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "Task" }) }))
  })
  it("rejects unauthenticated requests", async () => {
    m.auth.mockResolvedValue({ profile: null, error: new Response(null, { status: 401 }) })
    expect((await POST(request(valid))).status).toBe(401)
    expect(m.scope).not.toHaveBeenCalled()
  })
  it("rejects inaccessible projects and sub-departments", async () => {
    m.projectScope.mockResolvedValue(false)
    m.subScope.mockResolvedValue(false)
    expect((await POST(request(valid))).status).toBe(403)
    expect(m.ticket.create).not.toHaveBeenCalled()
  })
  it("rejects missing projects", async () => {
    m.project.findUnique.mockResolvedValue(null)
    expect((await POST(request(valid))).status).toBe(400)
    expect(m.ticket.create).not.toHaveBeenCalled()
  })
  it("rejects support projects", async () => {
    m.project.findUnique.mockResolvedValue({ kind: "support", subDepartmentId: "sub-1", departmentId: "dept-1" })
    expect((await POST(request(valid))).status).toBe(403)
    expect(m.ticket.create).not.toHaveBeenCalled()
  })
  it("requires department setup", async () => {
    m.setup.mockResolvedValue({ ok: false, error: "Setup required" })
    expect((await POST(request(valid))).status).toBe(422)
    expect(m.ticket.create).not.toHaveBeenCalled()
  })
  it("rejects missing primary assignees", async () => {
    m.profile.findUnique.mockResolvedValue(null)
    expect((await POST(request(valid))).status).toBe(400)
    expect(m.ticket.create).not.toHaveBeenCalled()
  })
  it("sends primary assignment email after responding", async () => {
    m.ticket.create.mockResolvedValue({ ...created, assignee: { id: "user-2", name: "Agent", email: "agent@example.test" } })
    await POST(request({ ...valid, assigneeId: "user-2" }))
    expect(m.email).not.toHaveBeenCalled()
    await m.after.mock.calls[0][0]()
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: "user-2", humanId: "DEV-7" }))
  })
})
