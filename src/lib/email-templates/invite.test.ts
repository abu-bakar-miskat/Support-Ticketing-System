import { describe, expect, it } from "vitest";
import { renderInvite } from "./invite";
import { formatInviteExpiry } from "../invites/constants";
import { safeNextPath, isGenericLandingPath } from "../auth-redirect";

const EXPIRES = new Date("2026-09-17T14:30:00Z");

describe("renderInvite", () => {
  it("includes department, subDepartment, role, message, CTA, and the expiry", () => {
    const { subject, html, text } = renderInvite({
      inviteeEmail: "jamie@pengroup.com",
      inviterName: "Alex Rivera",
      departmentName: "Engineering",
      subDepartmentName: "Platform",
      role: "sub_manager",
      message: "Welcome aboard",
      inviteToken: "abc123",
      expiresAt: EXPIRES,
      signature: { html: "<div>Sig</div>", text: "Sig" },
    });

    expect(subject).toContain("Alex Rivera");
    expect(subject).toContain("Engineering");
    expect(html).toContain("Welcome aboard");
    expect(html).toContain("Platform");
    expect(html).toContain("Sub-manager");
    expect(html).toContain("/invite/abc123");
    expect(html).toContain("Accept invitation");
    // Criterion: the exact expiry date/time is stated.
    expect(html).toContain("This invitation expires on");
    expect(html).toContain(formatInviteExpiry(EXPIRES));
    expect(text).toContain("This invitation expires on");
    expect(text).toContain(formatInviteExpiry(EXPIRES));
    expect(text).toContain("Welcome aboard");
    expect(text).toContain("jamie@pengroup.com");
  });

  it("uses a reminder subject/tone when isReminder is set", () => {
    const { subject, html } = renderInvite({
      inviteeEmail: "jamie@pengroup.com",
      inviterName: "Alex Rivera",
      departmentName: "Engineering",
      subDepartmentName: "Platform",
      role: "agent",
      inviteToken: "abc123",
      expiresAt: EXPIRES,
      isReminder: true,
    });
    expect(subject.toLowerCase()).toContain("reminder");
    expect(html).toContain("still waiting");
    expect(html).toContain("This invitation expires on");
  });

  it("omits message block when message is empty", () => {
    const { html } = renderInvite({
      inviteeEmail: "jamie@pengroup.com",
      inviterName: "Alex",
      departmentName: "Ops",
      subDepartmentName: "Support",
      role: "agent",
      message: "   ",
      inviteToken: "tok",
      expiresAt: EXPIRES,
    });
    expect(html).not.toContain("border-left:3px solid");
  });
});

describe("safeNextPath", () => {
  it("allows relative invite paths", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
  });

  it("strips query and hash from deep links", () => {
    expect(safeNextPath("/tenant-invite/abc?error=email_mismatch")).toBe("/tenant-invite/abc");
    expect(safeNextPath("/invite/abc#section")).toBe("/invite/abc");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil")).toBe("/");
  });
});

describe("isGenericLandingPath", () => {
  it("treats tenant/dept home as role-dispatch, not a deep link", () => {
    expect(isGenericLandingPath("/")).toBe(true);
    expect(isGenericLandingPath("/uchiha-clan")).toBe(true);
    expect(isGenericLandingPath("/uchiha-clan/tech-support")).toBe(true);
    expect(isGenericLandingPath("/api/user/preferences")).toBe(true);
    expect(isGenericLandingPath("/uchiha-clan/tech-support/manager")).toBe(false);
    expect(isGenericLandingPath("/uchiha-clan/tech-support/tasks")).toBe(false);
    expect(isGenericLandingPath("/invite/abc")).toBe(false);
    expect(isGenericLandingPath("/super-admin-invite/abc")).toBe(false);
  });
});
