import { toast } from "sonner";

/**
 * Pull the most specific human-readable reason out of an unknown error.
 * ApiError/Error carry the server's `{ error }` message (see lib/api/http.ts);
 * plain strings pass through; everything else falls back.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "error" in err) {
    const e = (err as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

/**
 * Toast an error, preferring the real reason from `err` over `fallback`.
 * Use in `catch (err)` blocks so the toast explains *why*, not just *what*.
 */
export function toastError(fallback: string, err?: unknown): void {
  toast.error(getErrorMessage(err, fallback));
}

/**
 * Read a failed `Response`'s `{ error }` body and toast it, falling back to
 * `fallback` when the body has no message. Use after `if (!res.ok)`.
 */
export async function toastResponseError(res: Response, fallback: string): Promise<void> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  toast.error(body?.error || fallback);
}
