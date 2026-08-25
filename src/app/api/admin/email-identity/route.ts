import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getEmailConfig,
  getDepartmentEmailIdentity,
  saveDepartmentEmailIdentity,
} from "@/lib/email-config";
import { assertTemplateFeatureEnabled } from "@/lib/template-catalogue";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate an optional sub-department belongs to the given department. */
async function checkSubScope(departmentId: string, subDepartmentId: string | null): Promise<NextResponse | null> {
  if (!subDepartmentId) return null;
  const sub = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, departmentId }, select: { id: true } });
  if (!sub) return NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 });
  return null;
}

export async function GET(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  const subDepartmentId = request.nextUrl.searchParams.get("subDepartmentId");

  if (!departmentId && profile!.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const deptScope = managerDeptScope(profile!);
  if (departmentId && deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 });
  }
  if (subDepartmentId && !departmentId) {
    return NextResponse.json({ error: "departmentId is required with subDepartmentId" }, { status: 400 });
  }
  const subScopeError = await checkSubScope(departmentId ?? "", subDepartmentId);
  if (subScopeError) return subScopeError;

  // Sub-department inherits the department's effective identity as its default.
  const baseConfig = subDepartmentId ? await getEmailConfig(departmentId) : await getEmailConfig();
  const override = subDepartmentId
    ? await getDepartmentEmailIdentity(departmentId!, subDepartmentId)
    : departmentId
      ? await getDepartmentEmailIdentity(departmentId)
      : {};

  return NextResponse.json({
    defaultFromName: baseConfig.fromName,
    defaultFromEmail: baseConfig.fromEmail,
    overrideFromName: override.fromName ?? null,
    overrideFromEmail: override.fromEmail ?? null,
    // DS-02: the full sender list (one flagged default) — empty when this scope
    // has no senders configured at all.
    senders: override.senders ?? [],
  });
}

export async function PUT(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const featureCheck = await assertTemplateFeatureEnabled(profile!.activeTenantId ?? "__no_tenant__", "emailSettings");
  if (!featureCheck.ok) {
    return NextResponse.json({ error: featureCheck.error }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : "";
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }
  const deptScope = managerDeptScope(profile!);
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 });
  }
  const subDepartmentId = typeof body?.subDepartmentId === "string" ? body.subDepartmentId : null;
  const subScopeError = await checkSubScope(departmentId, subDepartmentId);
  if (subScopeError) return subScopeError;

  const hasFromName = typeof body?.fromName === "string";
  const hasFromEmail = typeof body?.fromEmail === "string";
  const fromName = hasFromName ? (body.fromName as string).trim() : "";
  const fromEmail = hasFromEmail ? (body.fromEmail as string).trim() : "";
  if (fromEmail && !EMAIL_RE.test(fromEmail)) {
    return NextResponse.json({ error: "A valid From email is required" }, { status: 400 });
  }

  await saveDepartmentEmailIdentity(departmentId, {
    fromName: hasFromName ? (fromName || null) : undefined,
    fromEmail: hasFromEmail ? (fromEmail || null) : undefined,
  }, subDepartmentId);
  return NextResponse.json({ ok: true });
}
