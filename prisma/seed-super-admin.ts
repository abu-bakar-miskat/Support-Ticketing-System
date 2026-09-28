// Seed a single super-admin account: nur.m@penglobalbd.com.
//
// Profiles are keyed by the Supabase auth user id, so we can't just insert a
// Profile row — the id must match a real auth.users row or login (which does
// findUnique by id) never reconciles it. So we:
//   1. create (or reuse) a confirmed Supabase auth user via the admin API
//      (email_confirm: true — no confirmation email is sent),
//   2. upsert the Profile row with that exact auth uuid, role "admin" and
//      isSuperAdmin: true.
//
// No Tenant or TenantMembership row is created — isSuperAdmin transcends tenants.
//
// Idempotent: safe to re-run. Run: npx tsx prisma/seed-super-admin.ts
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

const SUPER_ADMIN = { email: "nur.m@penglobalbd.com", name: "Nur Mohammod" }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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
  const { email, name } = SUPER_ADMIN
  const { id, created } = await ensureAuthUser(email, name)

  // Promote to super-admin. `update` runs on re-seed so an existing agent/manager
  // profile is elevated too. isSuperAdmin transcends tenants, so no Tenant or
  // TenantMembership row is created here.
  await prisma.profile.upsert({
    where: { id },
    update: { email, name, role: "admin", isSuperAdmin: true, isActive: true },
    create: { id, email, name, role: "admin", isSuperAdmin: true, isActive: true },
  })

  console.log(`${created ? "＋ created" : "✓ exists "}  ${name.padEnd(22)} ${email}`)
  console.log(`✓ Super-admin seeded (isSuperAdmin: true, no tenant created).`)
}

main()
  .then(async () => { await prisma.$disconnect(); await pool.end() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); await pool.end(); process.exit(1) })
