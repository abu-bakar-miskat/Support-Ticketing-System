import "server-only"

import { prisma } from "@/lib/db"

export async function listPortalFormIssues(formId: string) {
  const orderBy = [{ order: "asc" as const }, { createdAt: "asc" as const }]
  const select = { id: true, name: true } as const
  return prisma.slaPolicy.findMany({
    where: {
      formConfigId: formId,
      enabled: true,
    },
    orderBy,
    select,
  })
}
