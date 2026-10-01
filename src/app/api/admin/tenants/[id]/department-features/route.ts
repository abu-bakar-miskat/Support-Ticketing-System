import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isMarketplaceFeatureKey } from "@/lib/template-features";
import { listTenantDepartmentFeatures, setTenantDepartmentFeatures } from "@/lib/feature-marketplace";

type Params = { params: Promise<{ id: string }> };

/** Marketplace features currently granted on every department in one tenant. */
export async function GET(_request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const features = await listTenantDepartmentFeatures(id);
  return NextResponse.json({ tenantId: id, features });
}

/** Grant or remove a marketplace feature on every department in the tenant. */
export async function PUT(request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const enabled = body?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const all = body?.all === true;
  const key = body?.key;
  if (!all && !isMarketplaceFeatureKey(key)) {
    return NextResponse.json({ error: "Unknown feature" }, { status: 400 });
  }

  const features = await setTenantDepartmentFeatures({
    tenantId: id,
    key: all ? null : key,
    enabled,
    actorId: profile!.id,
  });
  return NextResponse.json({ tenantId: id, features });
}
