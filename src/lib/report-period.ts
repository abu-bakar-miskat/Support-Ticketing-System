/**
 * Resolve report `from`/`to` query params (yyyy-MM-dd) to a concrete date range.
 * Defaults to the last 30 days when params are missing. `to` is treated as
 * inclusive of the whole day.
 */
export function resolveReportRange(
  from: string | null,
  to: string | null,
): { start: Date; end: Date } {
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date()
  const start = from
    ? new Date(`${from}T00:00:00`)
    : new Date(end.getTime() - 30 * 86_400_000)
  return { start, end }
}
