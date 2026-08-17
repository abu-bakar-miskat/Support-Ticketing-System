import { createClient } from "@/lib/supabase/server";
import {
  avatarIconContentType,
  isAllowedAvatarIcon,
  MAX_AVATAR_ICON_BYTES,
} from "@/lib/avatar-icon-file";
import { contentTypeForFile } from "@/lib/mime";
export const BUCKET = "attachments";
const MAX_AVATAR_BYTES = MAX_AVATAR_ICON_BYTES;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_DESC_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export function sanitize(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);
}

export type UploadResult = { url: string; path: string };

/**
 * Upload a profile avatar.
 * Path: avatars/{userId}/{timestamp}.{ext}
 */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Avatar must be under 5 MB");
  }
  if (!isAllowedAvatarIcon(file)) {
    throw new Error("Avatar must be an image (JPEG, PNG, GIF, WebP, or SVG)");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `avatars/${userId}/${Date.now()}.${ext}`;
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: avatarIconContentType(file) });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a ticket attachment.
 * Path: tickets/{ticketId}/{timestamp}-{sanitizedName}
 */
export async function uploadTicketFile(
  ticketId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File must be under 50 MB");
  }

  const path = `tickets/${ticketId}/${Date.now()}-${sanitize(file.name)}`;
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function uploadProjectIcon(
  projectId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Image must be under 5 MB");
  }
  if (!isAllowedAvatarIcon(file)) {
    throw new Error("File must be an image (JPEG, PNG, GIF, WebP, or SVG)");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `projects/${projectId}/icon-${Date.now()}.${ext}`;
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: avatarIconContentType(file) });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a tenant logo/icon.
 * Path: tenants/{tenantId}/logo-{timestamp}.{ext}
 */
export async function uploadTenantLogo(
  tenantId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Logo must be under 5 MB");
  }
  if (!isAllowedAvatarIcon(file)) {
    throw new Error("Logo must be an image (JPEG, PNG, GIF, WebP, or SVG)");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `tenants/${tenantId}/logo-${Date.now()}.${ext}`;
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: avatarIconContentType(file) });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a project asset.
 * Path: projects/{projectId}/{timestamp}-{sanitizedName}
 */
export async function uploadProjectFile(
  projectId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File must be under 50 MB");
  }

  const path = `projects/${projectId}/${Date.now()}-${sanitize(file.name)}`;
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a description file (image, PDF, Excel, etc).
 * Path: description-files/{userId}/{timestamp}-{sanitizedName}.{ext}
 */
export async function uploadDescriptionFile(
  userId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_DESC_FILE_BYTES) {
    throw new Error("File must be under 50 MB");
  }
  // Any file type is allowed in ticket descriptions; only size is capped.
  const contentType = contentTypeForFile(file.name, file.type);

  const path = `description-files/${userId}/${Date.now()}-${sanitize(file.name)}`;
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Upload a description image (backwards compatibility).
 * Delegates to uploadDescriptionFile.
 */
export async function uploadDescriptionImage(
  userId: string,
  file: File,
): Promise<UploadResult> {
  return uploadDescriptionFile(userId, file);
}

/**
 * Delete a file from storage by its path.
 */
export async function deleteStorageFile(path: string): Promise<void> {
  const supabase = await createClient();
  await supabase.storage.from(BUCKET).remove([path]);
}
