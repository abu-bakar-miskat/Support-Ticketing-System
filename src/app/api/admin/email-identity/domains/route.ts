import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listTenantDomains, addTenantDomain } from "@/lib/email-domains";

// Tenant-admin domain management, scoped to the caller's active tenant. Distinct
// from the super-admin /api/admin/email-domains routes (which list every domain
// in the Resend account): here a tenant admin only ever sees and manages the
// domains their own workspace registered.

export async function GET() {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) return NextResponse.json({ domains: [] });

  const domains = await listTenantDomains(tenantId);
  return NextResponse.json({ domains });
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAdmin();
  if (error) return error;

  const tenantId = profile!.activeTenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No active workspace to add a domain to." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ error: "A domain name is required" }, { status: 400 });
  }
  if (body.allDepartments !== undefined && typeof body.allDepartments !== "boolean") {
    return NextResponse.json({ error: "allDepartments must be a boolean" }, { status: 400 });
  }
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : null;
  const subDepartmentId = typeof body?.subDepartmentId === "string" ? body.subDepartmentId : null;

  const result = await addTenantDomain(tenantId, name, { departmentId, subDepartmentId, allDepartments: body.allDepartments === true });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ domain: result }, { status: 201 });
}
