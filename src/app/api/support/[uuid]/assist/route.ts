import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { z } from "zod"
import { domainAcceptsMail } from "@/lib/email-validation"
import { aiConfigured, aiObject } from "@/lib/ai"

// Public endpoint: keep abuse surface small. Tight token caps + per-IP rate
// limiting (best-effort in-memory; instances are reused under Fluid Compute so
// this holds for bursts, which is what matters here).
const RATE_LIMIT = 15 // requests per window per IP
const RATE_WINDOW_MS = 60_000
const hits = new Map<string, { count: number; windowStart: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  if (hits.size > 5000) hits.clear()
  return entry.count > RATE_LIMIT
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: uuid },
    select: { isActive: true, displayMode: true, name: true, department: { select: { name: true } } },
  })
  if (!form || !form.isActive || form.displayMode !== "CHAT") {
    return NextResponse.json({ error: "Form unavailable" }, { status: 400 })
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const kind =
    body?.kind === "review" || body?.kind === "email" ? (body.kind as string) : "offscript"
  const question = typeof body?.question === "string" ? body.question.slice(0, 300) : ""
  const message = typeof body?.message === "string" ? body.message.slice(0, 1000) : ""
  const recent: { role: string; text: string }[] = Array.isArray(body?.recent)
    ? body.recent.slice(-8).map((m: { role?: string; text?: string }) => ({
        role: m?.role === "user" ? "visitor" : "assistant",
        text: String(m?.text ?? "").slice(0, 500),
      }))
    : []
  if (!message || (kind !== "email" && !question)) {
    return NextResponse.json({ error: "question and message are required" }, { status: 400 })
  }

  // ── Email deliverability: DNS only, no AI ───────────────────────────────────
  if (kind === "email") {
    const accepts = await domainAcceptsMail(message)
    if (accepts === false) {
      const domain = message.split("@")[1] ?? ""
      return NextResponse.json({
        ok: false,
        reply: `Hmm, "${domain}" doesn't seem to be able to receive email — mind double-checking your address?`,
      })
    }
    return NextResponse.json({ ok: true })
  }

  if (!aiConfigured()) {
    return NextResponse.json({ error: "Assist unavailable" }, { status: 503 })
  }

  const identity = `You are the support intake assistant for "${form.name}" (${form.department.name} department). You collect ticket details through a fixed sequence of questions. If asked, you are an automated assistant — a human from the team reads and handles every submitted ticket.`
  const facts =
    "Facts you may share: the visitor's problem description is captured during this conversation; attachments can be added at any time via the paperclip button or by pasting/dropping files; the team follows up by email after submission. Never invent ticket statuses, prices, deadlines, or promises. Reply in the visitor's language."

  try {
    // ── Answer-quality review: is this a real answer to the current question? ──
    if (kind === "review") {
      const output = await aiObject({
        schema: z.object({
          ok: z
            .boolean()
            .describe(
              "true if the message plausibly answers the current question (typos, brevity, and any language are fine). false if it is keyboard-mash gibberish, a question directed at the assistant, or clearly unrelated to the question.",
            ),
          reply: z
            .string()
            .describe(
              "ALWAYS include this field. When ok is true, return an empty string. When ok is false: max 2 sentences — if they asked the assistant something, answer it briefly using the shareable facts, then re-ask the current question; if gibberish, politely ask for a real answer.",
            ),
        }),
        system: [
          identity,
          facts,
          "Judge whether the visitor's latest message is a genuine answer to the current question. Err on accepting — reject only clear gibberish, questions aimed at you, or complete non-answers.",
          `Current question: "${question}"`,
        ].join("\n"),
        prompt: [...recent.map((m) => `${m.role}: ${m.text}`), `visitor: ${message}`].join("\n"),
        maxOutputTokens: 1000,
      })
      return NextResponse.json({ ok: output.ok, reply: output.reply })
    }

    // ── Off-script reply: validation already failed, respond helpfully ─────────
    const output = await aiObject({
      schema: z.object({
        reply: z
          .string()
          .describe("Short, warm reply to the visitor: max 2 sentences."),
      }),
      system: [
        identity,
        "The visitor just sent a message that is not a valid answer to the current question — they may have asked something, described their problem early, or made a mistake.",
        `Write a brief, friendly reply that: (1) acknowledges or answers their message in one short sentence when you can; (2) steers them back to answering the current question.`,
        facts,
        `Current question the visitor needs to answer: "${question}"`,
      ].join("\n"),
      prompt: [...recent.map((m) => `${m.role}: ${m.text}`), `visitor: ${message}`].join("\n"),
      maxOutputTokens: 1000,
    })
    return NextResponse.json({ reply: output.reply })
  } catch (err) {
    console.error("[intake assist] generation failed:", err)
    return NextResponse.json({ error: "Assist failed" }, { status: 502 })
  }
}
