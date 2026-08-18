import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people"
import { resolveIntakeDefaultFields } from "@/lib/intake-default-fields"
import { readFormBranding, type FormBrandingDefaults } from "@/lib/form-branding"
import { getEmailConfig, brandingFrom } from "@/lib/email-config"
import { prisma } from "@/lib/db"
import {
  SettingsIntakeFormsPage,
  type IntakeFormRow,
  type DeptOption,
  type SubDepartmentOption,
} from "@/components/settings/settings-intake-forms-page"

export const metadata = { title: "Support forms — Ticketing System" }

export default async function SettingsIntakeFormsRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  if (!isAdmin && !isManager) redirect("/settings")

  const profileScope = await getProfileDeptScope(profile)
  const activeDeptId = profileScope?.activeDeptId ?? null

  const managedDeptIds = [
    ...new Set([
      ...(profile.managedDepartmentIds ?? []),
      ...(profile.grantedAccessDeptIds ?? []),
    ]),
  ]

  const tenantId = profile.activeTenantId ?? "__no_tenant__"
  const deptWhere = activeDeptId
    ? { id: activeDeptId }
    : isAdmin
      ? { tenantId }
      : { id: { in: managedDeptIds } }

  const [forms, departments] = await Promise.all([
    prisma.intakeFormConfig.findMany({
      where: { department: deptWhere },
      orderBy: { createdAt: "desc" },
      include: {
        department: { select: { id: true, name: true } },
        intakeSubDepartment: { select: { id: true, name: true, workloadThreshold: true } },
        _count: { select: { intakes: true } },
      },
    }),
    prisma.department.findMany({
      where: deptWhere,
      orderBy: { name: "asc" },
      include: {
        subDepartments: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
  ])

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

  // Department members populate the per-issue "Assign to" picker (feature is
  // department-scoped). Reuses the same eligibility rules the API validates against.
  const deptPeople = await Promise.all(
    departments.map((d) => fetchProjectDepartmentPeople(d.id)),
  )

  const deptOptions: DeptOption[] = departments.map((d, i) => ({
    id: d.id,
    name: d.name,
    subDepartments: d.subDepartments.map(
      (t): SubDepartmentOption => ({ id: t.id, name: t.name }),
    ),
    members: deptPeople[i].map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      departmentName: p.departmentName,
      subDepartmentName: p.subDepartmentName,
    })),
  }))

  const scopedDepartment = activeDeptId
    ? (departments.find((d) => d.id === activeDeptId) ?? null)
    : null

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
      scopedDepartmentName={scopedDepartment?.name ?? null}
      workspaceBranding={workspaceBranding}
    />
  )
}
