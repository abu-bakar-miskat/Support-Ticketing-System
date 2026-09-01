// Backfills SubDepartment.slug (URL-safe, unique within each department, so two
// departments can both have a "Frontend" sub-department). Idempotent.
//
// Run: npx tsx scripts/backfill-subdepartment-slugs.ts
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
      .replace(/^-+|-+$/g, "") || "team"
  )
}

async function main() {
  const subs = await prisma.subDepartment.findMany({
    select: { id: true, departmentId: true, name: true, slug: true },
    orderBy: { id: "asc" },
  })

  const usedByDept = new Map<string, Set<string>>()
  const used = (deptId: string) => {
    let s = usedByDept.get(deptId)
    if (!s) usedByDept.set(deptId, (s = new Set()))
    return s
  }
  for (const s of subs) if (s.slug) used(s.departmentId).add(s.slug)

  let updated = 0
  for (const s of subs) {
    if (s.slug) continue
    const set = used(s.departmentId)
    const base = slugify(s.name)
    let slug = base
    let i = 2
    while (set.has(slug)) slug = `${base}-${i++}`
    set.add(slug)
    await prisma.subDepartment.update({ where: { id: s.id }, data: { slug } })
    updated++
  }

  console.log(`Backfilled ${updated} sub-department slug(s) across ${usedByDept.size} department(s).`)
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
