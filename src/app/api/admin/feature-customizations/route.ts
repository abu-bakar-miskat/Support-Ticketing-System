import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { badRequest } from "@/lib/api-response";
import { resetFeature, saveFeature } from "@/lib/saved-features";

/** Super admin saves one feature's options. */
export async function POST(req: NextRequest) {
  const { profile, error } = await requireSuperAdmin();
  if (error) return error;
  const body = await req.json().catch(() => null);
  try {
    const feature = await saveFeature(body, profile!.id);
    return NextResponse.json({ feature });
  } catch (err) {
    return badRequest((err as Error).message);
  }
}

/** Restore a feature to its built-in options. */
export async function DELETE(req: NextRequest) {
  const { profile, error } = await requireSuperAdmin();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return badRequest("id is required");
  try {
    await resetFeature(id, profile!.id);
  } catch (err) {
    return badRequest((err as Error).message);
  }
  return NextResponse.json({ ok: true });
}
