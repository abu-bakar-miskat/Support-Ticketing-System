import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import {
  brandingFrom,
  getEmailConfig,
  getDepartmentEmailBranding,
  saveDepartmentEmailBranding,
  type EmailBranding,
} from "@/lib/email-config";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function requireDepartmentId(
  profile: NonNullable<Awaited<ReturnType<typeof requireAdminOrManager>>["profile"]>,
  departmentId: string | null,
): NextResponse | null {
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }
  const deptScope = managerDeptScope(profile);
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json(
      { error: "Forbidden: department is outside your scope" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  const scopeError = requireDepartmentId(profile!, departmentId);
  if (scopeError) return scopeError;

  const workspaceConfig = await getEmailConfig();
  const override = await getDepartmentEmailBranding(departmentId!);
  const defaults = brandingFrom(workspaceConfig);

  return NextResponse.json({
    defaults,
    override: {
      brandColor: override.brandColor ?? null,
      headerColor: override.headerColor ?? null,
      logoUrl: override.logoUrl ?? null,
      footerText: override.footerText ?? null,
    },
    hasOverride: Object.keys(override).length > 0,
  });
}

export async function PUT(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : "";
  const scopeError = requireDepartmentId(profile!, departmentId || null);
  if (scopeError) return scopeError;

  const branding: Partial<EmailBranding> = {};
  for (const key of ["brandColor", "headerColor", "logoUrl", "footerText"] as const) {
    if (typeof body?.[key] !== "string") {
      return NextResponse.json({ error: `${key} is required` }, { status: 400 });
    }
    branding[key] = (body[key] as string).trim();
  }

  if (!HEX_RE.test(branding.brandColor!) || !HEX_RE.test(branding.headerColor!)) {
    return NextResponse.json(
      { error: "brandColor and headerColor must be valid hex colors" },
      { status: 400 },
    );
  }

  await saveDepartmentEmailBranding(departmentId, branding as EmailBranding);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  const scopeError = requireDepartmentId(profile!, departmentId);
  if (scopeError) return scopeError;

  await saveDepartmentEmailBranding(departmentId!, null);
  return NextResponse.json({ ok: true });
}
