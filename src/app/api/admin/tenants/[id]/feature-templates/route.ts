import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { badRequest, notFound } from "@/lib/api-response";
import {
  disableTenantFeature,
  disableTenantTemplate,
  enableTenantFeature,
  enableTenantTemplate,
} from "@/lib/feature-marketplace";

type Params = { params: Promise<{ id: string }> };

/** Super admin enables an operation, or one of its features, for every department in the tenant. */
export async function POST(req: NextRequest, { params }: Params) {
  const { profile, error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  if (!templateId) return badRequest("templateId is required");

  const enabled = body.enabled !== false;
  const featureKey = typeof body.featureKey === "string" ? body.featureKey : "";

  try {
    if (featureKey) {
      const change = { tenantId: id, templateId, featureKey, actorId: profile!.id };
      if (enabled) await enableTenantFeature(change);
      else await disableTenantFeature(change);
    } else if (enabled) {
      await enableTenantTemplate({ tenantId: id, templateId, actorId: profile!.id });
    } else {
      await disableTenantTemplate({ tenantId: id, templateId, actorId: profile!.id });
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message === "Organization not found") return notFound(message);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
