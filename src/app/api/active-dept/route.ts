import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessDepartment } from "@/lib/role-assignment";
import { DEPT_SLUG_COOKIE, SUBDEPT_SLUG_COOKIE } from "@/lib/tenant-path";

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const deptId: string | null = body.deptId ?? null;

  // Validate the dept exists and the user has access to it. Access is decided by
  // the canonical scope resolver (SRS D-06), with a TenantMembership fallback —
  // RoleAssignment can lag right after entering a tenant, which used to 403 the
  // Manage button and bounce the user straight back to /departments.
  let deptSlug = "";
  if (deptId) {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
      select: { id: true, slug: true, tenantId: true },
    });
    if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viaScope = await canAccessDepartment(profile.id, deptId);
    const viaTenantAdmin =
      profile.role === "admin" &&
      !!profile.activeTenantId &&
      profile.activeTenantId === dept.tenantId;
    const viaManaged = (profile.managedDepartmentIds ?? []).includes(deptId);
    if (!viaScope && !viaTenantAdmin && !viaManaged && !profile.isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    deptSlug = dept.slug ?? "";
  }

  const res = NextResponse.json({ ok: true, slug: deptSlug });
  res.cookies.set("pen_active_dept", deptId ?? "", {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  // Mirror the dept slug so middleware can build /<tenant>/<dept>/… URLs.
  res.cookies.set(DEPT_SLUG_COOKIE, deptSlug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  // Switching department invalidates any prior sub-department selection.
  res.cookies.set("pen_active_team", "", { path: "/", maxAge: 0 });
  res.cookies.set(SUBDEPT_SLUG_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
