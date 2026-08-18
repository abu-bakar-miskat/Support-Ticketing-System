import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import {
  SettingsFieldBuilderPage,
  type FieldRow,
} from "@/components/settings/settings-field-builder-page"

export const metadata = { title: "Field builder — Ticketing System" }

export default async function SettingsFieldBuilderRoute({
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
      intakeSubDepartment: { select: { id: true, name: true } },
      fields: { orderBy: { order: "asc" } },
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

  const fields: FieldRow[] = form.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type as FieldRow["type"],
    isRequired: f.isRequired,
    options: f.options,
    childOptions: (f.childOptions ?? {}) as Record<string, string[]>,
    order: f.order,
  }))

  return (
    <SettingsFieldBuilderPage
      formId={formId}
      formName={form.name}
      departmentName={form.department.name}
      fields={fields}
    />
  )
}
