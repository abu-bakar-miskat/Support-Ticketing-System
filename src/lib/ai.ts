import { generateText, streamText, Output } from "ai"
import type { LanguageModel } from "ai"
import { groq } from "@ai-sdk/groq"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { z } from "zod"

// AI assist/compose runs on a pool of free-tier providers. Every request
// shuffles the pool and fails over to the next candidate on error (rate limits,
// quota, transient upstream faults), so no single free tier is a hard dependency.
//
// Constraint: all callers use structured JSON output, so every candidate MUST
// reliably support json_schema structured outputs — that's why only specific
// models are listed here (many free models silently omit fields or return empty).

type ProviderOptions = Parameters<typeof generateText>[0]["providerOptions"]

type Candidate = {
  name: string
  model: LanguageModel
  providerOptions?: ProviderOptions
}

function buildPool(): Candidate[] {
  const pool: Candidate[] = []

  if (process.env.GROQ_API_KEY) {
    pool.push({
      name: "groq:" + (process.env.GROQ_MODEL || "openai/gpt-oss-20b"),
      model: groq(process.env.GROQ_MODEL || "openai/gpt-oss-20b"),
      // gpt-oss is a reasoning model: cap the reasoning effort or it spends the
      // whole token budget "thinking" and returns empty JSON.
      providerOptions: { groq: { reasoningEffort: "low" } },
    })
  }

  if (process.env.OPENROUTER_API_KEY) {
    const or = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
    for (const id of ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"]) {
      pool.push({ name: "openrouter:" + id, model: or(id) })
    }
  }

  return pool
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function aiConfigured(): boolean {
  return buildPool().length > 0
}

/** Generate a structured object, shuffling the provider pool and failing over on error. */
export async function aiObject<S extends z.ZodTypeAny>(args: {
  schema: S
  system: string
  prompt: string
  maxOutputTokens: number
}): Promise<z.infer<S>> {
  const pool = shuffle(buildPool())
  if (pool.length === 0) throw new Error("No AI providers configured")

  let lastErr: unknown
  for (const c of pool) {
    try {
      const { output } = await generateText({
        model: c.model,
        providerOptions: c.providerOptions,
        output: Output.object({ schema: args.schema }),
        system: args.system,
        prompt: args.prompt,
        maxOutputTokens: args.maxOutputTokens,
      })
      return output as z.infer<S>
    } catch (err) {
      lastErr = err
      console.warn(`[ai] candidate ${c.name} failed, failing over:`, (err as Error)?.message)
    }
  }
  throw lastErr ?? new Error("All AI providers failed")
}

/**
 * Stream plain text, shuffling the pool and failing over on error. Failover
 * happens before the first chunk is emitted (request-level errors like 429/auth
 * surface on the first read), so a downed provider is transparent to the client.
 */
export async function aiStreamText(args: {
  system: string
  prompt: string
  maxOutputTokens: number
}): Promise<Response> {
  const pool = shuffle(buildPool())
  if (pool.length === 0) throw new Error("No AI providers configured")

  let lastErr: unknown
  for (const c of pool) {
    try {
      const result = streamText({
        model: c.model,
        providerOptions: c.providerOptions,
        system: args.system,
        prompt: args.prompt,
        maxOutputTokens: args.maxOutputTokens,
      })
      const reader = result.textStream.getReader()
      const first = await reader.read() // throws here if the provider errored before emitting

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          if (!first.done && first.value) controller.enqueue(encoder.encode(first.value))
          ;(async () => {
            try {
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                if (value) controller.enqueue(encoder.encode(value))
              }
              controller.close()
            } catch (err) {
              controller.error(err)
            }
          })()
        },
      })
      return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    } catch (err) {
      lastErr = err
      console.warn(`[ai] stream candidate ${c.name} failed, failing over:`, (err as Error)?.message)
    }
  }
  throw lastErr ?? new Error("All AI providers failed")
}
