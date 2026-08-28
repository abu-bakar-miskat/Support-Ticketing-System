/**
 * Best-effort in-memory per-IP limiter for anonymous public POSTs (FM-08).
 * Instances are reused under Fluid Compute so this holds for bursts.
 */

const hits = new Map<string, { count: number; windowStart: number }>();

export function publicRateLimited(
  ip: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  if (hits.size > 5000) hits.clear();
  return entry.count > limit;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
