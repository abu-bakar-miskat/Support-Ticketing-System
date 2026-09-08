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

  // Any form that routes tickets into this sub-department — including
  // department-scoped forms that use it as the intake target.
  const forms = await prisma.intakeFormConfig.findMany({
    where: { intakeSubDepartmentId: subDepartment.id },
    orderBy: { createdAt: "desc" },
    include: {
      department: { select: { id: true, name: true, assignmentMethod: true } },
      intakeSubDepartment: { select: { id: true, name: true, workloadThreshold: true, assignmentMethod: true } },
      _count: { select: { intakes: true } },
    },
  })

  // Which of these forms have at least one enabled SLA policy — the same
  // condition that makes the public form render its issue-type field.
  const formsWithSla = new Set(
    (
      await prisma.slaPolicy.findMany({
        where: { formConfigId: { in: forms.map((f) => f.id) }, enabled: true },
        select: { formConfigId: true },
        distinct: ["formConfigId"],
      })
    ).flatMap((p) => (p.formConfigId ? [p.formConfigId] : [])),
  )

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
    assignmentMethod: f.assignmentMethod ?? null,
    effectiveMethod:
      f.assignmentMethod ??
      f.intakeSubDepartment.assignmentMethod ??
      f.department.assignmentMethod ??
      "ROUND_ROBIN",
    scope: f.scope === "SUB_DEPARTMENT" ? "SUB_DEPARTMENT" as const : "DEPARTMENT" as const,
    hasSlaPolicies: formsWithSla.has(f.id),
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

  const ws = brandingFrom(await getEmailConfig(subDepartment.departmentId))
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
      activeSubDepartmentId={subDepartment.id}
      activeSubDepartmentName={subDepartment.name}
      workspaceBranding={workspaceBranding}
      submissionsBasePath={`/sub-departments/${name}/support-forms`}
    />
  )
}
