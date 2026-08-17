import Link from "next/link"
import { LayoutDashboard, Video } from "lucide-react"
import { cn } from "@/lib/utils"

export type RecruitmentTabBoard = { id: string; name: string; candidateCount: number }

const tabClass = (active: boolean) =>
  cn(
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm",
    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
  )

/**
 * The Recruitment header tab strip for pages that live outside the board SPA
 * (screening), so the top navigation stays consistent everywhere. Board tabs
 * deep-link back into the SPA via /recruitment?board=<id>.
 */
export function RecruitmentTabs({ boards }: { boards: RecruitmentTabBoard[] }) {
  return (
    <div className="border-border flex flex-nowrap items-center gap-2 border-b px-4 py-3">
      <h1 className="mr-2 shrink-0 text-base font-semibold">Recruitment</h1>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link href="/recruitment" className={tabClass(false)}>
          <LayoutDashboard className="size-3.5" /> Overview
        </Link>
        <span className={tabClass(true)}>
          <Video className="size-3.5" /> Screening
        </span>
        {boards.map((b) => (
          <Link key={b.id} href={`/recruitment?board=${b.id}`} className={tabClass(false)}>
            {b.name}
            <span className="text-muted-foreground ml-1.5 text-xs">{b.candidateCount}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
