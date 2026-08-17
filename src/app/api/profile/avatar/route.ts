import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadAvatar } from "@/lib/storage";
import { validateAvatarIcon } from "@/lib/avatar-icon-file";

export async function POST(request: Request) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const validationError = validateAvatarIcon(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const { url } = await uploadAvatar(profile.id, file);

    await prisma.profile.update({
      where: { id: profile.id },
      data: { avatarUrl: url },
    });

    return NextResponse.json({ avatarUrl: url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
