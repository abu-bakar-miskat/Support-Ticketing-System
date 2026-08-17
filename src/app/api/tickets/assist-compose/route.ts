import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { aiConfigured, aiObject, aiStreamText } from "@/lib/ai"

type Mode = "title" | "description"

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

export async function POST(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const mode: Mode = body?.mode === "title" ? "title" : "description"
  const rawTitle = typeof body?.title === "string" ? body.title.trim().slice(0, 300) : ""
  const descriptionText = stripHtml(
    typeof body?.description === "string" ? body.description : "",
  ).slice(0, 3000)

  if (!rawTitle && !descriptionText) {
    return badRequest(
      mode === "title"
        ? "Add a title or some description text first."
        : "Add a title first, then generate a description.",
    )
  }

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI compose is not configured" }, { status: 503 })
  }

  if (mode === "title") {
    try {
      const output = await aiObject({
        schema: z.object({
          title: z
            .string()
            .describe(
              "A clear, specific, imperative ticket title (roughly 4-12 words). No trailing period. Capture the concrete task or problem. If a good title already exists, refine rather than replace it.",
            ),
        }),
        system:
          "You write crisp software-ticket titles. Preserve the author's intent and facts exactly — clarify, don't fabricate. Match the input language.",
        prompt: [
          `Current title: ${rawTitle || "(none)"}`,
          `Description context: ${descriptionText || "(none)"}`,
        ].join("\n"),
        maxOutputTokens: 120,
      })
      return NextResponse.json({ title: output.title })
    } catch (err) {
      console.error("[assist-compose:title] failed:", err)
      return NextResponse.json({ error: "Compose failed" }, { status: 502 })
    }
  }

  // ── Description: stream HTML so it fills in realtime ────────────────────────
  const hasDescription = descriptionText.length > 0
  try {
    return await aiStreamText({
      system: [
        "You write the description body of a software ticket as clean HTML.",
        "Output ONLY HTML using these tags: <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>.",
        "No markdown, no code fences, no commentary, no <html>/<body>/<div>/<span>, no style attributes.",
        "Match the input language.",
      ].join(" "),
      prompt: hasDescription
        ? [
            "Rewrite the following ticket description as clean, well-structured HTML.",
            "Clarify and organize it — use short sections (e.g. Summary, Steps, Expected/Actual, Acceptance criteria) only when the content supports them. Never invent facts, steps, or requirements not implied by the input.",
            `Title: ${rawTitle || "(none)"}`,
            "Existing description:",
            descriptionText,
          ].join("\n")
        : [
            "There is no description yet. Draft a concise starter description inferred from the ticket title.",
            "Include a one-line summary and, when appropriate, a short bullet list of likely sub-tasks or acceptance criteria phrased generically.",
            "Do NOT invent specific facts, names, numbers, or requirements — keep inferred content neutral and clearly generic so the author can fill in specifics.",
            `Title: ${rawTitle}`,
          ].join("\n"),
      maxOutputTokens: 550,
    })
  } catch (err) {
    console.error("[assist-compose:description] failed:", err)
    return NextResponse.json({ error: "Compose failed" }, { status: 502 })
  }
}
