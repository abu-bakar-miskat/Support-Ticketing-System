import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { IntakeSubmissionDetailView } from "@/components/settings/intake-submission-detail-view"

export const metadata = { title: "Submission — Support Ticketing System" }

export default async function SettingsIntakeSubmissionDetailRoute({
  params,
}: {
  params: Promise<{ id: string; intakeId: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  if (!isAdmin && !isManager) redirect("/")

  const { id: formId, intakeId } = await params

  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    select: { id: true, name: true, departmentId: true },
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

  return (
    <IntakeSubmissionDetailView
      formId={formId}
      intakeId={intakeId}
      basePath="/settings/support-forms"
      crumbs={[
        { label: "Support forms", href: "/settings/support-forms" },
        { label: form.name, href: `/settings/support-forms/${formId}` },
        { label: "Submissions", href: `/settings/support-forms/${formId}/submissions` },
      ]}
    />
  )
}
