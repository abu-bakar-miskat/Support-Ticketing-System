import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { getProfile } from "@/lib/profile"
import { recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { computeRecruitmentStats } from "@/lib/recruitment-stats"
import {
  RecruitmentPage,
  type BoardSummary,
  type BoardDetail,
} from "@/components/recruitment/recruitment-page"
import type { Field, Candidate } from "@/components/recruitment/cells"

export const metadata = { title: "Recruitment — Support Ticketing System" }

export default async function RecruitmentRoute({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "admin" && profile.role !== "manager") redirect("/")
  const { board: requestedBoardId } = await searchParams

  const activeDeptId = await resolveActiveDeptId(profile)
  const fullBoards = await prisma.recruitmentBoard.findMany({
    where: recruitmentBoardWhere(profile, activeDeptId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      archivedAt: true,
      fields: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, type: true, options: true, order: true, hidden: true },
      },
      candidates: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, values: true, order: true, createdAt: true },
      },
    },
  })

  const boards: BoardSummary[] = fullBoards.map((b) => ({
    id: b.id,
    name: b.name,
    archived: b.archivedAt !== null,
    candidateCount: b.candidates.length,
  }))

  const stats = computeRecruitmentStats(
    fullBoards.map((b) => ({
      id: b.id,
      name: b.name,
      archived: b.archivedAt !== null,
      createdAt: b.createdAt,
      fields: b.fields,
      candidates: b.candidates,
    })),
  )

  // ?board=<id> (e.g. from the screening page's tab strip) opens that board
  // directly instead of the overview.
  const requested = requestedBoardId ? fullBoards.find((b) => b.id === requestedBoardId) : undefined
  const first = requested ?? fullBoards.find((b) => b.archivedAt === null) ?? fullBoards[0]
  const initialBoard: BoardDetail | null = first
    ? {
        id: first.id,
        name: first.name,
        fields: first.fields as unknown as Field[],
        candidates: first.candidates.map((c) => ({
          id: c.id,
          values: (c.values ?? {}) as Candidate["values"],
          order: c.order,
          createdAt: c.createdAt.toISOString(),
        })),
      }
    : null

  return (
    <RecruitmentPage
      initialBoards={boards}
      initialBoard={initialBoard}
      stats={stats}
      initialView={requested ? "board" : "overview"}
    />
  )
}
