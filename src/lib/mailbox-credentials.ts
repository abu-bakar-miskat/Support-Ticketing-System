import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for `MailboxConnection.credentialsRef` (slice 14, NFR-03).
 * AES-256-GCM via Node's built-in `crypto` — no new dependency, no plaintext
 * ever touches the database. `MAILBOX_CREDENTIALS_KEY` is a base64-encoded
 * 32-byte key; there is no key-rotation scheme yet (single key, like every
 * other secret in this app's env).
 *
 * The Resend provider (the only functional one today) never calls this —
 * it authenticates via the platform-wide `RESEND_API_KEY`, so
 * `MailboxConnection.credentialsRef` stays null for it. This module only
 * matters once OAuth (M365/Google) or IMAP credentials land (EM-05).
 */

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.MAILBOX_CREDENTIALS_KEY;
  if (!raw) {
    throw new Error("MAILBOX_CREDENTIALS_KEY is not configured");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MAILBOX_CREDENTIALS_KEY must decode to exactly 32 bytes");
  }
  return key;
}

/** Encrypts `plaintext` into an opaque base64 blob safe to store in `credentialsRef`. */
export function encryptMailboxCredentials(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Decrypts a blob produced by {@link encryptMailboxCredentials}. Throws if tampered or the key doesn't match. */
export function decryptMailboxCredentials(ciphertext: string): string {
  const raw = Buffer.from(ciphertext, "base64");
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Malformed mailbox credentials blob");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
