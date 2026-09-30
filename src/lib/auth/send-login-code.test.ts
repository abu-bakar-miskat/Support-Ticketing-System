import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateLink, sendAuthEmail, isAuthEmailConfigured, getPlatformSettings } = vi.hoisted(() => ({
  generateLink: vi.fn(),
  sendAuthEmail: vi.fn(),
  isAuthEmailConfigured: vi.fn(),
  getPlatformSettings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));
vi.mock("@/lib/email-transport", () => ({
  sendAuthEmail,
  isAuthEmailConfigured,
}));
vi.mock("@/lib/platform-settings", () => ({
  getPlatformSettings,
}));

import { sendLoginCode } from "./send-login-code";

describe("sendLoginCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Global Support Portal <login@example.com>");
    isAuthEmailConfigured.mockResolvedValue(true);
    generateLink.mockResolvedValue({
      data: { properties: { email_otp: "12345678", verification_type: "magiclink" } },
      error: null,
    });
    sendAuthEmail.mockResolvedValue({ ok: true, id: "email-1", via: "resend" });
    getPlatformSettings.mockResolvedValue({ otpEmailTemplate: null, platformName: "Acme Support" });
  });

  it("sends only the numeric OTP and never includes a magic link", async () => {
    const result = await sendLoginCode("new.member@example.com");

    expect(result).toEqual({ error: null, verificationType: "magiclink" });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "new.member@example.com",
    });
    expect(sendAuthEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new.member@example.com",
        from: "Acme Support <login@example.com>",
        text: expect.stringContaining("12345678"),
      }),
    );
    const message = sendAuthEmail.mock.calls[0][0];
    expect(message.html).toContain("12345678");
    expect(message.subject).toContain("Acme Support");
    expect(message.html).toContain("Acme Support");
    expect(message.html).not.toContain("ConfirmationURL");
    expect(message.html).not.toContain("href=");
  });

  it("uses the super-admin OTP override when one is set", async () => {
    getPlatformSettings.mockResolvedValue({
      platformName: "Acme Support",
      otpEmailTemplate: {
        subject: "Custom sign-in subject",
        bodyHtml: "<p>Your code is {{code}}</p>",
      },
    });

    await sendLoginCode("override.user@example.com");

    const message = sendAuthEmail.mock.calls[0][0];
    expect(message.subject).toBe("Custom sign-in subject");
    expect(message.html).toBe("<p>Your code is 12345678</p>");
  });

  it("does not send when Supabase cannot mint a code", async () => {
    generateLink.mockResolvedValue({
      data: { properties: {} },
      error: { message: "Invalid email" },
    });

    await expect(sendLoginCode("invalid@example.com")).resolves.toEqual({
      error: "Invalid email",
    });
    expect(sendAuthEmail).not.toHaveBeenCalled();
  });

  it("reports a rejected email delivery", async () => {
    sendAuthEmail.mockResolvedValue({ ok: false, error: "Domain rejected" });

    await expect(sendLoginCode("rejected@example.com")).resolves.toEqual({
      error: "Domain rejected",
    });
  });
});
