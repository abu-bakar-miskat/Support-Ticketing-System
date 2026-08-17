import { toast } from "sonner"
import { isPermissionError } from "@/lib/api-error"

/**
 * Standard per-call mutation onError. Shows the error as a toast, but skips
 * auth/permission errors (401/403) since the global mutation handler already
 * surfaces those — avoids showing the same denial twice.
 */
export function notifyMutationError(err: unknown) {
  if (isPermissionError(err)) return
  toast.error(err instanceof Error ? err.message : "Something went wrong.")
}
