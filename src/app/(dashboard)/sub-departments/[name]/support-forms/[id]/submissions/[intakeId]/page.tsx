import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { resolveSubDepartmentByName } from "@/lib/sub-department-access"
import { prisma } from "@/lib/db"
import { IntakeSubmissionDetailView } from "@/components/settings/intake-submission-detail-view"

export const metadata = { title: "Submission — Support Ticketing System" }

export default async function SubDepartmentSubmissionDetailRoute({
  params,
}: {
  params: Promise<{ name: string; id: string; intakeId: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/")

  const { name, id: formId, intakeId } = await params
  const subDepartment = await resolveSubDepartmentByName(decodeURIComponent(name), profile)
  if (!subDepartment) notFound()

  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    select: { id: true, name: true, intakeSubDepartmentId: true, scope: true },
  })

  // Only this sub-department's own forms are managed here — mirror the list page.
  if (
    !form ||
    form.intakeSubDepartmentId !== subDepartment.id ||
    form.scope !== "SUB_DEPARTMENT"
  ) {
    notFound()
  }

  const basePath = `/sub-departments/${name}/support-forms`

  return (
    <IntakeSubmissionDetailView
      formId={formId}
      intakeId={intakeId}
      basePath={basePath}
      crumbs={[
        { label: subDepartment.name, href: basePath },
        { label: form.name, href: `${basePath}/${formId}/submissions` },
        { label: "Submissions", href: `${basePath}/${formId}/submissions` },
      ]}
    />
  )
}
