import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EMAIL_NOTIFY_KEYS,
  type EmailNotifyKey,
  saveDepartmentNotifyOverride,
} from "@/lib/email-config";

function isNotifyKey(value: string): value is EmailNotifyKey {
  return (EMAIL_NOTIFY_KEYS as readonly string[]).includes(value);
}

/** Department overrides only — a manager may only touch departments in their scope. */
function checkScope(
  profile: NonNullable<Awaited<ReturnType<typeof requireAdminOrManager>>["profile"]>,
  departmentId: string,
): NextResponse | null {
  const deptScope = managerDeptScope(profile);
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 });
  }
  return null;
}

/** Validate an optional sub-department belongs to the given department. */
async function checkSubScope(departmentId: string, subDepartmentId: string | null): Promise<NextResponse | null> {
  if (!subDepartmentId) return null;
  const sub = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, departmentId }, select: { id: true } });
  if (!sub) return NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 });
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const { key } = await params;
  if (!isNotifyKey(key)) {
    return NextResponse.json({ error: "Unknown notification" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : "";
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }
  const scopeError = checkScope(profile!, departmentId);
  if (scopeError) return scopeError;
  const subDepartmentId = typeof body?.subDepartmentId === "string" ? body.subDepartmentId : null;
  const subScopeError = await checkSubScope(departmentId, subDepartmentId);
  if (subScopeError) return subScopeError;

  if (typeof body?.value !== "boolean") {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }

  await saveDepartmentNotifyOverride(key, body.value, departmentId, subDepartmentId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const { key } = await params;
  if (!isNotifyKey(key)) {
    return NextResponse.json({ error: "Unknown notification" }, { status: 404 });
  }

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }
  const scopeError = checkScope(profile!, departmentId);
  if (scopeError) return scopeError;
  const subDepartmentId = request.nextUrl.searchParams.get("subDepartmentId");
  const subScopeError = await checkSubScope(departmentId, subDepartmentId);
  if (subScopeError) return subScopeError;

  await saveDepartmentNotifyOverride(key, null, departmentId, subDepartmentId);
  return NextResponse.json({ ok: true });
}
