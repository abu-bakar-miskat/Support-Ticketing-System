import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, close, getPlatformSettings, getResendClient, resendSend, fetchMock } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  close: vi.fn(),
  getPlatformSettings: vi.fn(),
  getResendClient: vi.fn(),
  resendSend: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail, close }),
  },
}));
vi.mock("@/lib/platform-settings", () => ({ getPlatformSettings }));
vi.mock("@/lib/resend-client", () => ({ getResendClient }));

import {
  getMailpitUiBase,
  isAuthEmailConfigured,
  sendAuthEmail,
  sendOutboundEmail,
} from "./email-transport";

const message = {
  from: "Global Support Portal <noreply@example.com>",
  to: "anyone@example.com",
  subject: "Test",
  html: "<p>hi</p>",
  text: "hi",
};

describe("sendAuthEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    // Local-dev branch: routing is governed by ALLOW_MAILPIT (off by default here).
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_MAILPIT", "");
    // Clear optional overrides so hardcoded defaults are used.
    vi.stubEnv("MAILPIT_UI_BASE", "");
    vi.stubEnv("MAILPIT_UI_USER", "");
    vi.stubEnv("MAILPIT_UI_PASS", "");
    vi.stubEnv("MAILPIT_SMTP_HOST", "");
    vi.stubEnv("MAILPIT_SMTP_PORT", "");
    vi.stubEnv("MAILPIT_SMTP_USER", "");
    vi.stubEnv("MAILPIT_SMTP_PASS", "");
    sendMail.mockResolvedValue({ messageId: "<mailpit-1>" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ID: "http-msg-1" }),
    });
    getResendClient.mockReturnValue({ emails: { send: resendSend } });
    resendSend.mockResolvedValue({ data: { id: "re_1" }, error: null });
  });

  it("uses hardcoded Mailpit defaults without env vars", () => {
    expect(getMailpitUiBase()).toBe("http://3.8.185.28/mailpit.local");
  });

  it("routes to Mailpit HTTP when ALLOW_MAILPIT is true", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "true");

    await expect(sendAuthEmail(message)).resolves.toEqual({
      ok: true,
      id: "http-msg-1",
      via: "mailpit",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://3.8.185.28/mailpit.local/api/v1/send",
      expect.objectContaining({ method: "POST" }),
    );
    expect(sendMail).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("falls back to SMTP when Mailpit HTTP fails", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "true");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ Error: "boom" }),
    });

    await expect(sendAuthEmail(message)).resolves.toEqual({
      ok: true,
      id: "<mailpit-1>",
      via: "mailpit",
    });
    expect(sendMail).toHaveBeenCalled();
  });

  it("routes to Resend when ALLOW_MAILPIT is unset", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "");

    await expect(sendAuthEmail(message)).resolves.toEqual({
      ok: true,
      id: "re_1",
      via: "resend",
    });
    expect(resendSend).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("reports Mailpit as always configured when ALLOW_MAILPIT is true", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "true");
    await expect(isAuthEmailConfigured()).resolves.toBe(true);

    vi.stubEnv("ALLOW_MAILPIT", "");
    getResendClient.mockReturnValue(null);
    await expect(isAuthEmailConfigured()).resolves.toBe(false);
  });
});

describe("sendOutboundEmail — business email (ticket confirmations, etc.)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_MAILPIT", "");
    vi.stubEnv("MAILPIT_UI_BASE", "");
    vi.stubEnv("MAILPIT_UI_USER", "");
    vi.stubEnv("MAILPIT_UI_PASS", "");
    vi.stubEnv("MAILPIT_SMTP_HOST", "");
    vi.stubEnv("MAILPIT_SMTP_PORT", "");
    vi.stubEnv("MAILPIT_SMTP_USER", "");
    vi.stubEnv("MAILPIT_SMTP_PASS", "");
    sendMail.mockResolvedValue({ messageId: "<mailpit-1>" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ID: "http-msg-1" }) });
    getResendClient.mockReturnValue({ emails: { send: resendSend } });
    resendSend.mockResolvedValue({ data: { id: "re_1" }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("diverts to Mailpit in local dev when ALLOW_MAILPIT is true, without reading platform settings", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "true");

    await expect(sendOutboundEmail(message)).resolves.toEqual({
      ok: true,
      id: "http-msg-1",
      via: "mailpit",
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
    // In local dev the shared DB flag must not be consulted.
    expect(getPlatformSettings).not.toHaveBeenCalled();
  });

  it("treats ALLOW_MAILPIT case-insensitively", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "TRUE");

    await expect(sendOutboundEmail(message)).resolves.toMatchObject({ via: "mailpit" });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sends via Resend in local dev when ALLOW_MAILPIT is unset (ignores platform devMode)", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "");
    getPlatformSettings.mockResolvedValue({ devMode: true });

    await expect(sendOutboundEmail(message)).resolves.toEqual({
      ok: true,
      id: "re_1",
      via: "resend",
    });
    expect(resendSend).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(getPlatformSettings).not.toHaveBeenCalled();
  });

  it("diverts to Mailpit in a deployed env when platform devMode is on (ignores ALLOW_MAILPIT)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MAILPIT", "");
    getPlatformSettings.mockResolvedValue({ devMode: true });

    await expect(sendOutboundEmail(message)).resolves.toMatchObject({ via: "mailpit" });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sends via Resend in a deployed env when platform devMode is off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    getPlatformSettings.mockResolvedValue({ devMode: false });

    await expect(sendOutboundEmail(message)).resolves.toEqual({
      ok: true,
      id: "re_1",
      via: "resend",
    });
    expect(resendSend).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("routes attachment-bearing mail through SMTP, not the HTTP API", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "true");

    await expect(
      sendOutboundEmail({ ...message, attachments: [{ content: "abc", filename: "a.txt" }] }),
    ).resolves.toMatchObject({ via: "mailpit", id: "<mailpit-1>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [{ content: "abc", filename: "a.txt" }] }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards custom headers (email threading) to Mailpit", async () => {
    vi.stubEnv("ALLOW_MAILPIT", "true");

    await sendOutboundEmail({ ...message, headers: { "In-Reply-To": "<abc@x>" } });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.Headers).toEqual({ "In-Reply-To": "<abc@x>" });
  });
});
