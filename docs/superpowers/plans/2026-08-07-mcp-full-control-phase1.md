# MCP Full-Control Tools — Phase 1 (Ticket Mutations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `update_ticket`, `add_comment`, and `delete_ticket` MCP tools so an admin/read_write API key can mutate tickets through the claude.ai connector, mirroring the REST routes' behavior (activity events, notifications, completion side-effects).

**Architecture:** Three new exported async functions in `src/lib/mcp/tools.ts` following the existing `createTicket` pattern — take `(ApiKeyContext, input)`, hit Prisma directly, return `ToolResult`. Registered in the MCP route with zod schemas. Mutations are attributed to the key owner (`ctx.createdById`). Status changes run inside a transaction that sets `app.current_user_id` so the existing DB trigger stamps the ActivityLog actor; all other field changes write explicit `appendTicketEvent` rows exactly like `PATCH /api/tickets/[id]` does.

**Tech Stack:** Next.js App Router route handlers, Prisma, zod, vitest (mocked Prisma — see `src/lib/mcp/tools.test.ts`), `mcp-handler`.

**Spec:** `docs/superpowers/specs/2026-08-07-mcp-full-control-tools-design.md`

## Global Constraints

- **NEVER run `git commit`** — Dumitru commits after review (standing rule). Every task ends at "tests pass"; no commit steps.
- **No schema changes, no migrations.** Never run `prisma migrate dev` or `prisma migrate reset` (shared live DB — see AGENTS.md).
- **Tests must mock every module that emails or notifies real people**: `@/lib/notify`, `@/lib/email`, `@/lib/mentions`, `@/lib/ticket-completion-notify`, `@/lib/ticket-cascade`, `@/lib/timer-autostop`, `@/lib/ticket-events`. Nothing in tests may touch the real DB either — `@/lib/db` is always mocked.
- Run only the MCP tests during tasks: `npx vitest run src/lib/mcp/tools.test.ts` (the full suite has a pre-existing ~24-failure baseline unrelated to this work).
- Scope-gate messages follow the existing voice, e.g. `"This API key is read-only — ticket updates require a read_write key"`.
- Ref parsing reuses the module-level `REF_RE` and produces errors in the existing style (`Could not parse …`, `Ticket WEB-999 not found (or outside this key's department)`).

## Shared signatures (used across tasks)

Already exported and imported at the top of `tools.ts` or available in `src/lib/`:

```ts
// existing imports in tools.ts
import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"          // ({recipientId, actorId, type, ticketId, message, commentId?}) => Promise<void>
import { sendAssignmentEmail } from "@/lib/email"          // ({to, assigneeName, assigneeId, ticketId, humanId, ticketTitle, assignedByName, assignedById?, departmentId}) => Promise<void>
import { appendTicketEvent } from "@/lib/ticket-events"    // (ticketId, actorId, action, metadata) => Promise<void>
import { ensureProjectMembers } from "@/lib/ensure-project-members" // (projectId, userIds) => Promise<void>

// new imports added by these tasks
import { broadcastTicketEvent } from "@/lib/ticket-events" // (ticketId, action, actorId, metadata) => Promise<void>
import { resolveMentionedProfiles, processMentions } from "@/lib/mentions"
// resolveMentionedProfiles(body, ticketId) => Promise<Array<{id: string}>>
// processMentions({commentId, ticketId, actorId, actorName, body, ticketTitle}) => Promise<void>
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
// ({ticketId, ticketTitle, humanId, teamId, creatorId, actorId, actorName}) => Promise<void>
import { sendResolutionEmail } from "@/lib/email"
// ({to, submitterName, formName, ticketTitle, departmentId}) => Promise<void>
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade" // (ticketId) => Promise<void>
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop" // (ticketId, toStatus) => Promise<void>
```

The tests' Prisma mock must grow these members (extend the existing `vi.mock("@/lib/db", …)` factory):

```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    team: { findMany: vi.fn(), findFirst: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn() },
    ticket: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    profile: { findFirst: vi.fn() },
    teamStatus: { findFirst: vi.fn(), findMany: vi.fn() },
    sprint: { findFirst: vi.fn() },
    module: { findFirst: vi.fn() },
    comment: { create: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
```

And the new module mocks (top of `tools.test.ts`, alongside the existing ones):

```ts
vi.mock("@/lib/ticket-events", () => ({
  appendTicketEvent: vi.fn().mockResolvedValue(undefined),
  broadcastTicketEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ensure-project-members", () => ({ ensureProjectMembers: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/mentions", () => ({
  resolveMentionedProfiles: vi.fn().mockResolvedValue([]),
  processMentions: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ticket-completion-notify", () => ({ notifyTicketCompletion: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ticket-cascade", () => ({ cascadeCompleteToSubtickets: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/timer-autostop", () => ({ stopRunningTimersOnStatusChange: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/email", () => ({
  sendAssignmentEmail: vi.fn().mockResolvedValue(undefined),
  sendResolutionEmail: vi.fn().mockResolvedValue(undefined),
}))
```

Note `@/lib/email` already had a mock with only `sendAssignmentEmail` — replace it with the two-function version above.

`$transaction` mock pattern for tests that exercise status changes:

```ts
const tx = {
  $executeRaw: vi.fn().mockResolvedValue(undefined),
  ticket: { update: vi.fn().mockResolvedValue(undefined), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
}
vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (t: typeof tx) => unknown)(tx))
```

---

### Task 1: `updateTicket` — scaffold, scope gate, simple fields (title, description, type, priority)

