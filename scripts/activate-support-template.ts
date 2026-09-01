// Activates the "Support" catalogue template for a tenant, so the settings nav
// and sidebar reflect ONLY that template's features (getTenantActiveFeatureKeys
// stops failing open to "ALL"). Tenant-wide: affects every user in the tenant.
// Idempotent: re-running just re-affirms the ACTIVE grant.
//
// Run:  TENANT="Pen Global BD" npx tsx scripts/activate-support-template.ts
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

const TEMPLATE_SLUG = "support"
const TENANT_NAME = process.env.TENANT ?? "Pen Global BD"

async function main() {
  const template = await prisma.template.findUnique({ where: { slug: TEMPLATE_SLUG }, select: { id: true } })
  if (!template) throw new Error(`Template "${TEMPLATE_SLUG}" not found — run create-support-template.ts first.`)

  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NAME }, select: { id: true, name: true } })
  if (!tenant) throw new Error(`Tenant "${TENANT_NAME}" not found. Set TENANT env to the exact tenant name.`)

  const actor = await prisma.profile.findFirst({
    where: { isSuperAdmin: true, deletedAt: null },
    select: { id: true },
  })
  if (!actor) throw new Error("No super-admin profile found to record as activator.")

  await prisma.tenantTemplate.upsert({
    where: { tenantId_templateId: { tenantId: tenant.id, templateId: template.id } },
    update: { status: "ACTIVE", revokedAt: null },
    create: { tenantId: tenant.id, templateId: template.id, status: "ACTIVE", activatedById: actor.id },
  })

  console.log(`Activated "${TEMPLATE_SLUG}" template for tenant "${tenant.name}".`)
  console.log("Settings/sidebar will now show only that template's features (Projects, Modules, Timeline, Notion import are excluded).")
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
