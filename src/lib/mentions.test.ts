import { describe, it, expect, vi, beforeEach } from "vitest"
import { parseMentionHandles, processMentions, resolveMentionedProfiles } from "./mentions"

vi.mock("@/lib/db", () => ({
  prisma: {
    profile: { findFirst: vi.fn(), findMany: vi.fn() },
    ticket: { findUnique: vi.fn() },
    mention: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}))
vi.mock("@/lib/email", () => ({ sendMentionEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/mentionable-users", () => ({
  getMentionableUsersForTicketDept: vi.fn().mockResolvedValue([]),
  getMentionableProjectMembers: vi.fn().mockResolvedValue([]),
}))

import { prisma } from "@/lib/db"
import { sendMentionEmail } from "@/lib/email"
import {
  getMentionableProjectMembers,
  getMentionableUsersForTicketDept,
} from "@/lib/mentionable-users"

const mockProfileFindFirst = vi.mocked(prisma.profile.findFirst)
const mockProfileFindMany = vi.mocked(prisma.profile.findMany)
const mockTicketFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockMentionFindFirst = vi.mocked(prisma.mention.findFirst)
const mockMentionCreate = vi.mocked(prisma.mention.create)
const mockActivityLogCreate = vi.mocked(prisma.activityLog.create)
const mockSendEmail = vi.mocked(sendMentionEmail)
const mockGetMentionable = vi.mocked(getMentionableUsersForTicketDept)
const mockGetProjectMembers = vi.mocked(getMentionableProjectMembers)

const resolvedProfile = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "sara@pen.com",
  name: "Sara",
}

const baseArgs = {
  commentId: "comment-1",
  ticketId: "ticket-1",
  actorId: "00000000-0000-0000-0000-000000000001",
  body: "Hey @Sara check this",
  ticketTitle: "Fix login",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMentionCreate.mockResolvedValue({} as never)
  mockActivityLogCreate.mockResolvedValue({} as never)
  mockProfileFindMany.mockResolvedValue([])
  mockTicketFindUnique.mockResolvedValue(null)
  mockGetMentionable.mockResolvedValue([])
  mockGetProjectMembers.mockResolvedValue([])
})

describe("parseMentionHandles", () => {
  it("extracts mention handles from body", () => {
    expect(parseMentionHandles("Hello @alice and @bob")).toEqual(["alice", "bob"])
  })

  it("deduplicates repeated handles", () => {
    expect(parseMentionHandles("@alice @alice")).toEqual(["alice"])
  })

  it("returns empty array when no mentions", () => {
    expect(parseMentionHandles("no mentions here")).toEqual([])
  })

  it("extracts @all as a handle", () => {
    expect(parseMentionHandles("Hey @all please review")).toEqual(["all"])
  })
})

describe("resolveMentionedProfiles", () => {
  it("expands @all to team/department members when the ticket has no project", async () => {
    mockTicketFindUnique.mockResolvedValue({
      teamId: "team-1",
      projectId: null,
      team: { departmentId: "dept-1" },
    } as never)
    mockGetMentionable.mockResolvedValue([
      { id: resolvedProfile.id, name: resolvedProfile.name, avatarUrl: null, departmentName: null, teamName: "Backend", role: "staff" },
    ])
    mockProfileFindMany.mockResolvedValue([resolvedProfile] as never)

    const profiles = await resolveMentionedProfiles("Hey @all", "ticket-1")

    expect(mockGetMentionable).toHaveBeenCalledWith("dept-1", "team-1")
    expect(mockGetProjectMembers).not.toHaveBeenCalled()
    expect(profiles).toEqual([resolvedProfile])
  })

  it("expands @all to project members when the ticket has a project", async () => {
    mockTicketFindUnique.mockResolvedValue({
      teamId: "team-1",
      projectId: "project-1",
      team: { departmentId: "dept-1" },
    } as never)
    mockGetProjectMembers.mockResolvedValue([
      { id: resolvedProfile.id, name: resolvedProfile.name, avatarUrl: null, departmentName: null, teamName: "Backend", role: "staff" },
    ])
    mockProfileFindMany.mockResolvedValue([resolvedProfile] as never)

    const profiles = await resolveMentionedProfiles("Hey @all", "ticket-1")

    expect(mockGetProjectMembers).toHaveBeenCalledWith("project-1")
    expect(mockGetMentionable).not.toHaveBeenCalled()
    expect(profiles).toEqual([resolvedProfile])
  })
})

describe("processMentions", () => {
  it("creates a Mention row and ActivityLog for a valid mention", async () => {
    mockProfileFindFirst.mockResolvedValue(resolvedProfile as never)
    mockMentionFindFirst.mockResolvedValue(null)

    await processMentions(baseArgs)

    expect(mockMentionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { commentId: "comment-1", mentionedUserId: resolvedProfile.id },
      }),
    )
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MENTION" }),
      }),
    )
  })

  it("does not duplicate a Mention row on re-edit", async () => {
    mockProfileFindFirst.mockResolvedValue(resolvedProfile as never)
    mockMentionFindFirst.mockResolvedValue({ id: "existing" } as never)

    await processMentions(baseArgs)

    expect(mockMentionCreate).not.toHaveBeenCalled()
  })

  it("does not re-send email when user is in alreadyNotifiedIds", async () => {
    mockProfileFindFirst.mockResolvedValue(resolvedProfile as never)
    mockMentionFindFirst.mockResolvedValue(null)

    await processMentions({ ...baseArgs, alreadyNotifiedIds: [resolvedProfile.id] })

    expect(mockMentionCreate).toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("silently ignores a mention handle that resolves to no profile", async () => {
    mockProfileFindFirst.mockResolvedValue(null)

    await processMentions(baseArgs)

    expect(mockMentionCreate).not.toHaveBeenCalled()
    expect(mockActivityLogCreate).not.toHaveBeenCalled()
  })
})