**Files:**
- Modify: `src/lib/mcp/tools.ts` (append after `createTicket`)
- Test: `src/lib/mcp/tools.test.ts` (new `describe("updateTicket")`)

**Interfaces:**
- Consumes: `REF_RE`, `teamWhere`, `TICKET_TYPES`, `TICKET_PRIORITIES`, `ToolResult`, `appendTicketEvent`.
- Produces: `export async function updateTicket(ctx: ApiKeyContext, input: UpdateTicketInput): Promise<ToolResult>` where

```ts
export type UpdateTicketInput = {
  ref: string
  title?: string
  description?: string | null
  type?: (typeof TICKET_TYPES)[number]
  priority?: (typeof TICKET_PRIORITIES)[number]
  status?: string            // Task 3
  assigneeEmail?: string | null // Task 2
  projectId?: string | null     // Task 2
  sprintId?: string | null      // Task 2
  moduleId?: string | null      // Task 2
}
```

Success payload shape (relied on by all later tasks): `{ ok: true, data: { ref, changed: Record<string, { from: unknown; to: unknown }> } }`.

- [ ] **Step 1: Write the failing tests**

Add to `tools.test.ts` (after extending the mocks per "Shared signatures" above; import `updateTicket` from `./tools`):

```ts
describe("updateTicket", () => {
  it("rejects read-scope keys", async () => {
    const res = await updateTicket(readCtx, { ref: "WEB-1", title: "New" })
    expect(res).toEqual({
      ok: false,
      message: "This API key is read-only — ticket updates require a read_write key",
    })
  })

  it("errors when the ticket is not found", async () => {
    mockTicketFindFirst.mockResolvedValue(null as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-999", title: "New" })
    expect(res).toEqual({
      ok: false,
      message: "Ticket WEB-999 not found (or outside this key's department)",
    })
  })

  it("updates simple fields and emits one event per changed field", async () => {
    mockTicketFindFirst.mockResolvedValue({
      id: "t-1", title: "Old title", description: null, type: "Bug", priority: "Low",
      status: "Backlog", labels: [], closedAt: null, ticketNumber: 7,
      teamId: "team-web", projectId: "p-1", sprintId: null, moduleId: null,
      assigneeId: null, creatorId: "user-9",
      team: { prefix: "WEB", departmentId: "dept-1" },
      assignee: null, sprint: null, module: null, project: { id: "p-1", name: "Misc" },
      intake: null,
    } as never)
    mockTicketUpdate.mockResolvedValue({} as never)

    const res = await updateTicket(writeCtx, { ref: "WEB-7", title: "New title", priority: "High" })

    expect(res.ok).toBe(true)
    expect(mockTicketUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "t-1" },
      data: { title: "New title", priority: "High" },
    })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "TITLE_CHANGED", {
      from: "Old title", to: "New title",
    })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "PRIORITY_CHANGED", {
      from: "Low", to: "High",
    })
    expect((res as { ok: true; data: { changed: Record<string, unknown> } }).data.changed).toEqual({
      title: { from: "Old title", to: "New title" },
      priority: { from: "Low", to: "High" },
    })
  })

  it("returns ok with empty changed when no provided field differs", async () => {
    mockTicketFindFirst.mockResolvedValue({
      id: "t-1", title: "Same", description: null, type: "Bug", priority: "Low",
      status: "Backlog", labels: [], closedAt: null, ticketNumber: 7,
      teamId: "team-web", projectId: "p-1", sprintId: null, moduleId: null,
      assigneeId: null, creatorId: "user-9",
      team: { prefix: "WEB", departmentId: "dept-1" },
      assignee: null, sprint: null, module: null, project: { id: "p-1", name: "Misc" },
      intake: null,
    } as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-7", title: "Same" })
    expect(res.ok).toBe(true)
    expect(mockTicketUpdate).not.toHaveBeenCalled()
    expect((res as { ok: true; data: { changed: Record<string, unknown> } }).data.changed).toEqual({})
  })
})
```

Also add near the other mock aliases: `const mockTicketUpdate = vi.mocked(prisma.ticket.update)` and import `{ appendTicketEvent }` from `"@/lib/ticket-events"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: FAIL — `updateTicket` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/mcp/tools.ts`:

