import { describe, expect, it } from "vitest";
import { OTP_DEFAULT, renderOtpEmail } from "./otp";

describe("renderOtpEmail", () => {
  it("uses the built-in default when no override is given", () => {
    const mail = renderOtpEmail("123456");
    expect(mail.subject).toBe(OTP_DEFAULT.subject);
    expect(mail.html).toContain("123456");
    expect(mail.html).not.toContain("{{code}}");
    expect(mail.text).toContain("123456");
  });

  it("uses default when override is null", () => {
    const mail = renderOtpEmail("123456", null);
    expect(mail.subject).toBe(OTP_DEFAULT.subject);
  });

  it("applies an override's subject and body", () => {
    const mail = renderOtpEmail("999000", {
      subject: "Your login code",
      bodyHtml: "<p>Code: {{code}}</p>",
    });
    expect(mail.subject).toBe("Your login code");
    expect(mail.html).toBe("<p>Code: 999000</p>");
  });

  it("HTML-escapes the code in the HTML body but keeps it raw in text", () => {
    const mail = renderOtpEmail("<b>", { subject: "s", bodyHtml: "{{code}}" });
    expect(mail.html).toBe("&lt;b&gt;");
    expect(mail.text).toContain("<b>");
  });

  it("falls back to default fields when override fields are blank", () => {
    const mail = renderOtpEmail("123456", { subject: "   ", bodyHtml: "" });
    expect(mail.subject).toBe(OTP_DEFAULT.subject);
    expect(mail.html).toContain("123456");
  });
});
