// Complete seed — covers every major model for a realistic dev/QA database.
// Idempotent: upserts all structure; skips tickets/sprints/workspace if already present.
// Run: npm run db:seed
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

// ── Constants ─────────────────────────────────────────────────────────────────

// Standard ticket workflow applied to every team.
// "Live" is the only terminal/complete status.
const STANDARD_STATUSES = [
  { label: "Not Started", color: "#94a3b8", order: 0, isComplete: false },
  { label: "In Progress", color: "#3b82f6", order: 1, isComplete: false },
  { label: "In Review",   color: "#f59e0b", order: 2, isComplete: false },
  { label: "Blocked",     color: "#ef4444", order: 3, isComplete: false },
  { label: "Live",        color: "#22c55e", order: 4, isComplete: true  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const days = (n: number) => new Date(Date.now() + n * 86_400_000)

async function main() {

  // ── 1. Profiles ─────────────────────────────────────────────────────────────
  // Profiles are created by Supabase Auth on first sign-in; we just read them.
  const profiles = await prisma.profile.findMany({ orderBy: { createdAt: "asc" } })
  if (profiles.length === 0) {
    throw new Error(
      "No profiles found. Sign in to the app at least once before seeding."
    )
  }

  // Destructure — fall back to the first user for any missing slot
  const [p0, p1 = p0, p2 = p0, p3 = p0, p4 = p0] = profiles
  const [admin, manager, lead, dev1, dev2] = [p0, p1, p2, p3, p4]

  // Promote roles (idempotent updates)
  await prisma.profile.update({ where: { id: admin.id },   data: { role: "admin"   } })
  if (manager.id !== admin.id)
    await prisma.profile.update({ where: { id: manager.id }, data: { role: "manager" } })
  if (lead.id !== admin.id)
    await prisma.profile.update({ where: { id: lead.id },    data: { role: "sub_manager"    } })

  // ── 1b. Tenant ────────────────────────────────────────────────────────────────
  // All seeded structure lives in a single "PEN" tenant. Every profile becomes a
  // member; the admin is the super-admin.
  const tenant = await prisma.tenant.upsert({
    where: { slug: "pen" },
    update: {},
    create: { slug: "pen", name: "PEN" },
  })
  await prisma.profile.update({ where: { id: admin.id }, data: { isSuperAdmin: true } })
  for (const p of profiles) {
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: p.id } },
      update: {},
      create: { tenantId: tenant.id, userId: p.id, role: p.role },
    })
  }

  // ── 2. Departments ───────────────────────────────────────────────────────────
  const deptEng = (await prisma.department.findFirst({ where: { name: "Engineering" } }))
    ?? (await prisma.department.create({ data: { name: "Engineering", tenantId: tenant.id } }))

  const deptDesign = (await prisma.department.findFirst({ where: { name: "Design" } }))
    ?? (await prisma.department.create({ data: { name: "Design", tenantId: tenant.id } }))

  // ── 3. Department managers ───────────────────────────────────────────────────
  await prisma.departmentManager.upsert({
    where: { departmentId_userId: { departmentId: deptEng.id, userId: admin.id } },
    update: {},
    create: { departmentId: deptEng.id, userId: admin.id, assignedBy: admin.id },
  })
  if (manager.id !== admin.id) {
    await prisma.departmentManager.upsert({
      where: { departmentId_userId: { departmentId: deptDesign.id, userId: manager.id } },
      update: {},
      create: { departmentId: deptDesign.id, userId: manager.id, assignedBy: admin.id },
    })
  }

  // ── 4. Teams ─────────────────────────────────────────────────────────────────
  const devTeam  = await prisma.subDepartment.upsert({ where: { prefix: "DEV"  }, update: {}, create: { name: "Backend",  prefix: "DEV",   departmentId: deptEng.id,    tenantId: tenant.id } })
  const techTeam = await prisma.subDepartment.upsert({ where: { prefix: "TECH" }, update: {}, create: { name: "DevOps",   prefix: "TECH",  departmentId: deptEng.id,    tenantId: tenant.id } })
  const phpTeam  = await prisma.subDepartment.upsert({ where: { prefix: "PHP"  }, update: {}, create: { name: "Platform", prefix: "PHP",   departmentId: deptEng.id,    tenantId: tenant.id } })
  const uiuxTeam = await prisma.subDepartment.upsert({ where: { prefix: "UI/UX"}, update: {}, create: { name: "UI/UX",   prefix: "UI/UX", departmentId: deptDesign.id, tenantId: tenant.id } })
  const itTeam   = await prisma.subDepartment.upsert({ where: { prefix: "IT"   }, update: {}, create: { name: "IT Ops",  prefix: "IT",    departmentId: deptEng.id,    tenantId: tenant.id } })
  const allTeams = [devTeam, techTeam, phpTeam, uiuxTeam, itTeam]

  // ── 5. Team statuses ─────────────────────────────────────────────────────────
  for (const team of allTeams) {
    for (const s of STANDARD_STATUSES) {
      await prisma.subDepartmentStatus.upsert({
        where: { subDepartmentId_label: { subDepartmentId: team.id, label: s.label } },
        update: { color: s.color, order: s.order, isComplete: s.isComplete },
        create: { subDepartmentId: team.id, ...s },
      })
    }
  }

  // ── 6. Team memberships + primary team assignment ────────────────────────────
  const memberDefs: Array<{ profile: typeof admin; team: typeof devTeam; role: "admin" | "manager" | "sub_manager" | "agent" }> = [
    { profile: admin,   team: devTeam,  role: "admin"   },
    { profile: manager, team: devTeam,  role: "manager" },
    { profile: lead,    team: techTeam, role: "sub_manager"    },
    { profile: dev1,    team: phpTeam,  role: "agent"   },
    { profile: dev2,    team: uiuxTeam, role: "agent"   },
  ]
  for (const { profile, team, role } of memberDefs) {
    await prisma.subDepartmentMembership.upsert({
      where: { userId_subDepartmentId: { userId: profile.id, subDepartmentId: team.id } },
      update: {},
      create: { userId: profile.id, subDepartmentId: team.id, role },
    })
    await prisma.profile.update({ where: { id: profile.id }, data: { subDepartmentId: team.id } })
  }
  // Any remaining profiles land on devTeam
  await prisma.profile.updateMany({ where: { subDepartmentId: null }, data: { subDepartmentId: devTeam.id } })

  // ── 7. Projects ──────────────────────────────────────────────────────────────
  type ProjectDef = {
    slug: string; name: string; color: string; description: string
    subDepartmentId: string; departmentId: string; projectStatus: string
  }
  const projectDefs: ProjectDef[] = [
    { slug: "web",      name: "Web Platform",   color: "#0a76b9", description: "Tenant portals, ticketing system, internal tooling",    subDepartmentId: devTeam.id,  departmentId: deptEng.id,    projectStatus: "active"   },
    { slug: "seo",      name: "SEO Platform",   color: "#7c3aed", description: "Crawler, rank tracker, and performance dashboard",       subDepartmentId: techTeam.id, departmentId: deptEng.id,    projectStatus: "active"   },
    { slug: "internal", name: "Internal Tools", color: "#f59e0b", description: "DevOps automation, monitoring, and internal dashboards", subDepartmentId: itTeam.id,   departmentId: deptEng.id,    projectStatus: "active"   },
    { slug: "mobile",   name: "Mobile App",     color: "#10b981", description: "iOS / Android client for the ticketing platform",        subDepartmentId: phpTeam.id,  departmentId: deptEng.id,    projectStatus: "pipeline" },
    { slug: "design-system", name: "Design System", color: "#f43f5e", description: "Component library, tokens, and Figma integration",  subDepartmentId: uiuxTeam.id, departmentId: deptDesign.id, projectStatus: "active"   },
  ]
  const projects: Record<string, { id: string }> = {}
  for (const { slug, name, color, description, subDepartmentId, departmentId, projectStatus } of projectDefs) {
    projects[slug] = await prisma.project.upsert({
      where: { slug },
      update: { color, description },
      create: { slug, name, color, description, subDepartmentId, departmentId, projectStatus, tenantId: tenant.id },
    })
  }

  // ── 8. Project members ───────────────────────────────────────────────────────
  const pmDefs: Array<{ slug: string; userId: string }> = [
    { slug: "web",          userId: admin.id   },
    { slug: "web",          userId: manager.id },
    { slug: "web",          userId: lead.id    },
    { slug: "seo",          userId: admin.id   },
    { slug: "seo",          userId: lead.id    },
    { slug: "internal",     userId: manager.id },
    { slug: "internal",     userId: dev1.id    },
    { slug: "mobile",       userId: admin.id   },
    { slug: "mobile",       userId: dev1.id    },
    { slug: "design-system",userId: dev2.id    },
    { slug: "design-system",userId: admin.id   },
  ]
  for (const { slug, userId } of pmDefs) {
    const projectId = projects[slug].id
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: {},
      create: { projectId, userId },
    })
  }

  // ── 9. Workspace / SLA rules / Routing rules ─────────────────────────────────
  if ((await prisma.workspace.count()) === 0) {
    await prisma.workspace.create({
      data: {
        name: "PEN Global",
        timeTrackingConfig: { enabled: true, billableDefault: true },
        approvalsConfig: { requireApproval: false },
        emailConfig: { inboundEnabled: true, domain: "support.penglobalbd.com" },
      },
    })
  }

  if ((await prisma.slaRule.count()) === 0) {
    await prisma.slaRule.createMany({
      data: [
        { priority: "Critical", firstResponseMins: 30,   resolutionMins: 240,  enabled: true },
        { priority: "High",   firstResponseMins: 120,  resolutionMins: 480,  enabled: true },
        { priority: "Medium", firstResponseMins: 480,  resolutionMins: 2880, enabled: true },
        { priority: "Low",    firstResponseMins: 1440, resolutionMins: 7200, enabled: true },
      ],
    })
  }

  if ((await prisma.routingRule.count()) === 0) {
    await prisma.routingRule.createMany({
      data: [
        { position: 0, conditionType: "subject_contains", conditionValue: "urgent",          subDepartmentId: devTeam.id,  priority: "Critical", enabled: true },
        { position: 1, conditionType: "subject_contains", conditionValue: "crash",            subDepartmentId: devTeam.id,  priority: "High",   enabled: true },
        { position: 2, conditionType: "from_domain",      conditionValue: "penglobalbd.com",  subDepartmentId: itTeam.id,   priority: "High",   enabled: true },
        { position: 3, conditionType: "body_contains",    conditionValue: "billing",          subDepartmentId: phpTeam.id,  priority: "Medium", enabled: true },
      ],
    })
  }

  if ((await prisma.institution.count()) === 0) {
    await prisma.institution.createMany({
      data: [
        { name: "PEN Global BD",    domain: "penglobalbd.com",   contactEmail: "admin@penglobalbd.com",   active: true },
        { name: "Demo University",  domain: "demo-uni.edu",      contactEmail: "it@demo-uni.edu",         active: true },
        { name: "Acme Corp",        domain: "acme.io",           contactEmail: "support@acme.io",         active: false },
      ],
    })
  }

  // ── 10. Sprints ──────────────────────────────────────────────────────────────
  const existingSprintCount = await prisma.sprint.count()
  let sprintDone:    { id: string } | null = null
  let sprintActive:  { id: string } | null = null
  let sprintPlanned: { id: string } | null = null
  let sprintPlanned2: { id: string } | null = null

  if (existingSprintCount === 0) {
    sprintDone = await prisma.sprint.create({
      data: {
        name: "Sprint 1 — Foundation",
        goal: "<p>Set up the core scaffold: auth, routing, database schema, and CI/CD pipeline.</p>",
        status: "completed",
        startDate: days(-28),
        endDate:   days(-14),
        pointsTarget: 40,
        createdById: admin.id,
        projectId: projects.web.id,
      },
    })
    sprintActive = await prisma.sprint.create({
      data: {
        name: "Sprint 2 — Core Features",
        goal: "<p>Deliver the board view, sprint management, real-time notifications, and the comments system.</p>",
        status: "active",
        startDate: days(-7),
        endDate:   days(7),
        pointsTarget: 55,
        createdById: admin.id,
        projectId: projects.web.id,
      },
    })
    sprintPlanned = await prisma.sprint.create({
      data: {
        name: "Sprint 3 — Polish & Performance",
        goal: "<p>Search across all entities, global keyboard shortcuts, sub-ticket trees, and performance profiling.</p>",
        status: "planned",
        startDate: days(14),
        endDate:   days(28),
        pointsTarget: 40,
        createdById: manager.id,
        projectId: projects.web.id,
      },
    })
    sprintPlanned2 = await prisma.sprint.create({
      data: {
        name: "Sprint 1 — SEO Crawler MVP",
        goal: "<p>Ship the first version of the property crawler and the rank-tracking data pipeline.</p>",
        status: "planned",
        startDate: days(7),
        endDate:   days(21),
        pointsTarget: 30,
        createdById: lead.id,
        projectId: projects.seo.id,
      },
    })
    console.log("✓ Seeded 4 sprints.")
  } else {
    // Load existing sprints so we can assign tickets to them
    const existing = await prisma.sprint.findMany({ orderBy: { createdAt: "asc" } })
    sprintDone    = existing.find((s) => s.status === "completed") ?? null
    sprintActive  = existing.find((s) => s.status === "active")    ?? null
    sprintPlanned = existing.find((s) => s.status === "planned")   ?? null
    console.log(`Sprints already exist (${existingSprintCount}) — skipping sprint seed.`)
  }

  // ── 11. Tickets ──────────────────────────────────────────────────────────────
  const existingTicketCount = await prisma.ticket.count()
  if (existingTicketCount > 0) {
    console.log(`Tickets already exist (${existingTicketCount}) — skipping ticket seed.`)
    return
  }

  // Shorthand ticket create. The BEFORE INSERT trigger stamps ticketNumber.
  type TD = {
    title: string
    description?: string
    type: "Bug" | "Feature" | "Task" | "Chore"
    priority: "Low" | "Medium" | "High" | "Critical"
    status: "Not Started" | "In Progress" | "In Review" | "Blocked" | "Live"
    project: keyof typeof projects
    subDepartmentId: string
    assigneeId?: string | null
    dueInDays?: number | null
    storyPoints?: number | null
    estimatedTime?: number | null
    sprintId?: string | null
    labels?: string[]
    parentId?: string | null
    startDate?: Date | null
  }

  async function mkTicket(t: TD) {
    return prisma.ticket.create({
      data: {
        title:         t.title,
        description:   t.description ?? null,
        type:          t.type,
        priority:      t.priority,
        status:        t.status,
        labels:        t.labels ?? [],
        tenantId:      tenant.id,
        projectId:     projects[t.project].id,
        subDepartmentId:        t.subDepartmentId,
        creatorId:     admin.id,
        assigneeId:    t.assigneeId ?? null,
        ticketNumber:  0, // BEFORE INSERT trigger overwrites this
        storyPoints:   t.storyPoints ?? null,
        estimatedTime: t.estimatedTime ?? null,
        sprintId:      t.sprintId ?? null,
        parentId:      t.parentId ?? null,
        startDate:     t.startDate ?? null,
        dueDate:       t.dueInDays != null ? days(t.dueInDays) : null,
      },
    })
  }

  // ── Web Platform — active sprint (Sprint 2) ──────────────────────────────────

  // Auth epic + sub-tasks
  const authEpic = await mkTicket({
    title: "Authentication overhaul — Entra ID + session hardening",
    description: "<p>Full auth rewrite: Microsoft Entra ID SSO via Supabase, JWT refresh rotation, and session pinning to prevent token reuse after logout.</p>",
    type: "Feature", priority: "Critical", status: "In Progress",
    project: "web", subDepartmentId: techTeam.id, assigneeId: manager.id,
    storyPoints: 13, estimatedTime: 480,
    sprintId: sprintActive?.id, labels: ["auth", "security"],
  })
  await mkTicket({
    title: "Entra ID OAuth flow via Supabase Auth provider",
    description: "<p>Register Entra ID app, configure Supabase OAuth, handle profile auto-provisioning on first login.</p>",
    type: "Task", priority: "Critical", status: "In Review",
    project: "web", subDepartmentId: techTeam.id, assigneeId: manager.id,
    storyPoints: 5, estimatedTime: 180,
    sprintId: sprintActive?.id, labels: ["auth"], parentId: authEpic.id,
  })
  await mkTicket({
    title: "JWT refresh token rotation on every use",
    type: "Task", priority: "High", status: "In Progress",
    project: "web", subDepartmentId: techTeam.id, assigneeId: lead.id,
    storyPoints: 3, estimatedTime: 120,
    sprintId: sprintActive?.id, labels: ["auth"], parentId: authEpic.id,
  })
  await mkTicket({
    title: "Session pinning — invalidate old tokens on new device login",
    type: "Task", priority: "High", status: "Not Started",
    project: "web", subDepartmentId: techTeam.id, assigneeId: null,
    storyPoints: 3, estimatedTime: 90,
    labels: ["auth", "security"], parentId: authEpic.id,
  })

  // Critical bug with sub-task
  const tenantLeak = await mkTicket({
    title: "Cross-tenant data leak in /api/projects",
    description: "<p>The auth middleware skips tenant context on the <code>/api/projects</code> route, causing cross-tenant rows to be returned. Needs a regression test added to the isolation suite.</p>",
    type: "Bug", priority: "Critical", status: "In Review",
    project: "web", subDepartmentId: devTeam.id, assigneeId: admin.id,
    dueInDays: 0, storyPoints: 5, estimatedTime: 240,
    sprintId: sprintActive?.id, labels: ["security", "db"],
    startDate: days(-5),
  })
  await mkTicket({
    title: "Regression test: tenant isolation on /api/projects",
    description: "<p>Write an integration test that signs in as two separate tenants and asserts no cross-tenant rows are returned.</p>",
    type: "Task", priority: "High", status: "In Progress",
    project: "web", subDepartmentId: devTeam.id, assigneeId: lead.id,
    storyPoints: 2, sprintId: sprintActive?.id,
    labels: ["testing", "security"], parentId: tenantLeak.id,
  })

  // Feature: inbound email
  const emailTicket = await mkTicket({
    title: "Inbound email → ticket webhook parser",
    description: "<p>Parse inbound support emails into tickets. Handle file attachments, thread detection via <code>In-Reply-To</code>, spam scoring, and routing rules.</p>",
    type: "Feature", priority: "High", status: "In Progress",
    project: "web", subDepartmentId: phpTeam.id, assigneeId: dev1.id,
    dueInDays: 3, storyPoints: 8, estimatedTime: 360,
    sprintId: sprintActive?.id, labels: ["email"],
    startDate: days(-4),
  })
  await mkTicket({
    title: "Resend webhook signature verification",
    description: "<p>Verify the <code>svix-signature</code> header before processing any inbound Resend webhook event.</p>",
    type: "Feature", priority: "High", status: "Not Started",
    project: "web", subDepartmentId: devTeam.id, assigneeId: null,
    storyPoints: 3, estimatedTime: 120,
    labels: ["email"], parentId: emailTicket.id,
  })

  // Board drag-and-drop (active sprint)
  const boardDnd = await mkTicket({
    title: "Board view — drag-and-drop ticket columns",
    description: "<p>Implement drag-and-drop between status columns using react-dnd. Optimistically update status and reconcile on success/failure.</p>",
    type: "Feature", priority: "High", status: "In Review",
    project: "web", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 8, estimatedTime: 300,
    sprintId: sprintActive?.id, labels: ["ui", "board"],
    startDate: days(-6),
  })
  await mkTicket({
    title: "Board: dragged card snaps to wrong column at boundary",
    type: "Bug", priority: "High", status: "In Progress",
    project: "web", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 2, dueInDays: 2,
    labels: ["ui", "dnd"], parentId: boardDnd.id,
  })

  // Notifications system (active sprint)
  await mkTicket({
    title: "Real-time notifications — assignment + mention + status change",
    description: "<p>Supabase Realtime subscription for notifications. Badge counter in nav, popover list with mark-all-read.</p>",
    type: "Feature", priority: "High", status: "Not Started",
    project: "web", subDepartmentId: devTeam.id, assigneeId: admin.id,
    storyPoints: 8, estimatedTime: 300,
    sprintId: sprintActive?.id, labels: ["notifications"],
  })

  // ── Web Platform — completed sprint (Sprint 1) ───────────────────────────────

  const scaffold = await mkTicket({
    title: "Next.js 15 scaffold + CI pipeline",
    description: "<p>Initial project setup: Next.js 15 App Router, Prisma 7 with PgBouncer adapter, Supabase Auth, Tailwind v4, GitHub Actions CI, Vercel preview deployments.</p>",
    type: "Chore", priority: "Medium", status: "Live",
    project: "web", subDepartmentId: devTeam.id, assigneeId: admin.id,
    storyPoints: 5, sprintId: sprintDone?.id,
  })
  await mkTicket({
    title: "Configure Supabase project, database, and RLS policies",
    type: "Task", priority: "High", status: "Live",
    project: "web", subDepartmentId: techTeam.id, assigneeId: manager.id,
    storyPoints: 3, sprintId: sprintDone?.id, parentId: scaffold.id,
  })
  await mkTicket({
    title: "Ticket list page with status filter and search",
    description: "<p>Server-rendered ticket list with client-side status/priority filters and debounced full-text search.</p>",
    type: "Feature", priority: "High", status: "Live",
    project: "web", subDepartmentId: devTeam.id, assigneeId: admin.id,
    storyPoints: 5, sprintId: sprintDone?.id, labels: ["ui"],
  })
  await mkTicket({
    title: "Ticket detail page — rich editor + comment thread",
    description: "<p>Tiptap-based rich text editor for descriptions. Comment thread with @mentions, file attachments, and edit/delete.</p>",
    type: "Feature", priority: "High", status: "Live",
    project: "web", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 8, sprintId: sprintDone?.id, labels: ["ui", "editor"],
  })
  await mkTicket({
    title: "Prisma schema — core models: Department, Team, Project, Ticket",
    type: "Chore", priority: "High", status: "Live",
    project: "web", subDepartmentId: devTeam.id, assigneeId: admin.id,
    storyPoints: 5, sprintId: sprintDone?.id, labels: ["db"],
  })

  // ── Web Platform — backlog ────────────────────────────────────────────────────

  await mkTicket({
    title: "Add Sentry to all API route handlers",
    description: "<p>Wrap every <code>route.ts</code> handler with Sentry error capture. Track userId on each scope.</p>",
    type: "Chore", priority: "Medium", status: "Not Started",
    project: "web", subDepartmentId: devTeam.id, assigneeId: admin.id,
    storyPoints: 3, estimatedTime: 90, labels: ["observability"],
  })
  await mkTicket({
    title: "Rate-limit public /api/status endpoint",
    type: "Task", priority: "Medium", status: "Not Started",
    project: "web", subDepartmentId: itTeam.id, assigneeId: null,
    storyPoints: 2, estimatedTime: 60, labels: ["security"],
  })
  await mkTicket({
    title: "Comment editor loses focus when @mention popup opens",
    type: "Bug", priority: "Medium", status: "Not Started",
    project: "web", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 2, dueInDays: 5, labels: ["ui", "editor"],
  })
  await mkTicket({
    title: "CSV export for ticket list with active filters applied",
    type: "Feature", priority: "Low", status: "Not Started",
    project: "web", subDepartmentId: devTeam.id, assigneeId: null,
    storyPoints: 3, labels: ["export"],
  })
  await mkTicket({
    title: "Ticket detail: copy-to-clipboard button for ticket ID",
    type: "Task", priority: "Low", status: "Not Started",
    project: "web", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 1, labels: ["ui"],
  })
  await mkTicket({
    title: "Webhook delivery retry with exponential backoff",
    type: "Feature", priority: "Medium", status: "Blocked",
    project: "web", subDepartmentId: phpTeam.id, assigneeId: dev1.id,
    storyPoints: 5, labels: ["webhooks", "reliability"],
    dueInDays: 10,
  })
  await mkTicket({
    title: "Bulk ticket status update from list view",
    type: "Feature", priority: "Medium", status: "Not Started",
    project: "web", subDepartmentId: devTeam.id, assigneeId: null,
    storyPoints: 5, sprintId: sprintPlanned?.id, labels: ["ui"],
  })
  await mkTicket({
    title: "Global search — tickets, projects, sprints, members",
    type: "Feature", priority: "High", status: "Not Started",
    project: "web", subDepartmentId: devTeam.id, assigneeId: admin.id,
    storyPoints: 8, sprintId: sprintPlanned?.id, estimatedTime: 360, labels: ["search"],
  })
  await mkTicket({
    title: "Keyboard shortcut layer (⌘K palette + per-page bindings)",
    type: "Feature", priority: "Medium", status: "Not Started",
    project: "web", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 5, sprintId: sprintPlanned?.id, labels: ["ui", "a11y"],
  })

  // ── SEO Platform ─────────────────────────────────────────────────────────────

  const crawlerEpic = await mkTicket({
    title: "Property crawler — schedule, run, and store results",
    description: "<p>Queue-based crawl scheduler. Configurable concurrency, user-agent rotation, robots.txt respect, and result persistence in PostgreSQL.</p>",
    type: "Feature", priority: "High", status: "In Progress",
    project: "seo", subDepartmentId: techTeam.id, assigneeId: lead.id,
    dueInDays: 14, storyPoints: 13, estimatedTime: 480,
    sprintId: sprintPlanned2?.id, labels: ["crawler"],
    startDate: days(-2),
  })
  await mkTicket({
    title: "Crawler: handle JavaScript-rendered pages via Puppeteer",
    type: "Task", priority: "High", status: "Not Started",
    project: "seo", subDepartmentId: techTeam.id, assigneeId: lead.id,
    storyPoints: 8, sprintId: sprintPlanned2?.id,
    labels: ["crawler"], parentId: crawlerEpic.id,
  })
  await mkTicket({
    title: "Crawler: respect robots.txt disallow rules",
    type: "Task", priority: "Medium", status: "Not Started",
    project: "seo", subDepartmentId: techTeam.id, assigneeId: null,
    storyPoints: 3, sprintId: sprintPlanned2?.id,
    labels: ["crawler"], parentId: crawlerEpic.id,
  })
  await mkTicket({
    title: "Crawl budget dashboard widget with sparkline trend",
    description: "<p>Widget showing crawl budget usage per property. Include daily sparkline, budget %, and link to full crawl log.</p>",
    type: "Feature", priority: "Medium", status: "Not Started",
    project: "seo", subDepartmentId: techTeam.id, assigneeId: lead.id,
    storyPoints: 5, estimatedTime: 180,
    sprintId: sprintPlanned2?.id, labels: ["data", "charts"],
  })
  await mkTicket({
    title: "Rank tracker — keyword position history line chart",
    type: "Feature", priority: "Medium", status: "Not Started",
    project: "seo", subDepartmentId: techTeam.id, assigneeId: null,
    storyPoints: 8, labels: ["data", "charts"],
  })
  await mkTicket({
    title: "Sitemap diff report — daily delta with regression alerts",
    type: "Feature", priority: "Low", status: "Not Started",
    project: "seo", subDepartmentId: techTeam.id, assigneeId: null,
    storyPoints: 5, labels: ["data"],
  })
  await mkTicket({
    title: "SEO: crawler rate-limiter crashes on malformed robots.txt",
    type: "Bug", priority: "High", status: "Not Started",
    project: "seo", subDepartmentId: techTeam.id, assigneeId: lead.id,
    storyPoints: 2, dueInDays: 3, labels: ["crawler", "crash"],
  })

  // ── Internal Tools ───────────────────────────────────────────────────────────

  await mkTicket({
    title: "Slack alerts for deploy failures (#deploys channel)",
    description: "<p>Post a structured message to <code>#deploys</code> on any failed GitHub Actions run. Include diff link, failed step, and one-click rollback instructions.</p>",
    type: "Task", priority: "Medium", status: "Not Started",
    project: "internal", subDepartmentId: itTeam.id, assigneeId: dev1.id,
    storyPoints: 2, estimatedTime: 90, dueInDays: 14, labels: ["devops"],
  })
  await mkTicket({
    title: "Automated daily database backup verification",
    description: "<p>Restore latest backup to a shadow database and run a row-count comparison against production to confirm integrity.</p>",
    type: "Task", priority: "High", status: "In Progress",
    project: "internal", subDepartmentId: itTeam.id, assigneeId: manager.id,
    storyPoints: 3, estimatedTime: 180, labels: ["devops", "db"],
    startDate: days(-3),
  })
  await mkTicket({
    title: "Clean up stale e2e test fixtures and snapshots",
    type: "Chore", priority: "Low", status: "Not Started",
    project: "internal", subDepartmentId: phpTeam.id, assigneeId: null,
    storyPoints: 1,
  })
  await mkTicket({
    title: "Dependency audit — upgrade packages with known CVEs",
    type: "Chore", priority: "High", status: "In Progress",
    project: "internal", subDepartmentId: devTeam.id, assigneeId: admin.id,
    storyPoints: 2, dueInDays: 5, labels: ["security"],
    startDate: days(-1),
  })

  // ── Mobile App ───────────────────────────────────────────────────────────────

  await mkTicket({
    title: "Push notification integration — FCM + APNs",
    description: "<p>Register device tokens on login. Receive assignment and mention notifications in the background via FCM (Android) and APNs (iOS).</p>",
    type: "Feature", priority: "High", status: "Not Started",
    project: "mobile", subDepartmentId: phpTeam.id, assigneeId: dev1.id,
    storyPoints: 8, labels: ["notifications"],
  })
  await mkTicket({
    title: "Offline mode — cache ticket list for 24 h with background sync",
    type: "Feature", priority: "Medium", status: "Not Started",
    project: "mobile", subDepartmentId: phpTeam.id, assigneeId: null,
    storyPoints: 5, labels: ["offline"],
  })
  await mkTicket({
    title: "Mobile: ticket detail crashes when assignee is null",
    type: "Bug", priority: "Critical", status: "Not Started",
    project: "mobile", subDepartmentId: phpTeam.id, assigneeId: dev1.id,
    storyPoints: 1, dueInDays: 1, labels: ["crash"],
  })
  await mkTicket({
    title: "Mobile: swipe-left to change ticket status from list view",
    type: "Feature", priority: "Low", status: "Not Started",
    project: "mobile", subDepartmentId: phpTeam.id, assigneeId: null,
    storyPoints: 3, labels: ["ui"],
  })

  // ── Design System ────────────────────────────────────────────────────────────

  await mkTicket({
    title: "Design token audit — align Figma tokens with Tailwind CSS vars",
    type: "Task", priority: "High", status: "In Progress",
    project: "design-system", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 5, estimatedTime: 240, labels: ["tokens"],
    startDate: days(-2),
  })
  await mkTicket({
    title: "Component: DatePicker — accessible, keyboard-navigable calendar",
    type: "Feature", priority: "Medium", status: "Not Started",
    project: "design-system", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 8, labels: ["component", "a11y"],
  })
  await mkTicket({
    title: "Storybook setup — document all existing UI components",
    type: "Chore", priority: "Medium", status: "Not Started",
    project: "design-system", subDepartmentId: uiuxTeam.id, assigneeId: null,
    storyPoints: 5, labels: ["docs"],
  })
  await mkTicket({
    title: "Component: DataTable — sortable, filterable, paginated",
    type: "Feature", priority: "Medium", status: "Not Started",
    project: "design-system", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 13, labels: ["component"],
  })
  await mkTicket({
    title: "Design system: Button component missing focus ring in high-contrast mode",
    type: "Bug", priority: "High", status: "Not Started",
    project: "design-system", subDepartmentId: uiuxTeam.id, assigneeId: dev2.id,
    storyPoints: 1, dueInDays: 7, labels: ["a11y", "component"],
  })

  // ── 12. Comments ─────────────────────────────────────────────────────────────

  const commentableTickets = await prisma.ticket.findMany({
    where: {
      title: {
        in: [
          "Cross-tenant data leak in /api/projects",
          "Inbound email → ticket webhook parser",
          "Board view — drag-and-drop ticket columns",
          "Authentication overhaul — Entra ID + session hardening",
          "Automated daily database backup verification",
        ],
      },
    },
  })

  type CommentSeed = { body: string; authorId: string; replyBody?: string; replyAuthorId?: string }
  const commentData: Record<string, CommentSeed> = {
    "Cross-tenant data leak in /api/projects": {
      body: "<p>Reproduced on staging — the middleware skips tenant context on the projects route. The fix is a one-liner in <code>middleware.ts</code> but we need the regression test before merging.</p>",
      authorId: admin.id,
      replyBody: "<p>Blocking the release cut on this one. CC @lead.</p>",
      replyAuthorId: manager.id,
    },
    "Inbound email → ticket webhook parser": {
      body: "<p>Basic <code>text/plain</code> parsing works. Still need to handle the <code>In-Reply-To</code> threading case and multipart MIME attachments.</p>",
      authorId: dev1.id,
      replyBody: "<p>Threading is the tricky part — let's timebox it to 1 day and ship without it if needed.</p>",
      replyAuthorId: manager.id,
    },
    "Board view — drag-and-drop ticket columns": {
      body: "<p>The boundary bug only triggers when releasing within ~5px of a column divider. Likely a hit-target issue in the drop zone calculation.</p>",
      authorId: dev2.id,
      replyBody: "<p>Try increasing the drop zone padding to 12px and see if that resolbs it.</p>",
      replyAuthorId: lead.id,
    },
    "Authentication overhaul — Entra ID + session hardening": {
      body: "<p>Scoped out the Supabase provider config — straightforward. The session pinning logic is the complex part; needs a Redis check on every request if we want true single-session.</p>",
      authorId: manager.id,
      replyBody: "<p>Let's go with soft pinning for MVP: invalidate old refresh tokens on new login but don't block concurrent reads.</p>",
      replyAuthorId: admin.id,
    },
    "Automated daily database backup verification": {
      body: "<p>Shadow restore takes ~8 min on the current backup size (~2 GB). Row-count comparison passes. Will schedule at 03:00 UTC.</p>",
      authorId: manager.id,
      replyBody: "<p>Add an alert if the row count delta is more than 0.5% — that would indicate a real discrepancy.</p>",
      replyAuthorId: admin.id,
    },
  }

  for (const ticket of commentableTickets) {
    const seed = commentData[ticket.title]
    if (!seed) continue
    const parent = await prisma.comment.create({
      data: { ticketId: ticket.id, authorId: seed.authorId, body: seed.body },
    })
    if (seed.replyBody) {
      await prisma.comment.create({
        data: {
          ticketId: ticket.id,
          authorId: seed.replyAuthorId ?? manager.id,
          parentId: parent.id,
          body: seed.replyBody,
        },
      })
    }
  }

  // ── 13. Time entries ─────────────────────────────────────────────────────────

  const timeTargets = await prisma.ticket.findMany({
    where: { status: { in: ["In Progress", "In Review", "Live"] } },
    take: 12,
    orderBy: { createdAt: "desc" },
  })

  const timeEntryDefs = [
    { offsetH: -48, durationM: 90,  profile: admin.id,   note: "Initial investigation" },
    { offsetH: -36, durationM: 120, profile: manager.id, note: "Implementation" },
    { offsetH: -24, durationM: 60,  profile: lead.id,    note: "Code review" },
    { offsetH: -20, durationM: 180, profile: admin.id,   note: "Implementation" },
    { offsetH: -16, durationM: 45,  profile: dev1.id,    note: "Bug fix" },
    { offsetH: -12, durationM: 150, profile: manager.id, note: "Feature development" },
    { offsetH: -8,  durationM: 75,  profile: lead.id,    note: "Testing" },
    { offsetH: -6,  durationM: 100, profile: dev2.id,    note: "UI implementation" },
    { offsetH: -4,  durationM: 90,  profile: admin.id,   note: "Review and merge" },
    { offsetH: -3,  durationM: 30,  profile: dev1.id,    note: "Hotfix" },
    { offsetH: -2,  durationM: 120, profile: manager.id, note: "Architecture review" },
    { offsetH: -1,  durationM: 45,  profile: lead.id,    note: "Documentation" },
  ]

  for (let i = 0; i < timeTargets.length && i < timeEntryDefs.length; i++) {
    const def = timeEntryDefs[i]
    const startedAt = new Date(Date.now() + def.offsetH * 3_600_000)
    const endedAt   = new Date(startedAt.getTime() + def.durationM * 60_000)
    await prisma.timeEntry.create({
      data: {
        profileId:    def.profile,
        ticketId:     timeTargets[i].id,
        startedAt,
        endedAt,
        durationSecs: def.durationM * 60,
        billable:     true,
        note:         def.note,
      },
    })
  }

  // ── 14. Notifications ────────────────────────────────────────────────────────

  const notifTickets = await prisma.ticket.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
  })

  for (const ticket of notifTickets.slice(0, 3)) {
    await prisma.notification.create({
      data: {
        recipientId: admin.id,
        actorId:     manager.id,
        type:        "assignment",
        ticketId:    ticket.id,
        message:     `${manager.name} assigned you to "${ticket.title}"`,
      },
    })
  }
  if (notifTickets[0]) {
    await prisma.notification.create({
      data: {
        recipientId: manager.id,
        actorId:     admin.id,
        type:        "status_change",
        ticketId:    notifTickets[0].id,
        message:     `Status changed to "In Review" on "${notifTickets[0].title}"`,
      },
    })
    await prisma.notification.create({
      data: {
        recipientId: lead.id,
        actorId:     admin.id,
        type:        "mention",
        ticketId:    notifTickets[0].id,
        message:     `${admin.name} mentioned you in a comment on "${notifTickets[0].title}"`,
      },
    })
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  const [ticketsFinal, commentsFinal, timesFinal] = await Promise.all([
    prisma.ticket.count(),
    prisma.comment.count(),
    prisma.timeEntry.count(),
  ])
  console.log(`✓ Departments : 2  (Engineering, Design)`)
  console.log(`✓ Teams       : ${allTeams.length}  (${allTeams.map((t) => t.prefix).join(", ")})`)
  console.log(`✓ Projects    : ${projectDefs.length}  (${projectDefs.map((p) => p.slug).join(", ")})`)
  console.log(`✓ Sprints     : 4  (1 completed, 1 active, 2 planned)`)
  console.log(`✓ Tickets     : ${ticketsFinal}`)
  console.log(`✓ Comments    : ${commentsFinal}`)
  console.log(`✓ Time entries: ${timesFinal}`)
  console.log(`✓ SLA rules   : 4`)
  console.log(`✓ Routing rules: 4`)
}

main()
  .then(async () => { await prisma.$disconnect(); await pool.end() })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); await pool.end(); process.exit(1) })
