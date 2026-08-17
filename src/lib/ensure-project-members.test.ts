import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    projectMember: { createMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { ensureProjectMembers } from "./ensure-project-members";

const mockCreateMany = vi.mocked(prisma.projectMember.createMany);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMany.mockResolvedValue({ count: 0 });
});

describe("ensureProjectMembers", () => {
  it("no-ops when projectId is missing", async () => {
    await ensureProjectMembers(null, ["u1"]);
    await ensureProjectMembers(undefined, ["u1"]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("no-ops when there are no user ids", async () => {
    await ensureProjectMembers("proj-1", [null, undefined, ""]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("dedupes and creates memberships with skipDuplicates", async () => {
    await ensureProjectMembers("proj-1", ["u1", "u2", "u1", null, ""]);
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { projectId: "proj-1", userId: "u1" },
        { projectId: "proj-1", userId: "u2" },
      ],
      skipDuplicates: true,
    });
  });
});
