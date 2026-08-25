import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
  saveEmailTemplateOverride,
} from "@/lib/email-config";

function isTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/** Validate an optional sub-department belongs to the given department. */
async function checkSubScope(departmentId: string, subDepartmentId: string | null): Promise<NextResponse | null> {
  if (!subDepartmentId) return null;
  const sub = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, departmentId }, select: { id: true } });
  if (!sub) return NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 });
  return null;
}

/** Templates are department-scoped — managers may only edit departments in scope. */
function checkDepartmentScope(
  profile: NonNullable<Awaited<ReturnType<typeof requireAdminOrManager>>["profile"]>,
  departmentId: string | null,
): NextResponse | null {
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }
  const deptScope = managerDeptScope(profile);
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json(
      { error: "Forbidden: department is outside your scope" },
      { status: 403 },
    );
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
  if (!isTemplateKey(key)) {
    return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const departmentId =
    typeof body?.departmentId === "string" && body.departmentId
      ? body.departmentId
      : null;
  const scopeError = checkDepartmentScope(profile!, departmentId);
  if (scopeError) return scopeError;
  const subDepartmentId = typeof body?.subDepartmentId === "string" ? body.subDepartmentId : null;
  const subScopeError = await checkSubScope(departmentId!, subDepartmentId);
  if (subScopeError) return subScopeError;

  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const heading = typeof body?.heading === "string" ? body.heading.trim() : "";
  const bodyHtml = typeof body?.bodyHtml === "string" ? body.bodyHtml.trim() : "";
  // DS-05/06: this template's own footer; omitted/empty falls back to the
  // department/tenant/platform default chain.
  const footerText = typeof body?.footerText === "string" ? body.footerText.trim() : "";

  if (!bodyHtml) {
    return NextResponse.json(
      { error: "bodyHtml is required to customize this template" },
      { status: 400 },
    );
  }

  await saveEmailTemplateOverride(
    key,
    { subject, heading, bodyHtml, ...(footerText ? { footerText } : {}) },
    departmentId!,
    profile!.id,
    subDepartmentId,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const { key } = await params;
  if (!isTemplateKey(key)) {
    return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  }

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  const scopeError = checkDepartmentScope(profile!, departmentId);
  if (scopeError) return scopeError;
  const subDepartmentId = request.nextUrl.searchParams.get("subDepartmentId");
  const subScopeError = await checkSubScope(departmentId!, subDepartmentId);
  if (subScopeError) return subScopeError;

  await saveEmailTemplateOverride(key, null, departmentId!, profile!.id, subDepartmentId);
  return NextResponse.json({ ok: true });
}
