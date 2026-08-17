export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "error";

/** Error thrown by client fetch wrappers, carrying the HTTP status and the
 *  server-provided code/message so callers (and the global handler) can react
 *  to permission failures specifically. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, message: string, code: ApiErrorCode = "error") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** True for auth/permission denials (401/403) — handled by the global toast. */
export function isPermissionError(err: unknown): err is ApiError {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}
