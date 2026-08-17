import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { IntakeForm } from "@/components/support/intake-form"
import { IntakeChat } from "@/components/support/intake-chat"
import { resolveIntakeDefaultFields } from "@/lib/intake-default-fields"
import { getEmailConfig, brandingFrom } from "@/lib/email-config"
import { resolveFormBranding } from "@/lib/form-branding"

export const dynamic = "force-dynamic"

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "dept-slug": string; uuid: string }>
}) {
  const { uuid } = await params
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: uuid },
    select: { name: true, department: { select: { name: true } } },
  })
  if (!form) return { title: "Form unavailable" }
  return { title: `${form.name} — ${form.department.name}` }
}

export default async function PublicIntakeFormPage({
  params,
}: {
  params: Promise<{ "dept-slug": string; uuid: string }>
}) {
  const { "dept-slug": deptSlug, uuid } = await params

  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: uuid },
    include: {
      department: { select: { id: true, name: true } },
      fields: { orderBy: { order: "asc" } },
    },
  })

  // UUID not found → 404
  if (!form) notFound()

  // Dept-slug mismatch → 404
  if (slugify(form.department.name) !== deptSlug) notFound()

  // Form inactive → unavailable message
  if (!form.isActive) {
    return <UnavailablePage formName={form.name} deptName={form.department.name} />
  }

  const fields = form.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type as "text" | "richtext" | "select" | "file" | "email" | "number",
    isRequired: f.isRequired,
    options: f.options,
    childOptions: (f.childOptions ?? {}) as Record<string, string[]>,
    placeholder: f.placeholder,
    helperText: f.helperText,
    validation: f.validation as Record<string, unknown> | null,
  }))

  const issues = await prisma.intakeIssue.findMany({
    where: { formConfigId: uuid },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })

  const defaultFields = resolveIntakeDefaultFields(form.intakeDefaultFields)

  const isChat = form.displayMode === "CHAT"

  const ws = brandingFrom(await getEmailConfig())
  const brand = resolveFormBranding(form.branding, {
    logoUrl: ws.logoUrl,
    headerColor: ws.headerColor,
    accentColor: ws.brandColor,
  })

  return (
    <main
      className="pen-light-scope h-full min-h-screen overflow-y-auto bg-pen-bg"
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
          <p className="font-poppins text-[11px] font-semibold uppercase tracking-[1.4px] text-pen-muted">
            {form.department.name}
          </p>
          <h1 className="mt-1.5 font-poppins text-[28px] font-semibold leading-tight text-pen-foreground">
            {form.name}
          </h1>
          <p className="mt-2 font-poppins text-[13px] text-pen-muted">
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
          <div className="rounded-2xl border border-pen-card-border bg-pen-card p-6 shadow-sm sm:p-8">
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
    <main className="pen-light-scope flex min-h-screen items-center justify-center bg-pen-bg px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-pen-surface">
          <svg
            className="size-5 text-pen-muted"
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
        <h1 className="pen-text-page-title">
          This form is currently unavailable
        </h1>
        <p className="mt-2 font-sans text-[13px] text-pen-muted">
          {formName} · {deptName}
        </p>
      </div>
    </main>
  )
}