```ts
export type UpdateTicketInput = {
  ref: string
  title?: string
  description?: string | null
  type?: (typeof TICKET_TYPES)[number]
  priority?: (typeof TICKET_PRIORITIES)[number]
  status?: string
  assigneeEmail?: string | null
  projectId?: string | null
  sprintId?: string | null
  moduleId?: string | null
}

const TICKET_SELECT_FOR_UPDATE = {
  id: true, title: true, description: true, type: true, priority: true,
  status: true, labels: true, closedAt: true, ticketNumber: true,
  teamId: true, projectId: true, sprintId: true, moduleId: true,
  assigneeId: true, creatorId: true,
  team: { select: { prefix: true, departmentId: true } },
  assignee: { select: { id: true, name: true } },
  sprint: { select: { id: true, name: true } },
  module: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  intake: { select: { submitterName: true, submitterEmail: true, formConfig: { select: { name: true } } } },
} as const

export async function updateTicket(ctx: ApiKeyContext, input: UpdateTicketInput): Promise<ToolResult> {
  if (ctx.scope !== "read_write" && ctx.scope !== "admin") {
    return { ok: false, message: "This API key is read-only — ticket updates require a read_write key" }
  }

  const match = input.ref.trim().match(REF_RE)
  if (!match) {
    return { ok: false, message: `Could not parse "${input.ref}" — expected a ticket reference like WEB-123` }
  }
  const prefix = match[1].toUpperCase()
  const number = parseInt(match[2], 10)

  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: number, deletedAt: null, team: { prefix, ...teamWhere(ctx) } },
    select: TICKET_SELECT_FOR_UPDATE,
  })
  if (!ticket) {
    return { ok: false, message: `Ticket ${prefix}-${number} not found (or outside this key's department)` }
  }

  const data: Record<string, unknown> = {}
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  const events: Array<() => Promise<void>> = []
  const actorId = ctx.createdById

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) return { ok: false, message: "title cannot be empty" }
    if (title !== ticket.title) {
      data.title = title
      changed.title = { from: ticket.title, to: title }
      events.push(() => appendTicketEvent(ticket.id, actorId, "TITLE_CHANGED", { from: ticket.title, to: title }))
    }
  }

  if (input.description !== undefined) {
    const description = input.description === null ? null : input.description.trim() || null
    if (description !== ticket.description) {
      data.description = description
      changed.description = { from: ticket.description, to: description }
      events.push(() => appendTicketEvent(ticket.id, actorId, "DESCRIPTION_CHANGED", {
        hadDescription: !!ticket.description, to: description,
      }))
    }
  }

  if (input.type !== undefined && input.type !== ticket.type) {
    data.type = input.type
    changed.type = { from: ticket.type, to: input.type }
  }

  if (input.priority !== undefined && input.priority !== ticket.priority) {
    data.priority = input.priority
    changed.priority = { from: ticket.priority, to: input.priority }
    events.push(() => appendTicketEvent(ticket.id, actorId, "PRIORITY_CHANGED", {
      from: ticket.priority, to: input.priority,
    }))
  }

  // Tasks 2 and 3 extend here: assignee/project/sprint/module, then status.

  if (Object.keys(data).length === 0) {
    return { ok: true, data: { ref: `${prefix}-${number}`, changed } }
  }

  await prisma.ticket.update({ where: { id: ticket.id }, data })
  await Promise.all(events.map((fire) => fire().catch(() => undefined)))

  return { ok: true, data: { ref: `${prefix}-${number}`, changed } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: PASS (all pre-existing tests still green).

---

### Task 2: `updateTicket` — assignee, project, sprint, module

**Files:**
- Modify: `src/lib/mcp/tools.ts` (inside `updateTicket`, at the `// Tasks 2 and 3 extend here` marker, and after the `prisma.ticket.update` call)
- Test: `src/lib/mcp/tools.test.ts`

**Interfaces:**
- Consumes: Task 1's `updateTicket` skeleton, `changed`/`data`/`events` accumulators; `ensureProjectMembers(projectId, userIds)`; `createNotification`; `sendAssignmentEmail`; `BASE_URL`.
- Produces: the same `updateTicket` signature, now honoring `assigneeEmail` (string sets, `null` unassigns), `projectId`, `sprintId`, `moduleId` (each `null`able to clear).

- [ ] **Step 1: Write the failing tests**

```ts
  it("assigns by email, notifies and emails the new assignee", async () => {
    mockTicketFindFirst.mockResolvedValue({
      id: "t-1", title: "Fix login", description: null, type: "Bug", priority: "Low",
      status: "Backlog", labels: [], closedAt: null, ticketNumber: 7,
      teamId: "team-web", projectId: "p-1", sprintId: null, moduleId: null,
      assigneeId: null, creatorId: "user-9",
      team: { prefix: "WEB", departmentId: "dept-1" },
      assignee: null, sprint: null, module: null, project: { id: "p-1", name: "Misc" },
      intake: null,
    } as never)
    mockProfileFindFirst.mockResolvedValue({ id: "user-2", name: "Abu", email: "abu@pen.org" } as never)
    mockTicketUpdate.mockResolvedValue({} as never)

    const res = await updateTicket(writeCtx, { ref: "WEB-7", assigneeEmail: "abu@pen.org" })

    expect(res.ok).toBe(true)
    expect(mockTicketUpdate.mock.calls[0][0]).toMatchObject({ data: { assigneeId: "user-2" } })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "ASSIGNED", {
      fromId: null, fromName: null, toId: "user-2", toName: "Abu",
    })
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith({
      recipientId: "user-2", actorId: "user-1", type: "assignment", ticketId: "t-1", message: "Fix login",
    })
    expect(vi.mocked(sendAssignmentEmail)).toHaveBeenCalledWith(expect.objectContaining({
      to: "abu@pen.org", humanId: "WEB-7", assignedByName: "Dumitru",
    }))
    expect(vi.mocked(ensureProjectMembers)).toHaveBeenCalledWith("p-1", ["user-2"])
  })

  it("errors when assignee email is unknown", async () => {
    mockTicketFindFirst.mockResolvedValue({
      id: "t-1", title: "T", description: null, type: "Bug", priority: "Low",
      status: "Backlog", labels: [], closedAt: null, ticketNumber: 7,
      teamId: "team-web", projectId: "p-1", sprintId: null, moduleId: null,
      assigneeId: null, creatorId: "user-9",
      team: { prefix: "WEB", departmentId: "dept-1" },
      assignee: null, sprint: null, module: null, project: { id: "p-1", name: "Misc" },
      intake: null,
    } as never)
    mockProfileFindFirst.mockResolvedValue(null as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-7", assigneeEmail: "ghost@pen.org" })
    expect(res).toEqual({ ok: false, message: "No user found with email ghost@pen.org" })
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it("moves project after validating it, and errors on unknown sprint", async () => {
    const base = {
      id: "t-1", title: "T", description: null, type: "Bug", priority: "Low",
      status: "Backlog", labels: [], closedAt: null, ticketNumber: 7,
      teamId: "team-web", projectId: "p-1", sprintId: null, moduleId: null,
      assigneeId: null, creatorId: "user-9",
      team: { prefix: "WEB", departmentId: "dept-1" },
      assignee: null, sprint: null, module: null, project: { id: "p-1", name: "Misc" },
      intake: null,
    }
    mockTicketFindFirst.mockResolvedValue(base as never)
    mockProjectFindFirst.mockResolvedValue({ id: "p-2", kind: "normal", name: "Portal" } as never)
    mockTicketUpdate.mockResolvedValue({} as never)
    const ok = await updateTicket(writeCtx, { ref: "WEB-7", projectId: "p-2" })
    expect(ok.ok).toBe(true)
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "PROJECT_CHANGED", {
      fromId: "p-1", fromName: "Misc", toId: "p-2", toName: "Portal",
    })

    vi.clearAllMocks()
    mockTicketFindFirst.mockResolvedValue(base as never)
    mockSprintFindFirst.mockResolvedValue(null as never)
    const bad = await updateTicket(writeCtx, { ref: "WEB-7", sprintId: "s-404" })
    expect(bad).toEqual({ ok: false, message: "Sprint not found: s-404" })
  })
```

Add mock aliases: `const mockProjectFindFirst = vi.mocked(prisma.project.findFirst)`, `const mockSprintFindFirst = vi.mocked(prisma.sprint.findFirst)`, `const mockModuleFindFirst = vi.mocked(prisma.module.findFirst)`, and import `{ ensureProjectMembers }` from `"@/lib/ensure-project-members"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: FAIL — assignee/project/sprint handling missing.

- [ ] **Step 3: Implement**

Insert at the Task-2 marker inside `updateTicket` (before the `data`-empty check):

```ts
  let newAssignee: { id: string; name: string; email: string } | null | undefined // undefined = not requested
  if (input.assigneeEmail !== undefined) {
    if (input.assigneeEmail === null) {
      newAssignee = null
    } else {
      newAssignee = await prisma.profile.findFirst({
        where: { email: { equals: input.assigneeEmail.trim(), mode: "insensitive" }, deletedAt: null },
        select: { id: true, name: true, email: true },
      })
      if (!newAssignee) return { ok: false, message: `No user found with email ${input.assigneeEmail}` }
    }
    const newId = newAssignee?.id ?? null
    if (newId !== ticket.assigneeId) {
      data.assigneeId = newId
      changed.assignee = { from: ticket.assignee?.name ?? null, to: newAssignee?.name ?? null }
      events.push(() => appendTicketEvent(ticket.id, actorId, "ASSIGNED", {
        fromId: ticket.assigneeId, fromName: ticket.assignee?.name ?? null,
        toId: newId, toName: newAssignee?.name ?? null,
      }))
    } else {
      newAssignee = undefined
    }
  }

  let newProject: { id: string; name: string } | null | undefined
  if (input.projectId !== undefined && input.projectId !== ticket.projectId) {
    if (input.projectId === null) {
      return { ok: false, message: "Tickets always belong to a project — pass a projectId from list_projects instead of null" }
    }
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        ...(ctx.departmentId
          ? { OR: [{ departmentId: ctx.departmentId }, { team: { departmentId: ctx.departmentId } }] }
          : {}),
      },
      select: { id: true, kind: true, name: true },
    })
    if (!project) return { ok: false, message: "Project not found (or outside this key's department) — call list_projects" }
    if (project.kind === "support") return { ok: false, message: "Support projects only accept tickets from the support form" }
    newProject = project
    data.projectId = project.id
    // Moving project clears the module unless one was explicitly provided (mirrors PATCH /api/tickets/[id])
    if (input.moduleId === undefined) data.moduleId = null
    changed.project = { from: ticket.project?.name ?? null, to: project.name }
    events.push(() => appendTicketEvent(ticket.id, actorId, "PROJECT_CHANGED", {
      fromId: ticket.project?.id ?? null, fromName: ticket.project?.name ?? null,
      toId: project.id, toName: project.name,
    }))
  }

  if (input.sprintId !== undefined && input.sprintId !== ticket.sprintId) {
    let sprintName: string | null = null
    if (input.sprintId !== null) {
      const sprint = await prisma.sprint.findFirst({ where: { id: input.sprintId }, select: { id: true, name: true } })
      if (!sprint) return { ok: false, message: `Sprint not found: ${input.sprintId}` }
      sprintName = sprint.name
    }
    data.sprintId = input.sprintId
    changed.sprint = { from: ticket.sprint?.name ?? null, to: sprintName }
    events.push(() => appendTicketEvent(ticket.id, actorId, "SPRINT_CHANGED", {
      fromId: ticket.sprint?.id ?? null, fromName: ticket.sprint?.name ?? null,
      toId: input.sprintId, toName: sprintName,
    }))
  }

  if (input.moduleId !== undefined && input.moduleId !== ticket.moduleId) {
    let moduleName: string | null = null
    if (input.moduleId !== null) {
      const mod = await prisma.module.findFirst({ where: { id: input.moduleId }, select: { id: true, name: true } })
      if (!mod) return { ok: false, message: `Module not found: ${input.moduleId}` }
      moduleName = mod.name
    }
    data.moduleId = input.moduleId
    changed.module = { from: ticket.module?.name ?? null, to: moduleName }
    events.push(() => appendTicketEvent(ticket.id, actorId, "MODULE_CHANGED", {
      fromId: ticket.module?.id ?? null, fromName: ticket.module?.name ?? null,
      toId: input.moduleId, toName: moduleName,
    }))
  }
