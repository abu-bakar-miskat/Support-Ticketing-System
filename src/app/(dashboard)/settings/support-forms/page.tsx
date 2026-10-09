import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people"
import { resolveIntakeDefaultFields } from "@/lib/intake-default-fields"
import { publicFormBrandDefaults, readFormBranding, type FormBrandingDefaults } from "@/lib/form-branding"
import { getEmailConfig, brandingFrom } from "@/lib/email-config"
import { getTenantBranding } from "@/lib/tenant-config"
import { supportFormPath } from "@/lib/support-form-path"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import {
  SettingsIntakeFormsPage,
  type IntakeFormRow,
  type DeptOption,
  type SubDepartmentOption,
} from "@/components/settings/settings-intake-forms-page"

export const metadata = { title: "Support forms — Global Support Portal" }

export default async function SettingsIntakeFormsRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const departmentAdminIds = profile.departmentAdminIds ?? []
  // Intake forms are admin-only (role-hierarchy.md). Department-scoped admins
  // surface as role "manager" but hold power via departmentAdminIds.
  if (!isAdmin && departmentAdminIds.length === 0) redirect("/")

  const profileScope = await getProfileDeptScope(profile)
  const activeDeptId = profileScope?.activeDeptId ?? null

  if (activeDeptId && !isAdmin && !departmentAdminIds.includes(activeDeptId)) {
    redirect("/")
  }

  // This is the department-level Support Forms page — the single home for forms
  // now that forms are owned by the department (issues route to sub-departments
  // via their SLA policy). Show every form for the department(s), labelled by
  // scope/owner. Do NOT filter by the persistent pen_active_team cookie here —
  // doing so hid every form except the last-viewed sub-department's.
  const tenantId = profile.activeTenantId ?? "__no_tenant__"
  const deptWhere = activeDeptId
    ? { id: activeDeptId }
    : isAdmin
      ? { tenantId }
      : { id: { in: departmentAdminIds } }

  // deptWhere is bound to the caller's admin dept ids / tenant — run unscoped
  // to skip the per-query scope waterfall.
  const [forms, departments] = await runAsSystem(() => Promise.all([
    prisma.intakeFormConfig.findMany({
      where: { department: deptWhere },
      orderBy: { createdAt: "desc" },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            slug: true,
            assignmentMethod: true,
            tenant: { select: { name: true, slug: true } },
          },
        },
        intakeSubDepartment: { select: { id: true, name: true, slug: true, workloadThreshold: true, assignmentMethod: true } },
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
  ]))

  // Which of these forms have at least one enabled SLA policy — the same
  // condition that makes the public form render its issue-type field.
  const formsWithSla = new Set(
    (
      await runAsSystem(() =>
        prisma.slaPolicy.findMany({
          where: { formConfigId: { in: forms.map((f) => f.id) }, enabled: true },
          select: { formConfigId: true },
          distinct: ["formConfigId"],
        }),
      )
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
    intakeSubDepartmentId: f.intakeSubDepartment?.id ?? null,
    intakeSubDepartmentName: f.intakeSubDepartment?.name ?? null,
    publicPath: supportFormPath({
      tenant: { slug: f.department.tenant.slug, name: f.department.tenant.name },
      department: { slug: f.department.slug, name: f.department.name },
      formId: f.id,
    }),
    workloadThreshold: f.intakeSubDepartment?.workloadThreshold ?? 0,
    intakeCount: f._count.intakes,
    createdAt: f.createdAt.toISOString(),
    defaultFields: resolveIntakeDefaultFields(f.intakeDefaultFields),
    branding: readFormBranding(f.branding),
    assignmentMethod: f.assignmentMethod ?? null,
    effectiveMethod:
      f.assignmentMethod ??
      f.intakeSubDepartment?.assignmentMethod ??
      f.department.assignmentMethod ??
      "ROUND_ROBIN",
    scope: f.scope === "SUB_DEPARTMENT" ? "SUB_DEPARTMENT" as const : "DEPARTMENT" as const,
    hasSlaPolicies: formsWithSla.has(f.id),
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

  const ws = brandingFrom(await getEmailConfig(activeDeptId))
  const tenantBrand = profile.activeTenantId
    ? await getTenantBranding(profile.activeTenantId)
    : null
  const workspaceBranding: FormBrandingDefaults = publicFormBrandDefaults({
    tenantLogoUrl: tenantBrand?.logoUrl,
    tenantHideLogo: tenantBrand?.hideLogo,
    tenantAccent: tenantBrand?.accentColor,
    emailLogoUrl: ws.logoUrl,
    emailHeaderColor: ws.headerColor,
    emailAccent: ws.brandColor,
  })

  return (
    <SettingsIntakeFormsPage
      forms={rows}
      departments={deptOptions}
      isAdmin={isAdmin}
      scopedDepartmentName={scopedDepartment?.name ?? null}
      activeSubDepartmentName={null}
      workspaceBranding={workspaceBranding}
    />
  )
}
