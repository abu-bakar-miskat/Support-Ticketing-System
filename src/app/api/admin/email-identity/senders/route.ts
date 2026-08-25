import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveDepartmentEmailSenders } from "@/lib/email-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * DS-02: replaces a department's full list of sender/reply-to addresses.
 * Full-list replace (not a per-item PATCH) — matches saveDepartmentEmailSenders's
 * semantics, so the client always sends its complete edited list.
 */
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
  const subDepartmentId = typeof body?.subDepartmentId === "string" ? body.subDepartmentId : null;
  if (subDepartmentId) {
    const sub = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, departmentId }, select: { id: true } });
    if (!sub) return NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 });
  }

  const rawSenders = Array.isArray(body?.senders) ? body.senders : null;
  if (!rawSenders) {
    return NextResponse.json({ error: "senders must be an array" }, { status: 400 });
  }

  const senders: { id?: string; name: string; email: string; isDefault?: boolean }[] = [];
  for (const s of rawSenders) {
    const name = typeof s?.name === "string" ? s.name.trim() : "";
    const email = typeof s?.email === "string" ? s.email.trim() : "";
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: `Invalid sender email: ${email || "(empty)"}` }, { status: 400 });
    }
    senders.push({ id: typeof s?.id === "string" ? s.id : undefined, name, email, isDefault: s?.isDefault === true });
  }

  const saved = await saveDepartmentEmailSenders(departmentId, senders, subDepartmentId);
  return NextResponse.json({ senders: saved });
}
