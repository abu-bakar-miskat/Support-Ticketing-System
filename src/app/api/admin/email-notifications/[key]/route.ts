import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
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

  if (typeof body?.value !== "boolean") {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }

  await saveDepartmentNotifyOverride(key, body.value, departmentId);
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

  await saveDepartmentNotifyOverride(key, null, departmentId);
  return NextResponse.json({ ok: true });
}
