import { describe, expect, it } from "vitest";
import {
  ensureAbsoluteUrl,
  normalizeTemplateBodyHtml,
  button,
  escapeHtml,
  summaryTable,
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
});
