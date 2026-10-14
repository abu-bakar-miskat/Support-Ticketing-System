import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Opaque per-intake token stored on `Intake.replyToken`. It used to be the
 * local part of a Resend reply address; customer replies now come back through
 * the connected Microsoft 365 mailbox, but the column is still populated so
 * existing rows and constraints stay consistent.
 */
export function generateReplyToken(): string {
  return randomBytes(24).toString("hex"); // 48 hex chars
}
