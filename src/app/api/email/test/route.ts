import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager } from "@/lib/auth";
import { describeSender, sendTestEmail } from "@/lib/email";
import { prisma } from "@/lib/db";

type Scope = { departmentId?: string | null; subDepartmentId?: string | null };

function readScope(source: Scope): Scope {
  return {
    departmentId: typeof source.departmentId === "string" && source.departmentId ? source.departmentId : null,
    subDepartmentId: typeof source.subDepartmentId === "string" && source.subDepartmentId ? source.subDepartmentId : null,
  };
}

/**
 * The scope must belong to the caller's active tenant — otherwise a test send
 * could go out through another tenant's connected mailbox.
 */
async function scopeError(scope: Scope, tenantId: string | null | undefined): Promise<NextResponse | null> {
  if (!scope.departmentId) return scope.subDepartmentId ? NextResponse.json({ error: "departmentId is required" }, { status: 400 }) : null;
  const dept = await prisma.department.findUnique({ where: { id: scope.departmentId }, select: { tenantId: true } });
  if (!dept || dept.tenantId !== tenantId) return NextResponse.json({ error: "Department not found" }, { status: 404 });
  if (scope.subDepartmentId) {
    const sub = await prisma.subDepartment.findFirst({
      where: { id: scope.subDepartmentId, departmentId: scope.departmentId },
      select: { id: true },
    });
    if (!sub) return NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 });
  }
  return null;
}

/** GET — which address email for this scope (department / sub-department / tenant) goes out from. */
export async function GET(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;
  const search = request.nextUrl.searchParams;
  const scope = readScope({ departmentId: search.get("departmentId"), subDepartmentId: search.get("subDepartmentId") });
  const invalid = await scopeError(scope, profile.activeTenantId);
  if (invalid) return invalid;
  return NextResponse.json(await describeSender({ tenantId: profile.activeTenantId, ...scope }));
}

/** POST — sends a test email to the caller through that same mailbox. */
export async function POST(request: Request) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as Scope & { to?: unknown };
  const to = typeof body.to === "string" && body.to.trim() ? body.to.trim() : profile.email;
  if (!to) {
    return NextResponse.json({ error: "No recipient address available." }, { status: 400 });
  }

  const scope = readScope(body);
  const invalid = await scopeError(scope, profile.activeTenantId);
  if (invalid) return invalid;

  const result = await sendTestEmail({
    to,
    recipientName: profile.name ?? "there",
    tenantId: profile.activeTenantId,
    ...scope,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, to, from: result.from, via: result.via });
}
