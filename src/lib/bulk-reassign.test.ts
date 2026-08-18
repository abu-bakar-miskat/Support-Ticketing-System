import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    team: { findMany: vi.fn(), update: vi.fn() },
    ticket: { findMany: vi.fn(), update: vi.fn() },
    bulkReassignJob: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}))
vi.mock("@/lib/rota", () => ({ getEligibleMembers: vi.fn() }))
vi.mock("@/lib/assignment-engine", () => ({
  autoAssignTicket: vi.fn(),
  recordAssignmentFailure: vi.fn(),
}))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ensure-project-members", () => ({ ensureProjectMembers: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from "@/lib/db"
import { getEligibleMembers } from "@/lib/rota"
import { autoAssignTicket, recordAssignmentFailure } from "@/lib/assignment-engine"
import { createBulkReassignJob, runBulkReassignJob, sweepStuckBulkReassignJobs } from "./bulk-reassign"

const mockTeamFindMany = vi.mocked(prisma.team.findMany)
const mockTeamUpdate = vi.mocked(prisma.team.update)
const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)
const mockTicketUpdate = vi.mocked(prisma.ticket.update)
const mockJobCreate = vi.mocked(prisma.bulkReassignJob.create)
const mockJobFindUnique = vi.mocked(prisma.bulkReassignJob.findUnique)
const mockJobUpdate = vi.mocked(prisma.bulkReassignJob.update)
const mockJobFindMany = vi.mocked(prisma.bulkReassignJob.findMany)
const mockActivityLogCreate = vi.mocked(prisma.activityLog.create)
const mockGetEligibleMembers = vi.mocked(getEligibleMembers)
const mockAutoAssign = vi.mocked(autoAssignTicket)
const mockRecordFailure = vi.mocked(recordAssignmentFailure)

beforeEach(() => {
  vi.clearAllMocks()
  mockJobFindUnique.mockResolvedValue(null as never)
  mockJobUpdate.mockResolvedValue({} as never)
  mockActivityLogCreate.mockResolvedValue({} as never)
})

describe("createBulkReassignJob", () => {
  it("snapshots the source agent's open tickets across the department's (or scoped) teams", async () => {
    mockTeamFindMany.mockResolvedValue([{ id: "team-1" }, { id: "team-2" }] as never)
    mockTicketFindMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never)
    mockJobCreate.mockResolvedValue({ id: "job-1" } as never)

    await createBulkReassignJob({
      tenantId: "tenant-1",
      departmentId: "dept-1",
      createdById: "admin-1",
      sourceAssigneeId: "agent-1",
      targetType: "SINGLE_AGENT",
      targetAgentId: "agent-2",
    })

    expect(mockTicketFindMany).toHaveBeenCalledWith({
      where: { assigneeId: "agent-1", teamId: { in: ["team-1", "team-2"] }, deletedAt: null, closedAt: null },
      select: { id: true },
    })
    expect(mockJobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticketIds: ["t1", "t2"], targetAgentId: "agent-2", targetTeamId: null }),
    })
  })

  it("snapshots no tickets when the department has no matching teams", async () => {
    mockTeamFindMany.mockResolvedValue([] as never)
    mockJobCreate.mockResolvedValue({ id: "job-1" } as never)

    await createBulkReassignJob({
      tenantId: "tenant-1",
      departmentId: "dept-1",
      createdById: "admin-1",
      sourceAssigneeId: "agent-1",
      targetType: "DEPARTMENT_POOL",
    })

    expect(mockTicketFindMany).not.toHaveBeenCalled()
    expect(mockJobCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ ticketIds: [] }) })
  })
})

const baseJob = {
  id: "job-1",
  tenantId: "tenant-1",
  departmentId: "dept-1",
  createdById: "admin-1",
  sourceAssigneeId: "agent-1",
  targetType: "SINGLE_AGENT" as const,
  targetAgentId: "agent-2",
  targetTeamId: null,
  status: "PENDING" as const,
  ticketIds: ["t1", "t2"],
  succeededTicketIds: [] as string[],
  startedAt: null,
}

