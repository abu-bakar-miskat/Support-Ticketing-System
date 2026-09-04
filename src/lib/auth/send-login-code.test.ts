import { beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.fn();
const send = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));
vi.mock("@/lib/resend-client", () => ({
  getResendClient: () => ({ emails: { send } }),
}));

import { sendLoginCode } from "./send-login-code";

describe("sendLoginCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "PEN Support <login@example.com>");
    generateLink.mockResolvedValue({
      data: { properties: { email_otp: "12345678", verification_type: "magiclink" } },
      error: null,
    });
    send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("sends only the numeric OTP and never includes a magic link", async () => {
    const result = await sendLoginCode("new.member@example.com");

    expect(result).toEqual({ error: null, verificationType: "magiclink" });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "new.member@example.com",
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new.member@example.com",
        from: "PEN Support <login@example.com>",
        text: expect.stringContaining("12345678"),
      }),
    );
    const message = send.mock.calls[0][0];
    expect(message.html).toContain("12345678");
    expect(message.html).not.toContain("ConfirmationURL");
    expect(message.html).not.toContain("href=");
  });

  it("does not send when Supabase cannot mint a code", async () => {
    generateLink.mockResolvedValue({
      data: { properties: {} },
      error: { message: "Invalid email" },
    });

    await expect(sendLoginCode("invalid@example.com")).resolves.toEqual({
      error: "Invalid email",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a rejected email delivery", async () => {
    send.mockResolvedValue({ data: null, error: { message: "Domain rejected" } });

    await expect(sendLoginCode("rejected@example.com")).resolves.toEqual({
      error: "Domain rejected",
    });
  });
});
