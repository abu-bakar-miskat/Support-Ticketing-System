import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  subDepartment: { findUnique: vi.fn() }, ticket: { updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { resolveMiscProjectForSubDepartment, reconcileMiscProjectTickets } from "./misc-project";

beforeEach(() => {
  vi.resetAllMocks();
  db.project.findUnique.mockResolvedValue({ id: "misc" });
});
describe("Miscellaneous project resolution", () => {
  it("uses the existing project without writes or legacy scans", async () => {
    expect(await resolveMiscProjectForSubDepartment("sub-1")).toBe("misc");
    expect(db.project.upsert).not.toHaveBeenCalled();
    expect(db.project.findMany).not.toHaveBeenCalled();
    expect(db.ticket.updateMany).not.toHaveBeenCalled();
    expect(db.subDepartment.findUnique).not.toHaveBeenCalled();
  });
  it("creates the canonical project on first use without legacy cleanup", async () => {
    db.project.findUnique.mockResolvedValue(null);
    db.subDepartment.findUnique.mockResolvedValue({ departmentId: "dept", tenantId: "tenant" });
    db.project.upsert.mockResolvedValue({ id: "new-misc" });
    expect(await resolveMiscProjectForSubDepartment("sub-1")).toBe("new-misc");
    expect(db.project.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: "miscellaneous-sub-1" }, update: {},
      create: expect.objectContaining({ tenantId: "tenant", subDepartmentId: "sub-1" }),
    }));
    expect(db.ticket.updateMany).not.toHaveBeenCalled();
  });
  it("only moves legacy tickets when maintenance is explicitly invoked", async () => {
    db.project.findMany.mockResolvedValue([{ id: "legacy" }]);
    await reconcileMiscProjectTickets("sub-1");
    expect(db.ticket.updateMany).toHaveBeenCalledWith({
      where: { projectId: { in: ["legacy"] } }, data: { projectId: "misc" },
    });
  });
});
