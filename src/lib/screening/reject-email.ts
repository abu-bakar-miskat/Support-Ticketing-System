import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"

// Haiku: rejection drafts are short and formulaic — cheapest model, same
// cost reasoning as CV extraction (team AI usage runs on a personal key).
const DRAFT_MODEL = "claude-haiku-4-5"

const RejectionEmailSchema = z.object({
  subject: z.string().describe("Short, kind email subject about the application"),
  body: z
    .string()
    .describe("Plain-text email body, paragraphs separated by blank lines, ready to send as-is"),
})

export type RejectionEmailDraft = z.infer<typeof RejectionEmailSchema>

const SYSTEM_PROMPT = `You draft candidate rejection emails for PEN Group's hiring team. The candidate completed an async video screening for the role, and the team has decided not to move forward with them.

Write a kind, professional, concise email (120–180 words):
- Address the candidate by their first name.
- Thank them for taking the time to record their answers.
- Say clearly but gently that they won't be moving forward for this role.
- Give 2–3 specific, constructive feedback points drawn from the screening assessments, phrased in the second person as encouragement to grow. Base them on the assessment notes, but NEVER mention scores, transcripts, AI, or any automated system — the feedback must read as coming from the reviewer who watched their answers.
- Never comment on accent, fluency, or spoken English.
- Encourage them to apply again in the future.
- Sign off with the sender's name on its own line, then "PEN Group".
- Plain text only: no markdown, no bullet symbols, no placeholders.`

/** Drafts a rejection email with feedback distilled from the AI screening assessments. */
export async function draftRejectionEmail(input: {
  candidateName: string
  roleTitle: string
  senderName: string | null
  answers: { prompt: string; score: number; reasoning: string | null }[]
}): Promise<RejectionEmailDraft> {
  const assessments = input.answers
    .map((a, i) =>
      [
        `Question ${i + 1}: ${a.prompt}`,
        `Score: ${a.score}/5`,
        a.reasoning ? `Reviewer assessment: ${a.reasoning}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n")

  const client = new Anthropic()
  const response = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Candidate: ${input.candidateName}`,
          `Role: ${input.roleTitle}`,
          `Sender (hiring team member): ${input.senderName ?? "The hiring team"}`,
          "",
          "Screening assessments:",
          assessments || "(no per-answer assessments available — keep the feedback general but warm)",
        ].join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(RejectionEmailSchema) },
  })
  if (!response.parsed_output) {
    throw new Error(`Draft returned no parseable output (stop_reason: ${response.stop_reason})`)
  }
  return response.parsed_output
}
