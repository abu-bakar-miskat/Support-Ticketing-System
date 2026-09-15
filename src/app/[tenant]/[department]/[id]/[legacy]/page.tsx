import { redirect } from "next/navigation"

/**
 * Backward-compat for legacy 4-segment public form links
 *   /<tenant>/<department>/<subDepartment>/<formId>
 * which are now 3-segment (/<tenant>/<department>/<formId>). The last segment is
 * the real form id, so we drop the sub-department segment and redirect.
 */
export default async function LegacyPublicIntakeFormRedirect({
  params,
}: {
  params: Promise<{ tenant: string; department: string; legacy: string }>
}) {
  const { tenant, department, legacy } = await params
  redirect(`/${tenant}/${department}/${legacy}`)
}
