import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import {
  getEmailConfig,
  getDepartmentEmailIdentity,
  saveDepartmentEmailIdentity,
} from "@/lib/email-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");

  if (!departmentId && profile!.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const deptScope = managerDeptScope(profile!);
  if (departmentId && deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 });
  }

  const workspaceConfig = await getEmailConfig();
  const override = departmentId ? await getDepartmentEmailIdentity(departmentId) : {};

  return NextResponse.json({
    defaultFromName: workspaceConfig.fromName,
    defaultFromEmail: workspaceConfig.fromEmail,
    overrideFromName: override.fromName ?? null,
    overrideFromEmail: override.fromEmail ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : "";
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }
  const deptScope = managerDeptScope(profile!);
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 });
  }

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
  });
  return NextResponse.json({ ok: true });
}
