import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { IntakeForm } from "@/components/support/intake-form"
import { IntakeChat } from "@/components/support/intake-chat"
import { resolveIntakeDefaultFields } from "@/lib/intake-default-fields"
import { getEmailConfig, brandingFrom } from "@/lib/email-config"
import { publicFormBrandDefaults, resolveFormBranding } from "@/lib/form-branding"
import { getTenantBranding } from "@/lib/tenant-config"
import { deriveAccentPalette } from "@/lib/tenant-accent"
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
            tenantId: true,
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

  // The form's selectable issues honour the two department SLA levels:
  //   1. department-owned SLA issues from Settings → SLA (a sub-department is
  //      selected on the policy); or, when none exist,
  //   2. department-wide SLA issues from Departments → SLA (no sub-department).
  // This form's own policies and unlinked department-wide policies are eligible;
  // policies belonging to a sibling form are never shown. When both levels are
  // empty, the form has no Issue type selector.
  const issues = await runAsSystem(async () => {
    const deptId = form.department.id
    const orderBy = [{ order: "asc" as const }, { createdAt: "asc" as const }]
    const select = { id: true, name: true } as const
    const thisFormOrUnlinked = [{ formConfigId: id }, { formConfigId: null }]

    // A Settings → SLA policy carries a routing sub-department. It overrides the
    // broader department policy list rather than being combined with it.
    const departmentOwned = await prisma.slaPolicy.findMany({
      where: {
        departmentId: deptId,
        subDepartmentId: { not: null },
        enabled: true,
        OR: thisFormOrUnlinked,
      },
      orderBy,
      select,
    })
    if (departmentOwned.length > 0) return departmentOwned

    return prisma.slaPolicy.findMany({
      where: {
        departmentId: deptId,
        subDepartmentId: null,
        enabled: true,
        OR: thisFormOrUnlinked,
      },
      orderBy,
      select,
    })
  })

  const defaultFields = resolveIntakeDefaultFields(form.intakeDefaultFields)

  const isChat = form.displayMode === "CHAT"

  // Form design wins. Otherwise the page uses this tenant's logo and accent,
  // then the department email brand.
  const ws = brandingFrom(await runAsSystem(() => getEmailConfig(form.department.id)))
  const tenantBrand = await runAsSystem(() => getTenantBranding(form.department.tenantId))
  const brand = resolveFormBranding(
    form.branding,
    publicFormBrandDefaults({
      tenantLogoUrl: tenantBrand?.logoUrl,
      tenantHideLogo: tenantBrand?.hideLogo,
      tenantAccent: tenantBrand?.accentColor,
      emailLogoUrl: ws.logoUrl,
      emailHeaderColor: ws.headerColor,
      emailAccent: ws.brandColor,
    }),
  )
  const palette = deriveAccentPalette(brand.accentColor)
  const accent = palette?.light.accent ?? brand.accentColor
  const accentFg = palette?.light.fg ?? "#ffffff"
  const pageBg = brand.backgroundColor ?? palette?.light.tint ?? undefined
  const tenantName = tenantBrand?.displayName ?? form.department.tenant.name

  return (
    <main
      className="sts-light-scope h-full min-h-screen overflow-y-auto bg-sts-bg"
      style={pageBg ? { background: pageBg } : undefined}
    >
      <div className="mx-auto max-w-4xl px-4 pt-12 pb-16 sm:px-6 lg:pt-16 lg:pb-24">
        <div className="mb-8 flex items-center gap-4">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={tenantName}
              className="size-14 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
            />
          ) : null}
          <div className="min-w-0">
            <p
              className="font-poppins text-[11px] font-semibold uppercase tracking-[1.4px]"
              style={{ color: accent }}
            >
              {form.department.name}
              {form.intakeSubDepartment?.name && (
                <span className="opacity-70"> · {form.intakeSubDepartment.name}</span>
              )}
            </p>
            <h1 className="mt-1 font-poppins text-[32px] font-semibold leading-tight text-sts-foreground">
              {form.name}
            </h1>
            <p className="mt-1.5 font-poppins text-[14px] leading-relaxed text-sts-muted">
              {brand.introText
                ? brand.introText
                : isChat
                  ? "Answer a few quick questions and we'll get back to you as soon as possible."
                  : "Fill in the details below and we'll get back to you as soon as possible."}
            </p>
          </div>
        </div>

        {isChat ? (
          <IntakeChat formId={form.id} fields={fields} issues={issues} />
        ) : (
          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.06)] sm:p-10">
            <IntakeForm
              formId={form.id}
              fields={fields}
              issues={issues}
              defaultFields={defaultFields}
              accentColor={accent}
              accentFg={accentFg}
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
