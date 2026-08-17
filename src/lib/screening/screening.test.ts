import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { generateScreeningToken, isSessionObjectKey, screeningObjectKey } from "./session"
import { SCREENING_QUESTIONS, getQuestion, MAX_TAKES, READ_SECONDS, RECORD_SECONDS } from "./questions"
import { presignR2Put, presignR2Get, r2Configured } from "./r2"

// session.ts imports @/lib/db (Prisma), but the helpers under test are pure.

describe("screening questions", () => {
  it("has exactly four questions with sequential positions", () => {
    expect(SCREENING_QUESTIONS).toHaveLength(4)
    expect(SCREENING_QUESTIONS.map((q) => q.position)).toEqual([1, 2, 3, 4])
  })

  it("every question carries a full rubric", () => {
    for (const q of SCREENING_QUESTIONS) {
      expect(q.rubric.five.length).toBeGreaterThan(20)
      expect(q.rubric.three.length).toBeGreaterThan(20)
      expect(q.rubric.one.length).toBeGreaterThan(20)
      expect(q.rubric.penalise.length).toBeGreaterThan(10)
    }
  })

  it("question keys are lookup-able and URL/object-key safe", () => {
    for (const q of SCREENING_QUESTIONS) {
      expect(getQuestion(q.key)).toBe(q)
      expect(q.key).toMatch(/^[a-z0-9_]+$/)
    }
    expect(getQuestion("nope")).toBeUndefined()
  })

  it("timings match the spec (30s read, 90s record, one retake)", () => {
    expect(READ_SECONDS).toBe(30)
    expect(RECORD_SECONDS).toBe(90)
    expect(MAX_TAKES).toBe(2)
  })
})

describe("screening tokens", () => {
  it("generates unique URL-safe tokens", () => {
    const a = generateScreeningToken()
    const b = generateScreeningToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/)
  })
})

describe("object key ownership", () => {
  it("accepts keys generated for the session", () => {
    const key = screeningObjectKey("sess1", "proud_build", 1, "webm")
    expect(key).toBe("screening/sess1/proud_build-take1.webm")
    expect(isSessionObjectKey("sess1", key)).toBe(true)
  })

  it("rejects another session's key", () => {
    const key = screeningObjectKey("sess1", "proud_build", 1, "webm")
    expect(isSessionObjectKey("sess2", key)).toBe(false)
  })

  it("rejects malformed keys", () => {
    expect(isSessionObjectKey("s", "screening/s/proud_build-take1.exe")).toBe(false)
    expect(isSessionObjectKey("s", "attachments/s/proud_build-take1.webm")).toBe(false)
    expect(isSessionObjectKey("s", "screening/s/../x/proud_build-take1.webm")).toBe(false)
    expect(isSessionObjectKey("s", "screening/s/UPPER-take1.webm")).toBe(false)
  })

  it("accepts DB question ids (cuid-style keys)", () => {
    expect(isSessionObjectKey("s", "screening/s/cmed3x9dg0000356o2c8yhcnf-take2.mp4")).toBe(true)
  })
})

describe("R2 presigner", () => {
  const saved: Record<string, string | undefined> = {}
  const KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k]
    process.env.R2_ACCOUNT_ID = "acct123"
    process.env.R2_ACCESS_KEY_ID = "AKIDEXAMPLE"
    process.env.R2_SECRET_ACCESS_KEY = "secret"
    process.env.R2_BUCKET = "screening-videos"
  })

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it("reports configured only when all env vars are present", () => {
    expect(r2Configured()).toBe(true)
    delete process.env.R2_BUCKET
    expect(r2Configured()).toBe(false)
  })

  it("builds a SigV4 query-auth URL against the account endpoint", () => {
    const url = new URL(presignR2Put("screening/s1/proud_build-take1.webm", 600))
    expect(url.host).toBe("acct123.r2.cloudflarestorage.com")
    expect(url.pathname).toBe("/screening-videos/screening/s1/proud_build-take1.webm")
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256")
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host")
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(
      /^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/,
    )
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/)
  })

  it("PUT and GET signatures differ for the same key", () => {
    const put = new URL(presignR2Put("screening/s1/a-take1.webm"))
    const get = new URL(presignR2Get("screening/s1/a-take1.webm"))
    expect(put.searchParams.get("X-Amz-Signature")).not.toBe(
      get.searchParams.get("X-Amz-Signature"),
    )
  })
})
