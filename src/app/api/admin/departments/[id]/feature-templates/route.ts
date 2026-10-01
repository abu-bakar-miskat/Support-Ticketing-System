import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { badRequest, notFound } from "@/lib/api-response";
import { disableDepartmentTemplate, enableDepartmentTemplate } from "@/lib/feature-marketplace";

type Params = { params: Promise<{ id: string }> };

/** Super admin enables one feature template for a department. */
export async function POST(req: NextRequest, { params }: Params) {
  const { profile, error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  if (!templateId) return badRequest("templateId is required");

  const enabled = body.enabled !== false;

  try {
    if (enabled) {
      await enableDepartmentTemplate({
        departmentId: id,
        templateId,
        actorId: profile!.id,
      });
    } else {
      await disableDepartmentTemplate({
        departmentId: id,
        templateId,
        actorId: profile!.id,
      });
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message === "Department not found") return notFound(message);
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
