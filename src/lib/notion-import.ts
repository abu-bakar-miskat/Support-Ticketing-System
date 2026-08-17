import { Client, isFullDataSource, isFullPage } from "@notionhq/client"
import type { DataSourceObjectResponse, PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { prisma } from "@/lib/db"
import type { TicketType, TicketPriority } from "@/generated/prisma/enums"
import { ensureProjectMembers } from "@/lib/ensure-project-members"
import { teamTenantId } from "@/lib/tenant-scope"

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotionDatabase = {
  id: string
  title: string
  properties: NotionProperty[]
}

export type NotionProperty = {
  id: string
  name: string
  type: string
}

export type ImportMapping = {
  projectsDatabaseId: string
  projectNameProp: string
  projectStatusProp?: string
  projectDescriptionProp?: string

  tasksDatabaseId: string
  taskTitleProp: string
  taskStatusProp?: string
  taskPriorityProp?: string
  taskTypeProp?: string
  taskAssigneeProp?: string
  taskDueDateProp?: string
  taskStartDateProp?: string
  taskProjectRelationProp?: string

  teamId: string
  creatorId: string
  departmentId?: string
}

export type ImportResult = {
  projectsCreated: number
  projectsSkipped: number
  ticketsCreated: number
  ticketsSkipped: number
  errors: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function uniqueSlug(base: string, existing: Set<string>): string {
  let slug = base
  let n = 2
  while (existing.has(slug)) slug = `${base}-${n++}`
  existing.add(slug)
  return slug
}

type PageProp = PageObjectResponse["properties"][string]

function getTextValue(prop: PageProp): string {
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("").trim()
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("").trim()
  return ""
}

function getSelectValue(prop: PageProp): string {
  if (prop.type === "select") return prop.select?.name ?? ""
  if (prop.type === "status") return (prop as any).status?.name ?? ""
  return ""
}

function getDateValue(prop: PageProp): Date | null {
  if (prop.type === "date") return prop.date?.start ? new Date(prop.date.start) : null
  return null
}

function getEmailsFromPeople(prop: PageProp): string[] {
  if (prop.type === "people") {
    return prop.people
      .map((p) => ("person" in p ? (p.person as any)?.email ?? "" : ""))
      .filter(Boolean)
  }
  return []
}

function getRelationIds(prop: PageProp): string[] {
  if (prop.type === "relation") return prop.relation.map((r) => r.id)
  return []
}

function mapPriority(raw: string): TicketPriority {
  const l = raw.toLowerCase()
  if (l.includes("urgent")) return "Urgent"
  if (l.includes("critical")) return "Critical"
  if (l.includes("high")) return "High"
  if (l.includes("low")) return "Low"
  return "Medium"
}

function mapType(raw: string): TicketType {
  const l = raw.toLowerCase()
  if (l.includes("bug") || l.includes("fix")) return "Bug"
  if (l.includes("feature") || l.includes("story")) return "Feature"
  if (l.includes("chore") || l.includes("maintenance")) return "Chore"
  return "Task"
}

// ── Fetch all pages from a datasource (handles pagination) ───────────────────

async function fetchAllPages(client: Client, dataSourceId: string): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = []
  let cursor: string | undefined

  do {
    const res = await client.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    })
    for (const item of res.results) {
      if (isFullPage(item)) pages.push(item)
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
  } while (cursor)

  return pages
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Validate token and return all datasources the integration can access. */
export async function previewNotionDatabases(token: string): Promise<NotionDatabase[]> {
  const client = new Client({ auth: token })
  const results: NotionDatabase[] = []
  let cursor: string | undefined

  do {
    const res = await client.search({
      filter: { property: "object", value: "data_source" },
      start_cursor: cursor,
      page_size: 100,
    })
    for (const item of res.results) {
      if (!isFullDataSource(item)) continue
      const ds = item as DataSourceObjectResponse
      const title = ds.title.map((t) => t.plain_text).join("").trim() || "Untitled"
      const properties: NotionProperty[] = Object.entries(ds.properties).map(([name, prop]) => ({
        id: prop.id,
        name,
        type: prop.type,
      }))
      results.push({ id: ds.id, title, properties })
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
  } while (cursor)

  return results
}

/** Run the full import: projects first, then tickets. */
export async function runNotionImport(token: string, mapping: ImportMapping): Promise<ImportResult> {
  const client = new Client({ auth: token })
  const result: ImportResult = {
    projectsCreated: 0,
    projectsSkipped: 0,
    ticketsCreated: 0,
    ticketsSkipped: 0,
    errors: [],
  }

  // Everything imported lands in the destination team's tenant.
  const importTenantId = await teamTenantId(mapping.teamId)
  if (!importTenantId) {
    result.errors.push(`Destination team ${mapping.teamId} not found`)
    return result
  }

  // ── 1. Collect existing slugs ─────────────────────────────────────────────
  const existingSlugs = new Set(
    (await prisma.project.findMany({ select: { slug: true } })).map((p) => p.slug),
  )

  // ── 2. Import projects ────────────────────────────────────────────────────
  const notionPageIdToProjectId = new Map<string, string>()
  const projectPages = await fetchAllPages(client, mapping.projectsDatabaseId)

  for (const page of projectPages) {
    try {
      const nameProp = page.properties[mapping.projectNameProp]
      const name = nameProp ? getTextValue(nameProp) : ""
      if (!name) { result.projectsSkipped++; continue }

      const alreadyImported = await prisma.project.findFirst({
        where: { description: { contains: `notion:${page.id}` } },
        select: { id: true },
      })
      if (alreadyImported) {
        notionPageIdToProjectId.set(page.id, alreadyImported.id)
        result.projectsSkipped++
        continue
      }

      const rawStatus = mapping.projectStatusProp
        ? getSelectValue(page.properties[mapping.projectStatusProp] ?? ({} as PageProp))
        : ""
      const rawDescription = mapping.projectDescriptionProp
        ? getTextValue(page.properties[mapping.projectDescriptionProp] ?? ({} as PageProp))
        : ""

      const slug = uniqueSlug(slugify(name) || "project", existingSlugs)
      const descriptionWithMeta = [rawDescription, `notion:${page.id}`].filter(Boolean).join("\n\n")

      const project = await prisma.project.create({
        data: {
          name,
          slug,
          description: descriptionWithMeta,
          projectStatus: rawStatus || "pipeline",
          departmentId: mapping.departmentId ?? null,
          tenantId: importTenantId,
        },
      })
      notionPageIdToProjectId.set(page.id, project.id)
      result.projectsCreated++
    } catch (e) {
      result.errors.push(`Project (${page.id}): ${String(e)}`)
    }
  }

  // ── 3. Build email → profileId cache ──────────────────────────────────────
  const profiles = await prisma.profile.findMany({
    where: { teamId: mapping.teamId },
    select: { id: true, email: true },
  })
  const emailToProfileId = new Map(profiles.map((p) => [p.email.toLowerCase(), p.id]))

  // ── 4. Import tickets ─────────────────────────────────────────────────────
  const taskPages = await fetchAllPages(client, mapping.tasksDatabaseId)

  for (const page of taskPages) {
    try {
      const titleProp = page.properties[mapping.taskTitleProp]
      const title = titleProp ? getTextValue(titleProp) : ""
      if (!title) { result.ticketsSkipped++; continue }

      const alreadyImported = await prisma.ticket.findFirst({
        where: { description: { contains: `notion:${page.id}` } },
        select: { id: true },
      })
      if (alreadyImported) { result.ticketsSkipped++; continue }

      let projectId: string | null = null
      if (mapping.taskProjectRelationProp) {
        const relProp = page.properties[mapping.taskProjectRelationProp]
        if (relProp) {
          for (const relId of getRelationIds(relProp)) {
            const mapped = notionPageIdToProjectId.get(relId)
            if (mapped) { projectId = mapped; break }
          }
        }
      }

      const rawStatus = mapping.taskStatusProp
        ? getSelectValue(page.properties[mapping.taskStatusProp] ?? ({} as PageProp))
        : "To Do"
      const rawPriority = mapping.taskPriorityProp
        ? getSelectValue(page.properties[mapping.taskPriorityProp] ?? ({} as PageProp))
        : ""
      const rawType = mapping.taskTypeProp
        ? getSelectValue(page.properties[mapping.taskTypeProp] ?? ({} as PageProp))
        : ""
      const dueDate = mapping.taskDueDateProp
        ? getDateValue(page.properties[mapping.taskDueDateProp] ?? ({} as PageProp))
        : null
      const startDate = mapping.taskStartDateProp
        ? getDateValue(page.properties[mapping.taskStartDateProp] ?? ({} as PageProp))
        : null

      let assigneeId: string | null = null
      if (mapping.taskAssigneeProp) {
        const assigneeProp = page.properties[mapping.taskAssigneeProp]
        if (assigneeProp) {
          for (const email of getEmailsFromPeople(assigneeProp)) {
            const pid = emailToProfileId.get(email.toLowerCase())
            if (pid) { assigneeId = pid; break }
          }
        }
      }

      await prisma.ticket.create({
        data: {
          title,
          description: `notion:${page.id}`,
          type: rawType ? mapType(rawType) : "Task",
          priority: rawPriority ? mapPriority(rawPriority) : "Medium",
          status: rawStatus || "To Do",
          ticketNumber: 0,
          dueDate,
          startDate,
          creator: { connect: { id: mapping.creatorId } },
          tenant: { connect: { id: importTenantId } },
          team: { connect: { id: mapping.teamId } },
          ...(projectId ? { project: { connect: { id: projectId } } } : {}),
          ...(assigneeId ? { assignee: { connect: { id: assigneeId } } } : {}),
        },
      })
      await ensureProjectMembers(projectId, [assigneeId])
      result.ticketsCreated++
    } catch (e) {
      result.errors.push(`Ticket (${page.id}): ${String(e)}`)
    }
  }

  return result
}
