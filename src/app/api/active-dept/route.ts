import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessDepartment } from "@/lib/role-assignment";
import { DEPT_SLUG_COOKIE } from "@/lib/tenant-path";

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const deptId: string | null = body.deptId ?? null;

  // Validate the dept exists and the user has access to it. Access is decided by
  // the canonical scope resolver (SRS D-06), not the legacy role tables.
  let deptSlug = "";
  if (deptId) {
    const dept = await prisma.department.findUnique({
      where: { id: deptId },
      select: { id: true, slug: true },
    });
    if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canAccessDepartment(profile.id, deptId))) {
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
  return res;
}