```

And after the `prisma.ticket.update` call (still before the return):

```ts
  const projectForMembers = (data.projectId as string | undefined) ?? ticket.projectId
  if (newAssignee) {
    await ensureProjectMembers(projectForMembers, [newAssignee.id])
    await createNotification({
      recipientId: newAssignee.id, actorId, type: "assignment", ticketId: ticket.id, message: ticket.title,
    })
    if (newAssignee.id !== actorId) {
      sendAssignmentEmail({
        to: newAssignee.email, assigneeName: newAssignee.name, assigneeId: newAssignee.id,
        ticketId: ticket.id, humanId: `${prefix}-${number}`, ticketTitle: ticket.title,
        assignedByName: ctx.creatorName, departmentId: ticket.team.departmentId,
      }).catch(() => undefined)
    }
  } else if (newProject) {
    await ensureProjectMembers(projectForMembers, [ticket.assigneeId])
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: PASS.

---

### Task 3: `updateTicket` — status changes with completion side-effects

**Files:**
- Modify: `src/lib/mcp/tools.ts` (inside `updateTicket`; replace the plain `prisma.ticket.update` with the transaction described below)
- Test: `src/lib/mcp/tools.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `prisma.$transaction`; `broadcastTicketEvent`; `stopRunningTimersOnStatusChange`; `notifyTicketCompletion`; `cascadeCompleteToSubtickets`; `sendResolutionEmail`.
- Produces: `updateTicket` honoring `status` — any label in the team's workflow, set directly (the admin key skips the UI's assignee-only one-step rule). The DB trigger writes the STATUS ActivityLog row (actor stamped via `set_config('app.current_user_id', …)`), so no `appendTicketEvent` for status — only `broadcastTicketEvent`.

- [ ] **Step 1: Write the failing tests**

```ts
  it("sets any valid status, stamps the trigger actor, and fires completion side-effects", async () => {
    mockTicketFindFirst.mockResolvedValue({
      id: "t-1", title: "Fix login", description: null, type: "Bug", priority: "Low",
      status: "In Progress", labels: [], closedAt: null, ticketNumber: 7,
      teamId: "team-web", projectId: "p-1", sprintId: null, moduleId: null,
      assigneeId: "user-2", creatorId: "user-9",
      team: { prefix: "WEB", departmentId: "dept-1" },
      assignee: { id: "user-2", name: "Abu" }, sprint: null, module: null,
      project: { id: "p-1", name: "Misc" },
      intake: { submitterName: "Jo", submitterEmail: "jo@x.org", formConfig: { name: "Support" } },
    } as never)
    mockStatusFindMany.mockResolvedValue([
      { label: "Backlog", isComplete: false },
      { label: "In Progress", isComplete: false },
      { label: "Live", isComplete: true },
    ] as never)
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      ticket: { update: vi.fn().mockResolvedValue(undefined) },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (t: typeof tx) => unknown)(tx))

    const res = await updateTicket(writeCtx, { ref: "WEB-7", status: "Live" })

    expect(res.ok).toBe(true)
    expect(tx.$executeRaw).toHaveBeenCalled() // set_config('app.current_user_id', 'user-1', true)
    expect(tx.ticket.update.mock.calls[0][0].data).toMatchObject({ status: "Live" })
    expect(tx.ticket.update.mock.calls[0][0].data.closedAt).toBeInstanceOf(Date)
    expect(vi.mocked(broadcastTicketEvent)).toHaveBeenCalledWith("t-1", "STATUS_CHANGED", "user-1", {
      from: "In Progress", to: "Live",
    })
    expect(vi.mocked(stopRunningTimersOnStatusChange)).toHaveBeenCalledWith("t-1", "Live")
    expect(vi.mocked(notifyTicketCompletion)).toHaveBeenCalledWith(expect.objectContaining({
      ticketId: "t-1", humanId: "WEB-7", actorId: "user-1", actorName: "Dumitru",
    }))
    expect(vi.mocked(cascadeCompleteToSubtickets)).toHaveBeenCalledWith("t-1")
    expect(vi.mocked(sendResolutionEmail)).toHaveBeenCalledWith(expect.objectContaining({ to: "jo@x.org" }))
  })

  it("rejects a status label outside the team's workflow", async () => {
    mockTicketFindFirst.mockResolvedValue({
      id: "t-1", title: "T", description: null, type: "Bug", priority: "Low",
      status: "Backlog", labels: [], closedAt: null, ticketNumber: 7,
      teamId: "team-web", projectId: "p-1", sprintId: null, moduleId: null,
      assigneeId: null, creatorId: "user-9",
      team: { prefix: "WEB", departmentId: "dept-1" },
      assignee: null, sprint: null, module: null, project: { id: "p-1", name: "Misc" },
      intake: null,
    } as never)
    mockStatusFindMany.mockResolvedValue([
      { label: "Backlog", isComplete: false },
      { label: "Live", isComplete: true },
    ] as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-7", status: "Bogus" })
    expect(res).toEqual({
      ok: false,
      message: 'Invalid status "Bogus" for this team — valid: Backlog, Live',
    })
  })
```

Add `const mockStatusFindMany = vi.mocked(prisma.teamStatus.findMany)` and imports for `broadcastTicketEvent`, `stopRunningTimersOnStatusChange`, `notifyTicketCompletion`, `cascadeCompleteToSubtickets`, `sendResolutionEmail`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: FAIL — status handling missing.

- [ ] **Step 3: Implement**

At the Task-3 point in `updateTicket` (after module handling, before the `data`-empty check):

```ts
  let statusChange: { to: string; isComplete: boolean } | null = null
  if (input.status !== undefined && input.status !== ticket.status) {
    const teamStatuses = await prisma.teamStatus.findMany({
      where: { teamId: ticket.teamId },
      orderBy: { order: "asc" },
      select: { label: true, isComplete: true },
    })
    const target = teamStatuses.find((s) => s.label === input.status)
    if (!target) {
      return {
        ok: false,
        message: `Invalid status "${input.status}" for this team — valid: ${teamStatuses.map((s) => s.label).join(", ")}`,
      }
    }
    statusChange = { to: target.label, isComplete: target.isComplete }
    data.status = target.label
    data.closedAt = target.isComplete ? (ticket.closedAt ?? new Date()) : null
    changed.status = { from: ticket.status, to: target.label }
  }
```

Replace the plain update call with:

```ts
  if (statusChange) {
    // The BEFORE UPDATE trigger writes the status ActivityLog row; set_config
    // stamps the key owner as its actor (same pattern as PATCH /api/tickets/[id]/status).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${actorId}, true)`
      await tx.ticket.update({ where: { id: ticket.id }, data })
    })
  } else {
    await prisma.ticket.update({ where: { id: ticket.id }, data })
  }
