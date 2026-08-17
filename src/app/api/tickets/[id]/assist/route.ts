import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { aiConfigured, aiObject } from "@/lib/ai"

type Action = "summarize" | "draft_reply" | "triage"

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      teamId: true,
      projectId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      isDraft: true,
      labels: true,
      team: { select: { departmentId: true } },
      assignees: { select: { userId: true } },
      intake: { select: { id: true } },
    },
  })
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const accessError = await assertTicketAccess(profile, ticket)
  if (accessError) return accessError

  const body = await request.json().catch(() => ({}))
  const action = body?.action as Action | undefined
  if (action !== "summarize" && action !== "draft_reply" && action !== "triage") {
    return badRequest("action must be one of: summarize, draft_reply, triage")
  }

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI assist is not configured" }, { status: 503 })
  }

  try {
    switch (action) {
      case "summarize":
        return await summarize(ticket)
      case "draft_reply":
        return await draftReply(ticket)
      case "triage":
        return await triage(ticket)
    }
  } catch (err) {
    console.error(`[ticket assist:${action}] failed:`, err)
    return NextResponse.json({ error: "Assist failed" }, { status: 502 })
  }
}

type TicketCtx = {
  id: string
  ticketNumber: number
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  teamId: string
  labels: string[]
  intake: { id: string } | null
}

// Fetch only the most recent `limit` comments/messages — older context rarely
// changes a summary/triage and just burns input tokens.
async function loadThread(ticketId: string, limit: number) {
  const [comments, messages] = await Promise.all([
    prisma.comment.findMany({
      where: { ticketId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { body: true, createdAt: true, author: { select: { name: true } } },
      take: limit,
    }),
    prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
      select: { direction: true, fromName: true, bodyHtml: true, createdAt: true },
      take: limit,
    }),
  ])
  // Return to chronological order for a readable transcript.
  return { comments: comments.reverse(), messages: messages.reverse() }
}

function buildTranscript(
  ticket: TicketCtx,
  comments: { body: string; author: { name: string } }[],
  messages: { direction: string; fromName: string; bodyHtml: string }[],
  opts: { itemChars?: number; descChars?: number } = {},
): string {
  const itemChars = opts.itemChars ?? 500
  const descChars = opts.descChars ?? 1000
  const lines: string[] = [
    `Ticket #${ticket.ticketNumber}: ${ticket.title}`,
    `Type: ${ticket.type} · Priority: ${ticket.priority} · Status: ${ticket.status}`,
  ]
  if (ticket.description) lines.push(`Description: ${ticket.description.slice(0, descChars)}`)
  for (const m of messages) {
    const who = m.direction === "inbound" ? `Customer (${m.fromName})` : `Team (${m.fromName})`
    lines.push(`${who}: ${stripHtml(m.bodyHtml).slice(0, itemChars)}`)
  }
  for (const c of comments) {
    lines.push(`Comment — ${c.author.name}: ${c.body.slice(0, itemChars)}`)
  }
  return lines.join("\n")
}

async function summarize(ticket: TicketCtx) {
  const { comments, messages } = await loadThread(ticket.id, 30)
  const transcript = buildTranscript(ticket, comments, messages, { itemChars: 500, descChars: 1000 })

  const output = await aiObject({
    schema: z.object({
      summary: z.string().describe("A concise digest (2-5 sentences) of the ticket and its discussion so far."),
      openQuestions: z.array(z.string()).describe("Any unresolved questions or blockers. Empty array if none."),
      nextStep: z.string().describe("The single most useful next action, in one short sentence."),
    }),
    system:
      "You summarize internal support/engineering tickets for the team working them. Be factual and terse. Never invent details not present in the transcript.",
    prompt: transcript.slice(0, 5000),
    maxOutputTokens: 400,
  })

  return NextResponse.json(output)
}

async function draftReply(ticket: TicketCtx) {
  if (!ticket.intake) {
    return badRequest("Draft reply is only available for support/intake tickets.")
  }
  const { comments, messages } = await loadThread(ticket.id, 20)
  if (messages.length === 0) {
    return badRequest("No customer messages to reply to yet.")
  }
  const transcript = buildTranscript(ticket, comments, messages, { itemChars: 600, descChars: 600 })

  const output = await aiObject({
    schema: z.object({
      reply: z
        .string()
        .describe(
          "A polished, friendly customer-facing reply the agent can edit before sending. Address the latest customer message. Do not promise deadlines, prices, or outcomes not supported by the transcript. Sign off generically (e.g. 'the team') — no fabricated names.",
        ),
    }),
    system:
      "You draft outbound customer support replies for a human agent to review and send. Warm, clear, professional. Never fabricate facts, timelines, or commitments. Reply in the customer's language.",
    prompt: transcript.slice(0, 4500),
    maxOutputTokens: 400,
  })

  return NextResponse.json(output)
}

async function triage(ticket: TicketCtx) {
  // Triage mostly needs the title/description + a little recent context.
  const { comments, messages } = await loadThread(ticket.id, 8)
  const transcript = buildTranscript(ticket, comments, messages, { itemChars: 300, descChars: 800 })

  const output = await aiObject({
    schema: z.object({
      type: z.enum(["Bug", "Feature", "Task", "Chore"]).describe("Suggested ticket type."),
      priority: z
        .enum(["Low", "Medium", "High", "Critical", "Urgent"])
        .describe("Suggested priority based on impact and urgency evident in the ticket."),
      labels: z.array(z.string()).describe("Up to 3 short suggested labels/tags. Empty if unsure."),
      reasoning: z.string().describe("One or two sentences explaining the suggestion."),
    }),
    system:
      "You assist triage of engineering/support tickets. Suggest a type and priority from the fixed options based only on evidence in the ticket. Be conservative with high priorities.",
    prompt:
      `Current type: ${ticket.type}, current priority: ${ticket.priority}.\n\n` +
      transcript.slice(0, 2500),
    maxOutputTokens: 220,
  })

  return NextResponse.json(output)
}
