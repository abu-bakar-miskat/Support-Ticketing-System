import { describe, it, expect, vi } from "vitest";
import {
  planTicketOperation,
  mergeTenantWhere,
  rowInScope,
  scopeFromRequestScope,
  resolveTicketScope,
  type TicketScope,
} from "./prisma-scope";
import { runWithScope, runAsSystem } from "./request-scope";

const tenantA: TicketScope = { kind: "tenant", tenantIds: ["tenant-A"] };

describe("planTicketOperation", () => {
  it("injects a tenant predicate into list reads", () => {
    for (const op of ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]) {
      expect(planTicketOperation(op, tenantA)).toEqual({ type: "inject" });
    }
  });

  it("post-filters unique reads", () => {
    expect(planTicketOperation("findUnique", tenantA)).toEqual({ type: "postfilter" });
    expect(planTicketOperation("findUniqueOrThrow", tenantA)).toEqual({ type: "postfilter" });
  });

  it("passes writes and creates through", () => {
    for (const op of ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"]) {
      expect(planTicketOperation(op, tenantA)).toEqual({ type: "passthrough" });
    }
  });

  it("passes everything through for platform and system scopes", () => {
    for (const op of ["findMany", "findUnique", "count"]) {
      expect(planTicketOperation(op, { kind: "platform" })).toEqual({ type: "passthrough" });
      expect(planTicketOperation(op, { kind: "system" })).toEqual({ type: "passthrough" });
    }
  });
});

describe("mergeTenantWhere — cross-tenant isolation", () => {
  it("adds the tenant predicate when there is no existing where", () => {
    expect(mergeTenantWhere(undefined, ["tenant-A"])).toEqual({ tenantId: { in: ["tenant-A"] } });
    expect(mergeTenantWhere({}, ["tenant-A"])).toEqual({ tenantId: { in: ["tenant-A"] } });
  });

  it("ANDs the tenant predicate alongside a caller-supplied where so it cannot be overridden", () => {
    const merged = mergeTenantWhere({ tenantId: "tenant-B" }, ["tenant-A"]);
    expect(merged).toEqual({
      AND: [{ tenantId: "tenant-B" }, { tenantId: { in: ["tenant-A"] } }],
    });
    // A caller pointing at tenant-B is now constrained by AND to tenant-A — the
    // conjunction is unsatisfiable, so no tenant-B row can return.
  });
});

describe("rowInScope — unique read post-filter", () => {
  it("keeps a row in the caller's tenant", () => {
    expect(rowInScope({ tenantId: "tenant-A" }, tenantA)).toBe(true);
  });

  it("drops a row from another tenant (→ null → 404)", () => {
    expect(rowInScope({ tenantId: "tenant-B" }, tenantA)).toBe(false);
  });

  it("drops a null or tenant-less row", () => {
    expect(rowInScope(null, tenantA)).toBe(false);
    expect(rowInScope({ tenantId: null }, tenantA)).toBe(false);
  });

  it("keeps any row for platform and system scopes", () => {
    expect(rowInScope({ tenantId: "tenant-B" }, { kind: "platform" })).toBe(true);
    expect(rowInScope({ tenantId: "tenant-B" }, { kind: "system" })).toBe(true);
  });
});

describe("scopeFromRequestScope — pure mapping", () => {
  it("maps a system scope", () => {
    expect(scopeFromRequestScope({ system: true, tenantIds: [] })).toEqual({ kind: "system" });
  });
  it("maps a platform scope for super-admins", () => {
    expect(scopeFromRequestScope({ isPlatformAdmin: true, tenantIds: [] })).toEqual({
      kind: "platform",
    });
  });
  it("maps a tenant scope", () => {
    expect(scopeFromRequestScope({ tenantIds: ["tenant-A"] })).toEqual({
      kind: "tenant",
      tenantIds: ["tenant-A"],
    });
  });
});

describe("resolveTicketScope — ambient resolution", () => {
  it("resolves a tenant scope from an ambient request store", async () => {
    const scope = await runWithScope({ tenantIds: ["tenant-A"] }, () => resolveTicketScope());
    expect(scope).toEqual({ kind: "tenant", tenantIds: ["tenant-A"] });
  });

  it("resolves a system scope under runAsSystem", async () => {
    const scope = await runAsSystem(() => resolveTicketScope());
    expect(scope).toEqual({ kind: "system" });
  });

  it("fails closed when there is no ambient scope and no authenticated caller", async () => {
    vi.doMock("@/lib/profile", () => ({ getProfile: vi.fn().mockResolvedValue(null) }));
    await expect(resolveTicketScope()).rejects.toThrow(/without a caller scope/);
    vi.doUnmock("@/lib/profile");
  });
});
