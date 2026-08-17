import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { uploadDescriptionFile } from "@/lib/storage";
import { createTemporaryAttachment } from "@/lib/api/uploads";

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const isImage = formData.get("isImage") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const { url, path } = await uploadDescriptionFile(profile.id, file);

    if (isImage) {
      return NextResponse.json({ url, type: "image", storagePath: path }, { status: 201 });
    }

    const attachment = await createTemporaryAttachment(
      profile.id,
      url,
      file.name,
      file.size,
    );

    return NextResponse.json(
      { url, type: "file", attachmentId: attachment.id, fileName: file.name, storagePath: path },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[uploads/file] Error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
