// Creates a "Support" catalogue template focused purely on customer-support
// features — deliberately EXCLUDING development-oriented ones (Projects,
// Modules, Timeline/sprints, Notion import). Idempotent: re-running updates the
// existing "support" template's features rather than duplicating it.
//
// Run: npx tsx scripts/create-support-template.ts
import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import { TEMPLATE_FEATURE_KEYS } from "../src/lib/template-features"
import { SUPPORT_TEMPLATE } from "../src/lib/system-templates"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// Single source of truth lives in src/lib/system-templates.ts.
const SLUG = SUPPORT_TEMPLATE.slug
const NAME = SUPPORT_TEMPLATE.name
const DESCRIPTION = SUPPORT_TEMPLATE.description
const SUPPORT_FEATURES = SUPPORT_TEMPLATE.featureKeys

// Explicitly excluded (development-related): projects, modules, timeline, importForm.
const EXCLUDED = ["projects", "modules", "timeline", "importForm"]

async function main() {
  // Guard: every chosen key must be a real feature key.
  const unknown = SUPPORT_FEATURES.filter((k) => !TEMPLATE_FEATURE_KEYS.includes(k))
  if (unknown.length) throw new Error(`Unknown feature keys: ${unknown.join(", ")}`)

  const superAdmin = await prisma.profile.findFirst({
    where: { isSuperAdmin: true, deletedAt: null },
    select: { id: true, email: true },
  })
  if (!superAdmin) throw new Error("No super-admin profile found to own the template (createdById).")

  const existing = await prisma.template.findUnique({ where: { slug: SLUG }, select: { id: true } })

  if (existing) {
    // Idempotent: reset features to exactly the support set.
    await prisma.$transaction([
      prisma.templateFeature.deleteMany({ where: { templateId: existing.id } }),
      prisma.templateFeature.createMany({
        data: SUPPORT_FEATURES.map((key) => ({ templateId: existing.id, key })),
      }),
      prisma.template.update({
        where: { id: existing.id },
        data: { name: NAME, description: DESCRIPTION, isActive: true },
      }),
    ])
    console.log(`Updated existing "${SLUG}" template (${existing.id}) with ${SUPPORT_FEATURES.length} support features.`)
  } else {
    const created = await prisma.template.create({
      data: {
        name: NAME,
        slug: SLUG,
        description: DESCRIPTION,
        createdById: superAdmin.id,
        features: { create: SUPPORT_FEATURES.map((key) => ({ key })) },
      },
      select: { id: true },
    })
    console.log(`Created "${NAME}" template (${created.id}) owned by ${superAdmin.email}.`)
  }

  console.log(`Included (${SUPPORT_FEATURES.length}): ${SUPPORT_FEATURES.join(", ")}`)
  console.log(`Excluded (development): ${EXCLUDED.join(", ")}`)
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
