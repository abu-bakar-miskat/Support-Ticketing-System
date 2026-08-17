import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canAddProjectAssets } from "@/lib/project-assets";
import { createClient } from "@/lib/supabase/server";
import { BUCKET, sanitize } from "@/lib/storage";
import { contentTypeForFile } from "@/lib/mime";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// Returns a short-lived signed URL so the browser uploads asset bytes directly
// to Supabase Storage, bypassing the ~4.5 MB Vercel function body limit.
export async function POST(request: Request) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const size = Number(body.size);

  if (!fileName || !projectId) {
    return NextResponse.json({ error: "fileName and projectId are required" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
  }
  if (size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File must be under 50 MB" }, { status: 400 });
  }
  if (!(await canAddProjectAssets(profile, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const path = `projects/${projectId}/${Date.now()}-${sanitize(fileName)}`;
  const supabase = await createClient();

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? "Could not create upload URL" }, { status: 400 });
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({
    path: signed.path,
    token: signed.token,
    publicUrl: pub.publicUrl,
    contentType: contentTypeForFile(fileName, body.contentType),
  });
}
