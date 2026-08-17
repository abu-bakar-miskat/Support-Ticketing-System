import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { parseOptions } from "@/lib/recruitment";
import type { RecruitmentFieldType } from "@/generated/prisma/enums";

/**
 * CV → board-field extraction. The board's own fields (with option ids for
 * selects) are put in the prompt, and Claude reads the CV document directly —
 * no separate PDF parser. Only facts evidenced by the CV come back; workflow
 * fields (stage, outcome, rating…) are left for humans.
 */

// Haiku keeps team-wide usage near-free (~half a cent per CV) and is plenty
// for reading facts off a CV into form fields.
const EXTRACT_MODEL = "claude-haiku-4-5";

/** Field types the model is allowed to fill from a CV. */
const FILLABLE_TYPES: RecruitmentFieldType[] = [
  "text",
  "select",
  "multi_select",
  "number",
  "date",
  "url",
  "email",
  "phone",
];

export type FieldForCv = {
  id: string;
  name: string;
  type: RecruitmentFieldType;
  options: unknown;
};

const CvExtractionSchema = z.object({
  fields: z.array(
    z.object({
      fieldId: z.string(),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
    }),
  ),
  assessment: z.object({
    highlights: z
      .string()
      .describe("1-2 sentences: the candidate's strongest points and fit for the role"),
    concerns: z
      .string()
      .describe(
        "1-2 sentences: red flags, inconsistencies, or gaps; prefix serious ones with '⚠️ '; 'None noted' if clean",
      ),
  }),
});

export type CvExtraction = z.infer<typeof CvExtractionSchema>;

/**
 * The board columns the AI assessment lands in, matched by name so any board
 * gains the feature just by having the columns.
 */
export function findAssessmentFields(fields: { id: string; name: string; type: string }[]): {
  highlightsField: { id: string } | null;
  concernsField: { id: string } | null;
} {
  const texts = fields.filter((f) => f.type === "text");
  return {
    highlightsField: texts.find((f) => /highlight/i.test(f.name)) ?? null,
    concernsField: texts.find((f) => /concern|gap|red.?flag/i.test(f.name)) ?? null,
  };
}

export function cvExtractionConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Workflow/process columns the CV must never fill, enforced here rather than
 * left to the prompt (the model was filling "Date Shortlisted" with the drop
 * date). These track recruiter decisions and pipeline steps, not CV facts.
 */
const WORKFLOW_FIELD_NAME = /shortlist|stage|status|outcome|reject|rating|source|screening|interview|\btest\b/i;

function fieldCatalog(fields: FieldForCv[]): string {
  return fields
    .filter((f) => FILLABLE_TYPES.includes(f.type) && !WORKFLOW_FIELD_NAME.test(f.name))
    .map((f) => {
      let line = `- id: ${f.id} | name: ${f.name} | type: ${f.type}`;
      if (f.type === "select" || f.type === "multi_select") {
        const opts = parseOptions(f.options)
          .map((o) => `${o.id} = "${o.label}"`)
          .join(", ");
        line += ` | options: ${opts}`;
      }
      return line;
    })
    .join("\n");
}

const SYSTEM = `You extract facts from a candidate's CV into a recruitment board's fields.

Rules:
- Only include a field when the CV clearly evidences its value. Omit anything you would have to guess.
- Never fill fields that track the hiring workflow rather than facts about the candidate — stage, pipeline status, interview outcomes, reject reasons, ratings, or how the candidate was sourced. Those are decided by recruiters, not the CV.
- For "select" fields, the value must be one of the listed option ids (the part before the '='), chosen by matching the CV against the option labels.
- For "multi_select" fields, the value is an array of option ids.
- For "date" fields, use YYYY-MM-DD.
- For "number" fields, a plain number.
- For a candidate-name field, use the person's full name as written on the CV.
- For a location field, use where the candidate THEMSELVES lives — usually in the CV's contact header near their email/phone. Never use an employer's address or the company location of a remote job. If the CV doesn't state the candidate's own location, omit the field.
- Keep text values short — cell values, not paragraphs (e.g. "3.5+ years", "Full-Stack Developer", "Dhaka, Bangladesh").

You also give a recruiter's first-pass assessment of the CV for the role being hired:
- "highlights": the candidate's strongest points and fit, 1-2 tight sentences (e.g. "5+ yrs full-stack with React/Node in production; led a 4-dev team at a product company").
- "concerns": red flags and gaps a recruiter should check — employment-date inconsistencies or overlaps, unexplained gaps, name/title discrepancies, missing core skills for the role, seniority that doesn't match the claims, job-hopping. Prefix genuinely serious ones with "⚠️ ". If the CV is clean, write "None noted".
- Judge only from the CV itself; be specific, not generic.`;

/**
 * Ask Claude to fill board fields from a CV (PDF or image). `mediaType` must
 * be application/pdf or an image type the API accepts.
 */
export async function extractCvFields(
  fileBase64: string,
  mediaType: string,
  fields: FieldForCv[],
  roleContext?: string,
): Promise<CvExtraction> {
  const client = new Anthropic();

  const documentBlock =
    mediaType === "application/pdf"
      ? ({
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: fileBase64 },
        })
      : ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
            data: fileBase64,
          },
        });

  const response = await client.messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: [
              roleContext ? `Role / pipeline being hired for: ${roleContext}` : null,
              `Extract this CV into the following board fields:\n\n${fieldCatalog(fields)}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(CvExtractionSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to process this document.");
  }
  if (!response.parsed_output) {
    throw new Error(`CV extraction returned no parseable output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
