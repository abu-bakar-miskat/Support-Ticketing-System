export const MAX_AVATAR_ICON_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["gif", "png", "jpg", "jpeg", "webp", "svg"]);

export const AVATAR_ICON_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,.gif,.png,.jpg,.jpeg,.webp,.svg";

export function isAllowedAvatarIcon(file: File): boolean {
  if (file.type === "image/svg+xml") return true;
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? ALLOWED_EXTENSIONS.has(ext) : false;
}

export function validateAvatarIcon(file: File): string | null {
  if (!isAllowedAvatarIcon(file)) {
    return "Use a JPEG, PNG, GIF, WebP, or SVG image.";
  }
  if (file.size > MAX_AVATAR_ICON_BYTES) {
    return "Image must be under 5 MB.";
  }
  return null;
}

export function avatarIconContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}
