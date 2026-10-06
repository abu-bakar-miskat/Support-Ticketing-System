import { createHash } from "node:crypto"
import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { assertDepartmentOperational } from "@/lib/department-setup"
import { prisma } from "@/lib/db"
import { isValidEmailFormat } from "@/lib/email-validation"
import { toFormFieldDef, validateSubmission } from "@/lib/form-validation"
import { createTicketFromPayload, type ResponseEntry } from "@/lib/intake-finalize"
import {
  cleanString,
  enforcePortalRateLimit,
  portalJson,
  readPortalJson,
  requirePortalApiKey,
} from "@/lib/portal-api"

type ExistingSubmission = { id: string; ticketId: string | null }

async function findExistingSubmission(
  apiKeyId: string,
  formConfigId: string,
  idempotencyKey: string,
): Promise<ExistingSubmission | null> {
  const existing = await prisma.$queryRaw<ExistingSubmission[]>`
    SELECT id, "ticketId" FROM "Intake"
    WHERE "apiKeyId" = ${apiKeyId}
      AND "formConfigId" = ${formConfigId}
      AND (
        "portalIdempotencyKey" = ${idempotencyKey}
        OR responses::jsonb @> ${JSON.stringify([{ _ikey: idempotencyKey }])}::jsonb
      )
    LIMIT 1
  `
  return existing[0] ?? null
}

export async function POST(request: NextRequest) {
  const { ctx, error } = await requirePortalApiKey(request, { write: true })
  if (error) return error
  const limited = enforcePortalRateLimit(request, ctx.keyId, 30, "submit")
  if (limited) return limited
  const parsed = await readPortalJson(request)
  if (parsed.error) return parsed.error
  const formId = ctx.formConfigId!
  const idempotencyHeader = cleanString(request.headers.get("idempotency-key"), 128)
  if (!idempotencyHeader) {
    return portalJson({ error: "Idempotency-Key header is required" }, { status: 400 })
  }
  const idempotencyKey = `portal_${createHash("sha256")
    .update(`${ctx.keyId}:${idempotencyHeader}`)
    .digest("hex")}`

  return runWithApiKeyScope(ctx, async () => {
    const form = await prisma.intakeFormConfig.findFirst({
      where: { id: formId, isActive: true, department: { tenantId: ctx.tenantId } },
      include: { fields: { orderBy: { order: "asc" } } },
    })
    if (!form) return portalJson({ error: "Form not found" }, { status: 404 })

    const submitterName = cleanString(parsed.data.submitterName, 200)
    const submitterEmail = cleanString(parsed.data.submitterEmail, 320).toLowerCase()
    const title = cleanString(parsed.data.title, 300)
    const issueId = cleanString(parsed.data.issueId, 100) || null
    if (!submitterName || !isValidEmailFormat(submitterEmail)) {
      return portalJson(
        { error: "A valid submitterName and submitterEmail are required" },
        { status: 400 },
      )
    }
    if (!issueId) {
      return portalJson({ error: "issueId is required" }, { status: 400 })
    }
    const rawResponses = parsed.data.responses
    if (!Array.isArray(rawResponses) || rawResponses.length > form.fields.length) {
      return portalJson({ error: "responses must be an array of form field values" }, { status: 400 })
    }
    const supplied = new Map<string, string>()
    for (const entry of rawResponses) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return portalJson({ error: "Each response must contain fieldId and value" }, { status: 400 })
      }
      const fieldId = cleanString((entry as Record<string, unknown>).fieldId, 100)
      const rawValue = (entry as Record<string, unknown>).value
      if (!fieldId || typeof rawValue !== "string" || rawValue.length > 10_000 || supplied.has(fieldId)) {
        return portalJson({ error: "Invalid or duplicate form response" }, { status: 400 })
      }
      supplied.set(fieldId, rawValue)
    }

    const knownIds = new Set(form.fields.map((field) => field.id))
    if ([...supplied.keys()].some((id) => !knownIds.has(id))) {
      return portalJson({ error: "A response references an unknown field" }, { status: 400 })
    }
    const values = Object.fromEntries(form.fields.map((field) => [field.id, supplied.get(field.id) ?? ""]))
    const validation = validateSubmission(form.fields.map(toFormFieldDef), values)
    if (!validation.ok) {
      return portalJson({ error: "Form validation failed", fieldErrors: validation.errors }, { status: 400 })
    }

    {
      const issue = await prisma.slaPolicy.findFirst({
        where: {
          id: issueId,
          formConfigId: form.id,
          tenantId: ctx.tenantId,
          enabled: true,
          departmentId: { not: null },
        },
        select: { departmentId: true },
      })
      if (!issue?.departmentId) {
        return portalJson({ error: "Invalid issueId" }, { status: 400 })
      }
      const operational = await assertDepartmentOperational(issue.departmentId)
      if (!operational.ok) return portalJson({ error: operational.error }, { status: 503 })
    }

    const responses: ResponseEntry[] = form.fields
      .filter((field) => supplied.has(field.id))
      .map((field) => ({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        value: supplied.get(field.id) ?? "",
      }))

    const existing = await findExistingSubmission(ctx.keyId, form.id, idempotencyKey)
    if (existing) {
      return portalJson({
        data: { submissionId: existing.id, ticketId: existing.ticketId },
        duplicate: true,
      })
    }

    try {
      const created = await createTicketFromPayload(
        form.id,
        {
          submitterName,
          submitterEmail,
          title,
          // Priority is resolved internally from the selected issue/SLA policy;
          // external portals cannot supply or override it.
          priority: null,
          issueId,
          responses,
          idempotencyKey,
        },
        { apiKeyId: ctx.keyId },
      )
      return portalJson(
        {
          data: {
            submissionId: created.intakeId,
            ticketId: created.ticketId,
            ticketReference: created.humanId,
          },
        },
        { status: 201 },
      )
    } catch (cause) {
      // A concurrent request with the same key can win the unique-index race.
      // Once its transaction commits, return its identifiers as an idempotent
      // success rather than surfacing the expected uniqueness error.
      const duplicate = await findExistingSubmission(ctx.keyId, form.id, idempotencyKey)
      if (duplicate) {
        return portalJson({
          data: { submissionId: duplicate.id, ticketId: duplicate.ticketId },
          duplicate: true,
        })
      }
      console.error("[portal api] submission failed", cause)
      return portalJson({ error: "Failed to create submission" }, { status: 500 })
    }
  })
}
