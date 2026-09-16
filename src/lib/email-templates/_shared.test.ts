import { describe, expect, it } from "vitest";
import {
  ensureAbsoluteUrl,
  normalizeTemplateBodyHtml,
  button,
  escapeHtml,
  summaryTable,
  applyPlaceholders,
  renderWithOverride,
  layout,
} from "./_shared";

describe("escapeHtml", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`A > B & C < "hi"`)).toBe(
      "A &gt; B &amp; C &lt; &quot;hi&quot;",
    );
  });

  it("does not double-encode already-escaped entities", () => {
    expect(escapeHtml("&gt; Configuration &gt; Roles")).toBe(
      "&gt; Configuration &gt; Roles",
    );
    expect(escapeHtml("&amp;gt; Configuration")).toBe("&gt; Configuration");
  });
});

describe("summaryTable", () => {
  it("renders titles with > correctly (no double escape)", () => {
    const html = summaryTable([
      { label: "Title", value: "> Configuration > User Roles Deletion" },
    ]);
    expect(html).toContain("&gt; Configuration &gt; User Roles Deletion");
    expect(html).not.toContain("&amp;gt;");
  });
});

describe("ensureAbsoluteUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(ensureAbsoluteUrl("ticketing-system.pengroup.com/tickets/abc")).toBe(
      "https://ticketing-system.pengroup.com/tickets/abc",
    );
  });

  it("leaves absolute urls unchanged", () => {
    expect(ensureAbsoluteUrl("https://example.com/tickets/abc")).toBe(
      "https://example.com/tickets/abc",
    );
  });
});

describe("normalizeTemplateBodyHtml", () => {
  it("converts legacy bracket view-ticket shorthand into a button", () => {
    const html = normalizeTemplateBodyHtml(
      `<p>[ticketing-system.pengroup.com/tickets/abc123]View ticket</p>`,
    );
    expect(html).toContain('href="https://ticketing-system.pengroup.com/tickets/abc123"');
    expect(html).toContain("View ticket</a>");
    expect(html).toContain("<table");
    expect(html).not.toContain("[ticketing-system");
  });

  it("converts bracket links for mention-style open-ticket labels", () => {
    const html = normalizeTemplateBodyHtml(
      `<p>[ticketing-system.pengroup.com/tickets/xyz]Open ticket</p>`,
    );
    expect(html).toContain('href="https://ticketing-system.pengroup.com/tickets/xyz"');
    expect(html).toContain("Open ticket</a>");
    expect(html).toContain("<table");
  });

  it("does not double-wrap urls already used in generated buttons", () => {
    const html = normalizeTemplateBodyHtml(
      button({
        href: "https://ticketing-system.pengroup.com/tickets/abc123",
        label: "View ticket",
      }),
    );
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(html).not.toContain("<a href=\"https://ticketing-system.pengroup.com/tickets/abc123\">https://");
  });

  it("leaves ticket titles with square brackets intact", () => {
    const title = "[Backend] &gt; Configuration &gt; User Roles Deletion + Dependency";
    const html = normalizeTemplateBodyHtml(
      `<td>${title}</td>`,
    );
    expect(html).toContain("[Backend] &gt; Configuration &gt; User Roles Deletion + Dependency");
    expect(html).not.toContain("<a href");
  });

  it("leaves bare [Label] prefixes without a URL unchanged", () => {
    const html = normalizeTemplateBodyHtml(
      `<p>[Backend] Fix the login flow</p>`,
    );
    expect(html).toContain("[Backend] Fix the login flow");
    expect(html).not.toContain("<a href");
  });

  it("colors body links with the accent (brandColor) so branding reaches the body", () => {
    const html = normalizeTemplateBodyHtml(
      `<p>[example.com/tickets/abc]my ticket</p>`,
      { brandColor: "#ff0000" },
    );
    expect(html).toContain("color:#ff0000");
  });

  it("lets an explicit linkColor override the accent for body links", () => {
    const html = normalizeTemplateBodyHtml(
      `<p>[example.com/tickets/abc]my ticket</p>`,
      { brandColor: "#ff0000", linkColor: "#00ff00" },
    );
    expect(html).toContain("color:#00ff00");
    expect(html).not.toContain("color:#ff0000");
  });
});

