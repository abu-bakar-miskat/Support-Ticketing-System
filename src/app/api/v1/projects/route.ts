import { NextRequest, NextResponse } from "next/server"
import { requireApiKey, runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import {
  resolveCurrentStage,
  resolveLifecycleStages,
  toLifecycleStageApi,
  toLifecycleStagesApi,
} from "@/lib/project-lifecycle"

/**
 * GET /api/v1/projects
 * Returns projects scoped to the API key's department.
 */
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireApiKey(req)
  if (error) return error

  return runWithApiKeyScope(ctx, async () => {
  const where = ctx.departmentId
    ? {
        OR: [
          { departmentId: ctx.departmentId },
          { subDepartment: { departmentId: ctx.departmentId } },
        ],
      }
    : {}

  const projects = await prisma.project.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      description: true,
      projectStatus: true,
      projectUrl: true,
      lifecycleStages: true,
      pipelineStartedAt: true,
      developmentStartedAt: true,
      liveAt: true,
      _count: {
        select: {
          tickets: { where: { deletedAt: null } },
          members: true,
        },
      },
    },
  })

  return NextResponse.json({
    data: projects.map((p) => {
      const stages = resolveLifecycleStages(p)
      const current = resolveCurrentStage(stages, p.projectStatus)
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        color: p.color,
        description: p.description,
        status: p.projectStatus,
        currentStage: current ? toLifecycleStageApi(current) : null,
        stages: toLifecycleStagesApi(stages),
        projectUrl: p.projectUrl,
        ticketCount: p._count.tickets,
        memberCount: p._count.members,
      }
    }),
  })
  })
}
