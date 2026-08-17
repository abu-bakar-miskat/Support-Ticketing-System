/**
 * One-time import of the Notion "Candidate Pipeline" export into a
 * Recruitment board. Idempotent: aborts if the board already exists.
 *
 * Usage: npx tsx scripts/import-recruitment-xlsx.ts [path-to-xlsx]
 */
import { readFileSync } from "fs"
import path from "path"
import { Pool } from "pg"
import ExcelJS from "exceljs"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const BOARD_NAME = "UI/UX Designer Pipeline"
const XLSX_PATH = process.argv[2] ?? "/Users/dumitruc/Desktop/PEN_UIUX_Candidate_Pipeline.xlsx"

// Load DATABASE_URL from .env if not already set
if (!process.env.DATABASE_URL) {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8")
  const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/m)
  if (!m) throw new Error("DATABASE_URL not found in .env")
  process.env.DATABASE_URL = m[1]
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

type FieldSpec = {
  name: string
  type: "text" | "select" | "number" | "date" | "url" | "email" | "phone" | "rating"
}

const FIELD_SPECS: FieldSpec[] = [
  { name: "Candidate", type: "text" },
  { name: "Stage", type: "select" },
  { name: "Rating", type: "rating" },
  { name: "Stage 2 Outcome", type: "select" },
  { name: "Reject Reason", type: "select" },
  { name: "Current Company", type: "text" },
  { name: "Current Role", type: "text" },
  { name: "Experience", type: "text" },
  { name: "Location", type: "text" },
  { name: "Source", type: "select" },
  { name: "Email", type: "email" },
  { name: "Phone", type: "phone" },
  { name: "Portfolio", type: "url" },
  { name: "LinkedIn", type: "url" },
  { name: "Salary Expectation", type: "text" },
  { name: "Notice Period", type: "text" },
  { name: "Availability", type: "text" },
  { name: "Date Shortlisted", type: "date" },
]

function stageColor(label: string): string {
  const l = label.toLowerCase()
  if (l.includes("hired") || l.includes("passed")) return "green"
  if (l.includes("rejected")) return "red"
  if (l.includes("final interview")) return "purple"
  if (l.includes("invitation")) return "blue"
  return "gray"
}

function selectColor(fieldName: string, label: string): string {
  if (fieldName === "Stage") return stageColor(label)
  if (fieldName === "Reject Reason") return "orange"
  if (fieldName === "Stage 2 Outcome") return label.toLowerCase() === "yes" ? "green" : "gray"
  if (fieldName === "Source") return "blue"
  return "gray"
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string }
    if (o.richText) return o.richText.map((r) => r.text).join("")
    if (typeof o.text === "string") return o.text
    if (o.result !== undefined) return String(o.result)
    if (typeof o.hyperlink === "string") return o.hyperlink
    return ""
  }
  return String(v).trim()
}

async function main() {
  const existing = await prisma.recruitmentBoard.findFirst({ where: { name: BOARD_NAME }, select: { id: true } })
  if (existing) {
    console.log(`Board "${BOARD_NAME}" already exists (${existing.id}) — nothing to do.`)
    return
  }

  // Importer identity: the first admin profile (board creator attribution)
  const admin = await prisma.profile.findFirst({
    where: { role: "admin", deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })
  if (!admin) throw new Error("No admin profile found to attribute the board to")

  // Records: from the xlsx when present, else from the captured JSON seed
  // (scripts/recruitment-seed.json — transcribed from the original Notion export).
  let records: Array<Record<string, string | number>>
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(XLSX_PATH)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error("Workbook has no sheets")
    const header: string[] = []
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      header[col - 1] = cellText(cell.value)
    })
    const colOf = new Map<string, number>()
    for (const spec of FIELD_SPECS) {
      const idx = header.findIndex((h) => h.trim().toLowerCase() === spec.name.toLowerCase())
      if (idx === -1) throw new Error(`Column "${spec.name}" not found in xlsx header: ${header.join(" | ")}`)
      colOf.set(spec.name, idx + 1)
    }
    records = []
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return
      const rec: Record<string, string | number> = {}
      for (const spec of FIELD_SPECS) {
        const raw = cellText(row.getCell(colOf.get(spec.name)!).value).trim()
        if (raw) rec[spec.name] = spec.type === "rating" ? (raw.match(/⭐/g) ?? []).length : raw
      }
      records.push(rec)
    })
    console.log(`Reading from xlsx: ${XLSX_PATH}`)
  } catch {
    const seedPath = path.join(process.cwd(), "scripts", "recruitment-seed.json")
    records = JSON.parse(readFileSync(seedPath, "utf8"))
    console.log(`xlsx not found — using seed: ${seedPath}`)
  }

  // Collect distinct select options per select field
  const optionLabels = new Map<string, Set<string>>()
  for (const spec of FIELD_SPECS.filter((s) => s.type === "select")) {
    optionLabels.set(spec.name, new Set())
    for (const rec of records) {
      const raw = rec[spec.name]
      if (typeof raw === "string" && raw.trim()) optionLabels.get(spec.name)!.add(raw.trim())
    }
  }

  console.log(`Importing ${records.length} candidates as ${admin.name}…`)

  const board = await prisma.recruitmentBoard.create({
    data: { name: BOARD_NAME, createdById: admin.id },
    select: { id: true },
  })

  // Create fields; remember ids + option maps
  const fieldIds = new Map<string, string>()
  const optionIds = new Map<string, Map<string, string>>() // fieldName -> label -> optionId
  let order = 0
  for (const spec of FIELD_SPECS) {
    let options: Array<{ id: string; label: string; color: string }> | undefined
    if (spec.type === "select") {
      const labels = [...optionLabels.get(spec.name)!]
      const map = new Map<string, string>()
      options = labels.map((label, i) => {
        const id = `opt_${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${i}`
        map.set(label, id)
        return { id, label, color: selectColor(spec.name, label) }
      })
      optionIds.set(spec.name, map)
    }
    const field = await prisma.recruitmentField.create({
      data: {
        boardId: board.id,
        name: spec.name,
        type: spec.type,
        options: options as never,
        order: order++,
      },
      select: { id: true },
    })
    fieldIds.set(spec.name, field.id)
  }

  // Create candidates
  let rowOrder = 0
  for (const rec of records) {
    const values: Record<string, unknown> = {}
    for (const spec of FIELD_SPECS) {
      const raw = rec[spec.name]
      if (raw === undefined || raw === "") continue
      const fieldId = fieldIds.get(spec.name)!
      switch (spec.type) {
        case "select": {
          const optId = optionIds.get(spec.name)!.get(String(raw).trim())
          if (optId) values[fieldId] = optId
          break
        }
        case "rating": {
          const stars = typeof raw === "number" ? raw : (String(raw).match(/⭐/g) ?? []).length
          if (stars > 0) values[fieldId] = Math.min(5, stars)
          break
        }
        case "date": {
          const m = String(raw).match(/^\d{4}-\d{2}-\d{2}/)
          if (m) values[fieldId] = m[0]
          break
        }
        default:
          values[fieldId] = String(raw)
      }
    }
    await prisma.recruitmentCandidate.create({
      data: {
        boardId: board.id,
        values: values as never,
        order: rowOrder++,
        createdById: admin.id,
      },
    })
  }

  console.log(`Done: board ${board.id} with ${FIELD_SPECS.length} fields and ${rowOrder} candidates.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
