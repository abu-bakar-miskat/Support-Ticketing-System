import { prisma } from "@/lib/db"
import {
  normalizeValue,
  parseOptions,
  isSelectType,
  mergeValues,
  OPTION_COLORS,
  RECRUITMENT_FIELD_TYPES,
  type SelectOption,
} from "@/lib/recruitment"
import type { ApiKeyContext } from "@/lib/api-key-auth"
import type { RecruitmentFieldType } from "@/generated/prisma/enums"
import type { ToolResult } from "./tools"

type FieldRow = {
  id: string
  name: string
  type: RecruitmentFieldType
  options: unknown
  order: number
  hidden: boolean
}

const FIELD_SELECT = {
  id: true, name: true, type: true, options: true, order: true, hidden: true,
} as const

function writeGate(ctx: ApiKeyContext): ToolResult | null {
  if (ctx.scope !== "read_write" && ctx.scope !== "admin") {
    return { ok: false, message: "This API key is read-only — recruitment changes require a read_write key" }
  }
  return null
}

/**
 * Recruitment boards are per-manager: the key owner sees only boards they
 * created, unless their profile role is admin. Mirrors the web UI rule.
 */
async function boardScope(ctx: ApiKeyContext): Promise<{ createdById?: string }> {
  const owner = await prisma.profile.findUnique({
    where: { id: ctx.createdById },
    select: { role: true },
  })
  return owner?.role === "admin" ? {} : { createdById: ctx.createdById }
}

/** Resolve a board by id or (case-insensitive) name, within the key owner's scope. */
async function resolveBoard(ctx: ApiKeyContext, ref: string) {
  const trimmed = ref.trim()
  return prisma.recruitmentBoard.findFirst({
    where: {
      ...(await boardScope(ctx)),
      OR: [{ id: trimmed }, { name: { equals: trimmed, mode: "insensitive" } }],
    },
    select: {
      id: true,
      name: true,
      fields: { orderBy: { order: "asc" }, select: FIELD_SELECT },
    },
  })
}

function newOptionId(): string {
  return `opt_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Normalize a values object keyed by FIELD NAME (human-friendly) into one
 * keyed by field id. Select values may be option labels or ids; unknown
 * labels are returned in `optionsToAdd` for auto-creation.
 */
export function resolveValuesByName(
  fields: FieldRow[],
  input: unknown,
):
  | { ok: true; values: Record<string, unknown>; optionsToAdd: Map<string, SelectOption[]> }
  | { ok: false; message: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, message: "values must be an object keyed by field name" }
  }
  const byName = new Map(fields.map((f) => [f.name.trim().toLowerCase(), f]))
  const values: Record<string, unknown> = {}
  const optionsToAdd = new Map<string, SelectOption[]>()

  const resolveOption = (field: FieldRow, raw: string): string => {
    const pending = optionsToAdd.get(field.id) ?? []
    const all = [...parseOptions(field.options), ...pending]
    const found = all.find(
      (o) => o.id === raw || o.label.trim().toLowerCase() === raw.trim().toLowerCase(),
    )
    if (found) return found.id
    const created: SelectOption = {
      id: newOptionId(),
      label: raw.trim(),
      color: OPTION_COLORS[all.length % OPTION_COLORS.length],
    }
    optionsToAdd.set(field.id, [...pending, created])
    return created.id
  }

  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    const field = byName.get(name.trim().toLowerCase())
    if (!field) {
      const known = fields.map((f) => f.name).join(", ")
      return { ok: false, message: `Unknown field "${name}" — this board's fields: ${known}` }
    }

    if (raw === null || raw === undefined || raw === "") {
      values[field.id] = null
      continue
    }

    if (field.type === "select") {
      if (typeof raw !== "string" || !raw.trim()) {
        return { ok: false, message: `${field.name}: expected an option label` }
      }
      values[field.id] = resolveOption(field, raw)
      continue
    }
    if (field.type === "multi_select") {
      const labels = Array.isArray(raw) ? raw : [raw]
      const ids: string[] = []
      for (const l of labels) {
        if (typeof l !== "string" || !l.trim()) {
          return { ok: false, message: `${field.name}: expected option labels` }
        }
        ids.push(resolveOption(field, l))
      }
      values[field.id] = ids.length ? ids : null
      continue
    }
    if (field.type === "rating" && typeof raw === "string") {
      const stars = (raw.match(/⭐|★/g) ?? []).length
      const res = normalizeValue(field, stars > 0 ? stars : raw)
      if (!res.ok) return { ok: false, message: `${field.name}: ${res.message}` }
      values[field.id] = res.value
      continue
    }

    const res = normalizeValue(field, raw)
    if (!res.ok) return { ok: false, message: `${field.name}: ${res.message}` }
    values[field.id] = res.value
  }

  return { ok: true, values, optionsToAdd }
}

/** Persist auto-created select options onto their fields. */
async function persistNewOptions(fields: FieldRow[], optionsToAdd: Map<string, SelectOption[]>) {
  for (const [fieldId, added] of optionsToAdd) {
    const field = fields.find((f) => f.id === fieldId)
    if (!field) continue
    const merged = [...parseOptions(field.options), ...added]
    await prisma.recruitmentField.update({
      where: { id: fieldId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { options: merged as any },
    })
    field.options = merged
  }
}

/** Map stored values (by field id) to a readable object keyed by field name. */
export function displayValues(fields: FieldRow[], stored: unknown): Record<string, unknown> {
  const values =
    typeof stored === "object" && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {}
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const v = values[field.id]
    if (v === undefined || v === null) continue
    if (field.type === "select" && typeof v === "string") {
      out[field.name] = parseOptions(field.options).find((o) => o.id === v)?.label ?? v
    } else if (field.type === "multi_select" && Array.isArray(v)) {
      const opts = parseOptions(field.options)
      out[field.name] = v.map((id) => opts.find((o) => o.id === id)?.label ?? id)
    } else {
      out[field.name] = v
    }
  }
  return out
}

