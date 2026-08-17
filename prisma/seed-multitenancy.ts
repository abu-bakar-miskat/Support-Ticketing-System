// Dev seed for multitenancy verification. Creates TWO independent tenants, each
// with its own admin, department, team, project, and a few tickets, plus a
// cross-tenant super-admin. Safe to re-run (idempotent upserts).
//
//   npx tsx --env-file=.env prisma/seed-multitenancy.ts
//
// The super-admin id matches the DEV_AUTH_BYPASS synthetic user so you can drive
// the app in dev without a real login.
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

const SUPER_ADMIN_ID = "00000000-0000-0000-0000-000000000001" // matches DEV_AUTH_BYPASS

const STATUSES = [
  { label: "Not Started", color: "#94a3b8", order: 0, isComplete: false },
  { label: "In Progress", color: "#3b82f6", order: 1, isComplete: false },
  { label: "Live", color: "#22c55e", order: 2, isComplete: true },
]

async function seedTenant(opts: {
  slug: string
  name: string
  adminId: string
  adminEmail: string
  deptName: string
  teamPrefix: string
  teamName: string
  projectSlug: string
}) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: opts.slug },
    update: { name: opts.name },
    create: { slug: opts.slug, name: opts.name },
  })

  // Tenant admin profile
  await prisma.profile.upsert({
    where: { id: opts.adminId },
    update: { email: opts.adminEmail, name: `${opts.name} Admin`, role: "admin" },
    create: { id: opts.adminId, email: opts.adminEmail, name: `${opts.name} Admin`, role: "admin" },
  })
  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: opts.adminId } },
    update: { role: "admin" },
    create: { tenantId: tenant.id, userId: opts.adminId, role: "admin" },
  })

  const dept = (await prisma.department.findFirst({ where: { name: opts.deptName, tenantId: tenant.id } }))
    ?? (await prisma.department.create({ data: { name: opts.deptName, tenantId: tenant.id } }))

  const team = await prisma.team.upsert({
    where: { prefix: opts.teamPrefix },
    update: {},
    create: { name: opts.teamName, prefix: opts.teamPrefix, departmentId: dept.id, tenantId: tenant.id },
  })
  for (const s of STATUSES) {
    await prisma.teamStatus.upsert({
      where: { teamId_label: { teamId: team.id, label: s.label } },
      update: {},
      create: { teamId: team.id, ...s },
    })
  }

  const project = await prisma.project.upsert({
    where: { slug: opts.projectSlug },
    update: {},
    create: {
      slug: opts.projectSlug,
      name: `${opts.name} Platform`,
      teamId: team.id,
      departmentId: dept.id,
      tenantId: tenant.id,
      projectStatus: "active",
    },
  })

  const existing = await prisma.ticket.count({ where: { tenantId: tenant.id } })
  if (existing === 0) {
    for (let i = 1; i <= 3; i++) {
      await prisma.ticket.create({
        data: {
          title: `${opts.name} ticket ${i}`,
          type: "Task",
          priority: "Medium",
          status: "Not Started",
          ticketNumber: 0,
          tenantId: tenant.id,
          teamId: team.id,
          projectId: project.id,
          creatorId: opts.adminId,
        },
      })
    }
  }

  return { tenant, adminId: opts.adminId }
}

async function main() {
  const pen = await seedTenant({
    slug: "pen",
    name: "PEN",
    adminId: "00000000-0000-0000-0000-0000000000a1",
    adminEmail: "admin@pen.dev",
    deptName: "Engineering",
    teamPrefix: "PEN",
    teamName: "PEN Backend",
    projectSlug: "pen-web",
  })

  const acme = await seedTenant({
    slug: "acme",
    name: "Acme",
    adminId: "00000000-0000-0000-0000-0000000000a2",
    adminEmail: "admin@acme.dev",
    deptName: "Product",
    teamPrefix: "ACME",
    teamName: "Acme Core",
    projectSlug: "acme-web",
  })

  // Cross-tenant super-admin (matches DEV_AUTH_BYPASS synthetic user)
  await prisma.profile.upsert({
    where: { id: SUPER_ADMIN_ID },
    update: { isSuperAdmin: true, role: "admin" },
    create: { id: SUPER_ADMIN_ID, email: "dev@local.test", name: "Dev Super Admin", role: "admin", isSuperAdmin: true },
  })
  for (const t of [pen.tenant, acme.tenant]) {
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: t.id, userId: SUPER_ADMIN_ID } },
      update: { role: "admin" },
      create: { tenantId: t.id, userId: SUPER_ADMIN_ID, role: "admin" },
    })
  }

  const counts = {
    tenants: await prisma.tenant.count(),
    profiles: await prisma.profile.count(),
    tickets: await prisma.ticket.count(),
    perTenant: {
      PEN: await prisma.ticket.count({ where: { tenantId: pen.tenant.id } }),
      Acme: await prisma.ticket.count({ where: { tenantId: acme.tenant.id } }),
    },
  }
  console.log("Seeded:", JSON.stringify(counts, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
