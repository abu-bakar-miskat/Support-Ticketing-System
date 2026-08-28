// Seed a fixed set of PEN subDepartment members as real, login-capable accounts.
//
// Profiles are keyed by the Supabase auth user id, so we can't just insert
// Profile rows — the id must match a real auth.users row or login (which does
// findUnique by id) never reconciles them. So for each person we:
//   1. create (or reuse) a confirmed Supabase auth user via the admin API
//      (email_confirm: true — no confirmation email is sent),
//   2. upsert the Profile row with that exact auth uuid,
//   3. upsert a membership in the primary "pen" tenant so admins can see them.
//
// Idempotent: safe to re-run. Run: npx tsx prisma/seed-users.ts
import "dotenv/config"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { createClient } from "@supabase/supabase-js"
import { PrismaClient } from "../src/generated/prisma/client"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USERS: Array<{ email: string; name: string }> = [
  { email: "abu.bakar@penglobalbd.com",  name: "Miskat" },
  { email: "kazi.r@penglobalbd.com",     name: "Kazi Ragib" },
  { email: "nishan.a@penglobalbd.com",   name: "Nishan" },
  { email: "omer.f@penglobalbd.com",     name: "Omer Faruk" },
  { email: "shafayath.r@penglobalbd.com", name: "Shafayath Jamil Rafi" },
  { email: "riaz.a@penglobalbd.com",     name: "Riaz Ahammed" },
]

/** Find an existing confirmed auth user by email, paging through the list. */
async function findAuthUserByEmail(email: string) {
  const target = email.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) break
  }
  return null
}

async function ensureAuthUser(email: string, name: string) {
  const existing = await findAuthUserByEmail(email)
  if (existing) return { id: existing.id, created: false }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true, // mark confirmed; does NOT send any email
    user_metadata: { name },
  })
  if (error || !data.user) throw error ?? new Error(`createUser failed for ${email}`)
  return { id: data.user.id, created: true }
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "pen" } })
  if (!tenant) {
    throw new Error('Primary tenant "pen" not found — run the main seed first (npm run db:seed).')
  }

  for (const { email, name } of USERS) {
    const { id, created } = await ensureAuthUser(email, name)

    await prisma.profile.upsert({
      where: { id },
      update: { email, name },
      create: { id, email, name, role: "agent" },
    })

    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: id } },
      update: {},
      create: { tenantId: tenant.id, userId: id, role: "agent", isActive: true },
    })

    console.log(`${created ? "＋ created" : "✓ exists "}  ${name.padEnd(22)} ${email}`)
  }

  console.log(`\nSeeded ${USERS.length} users into tenant "${tenant.name}".`)
}

main()
  .then(async () => { await prisma.$disconnect(); await pool.end() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); await pool.end(); process.exit(1) })
