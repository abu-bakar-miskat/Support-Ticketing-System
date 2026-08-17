import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import type { Prisma } from "@/generated/prisma/client"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function PATCH(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => null)
  const prefs = isPlainObject(body) ? body.notificationPrefs : undefined
  if (!isPlainObject(prefs)) {
    return NextResponse.json(
      { error: "notificationPrefs must be an object" },
      { status: 400 },
    )
  }
  if (Object.values(prefs).some((value) => typeof value !== "boolean")) {
    return NextResponse.json(
      { error: "notificationPrefs values must be booleans" },
      { status: 400 },
    )
  }

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: { notificationPrefs: prefs as Prisma.InputJsonValue },
  })

  return NextResponse.json({ notificationPrefs: updated.notificationPrefs })
}
