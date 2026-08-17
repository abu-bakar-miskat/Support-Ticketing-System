import { createMcpHandler } from "mcp-handler"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiKeyRaw, type ApiKeyContext } from "@/lib/api-key-auth"
import {
  listTeams,
  listProjects,
  searchTickets,
  getTicket,
  createTicket,
  updateTicket,
  addComment,
  deleteTicket,
  TICKET_TYPES,
  TICKET_PRIORITIES,
  type ToolResult,
} from "@/lib/mcp/tools"
import {
  listRecruitmentBoards,
  getRecruitmentBoard,
  addRecruitmentCandidate,
  updateRecruitmentCandidate,
  addRecruitmentField,
  deleteRecruitmentCandidate,
} from "@/lib/mcp/recruitment-tools"
import { RECRUITMENT_FIELD_TYPES } from "@/lib/recruitment"

export const maxDuration = 60

function toMcp(result: ToolResult) {
  if (result.ok) {
    return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 1) }] }
  }
  return { content: [{ type: "text" as const, text: result.message }], isError: true }
}

function buildHandler(key: string, ctx: ApiKeyContext) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "list_teams",
        {
          title: "List teams",
          description:
            "Teams in the PEN ticketing system: id, name, prefix (used in ticket refs like WEB-123 and as create_ticket's teamPrefix), department, and the team's status labels in workflow order.",
          inputSchema: {},
        },
        async () => toMcp(await listTeams(ctx)),
      )
      server.registerTool(
        "list_projects",
        {
          title: "List projects",
          description: "Projects with their id (usable as create_ticket's projectId), team, and department.",
          inputSchema: {},
        },
        async () => toMcp(await listProjects(ctx)),
      )
      server.registerTool(
        "search_tickets",
        {
          title: "Search tickets",
          description:
            "Find tickets by title text, status label, and/or team prefix. Returns refs like WEB-123 usable with get_ticket. Use before creating to avoid duplicates.",
          inputSchema: {
            query: z.string().optional().describe("Case-insensitive title substring"),
            status: z.string().optional().describe("Exact status label, e.g. In Progress"),
            teamPrefix: z.string().optional().describe("Team prefix, e.g. WEB"),
            limit: z.number().int().min(1).max(50).optional().describe("Max results, default 20"),
          },
        },
        async (input) => toMcp(await searchTickets(ctx, input)),
      )
      server.registerTool(
        "get_ticket",
        {
          title: "Get ticket",
          description: "Full detail of one ticket by its reference (e.g. WEB-123), including the 5 most recent comments.",
          inputSchema: { ref: z.string().describe("Ticket reference like WEB-123") },
        },
        async (input) => toMcp(await getTicket(ctx, input)),
      )
      server.registerTool(
        "create_ticket",
        {
          title: "Create ticket",
          description:
            "Create a ticket. Requires a read_write API key. teamPrefix must be one of list_teams' prefixes. Without projectId the ticket goes to the team's Miscellaneous project. The ticket is attributed to the API key's owner.",
          inputSchema: {
            title: z.string().min(1).describe("Short imperative summary"),
            description: z.string().optional().describe("Longer context, plain text"),
            type: z.enum(TICKET_TYPES).describe("Bug, Feature, Task, or Chore"),
            priority: z.enum(TICKET_PRIORITIES).describe("Low, Medium, High, Critical, or Urgent"),
            teamPrefix: z.string().describe("Team prefix from list_teams, e.g. WEB"),
            projectId: z.string().optional().describe("Project id from list_projects"),
            assigneeEmail: z.string().optional().describe("Assignee's work email; omit to leave unassigned"),
          },
        },
        async (input) => toMcp(await createTicket(ctx, input)),
      )
      server.registerTool(
        "update_ticket",
        {
          title: "Update ticket",
          description:
            "Update any fields of an existing ticket by ref (e.g. WEB-123). Requires a read_write key. Only provided fields change; pass null to clear assignee/sprint/module. status accepts any label from the team's workflow (see list_teams) — changes notify people exactly like the web app, including completion notifications.",
          inputSchema: {
            ref: z.string().describe("Ticket reference like WEB-123"),
            title: z.string().min(1).optional(),
            description: z.string().nullable().optional().describe("null clears the description"),
            type: z.enum(TICKET_TYPES).optional(),
            priority: z.enum(TICKET_PRIORITIES).optional(),
            status: z.string().optional().describe("Exact status label from the team's workflow"),
            assigneeEmail: z.string().nullable().optional().describe("Work email; null unassigns"),
            projectId: z.string().optional().describe("Project id from list_projects"),
            sprintId: z.string().nullable().optional(),
            moduleId: z.string().nullable().optional(),
          },
        },
        async (input) => toMcp(await updateTicket(ctx, input)),
      )
      server.registerTool(
        "add_comment",
        {
          title: "Add comment",
          description:
            "Comment on a ticket as the API key's owner. Requires a read_write key. @mentions notify the mentioned users by email, like the web app.",
          inputSchema: {
            ref: z.string().describe("Ticket reference like WEB-123"),
            body: z.string().min(1).describe("Comment text; @Name mentions are processed"),
          },
        },
        async (input) => toMcp(await addComment(ctx, input)),
      )
      server.registerTool(
        "delete_ticket",
        {
          title: "Delete ticket",
          description:
            "Soft-delete a ticket by ref. Requires an ADMIN key. The ticket is hidden, not destroyed; assignees are notified. Idempotent.",
          inputSchema: { ref: z.string().describe("Ticket reference like WEB-123") },
        },
        async (input) => toMcp(await deleteTicket(ctx, input)),
      )
      server.registerTool(
        "list_recruitment_boards",
        {
          title: "List recruitment boards",
          description:
            "Recruitment (hiring) boards: id, name, candidate count, and column names with types. Boards are Notion-style candidate pipelines managed by managers.",
          inputSchema: {},
        },
        async () => toMcp(await listRecruitmentBoards(ctx)),
      )
      server.registerTool(
        "get_recruitment_board",
        {
          title: "Get recruitment board",
          description:
            "Full board content: columns (with select options as labels) and every candidate with human-readable values keyed by column name.",
          inputSchema: { board: z.string().describe("Board name or id, e.g. 'UI/UX Designer Pipeline'") },
        },
        async (input) => toMcp(await getRecruitmentBoard(ctx, input)),
      )
      server.registerTool(
        "add_recruitment_candidate",
        {
          title: "Add recruitment candidate",
          description:
            "Add a candidate row. Requires a read_write key. values is keyed by COLUMN NAME (case-insensitive); select values are option labels — labels that don't exist yet are created automatically with a color. Ratings accept 1-5 or star strings.",
          inputSchema: {
            board: z.string().describe("Board name or id"),
            values: z.record(z.string(), z.unknown()).describe('e.g. {"Candidate": "Jane Doe", "Stage": "Invitation Sent", "Rating": 3}'),
          },
        },
        async (input) => toMcp(await addRecruitmentCandidate(ctx, input)),
      )
      server.registerTool(
        "update_recruitment_candidate",
        {
          title: "Update recruitment candidate",
          description:
            "Update any fields of a candidate by id (from get_recruitment_board). Requires a read_write key. Same values format as add_recruitment_candidate; null clears a field; unknown select labels are auto-created.",
          inputSchema: {
            board: z.string().describe("Board name or id"),
            candidateId: z.string().describe("Candidate id from get_recruitment_board"),
            values: z.record(z.string(), z.unknown()),
          },
        },
        async (input) => toMcp(await updateRecruitmentCandidate(ctx, input)),
      )
      server.registerTool(
        "add_recruitment_field",
        {
          title: "Add recruitment column",
          description:
            "Add a new column to a board. Requires a read_write key.",
          inputSchema: {
            board: z.string().describe("Board name or id"),
            name: z.string().describe("Column name"),
            type: z.enum(RECRUITMENT_FIELD_TYPES as [string, ...string[]]).optional().describe("Defaults to text"),
          },
        },
        async (input) => toMcp(await addRecruitmentField(ctx, input)),
      )
      server.registerTool(
        "delete_recruitment_candidate",
        {
          title: "Delete recruitment candidate",
          description: "Permanently delete a candidate row. Requires an ADMIN key.",
          inputSchema: {
            board: z.string().describe("Board name or id"),
            candidateId: z.string().describe("Candidate id from get_recruitment_board"),
          },
        },
        async (input) => toMcp(await deleteRecruitmentCandidate(ctx, input)),
      )
    },
    {},
    { basePath: `/api/mcp/${key}`, verboseLogs: false },
  )
}

async function handle(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const { ctx, error } = await requireApiKeyRaw(key)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  return buildHandler(key, ctx)(request)
}

export { handle as GET, handle as POST, handle as DELETE }