```

And after the events/notifications block, before the final return:

```ts
  if (statusChange) {
    broadcastTicketEvent(ticket.id, "STATUS_CHANGED", actorId, {
      from: ticket.status, to: statusChange.to,
    }).catch(() => undefined)
    await stopRunningTimersOnStatusChange(ticket.id, statusChange.to)
    if (statusChange.isComplete) {
      const humanId = `${prefix}-${number}`
      notifyTicketCompletion({
        ticketId: ticket.id, ticketTitle: ticket.title, humanId,
        teamId: ticket.teamId, creatorId: ticket.creatorId,
        actorId, actorName: ctx.creatorName,
      }).catch(() => undefined)
      cascadeCompleteToSubtickets(ticket.id).catch(() => undefined)
      if (ticket.intake) {
        sendResolutionEmail({
          to: ticket.intake.submitterEmail, submitterName: ticket.intake.submitterName,
          formName: ticket.intake.formConfig.name, ticketTitle: ticket.title,
          departmentId: ticket.team.departmentId,
        }).catch(() => undefined)
      }
    }
  }
```

Note: the two fire-and-forget completion helpers use `.catch(() => undefined)` but the test asserts they were *called* — vitest mocks resolve, so no unhandled rejections.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: PASS.

---

### Task 4: `addComment`

**Files:**
- Modify: `src/lib/mcp/tools.ts`
- Test: `src/lib/mcp/tools.test.ts` (new `describe("addComment")`)

**Interfaces:**
- Consumes: `REF_RE`, `teamWhere`, `appendTicketEvent`, `resolveMentionedProfiles`, `processMentions`, `createNotification`.
- Produces: `export async function addComment(ctx: ApiKeyContext, input: { ref: string; body: string }): Promise<ToolResult>` returning `{ ok: true, data: { ref, commentId, url } }`. Mirrors `POST /api/tickets/[id]/comments` minus attachments/threading (YAGNI for MCP v1).

- [ ] **Step 1: Write the failing tests**

```ts
describe("addComment", () => {
  const ticketRow = {
    id: "t-1", title: "Fix login", creatorId: "user-9", assigneeId: "user-2",
    assignees: [{ userId: "user-3" }],
    team: { prefix: "WEB" },
  }

  it("rejects read-scope keys", async () => {
    const res = await addComment(readCtx, { ref: "WEB-7", body: "hi" })
    expect(res).toEqual({
      ok: false,
      message: "This API key is read-only — commenting requires a read_write key",
    })
  })

  it("rejects an empty body", async () => {
    const res = await addComment(writeCtx, { ref: "WEB-7", body: "   " })
    expect(res).toEqual({ ok: false, message: "Comment body is required" })
  })

  it("creates the comment, logs the event, processes mentions, notifies watchers", async () => {
    mockTicketFindFirst.mockResolvedValue(ticketRow as never)
    mockCommentCreate.mockResolvedValue({ id: "c-1" } as never)
    vi.mocked(resolveMentionedProfiles).mockResolvedValue([{ id: "user-3" }] as never)

    const res = await addComment(writeCtx, { ref: "WEB-7", body: "Deployed @Nur" })

    expect(res.ok).toBe(true)
    expect(mockCommentCreate.mock.calls[0][0]).toMatchObject({
      data: { ticketId: "t-1", authorId: "user-1", body: "Deployed @Nur" },
    })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "COMMENT_ADDED", { commentId: "c-1" })
    expect(vi.mocked(processMentions)).toHaveBeenCalledWith({
      commentId: "c-1", ticketId: "t-1", actorId: "user-1", actorName: "Dumitru",
      body: "Deployed @Nur", ticketTitle: "Fix login",
    })
    // creator + assignee notified; mentioned co-assignee (user-3) skipped (mention flow covers them)
    const notified = vi.mocked(createNotification).mock.calls.map((c) => c[0].recipientId).sort()
    expect(notified).toEqual(["user-2", "user-9"])
  })
})
```

Add `const mockCommentCreate = vi.mocked(prisma.comment.create)` and import `addComment`, `{ resolveMentionedProfiles, processMentions }` from `"@/lib/mentions"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: FAIL — `addComment` not exported.

