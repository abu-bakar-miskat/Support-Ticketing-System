import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BUCKET, sanitize } from "@/lib/storage";
import { createTemporaryAttachment } from "@/lib/api/uploads";
import {
  contentTypeForFile,
  maxBytesFor,
  maxLabelFor,
  uploadKind,
} from "@/lib/mime";
import { classifyCommentAttachment, COMMENT_ATTACHMENT_MAX_BYTES } from "@/lib/message-attachments";

// Returns a short-lived signed URL so the browser uploads file bytes directly
// to Supabase Storage, bypassing the ~4.5 MB Vercel function body limit. Only
// tiny JSON passes through this route.
export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const size = Number(body.size);
    // Comments/customer replies link every file (including images) by
    // attachment id, so they opt in to always creating an attachment record.
    const forceAttach = body.attach === true;

    if (!fileName) {
      return NextResponse.json({ error: "Missing file name" }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
    }

    const contentType = contentTypeForFile(fileName, body.contentType);

    if (forceAttach) {
      // CM-04: comment/reply attachments — 25 MB cap, MIME allowlist
      // (images/PDF/office/text-CSV/zip), executables rejected outright.
      const classification = classifyCommentAttachment(contentType, size, fileName);
      if (classification === "too_large") {
        return NextResponse.json(
          { error: `File must be under ${COMMENT_ATTACHMENT_MAX_BYTES / 1024 / 1024} MB` },
          { status: 400 },
        );
      }
      if (classification === "blocked_type") {
        return NextResponse.json(
          { error: "This file type isn't supported for comment/reply attachments" },
          { status: 400 },
        );
      }
    } else {
      // Ticket descriptions: any file type is allowed; only size is capped.
      if (size > maxBytesFor(contentType)) {
        return NextResponse.json(
          { error: `File must be under ${maxLabelFor(contentType)}` },
          { status: 400 },
        );
      }
    }

    const kind = uploadKind(contentType);
    const path = `description-files/${profile.id}/${Date.now()}-${sanitize(fileName)}`;
    const supabase = await createClient();

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signed) {
      return NextResponse.json(
        { error: signErr?.message ?? "Could not create upload URL" },
        { status: 400 },
      );
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // Images embed by URL; other files/videos are tracked as attachments so they
    // can be linked to the ticket on create (same flow as the old route).
    let attachmentId: string | undefined;
    if (kind !== "image" || forceAttach) {
      const attachment = await createTemporaryAttachment(
        profile.id,
        publicUrl,
        fileName,
        size,
      );
      attachmentId = attachment.id;
    }

    return NextResponse.json(
      {
        path: signed.path,
        token: signed.token,
        publicUrl,
        contentType,
        kind,
        attachmentId,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("[uploads/sign] Error:", err);
    const msg = err instanceof Error ? err.message : "Failed to sign upload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
