import "server-only"

import { prisma } from "@/lib/db"
import { effectiveLinkedLabelNames } from "@/lib/status-label-choice"

/** Resolve workflow linked labels against the ticket team's department registry. */
export async function linkedLabelsForDepartment(
  allowedLabels: string[],
  departmentId: string | null,
): Promise<string[]> {
  if (!allowedLabels.length) return []
  const rows = await prisma.label.findMany({
    where: { departmentId },
    select: { name: true },
  })
  return effectiveLinkedLabelNames(
    allowedLabels,
    new Set(rows.map((row) => row.name)),
  )
}

/** Apply label changes when a ticket moves between statuses with linked labels. */
export function labelsAfterStatusMove(params: {
  ticketLabels: string[]
  priorLinkedLabels: string[]
  nextLinkedLabels: string[]
  chosenLabel?: string
}): string[] {
  const { ticketLabels, priorLinkedLabels, nextLinkedLabels, chosenLabel } = params

  const strippedFromPrior = priorLinkedLabels.length
    ? ticketLabels.filter((label) => priorLinkedLabels.includes(label))
    : []
  const baseLabels = strippedFromPrior.length
    ? ticketLabels.filter((label) => !strippedFromPrior.includes(label))
    : ticketLabels

  const withoutNextLinked = nextLinkedLabels.length
    ? baseLabels.filter((label) => !nextLinkedLabels.includes(label))
    : baseLabels

  if (chosenLabel && nextLinkedLabels.includes(chosenLabel)) {
    return [...withoutNextLinked, chosenLabel]
  }

  return withoutNextLinked
}
