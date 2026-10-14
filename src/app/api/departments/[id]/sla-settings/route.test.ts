import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/dept-scope", () => ({ canAdminDeptSettings: vi.fn(() => true), departmentIdInScope: vi.fn(() => true) }))
vi.mock("@/lib/db", () => ({ prisma: {
  department: { findUnique: vi.fn(), update: vi.fn() },
  subDepartment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
} }))
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { GET, PATCH } from "./route"

const calendar = { timezone: "Europe/London", workingDays: [1, 2, 3, 4, 5], workStartTime: "08:30", workEndTime: "17:00" }
const request = (body: unknown) => new NextRequest("https://example.test/api/departments/dept-1/sla-settings", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })
const context = { params: Promise.resolve({ id: "dept-1" }) }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAuth).mockResolvedValue({ profile: { id: "admin" }, error: null } as never)
  vi.mocked(prisma.department.findUnique).mockResolvedValue({ slaConfig: { mailboxActiveStatuses: ["Investigating"], atRiskPct: 75 }, businessHours: calendar, subDepartments: [{ id: "sub-1", statuses: [{ label: "In Progress", isComplete: false }, { label: "Investigating", isComplete: false }, { label: "Done", isComplete: true }] }] } as never)
  vi.mocked(prisma.department.update).mockImplementation((async ({ data }: { data: unknown }) => data) as never)
})
describe("form first-response active-status settings", () => {
  it("defaults to In Progress without changing mailbox settings", async () => {
    const response = await GET(new NextRequest("https://example.test/api/departments/dept-1/sla-settings"), context)
    expect(await response.json()).toMatchObject({ slaConfig: { firstResponseActiveStatuses: ["In Progress"], atRiskPct: 75 } })
  })
  it("saves form statuses while preserving existing mailbox active statuses", async () => {
    const response = await PATCH(request({ slaConfig: { firstResponseActiveStatuses: ["Investigating", "In Progress"] } }), context)
    expect(response.status).toBe(200)
    expect(prisma.department.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slaConfig: expect.objectContaining({ mailboxActiveStatuses: ["Investigating"], firstResponseActiveStatuses: ["Investigating", "In Progress"] }) }) }))
  })
  it.each([[], [""], [42], "In Progress"])("rejects invalid active-status lists (%j)", async (firstResponseActiveStatuses) => {
    const response = await PATCH(request({ slaConfig: { firstResponseActiveStatuses } }), context)
    expect(response.status).toBe(400)
    expect(prisma.department.update).not.toHaveBeenCalled()
  })
})


describe("dynamic workflow status options", () => {
  it("loads current custom workflow labels and excludes completed statuses", async () => {
    const response = await GET(new NextRequest("https://example.test/api/departments/dept-1/sla-settings"), context)
    expect((await response.json()).availableStatuses).toEqual(["In Progress", "Investigating"])
  })
  it.each(["Unknown", "Done"])("rejects unavailable or completed status %s", async (status) => {
    const response = await PATCH(request({ slaConfig: { firstResponseActiveStatuses: [status] } }), context)
    expect(response.status).toBe(400)
    expect(prisma.department.update).not.toHaveBeenCalled()
  })
  it("canonicalizes and deduplicates saved selections", async () => {
    const response = await PATCH(request({ slaConfig: { firstResponseActiveStatuses: ["InProgress", "In Progress"] } }), context)
    expect(response.status).toBe(200)
    expect((await response.json()).slaConfig.firstResponseActiveStatuses).toEqual(["In Progress"])
  })
  it("uses default workflow labels when statuses have not been customized", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ slaConfig: null, businessHours: calendar, subDepartments: [{ id: "sub-1", statuses: [] }] } as never)
    const response = await GET(new NextRequest("https://example.test/api/departments/dept-1/sla-settings"), context)
    expect((await response.json()).availableStatuses).toContain("IN PROGRESS")
  })
  it("deduplicates labels across sub-department workflows", async () => {
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ slaConfig: null, businessHours: calendar, subDepartments: [
      { id: "sub-1", statuses: [{ label: "Investigating", isComplete: false }] },
      { id: "sub-2", statuses: [{ label: "Investigating", isComplete: false }, { label: "Reviewing", isComplete: false }] },
    ] } as never)
    const response = await GET(new NextRequest("https://example.test/api/departments/dept-1/sla-settings"), context)
    expect((await response.json()).availableStatuses).toEqual(["Investigating", "Reviewing"])
  })
  it("limits options to the requested sub-department workflow", async () => {
    vi.mocked(prisma.subDepartment.findFirst).mockResolvedValue({ id: "sub-2" } as never)
    vi.mocked(prisma.subDepartment.findUnique).mockResolvedValue({ slaConfig: null, businessHours: null } as never)
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ slaConfig: null, businessHours: calendar, subDepartments: [
      { id: "sub-1", statuses: [{ label: "Investigating", isComplete: false }] },
      { id: "sub-2", statuses: [{ label: "Reviewing", isComplete: false }] },
    ] } as never)
    const response = await GET(new NextRequest("https://example.test/api/departments/dept-1/sla-settings?subDepartmentId=sub-2"), context)
    expect((await response.json()).availableStatuses).toEqual(["Reviewing"])
  })

})
