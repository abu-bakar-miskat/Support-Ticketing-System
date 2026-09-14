import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => {
  const departmentInvite = { findMany: vi.fn(), update: vi.fn() };
  const tenantInvite = { findMany: vi.fn(), update: vi.fn() };
  return { prisma: { departmentInvite, tenantInvite } };
});
vi.mock("@/lib/email", () => ({
  sendInviteEmail: vi.fn(),
  sendTenantInviteEmail: vi.fn(),
}));

import { sweepInviteReminders } from "./reminders";
import { INVITE_REMINDER_AFTER_MS } from "./constants";
import { prisma } from "@/lib/db";
import { sendInviteEmail, sendTenantInviteEmail } from "@/lib/email";

const deptFind = vi.mocked(prisma.departmentInvite.findMany);
const deptUpdate = vi.mocked(prisma.departmentInvite.update);
const tenantFind = vi.mocked(prisma.tenantInvite.findMany);
const tenantUpdate = vi.mocked(prisma.tenantInvite.update);
const mockSendDept = vi.mocked(sendInviteEmail);
const mockSendTenant = vi.mocked(sendTenantInviteEmail);

const NOW = new Date("2026-09-14T12:00:00Z");
const EXPIRES = new Date("2026-09-16T12:00:00Z");

function deptInvite(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    email: "a@x.com",
    departmentId: "dept1",
    role: "agent",
    message: null,
    token: "dtok",
    expiresAt: EXPIRES,
    department: { id: "dept1", name: "Engineering" },
    subDepartment: { name: "Platform" },
    inviter: { id: "u1", name: "Alex" },
    ...over,
  };
}

function tenantInvite(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    email: "b@x.com",
    tenantId: "ten1",
    role: "admin",
    message: null,
    token: "ttok",
    departmentIds: [],
    expiresAt: EXPIRES,
    tenant: { name: "Acme" },
    inviter: { id: "u2", name: "Sam" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deptFind.mockResolvedValue([] as never);
  tenantFind.mockResolvedValue([] as never);
});

describe("sweepInviteReminders", () => {
  it("only queries invites that are unaccepted, unrevoked, unreminded, aged 24h, and unexpired", async () => {
    await sweepInviteReminders(NOW);
    const where = deptFind.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.acceptedAt).toBeNull();
    expect(where.revokedAt).toBeNull();
    expect(where.reminderSentAt).toBeNull();
    expect(where.expiresAt).toEqual({ gt: NOW });
    expect(where.createdAt).toEqual({
      lte: new Date(NOW.getTime() - INVITE_REMINDER_AFTER_MS),
    });
    // Both invite types use the same eligibility gate.
    expect(tenantFind.mock.calls[0][0]!.where).toEqual(where);
  });

  it("sends a reminder and stamps reminderSentAt for each eligible invite", async () => {
    deptFind.mockResolvedValue([deptInvite()] as never);
    tenantFind.mockResolvedValue([tenantInvite({ departmentIds: ["dept9"] })] as never);

    const sent = await sweepInviteReminders(NOW);

    expect(sent).toBe(2);
    expect(mockSendDept).toHaveBeenCalledWith(
      expect.objectContaining({ isReminder: true, expiresAt: EXPIRES, inviteToken: "dtok" }),
    );
    expect(mockSendTenant).toHaveBeenCalledWith(
      expect.objectContaining({ isReminder: true, expiresAt: EXPIRES, departmentId: "dept9" }),
    );
    expect(deptUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { reminderSentAt: NOW } });
    expect(tenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { reminderSentAt: NOW } });
  });

  it("does not stamp (leaves eligible for retry) when the email send fails, and isolates the failure", async () => {
    deptFind.mockResolvedValue([deptInvite({ id: "d1" }), deptInvite({ id: "d2" })] as never);
    mockSendDept.mockRejectedValueOnce(new Error("smtp down"));

    const sent = await sweepInviteReminders(NOW);

    // First failed → not stamped; second still processed.
    expect(sent).toBe(1);
    expect(deptUpdate).toHaveBeenCalledTimes(1);
    expect(deptUpdate).toHaveBeenCalledWith({ where: { id: "d2" }, data: { reminderSentAt: NOW } });
  });
});
