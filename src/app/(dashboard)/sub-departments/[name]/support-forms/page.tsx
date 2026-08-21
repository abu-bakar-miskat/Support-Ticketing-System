import { notFound, redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { resolveSubDepartmentByName } from "@/lib/sub-department-access"
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people"
import { resolveIntakeDefaultFields } from "@/lib/intake-default-fields"
import { readFormBranding, type FormBrandingDefaults } from "@/lib/form-branding"
import { getEmailConfig, brandingFrom } from "@/lib/email-config"
import { prisma } from "@/lib/db"
import {
  SettingsIntakeFormsPage,
  type IntakeFormRow,
  type DeptOption,
} from "@/components/settings/settings-intake-forms-page"

export const metadata = { title: "Support forms — Support Ticketing System" }

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/")

  const isAdmin = profile.role === "admin"

  const { name } = await params
  const subDepartment = await resolveSubDepartmentByName(decodeURIComponent(name), profile)
  if (!subDepartment) notFound()

  // Only the forms routed to this sub-department are managed here.
  const forms = await prisma.intakeFormConfig.findMany({
    where: { intakeSubDepartmentId: subDepartment.id },
    orderBy: { createdAt: "desc" },
    include: {
      department: { select: { id: true, name: true } },
      intakeSubDepartment: { select: { id: true, name: true, workloadThreshold: true } },
      _count: { select: { intakes: true } },
    },
  })

  const rows: IntakeFormRow[] = forms.map((f) => ({
    id: f.id,
    name: f.name,
    isActive: f.isActive,
    autoAssign: f.autoAssign,
    displayMode: f.displayMode,
    departmentId: f.department.id,
    departmentName: f.department.name,
    intakeSubDepartmentId: f.intakeSubDepartment.id,
    intakeSubDepartmentName: f.intakeSubDepartment.name,
    workloadThreshold: f.intakeSubDepartment.workloadThreshold,
    intakeCount: f._count.intakes,
    createdAt: f.createdAt.toISOString(),
    defaultFields: resolveIntakeDefaultFields(f.intakeDefaultFields),
    branding: readFormBranding(f.branding),
  }))

  // Constrain creation/editing to this sub-department: a single department
  // option exposing only this sub-department as a routing target. Members feed
  // the per-issue "Assign to" picker (department-scoped, same as settings).
  const people = await fetchProjectDepartmentPeople(subDepartment.departmentId)
  const deptOptions: DeptOption[] = [
    {
      id: subDepartment.departmentId,
      name: subDepartment.departmentName,
      subDepartments: [{ id: subDepartment.id, name: subDepartment.name }],
      members: people.map((p) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        departmentName: p.departmentName,
        subDepartmentName: p.subDepartmentName,
      })),
    },
  ]

  const ws = brandingFrom(await getEmailConfig())
  const workspaceBranding: FormBrandingDefaults = {
    logoUrl: ws.logoUrl,
    headerColor: ws.headerColor,
    accentColor: ws.brandColor,
  }

  return (
    <SettingsIntakeFormsPage
      forms={rows}
      departments={deptOptions}
      isAdmin={isAdmin}
      scopedDepartmentName={subDepartment.name}
      workspaceBranding={workspaceBranding}
    />
  )
}
