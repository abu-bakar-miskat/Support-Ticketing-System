import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { badRequest } from "@/lib/api-response";
import {
  requestDepartmentFeature,
  requestDepartmentTemplate,
  requestTenantFeature,
  requestTenantTemplate,
} from "@/lib/feature-marketplace";

/** Tenant admin or department manager asks for one marketplace feature. */
export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.isSuperAdmin) {
    return NextResponse.json({ error: "Super admins approve feature requests." }, { status: 403 });
  }
  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Only a tenant admin or manager can request a feature." }, { status: 403 });
  }
  const tenantId = profile.activeTenantId;
  if (!tenantId) return badRequest("No active organization");

  const body = await req.json().catch(() => ({}));
  const departmentId = typeof body.departmentId === "string" ? body.departmentId : "";
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const featureKey = typeof body.featureKey === "string" ? body.featureKey : "";
  if (!templateId && !featureKey) {
    return badRequest("A template or feature is required");
  }
  if (!departmentId && profile.role === "manager") {
    return NextResponse.json(
      { error: "Choose a department you manage to request a feature." },
      { status: 403 },
    );
  }
  if (
    departmentId &&
    profile.role === "manager" &&
    !(profile.managedDepartmentIds ?? []).includes(departmentId)
  ) {
    return NextResponse.json(
      { error: "You can only request features for a department you manage." },
      { status: 403 },
    );
  }

  try {
    if (!departmentId) {
      if (templateId) {
        await requestTenantTemplate({
          tenantId,
          templateId,
          requestedById: profile.id,
          message: typeof body.message === "string" ? body.message : undefined,
        });
      } else {
        await requestTenantFeature({
          tenantId,
          featureKey,
          requestedById: profile.id,
          message: typeof body.message === "string" ? body.message : undefined,
        });
      }
      return NextResponse.json({ status: "PENDING" });
    }
    const request = featureKey
      ? await requestDepartmentFeature({
          tenantId,
          departmentId,
          featureKey,
          templateId: templateId || undefined,
          requestedById: profile.id,
          message: typeof body.message === "string" ? body.message : undefined,
        })
      : await requestDepartmentTemplate({
          tenantId,
          departmentId,
          templateId,
          requestedById: profile.id,
          message: typeof body.message === "string" ? body.message : undefined,
        });
    return NextResponse.json({ id: request.id, status: request.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
