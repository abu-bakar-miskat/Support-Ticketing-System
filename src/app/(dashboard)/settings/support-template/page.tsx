import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { getProfileDeptScope, canAdminDeptSettings } from "@/lib/dept-scope"
import { runAsSystem } from "@/lib/request-scope"
import { getEffectiveFeatureKeys } from "@/lib/template-catalogue"
import { SupportTemplateConfig } from "@/components/settings/support-template-config"

export const dynamic = "force-dynamic"

export const metadata = { title: "Support template — Global Support Portal" }

export default async function SupportTemplateSettingsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const deptScope = await getProfileDeptScope(profile)
  const departmentId = deptScope?.activeDeptId ?? null
  if (!departmentId || !canAdminDeptSettings(profile, departmentId)) redirect("/settings")

  const features = await getEffectiveFeatureKeys(profile.activeTenantId, departmentId)
  if (features !== "ALL" && !features.has("supportForm")) redirect("/settings")

  const [department, form, slaRules] = await runAsSystem(() =>
    Promise.all([
      prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true },
      }),
      prisma.intakeFormConfig.findFirst({
        where: { departmentId, name: "Support" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fields: {
            orderBy: { order: "asc" },
            select: { id: true, label: true, type: true, isRequired: true },
          },
        },
      }),
      prisma.slaPolicy.findMany({
        where: { departmentId },
        orderBy: { order: "asc" },
        select: { id: true, name: true, firstResponseMins: true, resolutionMins: true },
      }),
    ]),
  )

  if (!department) redirect("/settings")

  return (
    <SupportTemplateConfig
      departmentId={department.id}
      departmentName={department.name}
      formId={form?.id ?? null}
      fields={form?.fields ?? []}
      slaRules={slaRules}
    />
  )
}
