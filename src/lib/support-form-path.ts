/** URL-safe slug from a name. Mirrors the slug stored on Tenant/Department/
 *  SubDepartment (see uniqueDepartmentSlug / uniqueSubDepartmentSlug). */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

type Segment = {
  /** The stored slug (preferred). */
  slug: string | null | undefined
  /** Name fallback, only used for rows whose slug hasn't been backfilled. */
  name?: string
}

/** The single stored/derived slug for one URL segment. */
export function segmentSlug({ slug, name }: Segment): string {
  return slug || slugifyName(name ?? "")
}

/**
 * Public support-form URL path (relative — prefix with an origin to share):
 *   /<tenant>/<department>/<subDepartment>/<formId>
 *
 * Note the tenant is the FIRST segment (no /support prefix). The proxy treats a
 * 4-segment path ending in a form UUID as public (see PUBLIC_INTAKE_FORM_RE) so
 * it bypasses the authenticated tenant-slug rewrite for these links.
 *
 * Department-level forms have no fixed sub-department (each issue routes via its
 * SLA policy), so `subDepartment` is optional — when absent the department slug
 * fills the 3rd segment, keeping the 4-segment shape the proxy recognises. The
 * public page no longer validates that 3rd segment against the form.
 *
 * Prefers the stored slugs; the name fallbacks only cover rows created before
 * slugs were backfilled. Keep this the single source of truth so every place
 * that builds or validates the URL (the route, the settings list, ticket
 * detail) stays in lockstep.
 */
export function supportFormPath(opts: {
  tenant: Segment
  department: Segment
  subDepartment?: Segment | null
  formId: string
}): string {
  const t = segmentSlug(opts.tenant)
  const d = segmentSlug(opts.department)
  // Fall back to the department slug when the form has no sub-department, so the
  // URL keeps four segments and the proxy still marks it public.
  const s = opts.subDepartment ? segmentSlug(opts.subDepartment) : d
  return `/${t}/${d}/${s}/${opts.formId}`
}

/**
 * Matches a public support-form path: /<tenant>/<department>/<subDepartment>/<uuid>.
 * The trailing form UUID is what distinguishes these cookieless public links
 * from authenticated tenant-scoped routes (which never end in a UUID at the 4th
 * segment). The proxy uses this to mark the path public. Keep in lockstep with
 * supportFormPath above.
 */
export const PUBLIC_INTAKE_FORM_RE =
  /^\/[^/]+\/[^/]+\/[^/]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i

