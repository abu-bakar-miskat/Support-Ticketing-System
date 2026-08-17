import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import type { Prisma } from "@/generated/prisma/client"
import { hasSignatureContent, sanitizeSignatureHtml } from "@/lib/sanitize-signature-html"

export async function PATCH(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json()
  const data: Prisma.ProfileUpdateInput = {}

  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      )
    }
    data.name = body.name.trim()
  }

  if ("timezone" in body) {
    if (typeof body.timezone !== "string" || body.timezone.trim().length === 0) {
      return NextResponse.json(
        { error: "timezone must be a non-empty string" },
        { status: 400 },
      )
    }
    data.timezone = body.timezone.trim()
  }

  if ("location" in body) {
    data.location = body.location ? String(body.location).trim() : null
  }

  if ("avatarUrl" in body) {
    data.avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : null
  }

  if ("githubUsername" in body) {
    const raw = typeof body.githubUsername === "string" ? body.githubUsername.trim().replace(/^@/, "") : ""
    if (raw === "") {
      data.githubUsername = null
    } else if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(raw)) {
      return NextResponse.json(
        { error: "githubUsername must be a valid GitHub username" },
        { status: 400 },
      )
    } else {
      data.githubUsername = raw.toLowerCase()
    }
  }

  if ("displayName" in body || "signature" in body) {
    const existing = await prisma.profile.findUnique({
      where: { id: profile.id },
      select: { preferences: true },
    })
    const prefs = (existing?.preferences && typeof existing.preferences === "object" && !Array.isArray(existing.preferences))
      ? existing.preferences as Record<string, unknown>
      : {}
    const nextPrefs = { ...prefs }
    if ("displayName" in body) {
      nextPrefs.displayName = typeof body.displayName === "string" ? body.displayName.trim() : ""
    }
    if ("signature" in body) {
      const sig = body.signature
      const rawList: unknown[] = Array.isArray(sig?.list) ? sig.list : []
      const list = rawList
        .map((item: unknown) => {
          const entry = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
          return {
            id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
            label: typeof entry.label === "string" ? entry.label.trim() : "",
            html: typeof entry.html === "string" ? sanitizeSignatureHtml(entry.html) : "",
          }
        })
        .filter((entry) => entry.label && hasSignatureContent(entry.html))
      const activeId = list.some((entry) => entry.id === sig?.activeId) ? sig.activeId : (list[0]?.id ?? null)
      nextPrefs.signature = {
        enabled: sig?.enabled === true && list.length > 0,
        activeId,
        list,
      }
    }
    data.preferences = nextPrefs as Prisma.InputJsonValue
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data,
  })
  return NextResponse.json(updated)
}
