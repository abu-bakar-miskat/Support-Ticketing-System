import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    template: { findUnique: vi.fn() },
    department: { findUnique: vi.fn() },
    featureRequest: { findFirst: vi.fn(), create: vi.fn() },
    profile: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/template-catalogue", () => ({
  ensureAvailableFeatureTemplates: vi.fn(),
  getDepartmentActiveFeatureKeys: vi.fn(),
}));
vi.mock("@/lib/request-scope", () => ({
  runAsSystem: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/saved-features", () => ({
  listSavedFeatures: vi.fn(async () => []),
  ensureDefaultFeatureTemplates: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { getDepartmentActiveFeatureKeys } from "@/lib/template-catalogue";
import { requestDepartmentTemplate } from "./feature-marketplace";
import { getNotificationHref } from "./notification-routing";

const templateFind = vi.mocked(prisma.template.findUnique);
const departmentFind = vi.mocked(prisma.department.findUnique);
const requestFind = vi.mocked(prisma.featureRequest.findFirst);
const requestCreate = vi.mocked(prisma.featureRequest.create);
const profileFind = vi.mocked(prisma.profile.findMany);
const notify = vi.mocked(createNotification);
const activeKeys = vi.mocked(getDepartmentActiveFeatureKeys);

beforeEach(() => {
  vi.clearAllMocks();
  templateFind.mockResolvedValue({
    id: "tpl-timeline",
    name: "Timeline",
    slug: "timeline",
    isActive: true,
    features: [{ key: "timeline" }],
  } as never);
  departmentFind.mockResolvedValue({
    id: "dept-support",
    tenantId: "tenant-1",
    name: "Support",
    featureKeys: [],
    tenant: { name: "ESL" },
  } as never);
  activeKeys.mockResolvedValue(new Set());
  requestFind.mockResolvedValue(null);
  requestCreate.mockResolvedValue({ id: "req-1", status: "PENDING" } as never);
  profileFind.mockResolvedValue([{ id: "super-1" }, { id: "super-2" }] as never);
});

describe("requestDepartmentTemplate", () => {
  it("sends an approval notification to every active super admin", async () => {
    await requestDepartmentTemplate({
      tenantId: "tenant-1",
      departmentId: "dept-support",
      templateId: "tpl-timeline",
      requestedById: "tenant-admin",
    });

    expect(profileFind).toHaveBeenCalledWith({
      where: { isSuperAdmin: true, isActive: true },
      select: { id: true },
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith({
      recipientId: "super-1",
      actorId: "tenant-admin",
      type: "feature_request_submitted",
      message: "ESL requested approval to enable Timeline for Support.",
    });
    expect(notify).toHaveBeenCalledWith({
      recipientId: "super-2",
      actorId: "tenant-admin",
      type: "feature_request_submitted",
      message: "ESL requested approval to enable Timeline for Support.",
    });
  });
});

describe("feature approval notification link", () => {
  it("opens Feature approvals", () => {
    expect(
      getNotificationHref({
        type: "feature_request_submitted",
        ticketDbId: null,
        joinRequestId: null,
      }),
    ).toBe("/platform/feature-approvals");
  });
});