export async function listRecruitmentBoards(ctx: ApiKeyContext): Promise<ToolResult> {
  const boards = await prisma.recruitmentBoard.findMany({
    where: await boardScope(ctx),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      archivedAt: true,
      fields: { orderBy: { order: "asc" }, select: { name: true, type: true } },
      _count: { select: { candidates: true } },
    },
  })
  return {
    ok: true,
    data: boards.map((b) => ({
      id: b.id,
      name: b.name,
      archived: b.archivedAt !== null,
      candidateCount: b._count.candidates,
      fields: b.fields.map((f) => `${f.name} (${f.type})`),
    })),
  }
}

export async function getRecruitmentBoard(
  ctx: ApiKeyContext,
  input: { board: string },
): Promise<ToolResult> {
  const board = await resolveBoard(ctx, input.board)
  if (!board) return { ok: false, message: `No board matching "${input.board}" — call list_recruitment_boards` }

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { boardId: board.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, values: true },
  })

  return {
    ok: true,
    data: {
      id: board.id,
      name: board.name,
      fields: board.fields.map((f) => ({
        name: f.name,
        type: f.type,
        ...(isSelectType(f.type) ? { options: parseOptions(f.options).map((o) => o.label) } : {}),
      })),
      candidates: candidates.map((c) => ({ id: c.id, values: displayValues(board.fields, c.values) })),
    },
  }
}

export async function addRecruitmentCandidate(
  ctx: ApiKeyContext,
  input: { board: string; values: Record<string, unknown> },
): Promise<ToolResult> {
  const gate = writeGate(ctx)
  if (gate) return gate

  const board = await resolveBoard(ctx, input.board)
  if (!board) return { ok: false, message: `No board matching "${input.board}" — call list_recruitment_boards` }

  const res = resolveValuesByName(board.fields, input.values ?? {})
  if (!res.ok) return res
  await persistNewOptions(board.fields, res.optionsToAdd)

  const last = await prisma.recruitmentCandidate.findFirst({
    where: { boardId: board.id },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      boardId: board.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      values: mergeValues({}, res.values) as any,
      order: (last?.order ?? -1) + 1,
      createdById: ctx.createdById,
    },
    select: { id: true, values: true },
  })
  return {
    ok: true,
    data: { id: candidate.id, board: board.name, values: displayValues(board.fields, candidate.values) },
  }
}

export async function updateRecruitmentCandidate(
  ctx: ApiKeyContext,
  input: { board: string; candidateId: string; values: Record<string, unknown> },
): Promise<ToolResult> {
  const gate = writeGate(ctx)
  if (gate) return gate

  const board = await resolveBoard(ctx, input.board)
  if (!board) return { ok: false, message: `No board matching "${input.board}" — call list_recruitment_boards` }

  const candidate = await prisma.recruitmentCandidate.findFirst({
    where: { id: input.candidateId, boardId: board.id },
    select: { id: true, values: true },
  })
  if (!candidate) {
    return { ok: false, message: "Candidate not found on this board — use ids from get_recruitment_board" }
  }

  const res = resolveValuesByName(board.fields, input.values)
  if (!res.ok) return res
  await persistNewOptions(board.fields, res.optionsToAdd)

  const merged = mergeValues(candidate.values, res.values)
  const updated = await prisma.recruitmentCandidate.update({
    where: { id: candidate.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { values: merged as any },
    select: { id: true, values: true },
  })
  return {
    ok: true,
    data: { id: updated.id, board: board.name, values: displayValues(board.fields, updated.values) },
  }
}

export async function addRecruitmentField(
  ctx: ApiKeyContext,
  input: { board: string; name: string; type?: string },
): Promise<ToolResult> {
  const gate = writeGate(ctx)
  if (gate) return gate

  const board = await resolveBoard(ctx, input.board)
  if (!board) return { ok: false, message: `No board matching "${input.board}" — call list_recruitment_boards` }

  const name = input.name?.trim()
  if (!name) return { ok: false, message: "Field name is required" }
  if (board.fields.some((f) => f.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `Field "${name}" already exists on this board` }
  }

  const type: RecruitmentFieldType =
    input.type && RECRUITMENT_FIELD_TYPES.includes(input.type as RecruitmentFieldType)
      ? (input.type as RecruitmentFieldType)
      : "text"

  const field = await prisma.recruitmentField.create({
    data: {
      boardId: board.id,
      name,
      type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: (isSelectType(type) ? [] : undefined) as any,
      order: (board.fields.at(-1)?.order ?? -1) + 1,
    },
    select: { id: true, name: true, type: true },
  })
  return { ok: true, data: { board: board.name, field: { name: field.name, type: field.type } } }
}

export async function deleteRecruitmentCandidate(
  ctx: ApiKeyContext,
  input: { board: string; candidateId: string },
): Promise<ToolResult> {
  if (ctx.scope !== "admin") {
    return { ok: false, message: "Deleting candidates requires an admin API key" }
  }

  const board = await resolveBoard(ctx, input.board)
  if (!board) return { ok: false, message: `No board matching "${input.board}" — call list_recruitment_boards` }

  const candidate = await prisma.recruitmentCandidate.findFirst({
    where: { id: input.candidateId, boardId: board.id },
    select: { id: true },
  })
  if (!candidate) {
    return { ok: false, message: "Candidate not found on this board — use ids from get_recruitment_board" }
  }

  await prisma.recruitmentCandidate.delete({ where: { id: candidate.id } })
  return { ok: true, data: { deleted: candidate.id, board: board.name } }
}
