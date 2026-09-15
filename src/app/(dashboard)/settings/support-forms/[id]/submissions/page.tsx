import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people"
import {
  SettingsIntakeSubmissionsPage,
  type SubmissionRow,
} from "@/components/settings/settings-intake-submissions-page"

export const metadata = { title: "Submissions — Support Ticketing System" }

export default async function SettingsIntakeSubmissionsRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  if (!isAdmin && !isManager) redirect("/")

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
    if (!managedIds.has(form.departmentId)) redirect("/settings/support-forms")
  }

  // A department-level form spans sub-departments (each issue routes via its SLA
  // policy), so the "assign to" picker draws from the whole department's people.
  const [intakes, people] = await Promise.all([
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
    fetchProjectDepartmentPeople(form.departmentId),
  ])

  const subDepartmentMembers = people.map((p) => ({
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl ?? null,
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
      subDepartmentMembers={subDepartmentMembers}
    />
  )
}
