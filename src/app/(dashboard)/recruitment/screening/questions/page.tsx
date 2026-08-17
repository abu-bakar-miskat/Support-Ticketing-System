import Link from "next/link"
import { redirect } from "next/navigation"
import { ListChecks } from "lucide-react"
import { getProfile } from "@/lib/profile"
import { getAllQuestions } from "@/lib/screening/question-bank"
import { PageHeader } from "@/components/ui/page-header"
import { QuestionsEditor } from "./questions-editor"

export const metadata = { title: "Screening questions — Ticketing System" }

export default async function ScreeningQuestionsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "admin" && profile.role !== "manager") redirect("/")

  const questions = await getAllQuestions()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-2">
          <Link
            href="/recruitment/screening"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← Screening
          </Link>
        </div>
        <PageHeader
          title="Screening questions"
          description="Asked in order, top to bottom. Editing only affects new invites — candidates already invited keep the questions they were sent. The rubric fields brief the AI on what a 5, a 3 and a 1 look like."
          icon={ListChecks}
        />
        <div className="mt-6">
          <QuestionsEditor initialQuestions={questions} />
        </div>
      </div>
    </div>
  )
}
