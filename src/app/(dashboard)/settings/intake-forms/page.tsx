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

export const metadata = { title: "Support forms — Support Ticketing System" }

export default async function SettingsIntakeFormsRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  // Managers may view/create support forms for the sub-departments of the
  // departments they manage; the queries below scope them to managedDeptIds.
  if (!isAdmin && !isManager) redirect("/settings")

  const profileScope = await getProfileDeptScope(profile)
  const activeDeptId = profileScope?.activeDeptId ?? null

  // When a sub-department is active (its own Support Forms page), scope the list
  // to that sub-department's own SUB_DEPARTMENT forms. Otherwise (department
  // page) show every form for the department(s), labelled by scope/owner.
  const { cookies } = await import("next/headers")
  const activeSubDepartmentId = (await cookies()).get("pen_active_team")?.value || null

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
      where: activeSubDepartmentId
        ? { department: deptWhere, intakeSubDepartmentId: activeSubDepartmentId, scope: "SUB_DEPARTMENT" }
        : { department: deptWhere },
      orderBy: { createdAt: "desc" },
      include: {
        department: { select: { id: true, name: true, assignmentMethod: true } },
        intakeSubDepartment: { select: { id: true, name: true, workloadThreshold: true, assignmentMethod: true } },
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
    assignmentMethod: f.assignmentMethod ?? null,
    effectiveMethod:
      f.assignmentMethod ??
      f.intakeSubDepartment.assignmentMethod ??
      f.department.assignmentMethod ??
      "ROUND_ROBIN",
    scope: f.scope === "SUB_DEPARTMENT" ? "SUB_DEPARTMENT" as const : "DEPARTMENT" as const,
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

  // Name of the active sub-department, when this is a sub-department's own page.
  const activeSubDepartmentName = activeSubDepartmentId
    ? (scopedDepartment?.subDepartments.find((t) => t.id === activeSubDepartmentId)?.name ?? null)
    : null

  const ws = brandingFrom(await getEmailConfig(activeDeptId))
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
      activeSubDepartmentId={activeSubDepartmentId}
      activeSubDepartmentName={activeSubDepartmentName}
      workspaceBranding={workspaceBranding}
    />
  )
}
