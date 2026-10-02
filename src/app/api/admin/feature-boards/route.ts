import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { badRequest } from "@/lib/api-response";
import { resetBoard, saveBoard } from "@/lib/saved-boards";

/** Super admin saves a board (statuses, lists, features, group) and publishes it. */
export async function POST(req: NextRequest) {
  const { profile, error } = await requireSuperAdmin();
  if (error) return error;
  const body = await req.json().catch(() => null);
  try {
    const board = await saveBoard(body, profile!.id);
    return NextResponse.json({ board });
  } catch (err) {
    return badRequest((err as Error).message);
  }
}

/** Restore a built-in board, or hide a custom one from the marketplace. */
export async function DELETE(req: NextRequest) {
  const { profile, error } = await requireSuperAdmin();
  if (error) return error;
  const slug = new URL(req.url).searchParams.get("slug")?.trim() ?? "";
  if (!slug) return badRequest("slug is required");
  await resetBoard(slug, profile!.id);
  return NextResponse.json({ ok: true });
}
