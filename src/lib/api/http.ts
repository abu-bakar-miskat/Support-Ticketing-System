import { ApiError, type ApiErrorCode } from "@/lib/api-error";

/**
 * Thin fetch wrapper for internal API routes. On a non-OK response it throws
 * an ApiError carrying the HTTP status and the server's `{ error, code }`
 * payload, so callers and the global mutation handler can react to permission
 * denials (401/403) specifically. Returns parsed JSON on success.
 */
export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit & { fallbackError?: string },
): Promise<T> {
  const { fallbackError = "Something went wrong.", ...rest } = init ?? {};
  const res = await fetch(input, rest);

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; code?: ApiErrorCode }
      | null;
    throw new ApiError(
      res.status,
      body?.error || fallbackError,
      body?.code ?? "error",
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
