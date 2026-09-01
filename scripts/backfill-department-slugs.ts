// Backfills Department.slug for existing rows: a URL-safe slug from the name,
// unique WITHIN each tenant (so two tenants can both have "Support"). Idempotent
// — skips departments that already have a slug.
//
// Run: npx tsx scripts/backfill-department-slugs.ts
import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dept"
  )
}

async function main() {
  const depts = await prisma.department.findMany({
    select: { id: true, tenantId: true, name: true, slug: true },
    orderBy: { id: "asc" },
  })

  // Track slugs already used per tenant (existing + newly assigned).
  const usedByTenant = new Map<string, Set<string>>()
  const used = (tenantId: string) => {
    let s = usedByTenant.get(tenantId)
    if (!s) usedByTenant.set(tenantId, (s = new Set()))
    return s
  }
  for (const d of depts) if (d.slug) used(d.tenantId).add(d.slug)

  let updated = 0
  for (const d of depts) {
    if (d.slug) continue
    const set = used(d.tenantId)
    const base = slugify(d.name)
    let slug = base
    let i = 2
    while (set.has(slug)) slug = `${base}-${i++}`
    set.add(slug)
    await prisma.department.update({ where: { id: d.id }, data: { slug } })
    updated++
  }

  console.log(`Backfilled ${updated} department slug(s) across ${usedByTenant.size} tenant(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
