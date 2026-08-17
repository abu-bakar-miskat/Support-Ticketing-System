import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/db";
import { presignR2Get } from "@/lib/screening/r2";
import { getQuestion, SCREENING_FLAGS } from "@/lib/screening/questions";
import { parseRubricSnapshot, type Rubric } from "@/lib/screening/question-bank";
import { syncScreeningToBoard } from "@/lib/screening/board-sync";

/**
 * Post-submit scoring pipeline: Whisper transcription (language pinned to
 * English) then one Claude call per answer against that question's rubric.
 *
 * The one non-negotiable constraint: spoken English is NEVER judged from the
 * transcript. ASR degrades badly on accented English, and the candidates being
 * hired are exactly the group a transcript-based English score would
 * systematically penalise. Content is scored here; delivery is judged by a
 * human watching the video on the review page.
 */

// Sonnet 5: better than 4.6 and cheaper on intro pricing through 2026-08-31
// ($2/$10 vs $3/$15 per MTok); roughly break-even after.
const SCORING_MODEL = "claude-sonnet-5";

const AnswerScoreSchema = z.object({
  score: z.number().int().min(0).max(5),
  reasoning: z.string().describe("2-3 sentences explaining the score"),
  evidence: z
    .string()
    .describe("A verbatim quote from the transcript supporting the score"),
  flags: z.array(z.enum(SCREENING_FLAGS)),
});

export type AnswerScore = z.infer<typeof AnswerScoreSchema>;

export function scoringConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && !!process.env.OPENAI_API_KEY;
}

/** Download the recording from R2 and transcribe with Whisper, English pinned. */
export async function transcribeAnswer(objectKey: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const videoRes = await fetch(presignR2Get(objectKey));
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch recording ${objectKey}: ${videoRes.status}`);
  }

  // Whisper hard-rejects files over 25MB — fail with a diagnosable message
  // instead of an opaque API error (recorder caps bitrate, but old recordings
  // and other browsers can still exceed it). Check the header before
  // buffering so oversized files fail cheaply on every retry.
  const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
  const declared = Number(videoRes.headers.get("content-length") ?? 0);
  if (declared > WHISPER_MAX_BYTES) {
    await videoRes.body?.cancel();
    throw new Error(
      `Recording ${objectKey} is ${(declared / 1_000_000).toFixed(1)}MB — over Whisper's 25MB limit`,
    );
  }
  const blob = await videoRes.blob();
  if (blob.size > WHISPER_MAX_BYTES) {
    throw new Error(
      `Recording ${objectKey} is ${(blob.size / 1_000_000).toFixed(1)}MB — over Whisper's 25MB limit`,
    );
  }

  const ext = objectKey.endsWith(".mp4") ? "mp4" : "webm";
  const form = new FormData();
  form.append("file", blob, `answer.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "en");
  form.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper transcription failed (${res.status}): ${await res.text()}`);
  }
  return (await res.text()).trim();
}

function scoringSystemPrompt(): string {
  return [
    "You are pre-scoring one answer from an asynchronous video screening for a developer role at PEN Group's Chattogram office. You see only an automatic transcript of the spoken answer; a human reviewer will watch the actual video.",
    "",
    "Hard rules:",
    "- Do NOT judge accent, fluency, grammar, vocabulary, or any aspect of the candidate's English. The transcript comes from automatic speech recognition, which degrades badly on accented English — transcription artifacts are not the candidate's errors. Spoken English is assessed by a human watching the video, never by you.",
    "- Score CONTENT only, against the rubric provided.",
    "- This is a spoken answer: 30 seconds to read the question, up to 90 seconds to talk, unscripted. Calibrate the rubric bars to what a strong 90-second spoken answer can realistically contain, not to written-essay depth. When an answer sits between two bands, that context decides — round toward the higher band.",
    "- If the transcript is garbled or unreliable, say so in your reasoning, add the poor_audio flag, and score toward the middle (2-3) rather than guessing either way.",
    "- The evidence field must be a VERBATIM quote copied from the transcript. Never paraphrase, never invent. If no quote supports the score, use the closest verbatim fragment and note the limitation in the reasoning.",
    "- Flags may only be used when clearly warranted: contradicts_cv, no_specifics, sounds_scripted, did_not_answer, location_risk, poor_audio.",
    "- did_not_answer means the question was substantially ignored or deflected. An on-topic answer that misses a sub-part of the question is NOT did_not_answer — reflect the gap in the score, and use no_specifics if the answer lacks concrete detail.",
    "- sounds_scripted means the transcript reads as written text spoken aloud: dense comma-separated enumerations in written register, checklist or CV-bullet cadence, and a complete absence of spontaneous-speech markers (no restarts, fillers, or self-corrections anywhere in a 60-90 second answer). Fluency or good preparation alone is NOT enough — look for prose that could be pasted into a document unchanged. This flag asks a human to verify on video; do NOT lower the content score because of it.",
    "- You rank; a human decides. Never recommend rejecting or hiring.",
  ].join("\n");
}

export type ScoringQuestion = { prompt: string; rubric: Rubric }