describe("layout — full branding reaches the email body", () => {
  it("applies bodyTextColor, accent link color, header title, and page background", () => {
    const html = layout({
      heading: "Hello",
      bodyHtml: `<p>See <a href="https://example.com/tickets/x">example.com/tickets/x</a></p>`,
      branding: {
        brandColor: "#123456",
        bodyTextColor: "#abcdef",
        headerTitle: "Acme Support",
        pageBackground: "#101010",
      },
    });
    // Header wordmark uses the custom title, page background is applied, body
    // text uses bodyTextColor, and bare body ticket links follow the accent.
    expect(html).toContain("background:#101010");
    expect(html).toContain("color:#abcdef");
    expect(html).toContain("color:#123456");
    // The header title itself is rendered in the accent color.
    expect(html).toContain('color:#123456;">Acme Support');
    // No accent strip on the header anymore.
    expect(html).not.toContain("border-top:4px");
  });

  it("shows the default footer when no branding footer is set", () => {
    const html = layout({ heading: "Hi", bodyHtml: "<p>x</p>" });
    expect(html).toContain("This is an automated message.");
  });

  it("omits the footer entirely when hideFooter is set", () => {
    const html = layout({ heading: "Hi", bodyHtml: "<p>x</p>", branding: { hideFooter: true } });
    expect(html).not.toContain("This is an automated message.");
  });

  it("still renders a template-specific footer even when hideFooter is set", () => {
    const html = layout({
      heading: "Hi",
      bodyHtml: "<p>x</p>",
      branding: { hideFooter: true },
      footerOverride: "Sales team footer",
    });
    expect(html).toContain("Sales team footer");
  });

  it("renders the default Need Help block with the default support email", () => {
    const html = layout({ heading: "Hi", bodyHtml: "<p>x</p>" });
    expect(html).toContain("Need Help?");
    expect(html).toContain("support@penglobalbd.com");
  });

  it("lets branding customize the Need Help heading, message, and email", () => {
    const html = layout({
      heading: "Hi",
      bodyHtml: "<p>x</p>",
      branding: {
        helpHeading: "Questions?",
        helpMessage: "Email our team at",
        supportEmail: "care@acme.com",
      },
    });
    expect(html).toContain("Questions?");
    expect(html).toContain("Email our team at");
    expect(html).toContain("care@acme.com");
    expect(html).not.toContain("Need Help?");
    expect(html).not.toContain("support@penglobalbd.com");
  });

  it("omits the Need Help block entirely when hideHelp is set", () => {
    const html = layout({ heading: "Hi", bodyHtml: "<p>x</p>", branding: { hideHelp: true } });
    expect(html).not.toContain("Need Help?");
    expect(html).not.toContain("support@penglobalbd.com");
  });

  it("shows the default confidentiality notice when the notice is enabled", () => {
    const html = layout({ heading: "Hi", bodyHtml: "<p>x</p>", showConfidentialityNotice: true });
    expect(html).toContain("This email and any attachments are confidential");
  });

  it("uses a custom confidentiality notice when branding sets one", () => {
    const html = layout({
      heading: "Hi",
      bodyHtml: "<p>x</p>",
      showConfidentialityNotice: true,
      branding: { confidentialityNotice: "Do not forward this message." },
    });
    expect(html).toContain("Do not forward this message.");
    expect(html).not.toContain("This email and any attachments are confidential");
  });

  it("omits the confidentiality notice when hideConfidentiality is set, even without a signature", () => {
    const html = layout({
      heading: "Hi",
      bodyHtml: "<p>x</p>",
      showConfidentialityNotice: true,
      branding: { hideConfidentiality: true },
    });
    expect(html).not.toContain("This email and any attachments are confidential");
  });
});

describe("applyPlaceholders — DS-04 unresolved tokens render empty", () => {
  it("substitutes a known token", () => {
    expect(applyPlaceholders("Hello {{name}}", { name: "Jane" })).toBe("Hello Jane");
  });

  it("renders an unresolved token as an empty string, never raw {{...}} text", () => {
    expect(applyPlaceholders("Hello {{unknownToken}}", { name: "Jane" })).toBe("Hello ");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(applyPlaceholders("Hi {{ name }}", { name: "Jane" })).toBe("Hi Jane");
  });

  it("handles a mix of known and unresolved tokens in one string", () => {
    expect(applyPlaceholders("{{greeting}} {{name}}, {{missing}}!", { greeting: "Hi", name: "Jane" })).toBe(
      "Hi Jane, !",
    );
  });
});

describe("renderWithOverride — DS-05/06 per-template footer", () => {
  const baseOverride = { subject: "Subj", heading: "Heading", bodyHtml: "<p>Body</p>" };

  it("uses the template's own footer when set", () => {
    const { html } = renderWithOverride({
      override: { ...baseOverride, footerText: "Custom footer for this template" },
      placeholders: {},
      fallbackSubject: "fallback",
      fallbackHeading: "fallback",
      branding: { footerText: "Department-wide footer" },
    });
    expect(html).toContain("Custom footer for this template");
    expect(html).not.toContain("Department-wide footer");
  });

  it("falls back to the branding (department/tenant/platform) footer when the template has none", () => {
    const { html } = renderWithOverride({
      override: baseOverride,
      placeholders: {},
      fallbackSubject: "fallback",
      fallbackHeading: "fallback",
      branding: { footerText: "Department-wide footer" },
    });
    expect(html).toContain("Department-wide footer");
  });

  it("substitutes placeholders inside the template's own footer too", () => {
    const { html } = renderWithOverride({
      override: { ...baseOverride, footerText: "Contact {{supportEmail}}" },
      placeholders: { supportEmail: "help@example.com" },
      fallbackSubject: "fallback",
      fallbackHeading: "fallback",
    });
    expect(html).toContain("Contact help@example.com")
  })
});

describe("layout — footerOverride precedence", () => {
  it("prefers footerOverride over branding.footerText", () => {
    const html = layout({
      heading: "H",
      bodyHtml: "<p>B</p>",
      branding: { footerText: "Branding footer" },
      footerOverride: "Override footer",
    });
    expect(html).toContain("Override footer");
    expect(html).not.toContain("Branding footer");
  });

  it("falls back to the platform default when neither is set", () => {
    const html = layout({ heading: "H", bodyHtml: "<p>B</p>" });
    expect(html).toContain("Support Ticketing System. This is an automated message.");
  });
});
