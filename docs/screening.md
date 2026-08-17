# Async video screening

Catches location/hours mismatches and communication problems **before** anyone
schedules a call across the five-hour time difference or sends a code test.

```
Invitation Sent → Screening Sent → Screening Passed → Test Sent → Test Passed
→ Final Interview → Offer Sent → Hired
```

A candidate opens an emailed link (unique token, no login), answers four
questions on camera — 30s to read, 90s to record, one retake each — and each
answer uploads straight to R2 the moment it's recorded. On submit, answers are
transcribed with Whisper and pre-scored by Claude against per-question rubrics.
A reviewer watches the recordings on the admin page. **The AI ranks the queue; a
human decides. There is no code path that rejects a candidate.**

When a reviewer finishes, they mark the screening **complete** (row ✓ or the
review-page button): `completedAt`/`completedById` are stamped and it moves to
the queue's Completed tab, which shows who signed it off and when. Completion is
reversible (Reopen); delete remains the only destructive action. A manager-facing
"How it works" walkthrough lives behind the help button on the queue page.

## Where things live

| Piece | Path |
|---|---|
| Question bank (editable) | `ScreeningQuestion` table — edit at `/recruitment/screening/questions`; answers snapshot prompt/hint/rubric at invite time |
| Seed questions + rubrics | `src/lib/screening/questions.ts` (seeds the bank on first read; legacy fallback for pre-bank sessions) |
| Token/session helpers | `src/lib/screening/session.ts` |
| R2 presigner (SigV4, dependency-free) | `src/lib/screening/r2.ts` |
| Whisper + Claude scoring | `src/lib/screening/scoring.ts` |
| Invite email | `src/lib/email-templates/screening-invite.ts` |
| API routes | `src/app/api/screening/{session,upload-url,answer,submit,score}/route.ts` |
| Candidate page | `src/app/screen/[token]/` |
| Admin queue + review | `src/app/(dashboard)/recruitment/screening/` (`/recruitment/screening`, `/recruitment/screening/[id]` — the "Screening" tab on the Recruitment page) |
| DB models | `ScreeningSession` / `ScreeningAnswer` in `prisma/schema.prisma` (migration `20260811100000_add_screening`, applied to the shared DB) |

Auth model: `POST /api/screening/session` and `/recruitment/screening/*` are
admin-or-manager (managers see only invites they sent, mirroring recruitment boards). The candidate routes (`upload-url`, `answer`, `submit`,
`/screen/[token]`) are deliberately open — the token is the auth, and object-key
ownership is enforced by prefix (`screening/<sessionId>/…`). Both tables have
RLS enabled with no policies, so the Supabase anon key can never read them;
all access goes through server routes via Prisma.

## Environment variables

| Variable | Used for | Notes |
|---|---|---|
| `R2_ACCOUNT_ID` | R2 endpoint (`<id>.r2.cloudflarestorage.com`) | Cloudflare dashboard → R2 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Signing presigned PUT/GET URLs | Create an R2 API token scoped to the bucket, Object Read & Write |
| `R2_BUCKET` | Bucket holding screening video | e.g. `pen-screening` |
| `OPENAI_API_KEY` | Whisper transcription (`whisper-1`, language pinned `en`) | Already present in `.env.local` |
| `ANTHROPIC_API_KEY` | Claude scoring (`claude-sonnet-4-6`) | **Needs adding** |
| `SCREENING_SCORING_SECRET` | Machine trigger for `POST /api/screening/score` (`x-screening-secret` header) | Optional — admins can also trigger scoring from the review page; submit triggers it in-process via `after()` |
| `NEXT_PUBLIC_APP_URL` | Invite link base | Falls back to `https://ticketing-system.pengroup.com` |

Without R2 vars, `upload-url` returns 503 and the review page shows
"video unavailable". Without the AI keys, submit still works and the session
sits at `submitted` until scoring is configured and re-run.

## R2 bucket setup (do before shipping)

**CORS** — the browser PUTs directly to R2 with a presigned URL. Missing CORS
fails *silently* (no console error, the XHR just errors). Bucket → Settings →
CORS policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://ticketing-system.pengroup.com"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

**Lifecycle** — candidate video is personal data. Bucket → Settings → Object
lifecycle rules → delete objects **90 days** after upload. (DB rows keep the
transcript/scores; the video itself expires.)

## Scoring behaviour

- One Claude call per answer, strict JSON `{score 0–5, reasoning, evidence, flags[]}`
  via structured outputs. Flags: `contradicts_cv`, `no_specifics`,
  `sounds_scripted`, `did_not_answer`, `location_risk`, `poor_audio`.
- The prompt **explicitly forbids judging accent, fluency, grammar or
  vocabulary** — content is scored from the transcript; spoken English is judged
  by a human watching the video. Garbled transcript → say so, flag `poor_audio`,
  score toward the middle.
- Evidence must be verbatim from the transcript; the model is told never to
  invent quotes.
- Questions and rubrics are editable in the UI (`/recruitment/screening/questions`) —
  add/reorder/disable; the invite email's "N questions / ~2N minutes" copy follows the
  active count automatically. Invites snapshot the questions, so edits never affect
  candidates already invited.
- The invite form can preview and hand-edit the email per candidate
  (`[SCREENING LINK]` is substituted with the real link on send) and set the link
  validity (1–30 days).
- Re-runnable: the review page's "Re-run scoring" button (or
  `POST /api/screening/score {sessionId, force?}`) fills in anything a previous
  run missed; `force: true` re-transcribes and re-scores everything.
- Overall score = mean of answer scores; session flips to `scored` only when
  every uploaded answer has a score.

## Before it ships — test checklist

- [ ] Safari **and iOS Safari** (container falls back through vp9/vp8/webm to mp4 via `isTypeSupported`)
- [ ] Throttled connection — upload progress shows, retry works, closing the tab and reopening the link resumes at the first unanswered question
- [ ] Camera permission denied — clear guidance appears, no dead end
- [ ] R2 CORS verified from both localhost and production origins
- [ ] Record one deliberately vague, waffly answer and confirm it scores low (≤2).
      If waffle scores 4, tighten the rubrics in `src/lib/screening/questions.ts`
      before trusting the ranking
- [ ] Lifecycle rule (90 days) active on the bucket
- [ ] `ANTHROPIC_API_KEY` present in production env
