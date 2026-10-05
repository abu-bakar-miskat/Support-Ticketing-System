import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { resolveIntakeDefaultFields } from "@/lib/intake-default-fields"
import { requirePortalApiKey, portalJson } from "@/lib/portal-api"
import { listPortalFormIssues } from "@/lib/portal-form"

export async function GET(request: NextRequest) {
  const { ctx, error } = await requirePortalApiKey(request)
  if (error) return error

  return runWithApiKeyScope(ctx, async () => {
    const form = await prisma.intakeFormConfig.findFirst({
      where: {
        id: ctx.formConfigId!,
        isActive: true,
        department: { tenantId: ctx.tenantId },
      },
      select: {
        id: true,
        name: true,
        displayMode: true,
        departmentId: true,
        intakeDefaultFields: true,
        schemaVersion: true,
        fields: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            label: true,
            type: true,
            isRequired: true,
            order: true,
            options: true,
            childOptions: true,
            placeholder: true,
            helperText: true,
            validation: true,
            visibleWhen: true,
          },
        },
      },
    })
    if (!form) return portalJson({ error: "Support form unavailable" }, { status: 404 })

    const issues = await listPortalFormIssues(form.id)
    return portalJson({
      data: {
        id: form.id,
        name: form.name,
        schemaVersion: form.schemaVersion,
        defaultFields: resolveIntakeDefaultFields(form.intakeDefaultFields),
        fields: form.fields,
        issues,
      },
    })
  })
}
