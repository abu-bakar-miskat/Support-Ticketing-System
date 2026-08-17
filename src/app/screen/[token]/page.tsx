import type { Metadata } from "next"
import { getQuestion, READ_SECONDS, RECORD_SECONDS, MAX_TAKES } from "@/lib/screening/questions"
import { getLiveSessionByToken } from "@/lib/screening/session"
import { ScreeningFlow } from "./screening-flow"
import { ScreeningShell, ScreeningNotice } from "./screening-shell"
import "@fontsource-variable/inter"

export const metadata: Metadata = {
  title: "Video introduction — PEN Group",
  robots: { index: false, follow: false },
}

export default async function ScreenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await getLiveSessionByToken(token)

  if (!result.ok) {
    if (result.reason === "not_found") {
      return (
        <ScreeningShell>
          <ScreeningNotice
            heading="This link isn't valid"
            body="Check the link in your email is complete, or reply to the email that brought you here and we'll send a fresh one."
          />
        </ScreeningShell>
      )
    }
    if (result.reason === "submitted") {
      return (
        <ScreeningShell>
          <ScreeningNotice
            heading="Already submitted — thank you"
            body="Your answers are in and someone on the team will watch them. We'll be in touch about the next step by email."
          />
        </ScreeningShell>
      )
    }
    return (
      <ScreeningShell>
        <ScreeningNotice
          heading="This link has expired"
          body="Screening links are live for a limited time. Reply to the email that brought you here and we'll send a new one."
        />
      </ScreeningShell>
    )
  }

  const session = result.session

  // Questions come from the snapshot taken when the invite was created, so
  // later edits to the question bank never change a live invite. Sessions from
  // before the bank existed fall back to the code-defined questions by key.
  const questions = session.answers
    .map((a) => {
      const legacy = getQuestion(a.questionKey)
      return {
        key: a.questionKey,
        position: a.position,
        prompt: a.prompt ?? legacy?.prompt ?? "",
        hint: a.hint ?? legacy?.hint ?? "",
      }
    })
    .filter((q) => q.prompt)

  return (
    <ScreeningShell>
      <ScreeningFlow
        token={token}
        candidateName={session.candidateName}
        roleTitle={session.roleTitle}
        readSeconds={READ_SECONDS}
        recordSeconds={RECORD_SECONDS}
        maxTakes={MAX_TAKES}
        questions={questions}
        answered={session.answers.filter((a) => a.objectKey).map((a) => a.questionKey)}
        takesUsed={Object.fromEntries(session.answers.map((a) => [a.questionKey, a.takesUsed]))}
      />
    </ScreeningShell>
  )
}
