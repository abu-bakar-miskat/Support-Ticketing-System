import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGet = vi.fn()
const mockAttachmentsGet = vi.fn()
const mockApiKeysList = vi.fn()

vi.mock("@/lib/resend-client", () => ({
  getResendClient: vi.fn(() => ({
    emails: { receiving: { get: mockGet, attachments: { get: mockAttachmentsGet } } },
    apiKeys: { list: mockApiKeysList },
  })),
}))

import { getResendClient } from "@/lib/resend-client"
import { resendProvider } from "./resend-provider"

const mockGetResendClient = vi.mocked(getResendClient)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetResendClient.mockReturnValue({
    emails: { receiving: { get: mockGet, attachments: { get: mockAttachmentsGet } } },
    apiKeys: { list: mockApiKeysList },
  } as never)
})

describe("resendProvider.fetchMessage", () => {
  it("normalizes a fetched email into NormalizedInboundEmail", async () => {
    mockGet.mockResolvedValue({
      data: {
        from: "Jane <jane@example.com>",
        to: ["support@tickets.pengroup.com"],
        subject: "Help",
        text: "body text",
        html: "<p>body</p>",
        headers: { "in-reply-to": "<abc@example.com>" },
        attachments: [{ id: "att-1", filename: "file.pdf", content_type: "application/pdf", size: 100 }],
      },
      error: null,
    })

    const result = await resendProvider.fetchMessage("email-123")

    expect(result).toEqual({
      providerMessageId: "email-123",
      from: "Jane <jane@example.com>",
      to: ["support@tickets.pengroup.com"],
      subject: "Help",
      text: "body text",
      html: "<p>body</p>",
      headers: { "in-reply-to": "<abc@example.com>" },
      attachments: [{ id: "att-1", filename: "file.pdf", contentType: "application/pdf", size: 100 }],
    })
  })

  it("returns null when the Resend client isn't configured", async () => {
    mockGetResendClient.mockReturnValue(null)
    expect(await resendProvider.fetchMessage("email-123")).toBeNull()
  })

  it("returns null when Resend errors", async () => {
    mockGet.mockResolvedValue({ data: null, error: { message: "not found" } })
    expect(await resendProvider.fetchMessage("email-123")).toBeNull()
  })

  it("defaults missing optional fields", async () => {
    mockGet.mockResolvedValue({
      data: { from: "a@b.com", to: ["c@d.com"], subject: null, text: null, html: null, headers: undefined, attachments: undefined },
      error: null,
    })
    const result = await resendProvider.fetchMessage("email-1")
    expect(result?.headers).toEqual({})
    expect(result?.attachments).toEqual([])
  })
})

describe("resendProvider.fetchAttachmentUrl", () => {
  it("returns the download url on success", async () => {
    mockAttachmentsGet.mockResolvedValue({ data: { download_url: "https://example.com/file" }, error: null })
    const url = await resendProvider.fetchAttachmentUrl("email-1", "att-1")
    expect(url).toBe("https://example.com/file")
    expect(mockAttachmentsGet).toHaveBeenCalledWith({ emailId: "email-1", id: "att-1" })
  })

  it("returns null on error or missing url", async () => {
    mockAttachmentsGet.mockResolvedValue({ data: null, error: { message: "fail" } })
    expect(await resendProvider.fetchAttachmentUrl("email-1", "att-1")).toBeNull()
  })
})

describe("resendProvider.checkHealth", () => {
  it("is ok when the API key is accepted", async () => {
    mockApiKeysList.mockResolvedValue({ data: [], error: null })
    expect(await resendProvider.checkHealth({ credentialsRef: null })).toEqual({ ok: true })
  })

  it("reports the Resend error message on rejection", async () => {
    mockApiKeysList.mockResolvedValue({ data: null, error: { message: "invalid API key" } })
    expect(await resendProvider.checkHealth({ credentialsRef: null })).toEqual({ ok: false, error: "invalid API key" })
  })

  it("reports not-configured when there's no client", async () => {
    mockGetResendClient.mockReturnValue(null)
    expect(await resendProvider.checkHealth({ credentialsRef: null })).toEqual({
      ok: false,
      error: "RESEND_API_KEY is not configured",
    })
  })

  it("catches a thrown network error", async () => {
    mockApiKeysList.mockRejectedValue(new Error("ECONNRESET"))
    expect(await resendProvider.checkHealth({ credentialsRef: null })).toEqual({ ok: false, error: "ECONNRESET" })
  })
})
