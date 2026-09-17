import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createDomainRequest } from "@/lib/email-domain-requests";

// A department manager or sub-department manager requests a sending domain from
// their mailbox page; a tenant admin approves + registers it. Admins don't need
// this — they register directly.
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No active workspace." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : "";
  const subDepartmentId = typeof body?.subDepartmentId === "string" ? body.subDepartmentId : null;
  const domain = typeof body?.domain === "string" ? body.domain : "";
  const note = typeof body?.note === "string" ? body.note : null;

  if (!departmentId || !domain.trim()) {
    return NextResponse.json({ error: "A department and domain are required" }, { status: 400 });
  }

  // Only managers / sub-managers (and admins) may request, and only within their
  // own scope. The lib also re-checks the scope belongs to the tenant.
  const role = profile!.role;
  const managedDepts = new Set([
    ...(profile!.managedDepartmentIds ?? []),
    ...(profile!.grantedAccessDeptIds ?? []),
  ]);
  const memberSubDepts = new Set(profile!.subDepartmentIds ?? []);

  const allowed =
    role === "admin" ||
    (role === "manager" && managedDepts.has(departmentId)) ||
    (role === "sub_manager" && subDepartmentId != null && memberSubDepts.has(subDepartmentId));
  if (!allowed) {
    return NextResponse.json({ error: "You can only request a domain for a team you manage." }, { status: 403 });
  }

  const result = await createDomainRequest({
    tenantId,
    departmentId,
    subDepartmentId,
    domain,
    note,
    requestedById: profile!.id,
    requesterName: profile!.name,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
