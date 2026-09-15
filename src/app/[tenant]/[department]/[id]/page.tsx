import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { IntakeForm } from "@/components/support/intake-form"
import { IntakeChat } from "@/components/support/intake-chat"
import { resolveIntakeDefaultFields } from "@/lib/intake-default-fields"
import { getEmailConfig, brandingFrom } from "@/lib/email-config"
import { resolveFormBranding } from "@/lib/form-branding"
import { segmentSlug } from "@/lib/support-form-path"
import { runAsSystem } from "@/lib/request-scope"

export const dynamic = "force-dynamic"

type RouteParams = {
  tenant: string
  department: string
  id: string
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>
}) {
  const { id } = await params
  // Public page: no authenticated caller, so read config under system scope
  // (the tenant extension otherwise fails closed — see lib/prisma-scope).
  const form = await runAsSystem(() =>
    prisma.intakeFormConfig.findUnique({
      where: { id },
      select: { name: true, department: { select: { name: true } } },
    }),
  )
  if (!form) return { title: "Form unavailable" }
  return { title: `${form.name} — ${form.department.name}` }
}

export default async function PublicIntakeFormPage({
  params,
}: {
  params: Promise<RouteParams>
}) {
  const { tenant, department, id } = await params

  // This is a fully public page (anonymous requester). Every DB read below runs
  // under system scope via runAsSystem — a logged-out visitor has no caller
  // scope, so the tenant extension would otherwise throw (see lib/prisma-scope).
  const form = await runAsSystem(() =>
    prisma.intakeFormConfig.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            slug: true,
            tenant: { select: { name: true, slug: true } },
          },
        },
        intakeSubDepartment: { select: { name: true, slug: true } },
        fields: { orderBy: { order: "asc" } },
      },
    }),
  )

  // Form id not found → 404. The id is the real access token; the tenant/dept/
  // sub-dept slugs are readable, canonical prefixes we validate below so a stale
  // or hand-edited URL can't resolve a form under the wrong path.
  if (!form) notFound()

  if (segmentSlug({ slug: form.department.tenant.slug, name: form.department.tenant.name }) !== tenant) notFound()
  if (segmentSlug({ slug: form.department.slug, name: form.department.name }) !== department) notFound()

  // Form inactive → unavailable message
  if (!form.isActive) {
    return <UnavailablePage formName={form.name} deptName={form.department.name} />
  }

  const fields = form.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type as "text" | "richtext" | "select" | "file" | "email" | "number" | "checkbox" | "radio" | "date",
    isRequired: f.isRequired,
    options: f.options,
    childOptions: (f.childOptions ?? {}) as Record<string, string[]>,
    placeholder: f.placeholder,
    helperText: f.helperText,
    validation: f.validation as Record<string, unknown> | null,
    visibleWhen: (f.visibleWhen as { fieldId: string; equals?: string; in?: string[] } | null) ?? null,
  }))

  // The form's selectable "issues" are now its enabled SLA policies — each
  // policy carries the name, priority, assignee pool and SLA targets a ticket
  // inherits when the requester picks it (see lib/intake-finalize).
  const issues = await runAsSystem(() =>
    prisma.slaPolicy.findMany({
      where: { formConfigId: id, enabled: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
  )

  const defaultFields = resolveIntakeDefaultFields(form.intakeDefaultFields)

  const isChat = form.displayMode === "CHAT"

  // DS-01: department branding is the fallback layer between the form's own
  // override (most specific) and the workspace/tenant default (least specific)
  // — passing departmentId here is what makes a department's logo/colors
  // actually reach this customer-facing form when the form hasn't set its own.
  const ws = brandingFrom(await runAsSystem(() => getEmailConfig(form.department.id)))
  const brand = resolveFormBranding(form.branding, {
    logoUrl: ws.logoUrl,
    headerColor: ws.headerColor,
    accentColor: ws.brandColor,
  })

  return (
    <main
      className="sts-light-scope h-full min-h-screen overflow-y-auto bg-sts-bg"
      style={brand.backgroundColor ? { background: brand.backgroundColor } : undefined}
    >
      {brand.logoUrl && (
        <div style={{ background: brand.headerColor }} className="w-full px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-2xl items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.logoUrl}
              alt={form.department.name}
              className="h-9 w-auto"
            />
          </div>
        </div>
      )}
      <div className="mx-auto max-w-2xl px-4 pt-12 pb-16 sm:px-6 lg:pt-16 lg:pb-24">
        {/* Page header */}
        <div className="mb-8">
          <p className="font-poppins text-[11px] font-semibold uppercase tracking-[1.4px] text-sts-muted">
            {form.department.name}
            {form.intakeSubDepartment?.name && (
              <span className="text-sts-muted/70"> · {form.intakeSubDepartment.name}</span>
            )}
          </p>
          <h1 className="mt-1.5 font-poppins text-[28px] font-semibold leading-tight text-sts-foreground">
            {form.name}
          </h1>
          <p className="mt-2 font-poppins text-[13px] text-sts-muted">
            {brand.introText
              ? brand.introText
              : isChat
                ? "Answer a few quick questions and we'll get back to you as soon as possible."
                : "Fill in the details below and we'll get back to you as soon as possible."}
          </p>
        </div>

        {isChat ? (
          <IntakeChat formId={form.id} fields={fields} issues={issues} />
        ) : (
          <div className="rounded-2xl border border-sts-card-border bg-sts-card p-6 shadow-sm sm:p-8">
            <IntakeForm
              formId={form.id}
              fields={fields}
              issues={issues}
              defaultFields={defaultFields}
              accentColor={brand.accentColor}
              confirmationText={brand.confirmationText}
            />
          </div>
        )}
      </div>
    </main>
  )
}

function UnavailablePage({
  formName,
  deptName,
}: {
  formName: string
  deptName: string
}) {
  return (
    <main className="sts-light-scope flex min-h-screen items-center justify-center bg-sts-bg px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-sts-surface">
          <svg
            className="size-5 text-sts-muted"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="sts-text-page-title">
          This form is currently unavailable
        </h1>
        <p className="mt-2 font-sans text-[13px] text-sts-muted">
          {formName} · {deptName}
        </p>
      </div>
    </main>
  )
}
