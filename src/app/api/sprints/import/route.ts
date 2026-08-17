import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { projectInScope } from "@/lib/dept-scope"
import { parseStartDatePayload, parseDueDatePayload } from "@/lib/ticket-datetime"

type ImportResult = {
  created: number
  skipped: number
  errors: { row: number; message: string }[]
}

function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  return lines
    .map((line) => {
      const cells: string[] = []
      let current = ""
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (ch === "," && !inQuotes) {
          cells.push(current.trim())
          current = ""
        } else {
          current += ch
        }
      }
      cells.push(current.trim())
      return cells
    })
    .filter((row) => row.some((cell) => cell !== ""))
}

export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const isPrivileged =
    profile.role === "admin" ||
    profile.role === "manager" ||
    profile.role === "lead"

  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const projectId = (formData.get("projectId") as string | null)?.trim() || null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (!projectId) {
    return NextResponse.json(
      { error: "A project is required" },
      { status: 400 },
    )
  }
  if (!(await projectInScope(profile, projectId))) {
    return NextResponse.json({ error: "Project not in current department" }, { status: 403 })
  }

  const text = await file.text()
  const rows = parseCSV(text)

  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV must have a header row and at least one data row" },
      { status: 400 },
    )
  }

  const REQUIRED_HEADERS = ["name", "startdate", "enddate"]
  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, ""))
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.includes(h))
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      { error: `Missing required columns: ${missingHeaders.join(", ")}` },
      { status: 400 },
    )
  }

  const col = (name: string) => header.indexOf(name)

  const result: ImportResult = { created: 0, skipped: 0, errors: [] }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    const name = row[col("name")]?.trim() || ""
    const goal = col("goal") >= 0 ? row[col("goal")]?.trim() || null : null
    const startDateStr = row[col("startdate")]?.trim() || ""
    const endDateStr = row[col("enddate")]?.trim() || ""
    const pointsTargetStr =
      col("pointstarget") >= 0 ? row[col("pointstarget")]?.trim() || "" : ""

    if (!name) {
      result.errors.push({ row: rowNum, message: "name is required" })
      continue
    }

    const startDate = startDateStr ? parseStartDatePayload(startDateStr) : new Date(NaN)
    if (!startDateStr || isNaN(startDate.getTime())) {
      result.errors.push({ row: rowNum, message: `Invalid startDate: "${startDateStr}"` })
      continue
    }

    const endDate = endDateStr ? parseDueDatePayload(endDateStr) : new Date(NaN)
    if (!endDateStr || isNaN(endDate.getTime())) {
      result.errors.push({ row: rowNum, message: `Invalid endDate: "${endDateStr}"` })
      continue
    }

    if (endDate <= startDate) {
      result.errors.push({ row: rowNum, message: "endDate must be after startDate" })
      continue
    }

    let pointsTarget: number | null = null
    if (pointsTargetStr) {
      pointsTarget = parseInt(pointsTargetStr, 10)
      if (isNaN(pointsTarget) || pointsTarget < 0) {
        result.errors.push({ row: rowNum, message: `Invalid pointsTarget: "${pointsTargetStr}"` })
        continue
      }
    }

    // Duplicate check: same name + same startDate
    const duplicate = await prisma.sprint.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        startDate,
        projectId,
      },
    })

    if (duplicate) {
      result.skipped++
      continue
    }

    await prisma.sprint.create({
      data: {
        name,
        goal,
        startDate,
        endDate,
        pointsTarget,
        projectId,
        createdById: profile.id,
      },
    })
    result.created++
  }

  return NextResponse.json(result, { status: 200 })
}
