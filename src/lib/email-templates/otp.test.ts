import { describe, expect, it } from "vitest";
import { renderOtpEmail } from "./otp";

describe("renderOtpEmail", () => {
  it("uses the built-in default when no override is given", () => {
    const mail = renderOtpEmail("123456", "Acme Support");
    expect(mail.subject).toBe("Your Acme Support sign-in code");
    expect(mail.html).toContain("123456");
    expect(mail.html).not.toContain("{{code}}");
    expect(mail.text).toContain("123456");
  });

  it("uses default when override is null", () => {
    const mail = renderOtpEmail("123456", "Acme Support", null);
    expect(mail.subject).toBe("Your Acme Support sign-in code");
  });

  it("shows the platform name in the subject, HTML header, and text", () => {
    const mail = renderOtpEmail("123456", "Acme Support");
    expect(mail.subject).toContain("Acme Support");
    expect(mail.html).toContain("Acme Support");
    expect(mail.html).not.toContain("{{platformName}}");
    expect(mail.text).toContain("Acme Support");
  });

  it("falls back to a default name when platformName is blank", () => {
    const mail = renderOtpEmail("123456", "   ");
    expect(mail.subject).toBe("Your Global Support Portal sign-in code");
    expect(mail.text).toContain("Global Support Portal");
  });

  it("HTML-escapes the platform name in the HTML body", () => {
    const mail = renderOtpEmail("123456", "<Acme>");
    expect(mail.html).toContain("&lt;Acme&gt;");
    expect(mail.html).not.toContain("<Acme>");
    // subject is used as a mail header, not HTML — kept raw there
    expect(mail.subject).toBe("Your <Acme> sign-in code");
  });

  it("applies an override's subject and body", () => {
    const mail = renderOtpEmail("999000", "Acme Support", {
      subject: "Your login code",
      bodyHtml: "<p>Code: {{code}}</p>",
    });
    expect(mail.subject).toBe("Your login code");
    expect(mail.html).toBe("<p>Code: 999000</p>");
  });

  it("HTML-escapes the code in the HTML body but keeps it raw in text", () => {
    const mail = renderOtpEmail("<b>", "Acme Support", { subject: "s", bodyHtml: "{{code}}" });
    expect(mail.html).toBe("&lt;b&gt;");
    expect(mail.text).toContain("<b>");
  });

  it("falls back to default fields when override fields are blank", () => {
    const mail = renderOtpEmail("123456", "Acme Support", { subject: "   ", bodyHtml: "" });
    expect(mail.subject).toBe("Your Acme Support sign-in code");
    expect(mail.html).toContain("123456");
  });
});