function scoringPrompt(question: ScoringQuestion, transcript: string): string {
  const rubricLines = [
    question.rubric.five && `A 5 looks like: ${question.rubric.five}`,
    question.rubric.three && `A 3 looks like: ${question.rubric.three}`,
    question.rubric.one && `A 1 looks like: ${question.rubric.one}`,
    question.rubric.penalise && `Penalise: ${question.rubric.penalise}`,
  ].filter(Boolean) as string[]
  return [
    `Question asked (candidate had 30s to read, up to 90s to answer):`,
    question.prompt,
    "",
    `Scoring rubric (0-5):`,
    ...(rubricLines.length > 0
      ? rubricLines
      : ["No written rubric — judge how concretely and directly the answer addresses the question."]),
    "",
    "Transcript of the candidate's answer:",
    "<transcript>",
    transcript || "(empty transcript)",
    "</transcript>",
    "",
    "Score this answer against the rubric.",
  ].join("\n");
}

export async function scoreAnswer(
  question: ScoringQuestion,
  transcript: string,
): Promise<AnswerScore> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: SCORING_MODEL,
    max_tokens: 1024,
    // Sonnet 5 thinks by default when `thinking` is omitted, and thinking
    // spends from max_tokens — keep the cheap single-shot behavior 4.6 had.
    thinking: { type: "disabled" },
    system: scoringSystemPrompt(),
    messages: [{ role: "user", content: scoringPrompt(question, transcript) }],
    output_config: { format: zodOutputFormat(AnswerScoreSchema) },
  });
  if (!response.parsed_output) {
    throw new Error(`Scoring returned no parseable output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

export type ScoreSessionResult = {
  scored: number;
  skipped: number;
  failed: { questionKey: string; error: string }[];
};

/**
 * Transcribe + score every uploaded answer in a session. Re-runnable: answers
 * that already have a score are skipped unless `force` is set, so a partial
 * failure can be retried from the review page without re-paying for the rest.
 */
const GazeCheckSchema = z.object({
  verdict: z.enum(["no_concern", "possible_reading", "likely_reading"]),
  reasoning: z.string().describe("2-3 sentences citing the frame timestamps that support the verdict"),
});

export type GazeCheck = z.infer<typeof GazeCheckSchema>;

const GAZE_PROMPT = [
  "These contact sheets are webcam stills sampled every ~3 seconds while a candidate answered an interview question on video, reading order left-to-right then top-to-bottom (about 3 seconds between cells).",
  "Assess whether the frames suggest the answer may not have been produced independently and unaided. Two signal classes:",
  "1. Reading a prepared answer: sustained focus on a fixed off-axis point across many consecutive frames, especially with a line-scanning quality, persisting for most of the answer. NOT reading: glancing up, down, or away while thinking (looking away to recall is normal cognition), camera-shyness, or checking the on-screen question early on. Note that a script positioned at or just below the camera can look like normal screen engagement in stills — mention it as a limitation only if the gaze is unusually locked.",
  "2. Outside assistance: another person visibly interacting with the candidate during the answer (leaning in, talking to them, the candidate turning to engage them), or a phone/notes visibly held up. People merely passing by in an open-office background are NOT assistance — the signal is interaction. If someone is engaged with the candidate mid-answer, that is at least possible_reading, with the interaction described.",
  "Judge conservatively on gaze alone: default to no_concern unless the pattern is sustained; possible_reading for suggestive-but-ambiguous patterns or visible interaction with another person; likely_reading only for a clear, persistent reading pattern or unmistakable assistance.",
  "Your verdict only asks a human to verify against the full video — it never affects the candidate's score, and must never be based on appearance, background, or setting.",
].join("\n");

/**
 * AI gaze check over the frame sheets sampled during recording. A verify-on-
 * video signal for the reviewer — never part of the content score.
 */
export async function gazeCheckAnswer(
  videoObjectKey: string,
  frameCount: number,
): Promise<GazeCheck> {
  const images = await Promise.all(
    Array.from({ length: Math.min(frameCount, 8) }, async (_, i) => {
      const key = videoObjectKey.replace(/\.(webm|mp4)$/, `-frame${i}.jpg`);
      const res = await fetch(presignR2Get(key));
      if (!res.ok) throw new Error(`Failed to fetch frame sheet ${key}: ${res.status}`);
      return Buffer.from(await res.arrayBuffer()).toString("base64");
    }),
  );
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: SCORING_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((data) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
          })),
          { type: "text" as const, text: GAZE_PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(GazeCheckSchema) },
  });
  if (!response.parsed_output) {
    throw new Error(`Gaze check returned no parseable output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/** Don't retry until the submit-time scoring run has had a chance to finish. */
const RETRY_MIN_AGE_MS = 2 * 60 * 1000;
/** Minimum gap between attempts for one session. */
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
/** Give up on sessions stuck longer than this — surface to a human instead. */
const RETRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Self-heal for sessions stuck in "submitted": if the post-submit scoring run
 * died (crash, deploy, transient API failure), re-run it. Called fire-and-
 * forget from the queue page's after(), so any manager looking at the queue
 * re-kicks their own stuck sessions — no cron or manual intervention.
 * `scoringAttemptAt` is claimed atomically so overlapping renders don't
 * double-pay for transcription.
 */
export async function retryStuckScoring(where: Record<string, unknown> = {}): Promise<void> {
  const now = Date.now();
  const stuck = await prisma.screeningSession.findMany({
    where: {
      ...where,
      status: "submitted",
      submittedAt: {
        lt: new Date(now - RETRY_MIN_AGE_MS),
        gt: new Date(now - RETRY_MAX_AGE_MS),
      },
      answers: { some: { objectKey: { not: null }, score: null } },
    },
    select: { id: true },
  });
  for (const s of stuck) {
    const claimed = await prisma.screeningSession.updateMany({
      where: {
        id: s.id,
        OR: [
          { scoringAttemptAt: null },
          { scoringAttemptAt: { lt: new Date(now - RETRY_BACKOFF_MS) } },
        ],
      },
      data: { scoringAttemptAt: new Date() },
    });
    if (claimed.count === 0) continue;
    try {
      const res = await scoreSession(s.id);
      if (res.failed.length > 0) {
        console.error("[screening] scoring retry partially failed:", s.id, res.failed);
      }
    } catch (err) {
      console.error("[screening] scoring retry failed:", s.id, err);
    }
  }
}

export async function scoreSession(
  sessionId: string,
  { force = false }: { force?: boolean } = {},
): Promise<ScoreSessionResult> {
  const session = await prisma.screeningSession.findUnique({
    where: { id: sessionId },
    include: { answers: { orderBy: { position: "asc" } } },
  });
  if (!session) throw new Error("Session not found");

  const result: ScoreSessionResult = { scored: 0, skipped: 0, failed: [] };

  // Answers are independent, so transcribe + score them concurrently — the
  // session finishes in the time of its slowest answer, not the sum of all.
  await Promise.all(
    session.answers.map(async (answer) => {
      if (!answer.objectKey) {
        result.skipped++;
        return;
      }
      if (answer.score !== null && !force) {
        result.skipped++;
        return;
      }
      // Prefer the snapshot taken at invite time; fall back to the legacy
      // code-defined questions for sessions created before the question bank.
      const legacy = getQuestion(answer.questionKey);
      const prompt = answer.prompt ?? legacy?.prompt;
      const rubric = parseRubricSnapshot(answer.rubric) ?? legacy?.rubric;
      if (!prompt) {
        result.failed.push({ questionKey: answer.questionKey, error: "Unknown question" });
        return;
      }
      const question: ScoringQuestion = {
        prompt,
        rubric: rubric ?? { five: "", three: "", one: "", penalise: "" },
      };
      try {
        const transcript =
          answer.transcript && !force
            ? answer.transcript
            : await transcribeAnswer(answer.objectKey);
        const scored = await scoreAnswer(question, transcript);
        await prisma.screeningAnswer.update({
          where: { id: answer.id },
          data: {
            transcript,
            score: scored.score,
            reasoning: scored.reasoning,
            evidence: scored.evidence,
            flags: scored.flags,
            scoredAt: new Date(),
            scoringError: null,
          },
        });
        result.scored++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.failed.push({ questionKey: answer.questionKey, error: message });
        // Persist the failure — serverless logs are ephemeral and a stuck
        // answer must be diagnosable from the data alone.
        await prisma.screeningAnswer
          .update({ where: { id: answer.id }, data: { scoringError: message.slice(0, 2000) } })
          .catch(() => {});
      }
    }),
  );

  // Gaze check — separate best-effort pass, run concurrently per answer.
  // Failures never affect scoring; a missing verdict just shows nothing.
  await Promise.all(
    session.answers
      .filter((a) => a.objectKey && a.frameCount > 0 && a.gazeVerdict === null)
      .map(async (answer) => {
        try {
          const gaze = await gazeCheckAnswer(answer.objectKey as string, answer.frameCount);
          await prisma.screeningAnswer.update({
            where: { id: answer.id },
            data: { gazeVerdict: gaze.verdict, gazeReasoning: gaze.reasoning },
          });
        } catch (err) {
          console.error("[screening] gaze check failed:", answer.id, err);
        }
      }),
  );

  // Overall score = mean of scored answers. Only mark the session scored when
  // every uploaded answer has a score, so a partial run stays re-runnable.
  const fresh = await prisma.screeningAnswer.findMany({
    where: { sessionId, score: { not: null } },
    select: { score: true },
  });
  const uploaded = await prisma.screeningAnswer.count({
    where: { sessionId, objectKey: { not: null } },
  });
  if (fresh.length > 0) {
    const overall =
      fresh.reduce((sum, a) => sum + (a.score ?? 0), 0) / fresh.length;
    await prisma.screeningSession.update({
      where: { id: sessionId },
      data: {
        overallScore: Math.round(overall * 100) / 100,
        ...(fresh.length >= uploaded ? { status: "scored" } : {}),
      },
    });
    await syncScreeningToBoard(sessionId);
  }

  return result;
}
