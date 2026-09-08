import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { resolveSubDepartmentByName } from "@/lib/sub-department-access"
import { prisma } from "@/lib/db"
import {
  SettingsIntakeSubmissionsPage,
  type SubmissionRow,
} from "@/components/settings/settings-intake-submissions-page"

export const metadata = { title: "Submissions — Support Ticketing System" }

export default async function SubDepartmentSubmissionsRoute({
  params,
}: {
  params: Promise<{ name: string; id: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/")

  const { name, id: formId } = await params
  const subDepartment = await resolveSubDepartmentByName(decodeURIComponent(name), profile)
  if (!subDepartment) notFound()

  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    include: { department: { select: { id: true, name: true } } },
  })

  // Only this sub-department's own forms are managed here — mirror the list page.
  if (
    !form ||
    form.intakeSubDepartmentId !== subDepartment.id ||
    form.scope !== "SUB_DEPARTMENT"
  ) {
    notFound()
  }

  const [intakes, subDepartmentMemberships] = await Promise.all([
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
    prisma.subDepartmentMembership.findMany({
      where: { subDepartmentId: form.intakeSubDepartmentId, isActive: true },
      select: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ])

  const subDepartmentMembers = subDepartmentMemberships.map((m) => ({
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

  const basePath = `/sub-departments/${name}/support-forms`

  return (
    <SettingsIntakeSubmissionsPage
      formId={formId}
      formName={form.name}
      departmentName={form.department.name}
      submissions={submissions}
      subDepartmentMembers={subDepartmentMembers}
      formsBasePath={basePath}
      backLabel="Support forms"
      crumbs={[
        { label: subDepartment.name, href: basePath },
        { label: form.name, href: `${basePath}/${formId}/submissions` },
        { label: "Submissions", href: `${basePath}/${formId}/submissions` },
      ]}
    />
  )
}
