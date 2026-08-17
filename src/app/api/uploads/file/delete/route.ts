import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteStorageFile } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { path } = await req.json();

    if (!path) {
      return NextResponse.json({ error: "No file path provided" }, { status: 400 });
    }

    // Delete from Supabase storage
    await deleteStorageFile(path);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[uploads/file/delete] Error:", err);
    const msg = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