describe("runBulkReassignJob", () => {
  it("is a no-op for an already-completed job", async () => {
    mockJobFindUnique.mockResolvedValue({ ...baseJob, status: "COMPLETED" } as never)
    await runBulkReassignJob("job-1")
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })

  it("skips tickets already in succeededTicketIds (idempotent retry)", async () => {
    mockJobFindUnique.mockResolvedValue({ ...baseJob, succeededTicketIds: ["t1"] } as never)
    mockTicketFindMany.mockResolvedValue([
      { id: "t2", title: "Second", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 2, team: { prefix: "SUP" } },
    ] as never)
    mockJobFindUnique.mockResolvedValueOnce({ ...baseJob, succeededTicketIds: ["t1"] } as never)
    mockJobFindUnique.mockResolvedValueOnce({ succeededTicketIds: ["t1", "t2"], ticketIds: ["t1", "t2"] } as never)

    await runBulkReassignJob("job-1")

    expect(mockTicketFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["t2"] } } }))
    expect(mockTicketUpdate).toHaveBeenCalledTimes(1)
  })

  it("SINGLE_AGENT assigns every remaining ticket to the target agent and logs + notifies changes", async () => {
    mockJobFindUnique.mockResolvedValueOnce(baseJob as never)
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", title: "One", teamId: "team-1", assigneeId: "agent-1", projectId: "proj-1", ticketNumber: 1, team: { prefix: "SUP" } },
      { id: "t2", title: "Two", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 2, team: { prefix: "SUP" } },
    ] as never)
    mockJobFindUnique.mockResolvedValueOnce({ succeededTicketIds: ["t1", "t2"], ticketIds: ["t1", "t2"] } as never)

    await runBulkReassignJob("job-1")

    expect(mockTicketUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { assigneeId: "agent-2" } })
    expect(mockTicketUpdate).toHaveBeenCalledWith({ where: { id: "t2" }, data: { assigneeId: "agent-2" } })
    expect(mockActivityLogCreate).toHaveBeenCalledTimes(2)
    expect(mockRecordFailure).not.toHaveBeenCalled()
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED", resultSummary: expect.objectContaining({ succeeded: 2, failed: 0 }) }),
      }),
    )
  })

  it("GROUP round-robins across the target team's eligible members", async () => {
    mockJobFindUnique.mockResolvedValueOnce({ ...baseJob, targetType: "GROUP", targetAgentId: null, targetTeamId: "team-2" } as never)
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", title: "One", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 1, team: { prefix: "SUP" } },
      { id: "t2", title: "Two", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 2, team: { prefix: "SUP" } },
      { id: "t3", title: "Three", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 3, team: { prefix: "SUP" } },
    ] as never)
    mockGetEligibleMembers.mockResolvedValue([{ userId: "m1" }, { userId: "m2" }] as never)
    mockJobFindUnique.mockResolvedValueOnce({ succeededTicketIds: ["t1", "t2", "t3"], ticketIds: ["t1", "t2", "t3"] } as never)

    await runBulkReassignJob("job-1")

    expect(mockTicketUpdate).toHaveBeenNthCalledWith(1, { where: { id: "t1" }, data: { assigneeId: "m1" } })
    expect(mockTicketUpdate).toHaveBeenNthCalledWith(2, { where: { id: "t2" }, data: { assigneeId: "m2" } })
    expect(mockTicketUpdate).toHaveBeenNthCalledWith(3, { where: { id: "t3" }, data: { assigneeId: "m1" } })
  })

  it("GROUP with no eligible members marks every ticket ASSIGNMENT_FAILED", async () => {
    mockJobFindUnique.mockResolvedValueOnce({ ...baseJob, targetType: "GROUP", targetAgentId: null, targetTeamId: "team-2" } as never)
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", title: "One", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 1, team: { prefix: "SUP" } },
    ] as never)
    mockGetEligibleMembers.mockResolvedValue([] as never)
    mockJobFindUnique.mockResolvedValueOnce({ succeededTicketIds: ["t1"], ticketIds: ["t1"] } as never)

    await runBulkReassignJob("job-1")

    expect(mockTicketUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { assigneeId: null } })
    expect(mockRecordFailure).toHaveBeenCalledWith("t1", "dept-1", "admin-1", "One", "SUP-1")
  })

  it("DEPARTMENT_POOL re-routes via autoAssignTicket and persists a returned rota pointer", async () => {
    mockJobFindUnique.mockResolvedValueOnce({ ...baseJob, targetType: "DEPARTMENT_POOL", targetAgentId: null } as never)
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", title: "One", teamId: "team-1", assigneeId: "agent-1", projectId: null, ticketNumber: 1, team: { prefix: "SUP" } },
    ] as never)
    mockAutoAssign.mockResolvedValue({ assigneeId: "agent-3", method: "ROUND_ROBIN", failed: false, nextRotaPointer: 4 } as never)
    mockJobFindUnique.mockResolvedValueOnce({ succeededTicketIds: ["t1"], ticketIds: ["t1"] } as never)

    await runBulkReassignJob("job-1")

    expect(mockAutoAssign).toHaveBeenCalledWith({
      departmentId: "dept-1",
      teamId: "team-1",
      formValues: {},
      excludeUserId: null,
    })
    expect(mockTeamUpdate).toHaveBeenCalledWith({ where: { id: "team-1" }, data: { rotaPointer: 4 } })
    expect(mockTicketUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { assigneeId: "agent-3" } })
  })

  it("continues past a per-ticket error and reports it in the result summary", async () => {
    mockJobFindUnique.mockResolvedValueOnce(baseJob as never)
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", title: "One", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 1, team: { prefix: "SUP" } },
      { id: "t2", title: "Two", teamId: "team-1", assigneeId: null, projectId: null, ticketNumber: 2, team: { prefix: "SUP" } },
    ] as never)
    mockTicketUpdate.mockRejectedValueOnce(new Error("db blip")).mockResolvedValueOnce({} as never)
    mockJobFindUnique.mockResolvedValueOnce({ succeededTicketIds: ["t2"], ticketIds: ["t1", "t2"] } as never)

    await runBulkReassignJob("job-1")

    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultSummary: expect.objectContaining({
            succeeded: 1,
            failed: 1,
            errors: [{ ticketId: "t1", error: "db blip" }],
          }),
        }),
      }),
    )
  })
})

describe("sweepStuckBulkReassignJobs", () => {
  it("resumes every pending or stale-running job", async () => {
    mockJobFindMany.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }] as never)
    mockJobFindUnique.mockResolvedValue({ ...baseJob, status: "COMPLETED" } as never)

    const count = await sweepStuckBulkReassignJobs()

    expect(count).toBe(2)
    expect(mockJobFindUnique).toHaveBeenCalledTimes(2)
  })
})
