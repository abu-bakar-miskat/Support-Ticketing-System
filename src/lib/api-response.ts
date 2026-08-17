import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@/lib/api-error";

/** Consistent JSON error responses. Body always carries a machine-readable
 *  `code` alongside the human-readable `error`, so the client can detect
 *  permission denials without string-matching. */
function errorResponse(status: number, message: string, code: ApiErrorCode) {
  return NextResponse.json({ error: message, code }, { status });
}

export function unauthorized(message = "You need to sign in to do this.") {
  return errorResponse(401, message, "unauthorized");
}

export function forbidden(message = "You don't have permission to do this.") {
  return errorResponse(403, message, "forbidden");
}

export function badRequest(message = "Invalid request.") {
  return errorResponse(400, message, "bad_request");
}

export function notFound(message = "Not found.") {
  return errorResponse(404, message, "not_found");
}
