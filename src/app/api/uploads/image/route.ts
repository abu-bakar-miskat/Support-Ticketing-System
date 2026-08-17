import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { uploadDescriptionImage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return NextResponse.json({ error }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  try {
    const { url } = await uploadDescriptionImage(profile.id, file);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
