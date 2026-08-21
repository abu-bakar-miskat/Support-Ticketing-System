import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar } from "@/lib/dept-scope"
import { planRules, type Rule, type FormValues } from "@/lib/rules-engine"
import { isConditionGroup, isRuleActions } from "@/lib/rule-validation"

/**
 * POST /api/departments/:id/rules/test — dry-run (RE-04).
 *
 * Runs the pure `planRules` against sample form field values and returns the
 * full evaluation trace (which rules matched, what they'd fire, where it
 * stopped) WITHOUT mutating anything. Uses the department's saved rules by
 * default, or a set of draft rules passed in the body so the builder can test
 * unsaved changes.
 *
 * Body: { values: Record<string, unknown>, rules?: Rule[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const values: FormValues =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as FormValues)
      : {}

  let rules: Rule[]
  if (Array.isArray(body.rules)) {
    // Validate draft rules before planning.
    for (const r of body.rules) {
      if (!isConditionGroup(r?.conditions)) {
        return NextResponse.json({ error: "a draft rule has an invalid condition group" }, { status: 400 })
      }
      const actionsError = isRuleActions(r?.actions)
      if (actionsError) return NextResponse.json({ error: actionsError }, { status: 400 })
    }
    rules = body.rules as Rule[]
  } else {
    const saved = await prisma.rule.findMany({
      where: { departmentId: id },
      orderBy: { order: "asc" },
      select: { id: true, name: true, conditions: true, actions: true, order: true, enabled: true, stopProcessing: true },
    })
    rules = saved.map((r) => ({
      id: r.id,
      name: r.name,
      order: r.order,
      enabled: r.enabled,
      stopProcessing: r.stopProcessing,
      conditions: r.conditions as Rule["conditions"],
      actions: r.actions as Rule["actions"],
    }))
  }

  const plan = planRules(rules, values)
  return NextResponse.json(plan)
}