- [ ] **Step 3: Implement**

```ts
export async function addComment(
  ctx: ApiKeyContext,
  input: { ref: string; body: string },
): Promise<ToolResult> {
  if (ctx.scope !== "read_write" && ctx.scope !== "admin") {
    return { ok: false, message: "This API key is read-only — commenting requires a read_write key" }
  }
  const body = input.body?.trim()
  if (!body) return { ok: false, message: "Comment body is required" }

  const match = input.ref.trim().match(REF_RE)
  if (!match) {
    return { ok: false, message: `Could not parse "${input.ref}" — expected a ticket reference like WEB-123` }
  }
  const prefix = match[1].toUpperCase()
  const number = parseInt(match[2], 10)

  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: number, deletedAt: null, team: { prefix, ...teamWhere(ctx) } },
    select: {
      id: true, title: true, creatorId: true, assigneeId: true,
      assignees: { select: { userId: true } },
      team: { select: { prefix: true } },
    },
  })
  if (!ticket) {
    return { ok: false, message: `Ticket ${prefix}-${number} not found (or outside this key's department)` }
  }

  const comment = await prisma.comment.create({
    data: { ticketId: ticket.id, authorId: ctx.createdById, body },
    select: { id: true },
  })

  await appendTicketEvent(ticket.id, ctx.createdById, "COMMENT_ADDED", { commentId: comment.id })

  const mentioned = await resolveMentionedProfiles(body, ticket.id)
  const mentionedIds = new Set(mentioned.map((p) => p.id))
  processMentions({
    commentId: comment.id, ticketId: ticket.id, actorId: ctx.createdById,
    actorName: ctx.creatorName, body, ticketTitle: ticket.title,
  }).catch(() => undefined)

  const snippet = body.length > 140 ? `${body.slice(0, 137)}...` : body
  const recipients = new Set(
    [ticket.creatorId, ticket.assigneeId, ...ticket.assignees.map((a) => a.userId)].filter(Boolean) as string[],
  )
  for (const recipientId of recipients) {
    if (mentionedIds.has(recipientId) || recipientId === ctx.createdById) continue
    createNotification({
      recipientId, actorId: ctx.createdById, type: "comment",
      ticketId: ticket.id, commentId: comment.id, message: snippet,
    }).catch(() => undefined)
  }

  return {
    ok: true,
    data: { ref: `${prefix}-${number}`, commentId: comment.id, url: `${BASE_URL}/tasks/${ticket.id}` },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: PASS.

---

### Task 5: `deleteTicket`

**Files:**
- Modify: `src/lib/mcp/tools.ts`
- Test: `src/lib/mcp/tools.test.ts` (new `describe("deleteTicket")`)

**Interfaces:**
- Consumes: `REF_RE`, `teamWhere`, `createNotification`, `prisma.activityLog.create`.
- Produces: `export async function deleteTicket(ctx: ApiKeyContext, input: { ref: string }): Promise<ToolResult>` returning `{ ok: true, data: { ref, alreadyDeleted: boolean } }`. Mirrors `DELETE /api/tickets/[id]`: soft-delete (`deletedAt`), `TICKET_DELETED` activity row, `ticket_deleted` notifications to assignee + co-assignees (excluding the actor), idempotent when already deleted. **Admin scope required** (destructive — stricter than the REST route's creator check, because the key acts unattended).

- [ ] **Step 1: Write the failing tests**

```ts
describe("deleteTicket", () => {
  const adminCtx: ApiKeyContext = { ...writeCtx, scope: "admin" }
  const row = {
    id: "t-1", title: "Fix login", ticketNumber: 7, deletedAt: null,
    assigneeId: "user-2", assignees: [{ userId: "user-3" }],
    team: { prefix: "WEB" },
  }

  it("requires an admin key", async () => {
    const res = await deleteTicket(writeCtx, { ref: "WEB-7" })
    expect(res).toEqual({ ok: false, message: "Deleting tickets requires an admin API key" })
  })

  it("soft-deletes, logs TICKET_DELETED, notifies assignees", async () => {
    mockTicketFindFirst.mockResolvedValue(row as never)
    mockTicketUpdate.mockResolvedValue({} as never)

    const res = await deleteTicket(adminCtx, { ref: "WEB-7" })

    expect(res).toEqual({ ok: true, data: { ref: "WEB-7", alreadyDeleted: false } })
    expect(mockTicketUpdate.mock.calls[0][0].where).toEqual({ id: "t-1" })
    expect(mockTicketUpdate.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date)
    expect(mockActivityLogCreate.mock.calls[0][0].data).toMatchObject({
      ticketId: "t-1", actorId: "user-1", action: "TICKET_DELETED",
      metadata: { humanId: "WEB-7", title: "Fix login" },
    })
    const notified = vi.mocked(createNotification).mock.calls.map((c) => c[0].recipientId).sort()
    expect(notified).toEqual(["user-2", "user-3"])
  })

  it("is idempotent on an already-deleted ticket", async () => {
    mockTicketFindFirst.mockResolvedValue({ ...row, deletedAt: new Date() } as never)
    const res = await deleteTicket(adminCtx, { ref: "WEB-7" })
    expect(res).toEqual({ ok: true, data: { ref: "WEB-7", alreadyDeleted: true } })
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })
})
```

Add `const mockActivityLogCreate = vi.mocked(prisma.activityLog.create)` and import `deleteTicket`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: FAIL — `deleteTicket` not exported.

- [ ] **Step 3: Implement**

```ts
export async function deleteTicket(
  ctx: ApiKeyContext,
  input: { ref: string },
): Promise<ToolResult> {
  if (ctx.scope !== "admin") {
    return { ok: false, message: "Deleting tickets requires an admin API key" }
  }

  const match = input.ref.trim().match(REF_RE)
  if (!match) {
    return { ok: false, message: `Could not parse "${input.ref}" — expected a ticket reference like WEB-123` }
  }
  const prefix = match[1].toUpperCase()
  const number = parseInt(match[2], 10)

  // No deletedAt filter — deletion is idempotent, mirroring DELETE /api/tickets/[id]
  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: number, team: { prefix, ...teamWhere(ctx) } },
    select: {
      id: true, title: true, ticketNumber: true, deletedAt: true, assigneeId: true,
      assignees: { select: { userId: true } },
      team: { select: { prefix: true } },
    },
  })
  if (!ticket) {
    return { ok: false, message: `Ticket ${prefix}-${number} not found (or outside this key's department)` }
  }

  const humanId = `${prefix}-${number}`
  if (ticket.deletedAt) {
    return { ok: true, data: { ref: humanId, alreadyDeleted: true } }
  }

  await prisma.ticket.update({ where: { id: ticket.id }, data: { deletedAt: new Date() } })

  await prisma.activityLog.create({
    data: {
      ticketId: ticket.id, actorId: ctx.createdById, action: "TICKET_DELETED",
      metadata: { humanId, title: ticket.title },
    },
  }).catch(() => undefined)

  const recipients = [
    ...(ticket.assigneeId ? [ticket.assigneeId] : []),
    ...ticket.assignees.map((a) => a.userId),
  ].filter((uid, i, arr) => uid !== ctx.createdById && arr.indexOf(uid) === i)
  for (const recipientId of recipients) {
    createNotification({
      recipientId, actorId: ctx.createdById, type: "ticket_deleted",
      ticketId: ticket.id, message: humanId,
    }).catch(() => undefined)
  }

  return { ok: true, data: { ref: humanId, alreadyDeleted: false } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mcp/tools.test.ts`
Expected: PASS.

---

### Task 6: Register the tools in the MCP route + docs + full check

**Files:**
- Modify: `src/app/api/mcp/[key]/[transport]/route.ts`
- Modify: `src/components/docs/user-manual.tsx` (MCP section — tool list)

**Interfaces:**
- Consumes: `updateTicket` / `UpdateTicketInput`, `addComment`, `deleteTicket` from `@/lib/mcp/tools` (Tasks 1–5); existing `toMcp` and `buildHandler`.
- Produces: three new MCP tools visible to connectors: `update_ticket`, `add_comment`, `delete_ticket`.

- [ ] **Step 1: Register the tools**

In `buildHandler`, after the `create_ticket` registration, add (extend the import from `@/lib/mcp/tools` with `updateTicket, addComment, deleteTicket`):

```ts
      server.registerTool(
        "update_ticket",
        {
          title: "Update ticket",
          description:
            "Update any fields of an existing ticket by ref (e.g. WEB-123). Requires a read_write key. Only provided fields change; pass null to clear assignee/sprint/module. status accepts any label from the team's workflow (see list_teams) — changes notify people exactly like the web app, including completion notifications.",
          inputSchema: {
            ref: z.string().describe("Ticket reference like WEB-123"),
            title: z.string().min(1).optional(),
            description: z.string().nullable().optional().describe("null clears the description"),
            type: z.enum(TICKET_TYPES).optional(),
            priority: z.enum(TICKET_PRIORITIES).optional(),
            status: z.string().optional().describe("Exact status label from the team's workflow"),
            assigneeEmail: z.string().nullable().optional().describe("Work email; null unassigns"),
            projectId: z.string().optional().describe("Project id from list_projects"),
            sprintId: z.string().nullable().optional(),
            moduleId: z.string().nullable().optional(),
          },
        },
        async (input) => toMcp(await updateTicket(ctx, input)),
      )
      server.registerTool(
        "add_comment",
        {
          title: "Add comment",
          description:
            "Comment on a ticket as the API key's owner. Requires a read_write key. @mentions notify the mentioned users by email, like the web app.",
          inputSchema: {
            ref: z.string().describe("Ticket reference like WEB-123"),
            body: z.string().min(1).describe("Comment text; @Name mentions are processed"),
          },
        },
        async (input) => toMcp(await addComment(ctx, input)),
      )
      server.registerTool(
        "delete_ticket",
        {
          title: "Delete ticket",
          description:
            "Soft-delete a ticket by ref. Requires an ADMIN key. The ticket is hidden, not destroyed; assignees are notified. Idempotent.",
          inputSchema: { ref: z.string().describe("Ticket reference like WEB-123") },
        },
        async (input) => toMcp(await deleteTicket(ctx, input)),
      )
```

Note: `update_ticket`'s `projectId` is intentionally NOT nullable — tickets always belong to a project (the tool returns a friendly error if null sneaks through anyway).

- [ ] **Step 2: Update the user manual**

In `src/components/docs/user-manual.tsx`, find the MCP section (search for `Add the connector in claude.ai`, around line 881) and its tool list; add the three new tools with one-line descriptions and this warning sentence to the section: "Keys with read_write scope can create, edit, and comment on tickets; admin keys can also delete them — treat these keys like passwords."

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit` (expect no NEW errors — compare against a pre-change run if unsure) and `npx vitest run src/lib/mcp/tools.test.ts`.
Expected: MCP tests PASS.

- [ ] **Step 4: Manual smoke test (optional, needs dev server)**

Run the curl `initialize` + `tools/list` handshake against `http://localhost:3000/api/mcp/<a real read key>/mcp` and confirm the three new tools are listed. Do NOT call the mutation tools against the shared DB during the smoke test.

- [ ] **Step 5: Stop — hand back for review**

No commits (standing rule). Report results to Dumitru for review; he commits to `dev-v2` and, after that lands, Phase 2 (admin ops) gets its own plan.
