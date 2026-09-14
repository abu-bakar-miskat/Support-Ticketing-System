import { TENANT_SCOPED_ROOTS } from "@/lib/tenant-path";

/** Allow only same-origin relative paths (no protocol-relative or absolute URLs). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  // Block scheme-like paths such as /javascript:...
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(trimmed)) return fallback;
  // Drop query/hash — invite deep links must not carry ?error= through OTP verify.
  const pathOnly = trimmed.split(/[?#]/, 1)[0] || fallback;
  return pathOnly || fallback;
}

/**
 * True when `next` is the department/tenant home (or junk like /api/…) rather
 * than a named app route. Login should then dispatch by role instead of
 * dropping everyone on Home.
 */
export function isGenericLandingPath(next: string): boolean {
  const path = safeNextPath(next);
  if (path === "/") return true;
  if (path.startsWith("/api/") || path === "/manifest.webmanifest") return true;
  if (path.startsWith("/invite/") || path.startsWith("/tenant-invite/")) return false;
  const segs = path.split("/").filter(Boolean);
  const last = segs[segs.length - 1];
  if (!last) return true;
  return !TENANT_SCOPED_ROOTS.has(last);
}
