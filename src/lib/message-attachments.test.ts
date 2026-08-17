import { describe, it, expect } from "vitest"
import { classifyAttachment, INBOUND_MAX_BYTES } from "./message-attachments"

describe("classifyAttachment", () => {
  // ── size cap ──────────────────────────────────────────────────────────────

  it("returns too_large when file exceeds the cap", () => {
    expect(classifyAttachment("image/png", INBOUND_MAX_BYTES + 1)).toBe("too_large")
  })

  it("returns ok when file is exactly at the cap", () => {
    expect(classifyAttachment("image/png", INBOUND_MAX_BYTES)).toBe("ok")
  })

  // ── blocked MIME types ────────────────────────────────────────────────────

  it("blocks application/x-msdownload (.exe MIME type)", () => {
    expect(classifyAttachment("application/x-msdownload", 1024)).toBe("blocked_type")
  })

  it("blocks application/x-sh (shell script MIME)", () => {
    expect(classifyAttachment("application/x-sh", 512)).toBe("blocked_type")
  })

  it("blocks application/vnd.microsoft.portable-executable", () => {
    expect(classifyAttachment("application/vnd.microsoft.portable-executable", 1024)).toBe("blocked_type")
  })

  it("blocks application/x-python", () => {
    expect(classifyAttachment("application/x-python", 100)).toBe("blocked_type")
  })

  it("is case-insensitive on MIME type", () => {
    expect(classifyAttachment("Application/X-MSDownload", 1024)).toBe("blocked_type")
  })

  it("ignores MIME parameters when checking type (e.g. charset)", () => {
    expect(classifyAttachment("application/x-sh; charset=utf-8", 100)).toBe("blocked_type")
  })

  // ── blocked extensions ────────────────────────────────────────────────────

  it("blocks .exe extension even with generic MIME type", () => {
    expect(classifyAttachment("application/octet-stream", 1024, "payload.exe")).toBe("blocked_type")
  })

  it("blocks .ps1 PowerShell extension", () => {
    expect(classifyAttachment("application/octet-stream", 512, "script.ps1")).toBe("blocked_type")
  })

  it("blocks .bat extension", () => {
    expect(classifyAttachment("application/octet-stream", 100, "run.bat")).toBe("blocked_type")
  })

  it("blocks .sh extension", () => {
    expect(classifyAttachment("text/plain", 200, "setup.sh")).toBe("blocked_type")
  })

  it("is case-insensitive on extension", () => {
    expect(classifyAttachment("application/octet-stream", 100, "VIRUS.EXE")).toBe("blocked_type")
  })

  // ── safe types ────────────────────────────────────────────────────────────

  it("allows image/png", () => {
    expect(classifyAttachment("image/png", 50_000)).toBe("ok")
  })

  it("allows application/pdf", () => {
    expect(classifyAttachment("application/pdf", 500_000)).toBe("ok")
  })

  it("allows text/plain with .txt extension", () => {
    expect(classifyAttachment("text/plain", 1024, "notes.txt")).toBe("ok")
  })

  it("allows application/zip", () => {
    expect(classifyAttachment("application/zip", 2_000_000)).toBe("ok")
  })

  it("returns ok when filename is absent and MIME is safe", () => {
    expect(classifyAttachment("image/jpeg", 100_000, null)).toBe("ok")
  })

  // ── size takes precedence over type ───────────────────────────────────────

  it("returns too_large before checking blocklist when file is over cap", () => {
    // Even a blocked type should report too_large (dropped, not stored blocked)
    expect(classifyAttachment("application/x-msdownload", INBOUND_MAX_BYTES + 1)).toBe("too_large")
  })
})
