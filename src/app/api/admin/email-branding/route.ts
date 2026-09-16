import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertDepartmentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  brandingFrom,
  getEmailConfig,
  getDepartmentEmailBranding,
  saveDepartmentEmailBranding,
  type EmailBranding,
} from "@/lib/email-config";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Validate an optional sub-department belongs to the given department. */
async function checkSubScope(departmentId: string, subDepartmentId: string | null): Promise<NextResponse | null> {
  if (!subDepartmentId) return null;
  const sub = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, departmentId }, select: { id: true } });
  if (!sub) return NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 });
  return null;
}

function requireDepartmentId(
  profile: NonNullable<Awaited<ReturnType<typeof requireAuth>>["profile"]>,
  departmentId: string | null,
): NextResponse | null {
  return assertDepartmentAdmin(profile, departmentId);
}

export async function GET(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  const scopeError = requireDepartmentId(profile!, departmentId);
  if (scopeError) return scopeError;
  const subDepartmentId = request.nextUrl.searchParams.get("subDepartmentId");
  const subScopeError = await checkSubScope(departmentId!, subDepartmentId);
  if (subScopeError) return subScopeError;

  // Sub-department inherits the department's effective branding as its default.
  const baseConfig = subDepartmentId ? await getEmailConfig(departmentId) : await getEmailConfig();
  const override = subDepartmentId
    ? await getDepartmentEmailBranding(departmentId!, subDepartmentId)
    : await getDepartmentEmailBranding(departmentId!);
  const defaults = brandingFrom(baseConfig);

  return NextResponse.json({
    defaults,
    override: {
      brandColor: override.brandColor ?? null,
      headerColor: override.headerColor ?? null,
      logoUrl: override.logoUrl ?? null,
      footerText: override.footerText ?? null,
      bodyTextColor: override.bodyTextColor ?? null,
      linkColor: override.linkColor ?? null,
      headerTitle: override.headerTitle ?? null,
      useLogo: override.useLogo ?? null,
      pageBackground: override.pageBackground ?? null,
      hideFooter: override.hideFooter ?? null,
      helpHeading: override.helpHeading ?? null,
      helpMessage: override.helpMessage ?? null,
      supportEmail: override.supportEmail ?? null,
      hideHelp: override.hideHelp ?? null,
      hideSignature: override.hideSignature ?? null,
      confidentialityNotice: override.confidentialityNotice ?? null,
      hideConfidentiality: override.hideConfidentiality ?? null,
    },
    hasOverride: Object.keys(override).length > 0,
  });
}

export async function PUT(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : "";
  const scopeError = requireDepartmentId(profile!, departmentId || null);
  if (scopeError) return scopeError;
  const subDepartmentId = typeof body?.subDepartmentId === "string" ? body.subDepartmentId : null;
  const subScopeError = await checkSubScope(departmentId, subDepartmentId);
  if (subScopeError) return subScopeError;

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

  // Full-layout fields are optional; an empty color clears that override so it
  // falls back to the layout default (linkColor empty = follow the accent).
  for (const key of ["bodyTextColor", "linkColor", "pageBackground"] as const) {
    if (body?.[key] === undefined) continue;
    if (typeof body[key] !== "string") {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }
    const value = (body[key] as string).trim();
    if (value && !HEX_RE.test(value)) {
      return NextResponse.json({ error: `${key} must be a valid hex color` }, { status: 400 });
    }
    branding[key] = value;
  }
  // Optional free-text fields (header wordmark + "Need Help?" block).
  for (const key of ["headerTitle", "helpHeading", "helpMessage", "supportEmail", "confidentialityNotice"] as const) {
    if (body?.[key] === undefined) continue;
    if (typeof body[key] !== "string") {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }
    branding[key] = (body[key] as string).trim();
  }
  for (const key of ["useLogo", "hideFooter", "hideHelp", "hideSignature", "hideConfidentiality"] as const) {
    if (body?.[key] === undefined) continue;
    if (typeof body[key] !== "boolean") {
      return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 });
    }
    branding[key] = body[key] as boolean;
  }

  await saveDepartmentEmailBranding(departmentId, branding, subDepartmentId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  const scopeError = requireDepartmentId(profile!, departmentId);
  if (scopeError) return scopeError;
  const subDepartmentId = request.nextUrl.searchParams.get("subDepartmentId");
  const subScopeError = await checkSubScope(departmentId!, subDepartmentId);
  if (subScopeError) return subScopeError;

  await saveDepartmentEmailBranding(departmentId!, null, subDepartmentId);
  return NextResponse.json({ ok: true });
}
