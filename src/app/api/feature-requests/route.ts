import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { badRequest } from "@/lib/api-response";
import { requestDepartmentFeature } from "@/lib/feature-marketplace";

/** Tenant admin asks for one marketplace feature on the active department. */
export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && !profile.isSuperAdmin) {
    return NextResponse.json({ error: "Only a tenant admin can request a feature." }, { status: 403 });
  }
  const tenantId = profile.activeTenantId;
  if (!tenantId) return badRequest("No active organization");

  const body = await req.json().catch(() => ({}));
  const departmentId = typeof body.departmentId === "string" ? body.departmentId : "";
  const featureKey = typeof body.featureKey === "string" ? body.featureKey : "";
  if (!departmentId || !featureKey) return badRequest("departmentId and featureKey are required");

  try {
    const request = await requestDepartmentFeature({
      tenantId,
      departmentId,
      featureKey,
      requestedById: profile.id,
      message: typeof body.message === "string" ? body.message : undefined,
    });
    return NextResponse.json({ id: request.id, status: request.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
