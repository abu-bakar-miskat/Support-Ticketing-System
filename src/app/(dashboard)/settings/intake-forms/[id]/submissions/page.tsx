import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import {
  SettingsIntakeSubmissionsPage,
  type SubmissionRow,
} from "@/components/settings/settings-intake-submissions-page"

export const metadata = { title: "Submissions — Ticketing System" }

export default async function SettingsIntakeSubmissionsRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  if (!isAdmin && !isManager) redirect("/settings")

  const { id: formId } = await params

  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    include: {
      department: { select: { id: true, name: true } },
    },
  })

  if (!form) notFound()

  // Scope check for managers
  if (!isAdmin) {
    const managedIds = new Set([
      ...(profile.managedDepartmentIds ?? []),
      ...(profile.grantedAccessDeptIds ?? []),
    ])
    if (!managedIds.has(form.departmentId)) redirect("/settings/intake-forms")
  }

  const [intakes, teamMemberships] = await Promise.all([
    prisma.intake.findMany({
      where: { formConfigId: formId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        submitterName: true,
        submitterEmail: true,
        priority: true,
        createdAt: true,
        ticketId: true,
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            status: true,
            deletedAt: true,
            assigneeId: true,
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    }),
    prisma.teamMembership.findMany({
      where: { teamId: form.intakeTeamId, isActive: true },
      select: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ])

  const teamMembers = teamMemberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl ?? null,
  }))

  const submissions: SubmissionRow[] = intakes.map((i) => {
    const t = i.ticket && !i.ticket.deletedAt ? i.ticket : null
    return {
      id: i.id,
      submitterName: i.submitterName,
      submitterEmail: i.submitterEmail,
      priority: i.priority,
      createdAt: i.createdAt.toISOString(),
      ticketId: t?.id ?? null,
      ticketNumber: t?.ticketNumber ?? null,
      ticketStatus: t?.status ?? null,
      ticketAssigneeId: t?.assignee?.id ?? null,
      ticketAssigneeName: t?.assignee?.name ?? null,
      ticketAssigneeAvatarUrl: t?.assignee?.avatarUrl ?? null,
    }
  })

  return (
    <SettingsIntakeSubmissionsPage
      formId={formId}
      formName={form.name}
      departmentName={form.department.name}
      submissions={submissions}
      teamMembers={teamMembers}
    />
  )
}
