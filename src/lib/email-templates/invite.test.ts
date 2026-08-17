import { describe, expect, it } from "vitest";
import { renderInvite } from "./invite";
import { safeNextPath } from "../auth-redirect";

describe("renderInvite", () => {
  it("includes department, team, role, message, and CTA", () => {
    const { subject, html, text } = renderInvite({
      inviteeEmail: "jamie@pengroup.com",
      inviterName: "Alex Rivera",
      departmentName: "Engineering",
      teamName: "Platform",
      role: "lead",
      message: "Welcome aboard",
      inviteToken: "abc123",
      signature: { html: "<div>Sig</div>", text: "Sig" },
    });

    expect(subject).toContain("Alex Rivera");
    expect(subject).toContain("Engineering");
    expect(html).toContain("Welcome aboard");
    expect(html).toContain("Platform");
    expect(html).toContain("Lead");
    expect(html).toContain("/invite/abc123");
    expect(html).toContain("Accept invitation");
    expect(text).toContain("Welcome aboard");
    expect(text).toContain("jamie@pengroup.com");
  });

  it("omits message block when message is empty", () => {
    const { html } = renderInvite({
      inviteeEmail: "jamie@pengroup.com",
      inviterName: "Alex",
      departmentName: "Ops",
      teamName: "Support",
      role: "staff",
      message: "   ",
      inviteToken: "tok",
    });
    expect(html).not.toContain("border-left:3px solid");
  });
});

describe("safeNextPath", () => {
  it("allows relative invite paths", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil")).toBe("/");
  });
});
