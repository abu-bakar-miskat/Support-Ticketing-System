import { describe, it, expect, vi } from "vitest";
import {
  planTicketOperation,
  mergeTenantWhere,
  mergeScopeWhere,
  subDepartmentAllowlist,
  rowInScope,
  rowSubDepartmentAllowed,
  scopeFromRequestScope,
  resolveTicketScope,
  withTenantScope,
  TENANT_SCOPED_MODELS,
  type TicketScope,
} from "./prisma-scope";
import { runWithScope, runAsSystem, withSystemScope } from "./request-scope";

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

/** Capture the extension object a client would register via `$extends`. */
function registerScope() {
  let registered: { query: Record<string, { $allOperations: (p: unknown) => Promise<unknown> }> } | undefined;
  const stub = {
    $extends(ext: typeof registered) {
      registered = ext;
      return stub;
    },
  };
  withTenantScope(stub as never);
  if (!registered) throw new Error("extension not registered");
  return registered;
}

describe("withTenantScope — model coverage", () => {
  it("registers a scope handler for every tenant-scoped model", () => {
    const registered = registerScope();
    expect(Object.keys(registered.query).sort()).toEqual([...TENANT_SCOPED_MODELS].sort());
  });

  it("defaults to ticket/project/team/department", () => {
    expect([...TENANT_SCOPED_MODELS].sort()).toEqual(
      ["department", "project", "team", "ticket"],
    );
  });

  it("injects the tenant predicate into a non-ticket list read (project)", async () => {
    const registered = registerScope();
    const calls: { where?: unknown }[] = [];
    const run = (args: { where?: unknown }) => {
      calls.push(args);
      return Promise.resolve([]);
    };
    await runWithScope({ tenantIds: ["tenant-A"] }, () =>
      registered.query.project.$allOperations({ operation: "findMany", args: {}, query: run } as never),
    );
    expect(calls[0].where).toEqual({ tenantId: { in: ["tenant-A"] } });
  });

  it("post-filters a non-ticket unique read cross-tenant → null (department)", async () => {
    const registered = registerScope();
    const run = () => Promise.resolve({ id: "d1", tenantId: "tenant-B" });
    const res = await runWithScope({ tenantIds: ["tenant-A"] }, () =>
      registered.query.department.$allOperations({ operation: "findUnique", args: {}, query: run } as never),
    );
    expect(res).toBeNull();
  });

  it("keeps a same-tenant non-ticket unique read (team)", async () => {
    const registered = registerScope();
    const row = { id: "t1", tenantId: "tenant-A" };
    const res = await runWithScope({ tenantIds: ["tenant-A"] }, () =>
      registered.query.team.$allOperations({ operation: "findUnique", args: {}, query: () => Promise.resolve(row) } as never),
    );
    expect(res).toEqual(row);
  });
});

describe("withSystemScope — anonymous/background route wrapper", () => {
  it("runs the wrapped handler under system scope", async () => {
    const wrapped = withSystemScope(() => resolveTicketScope());
    await expect(wrapped()).resolves.toEqual({ kind: "system" });
  });

  it("forwards arguments and return value", async () => {
    const wrapped = withSystemScope((a: number, b: number) => Promise.resolve(a + b));
    await expect(wrapped(2, 3)).resolves.toBe(5);
  });
});

const tenantWithSub: TicketScope = {
  kind: "tenant",
  tenantIds: ["tenant-A"],
  subDepartmentTeamIds: ["teamA"],
};

describe("subDepartmentAllowlist", () => {
  it("returns the allowlist only for the Ticket model under a tenant scope", () => {
    expect(subDepartmentAllowlist("Ticket", tenantWithSub)).toEqual(["teamA"]);
    expect(subDepartmentAllowlist("Project", tenantWithSub)).toBeNull();
    expect(subDepartmentAllowlist("Department", tenantWithSub)).toBeNull();
  });
  it("is null when the tenant scope carries no sub-department restriction", () => {
    expect(subDepartmentAllowlist("Ticket", tenantA)).toBeNull();
  });
  it("is null for system and platform scopes", () => {
    expect(subDepartmentAllowlist("Ticket", { kind: "system" })).toBeNull();
    expect(subDepartmentAllowlist("Ticket", { kind: "platform" })).toBeNull();
  });
});

describe("mergeScopeWhere — SD-06 sub-department predicate", () => {
  it("adds only the tenant predicate when the allowlist is null", () => {
    expect(mergeScopeWhere(undefined, ["tenant-A"], null)).toEqual({ tenantId: { in: ["tenant-A"] } });
  });
  it("ANDs tenant + sub-department predicates when an allowlist is present", () => {
    expect(mergeScopeWhere(undefined, ["tenant-A"], ["teamA"])).toEqual({
      AND: [{ tenantId: { in: ["tenant-A"] } }, { teamId: { in: ["teamA"] } }],
    });
  });
  it("preserves a caller-supplied where alongside both predicates", () => {
    expect(mergeScopeWhere({ status: "open" }, ["tenant-A"], ["teamA"])).toEqual({
      AND: [{ status: "open" }, { tenantId: { in: ["tenant-A"] } }, { teamId: { in: ["teamA"] } }],
    });
  });
});

describe("rowSubDepartmentAllowed", () => {
  it("passes any row when the allowlist is null", () => {
    expect(rowSubDepartmentAllowed({ teamId: "teamB" }, null)).toBe(true);
  });
  it("keeps a row whose team is in the allowlist", () => {
    expect(rowSubDepartmentAllowed({ teamId: "teamA" }, ["teamA"])).toBe(true);
  });
  it("drops a row from another sub-department (→ null → 404)", () => {
    expect(rowSubDepartmentAllowed({ teamId: "teamB" }, ["teamA"])).toBe(false);
  });
  it("drops a null or team-less row under a restriction", () => {
    expect(rowSubDepartmentAllowed(null, ["teamA"])).toBe(false);
    expect(rowSubDepartmentAllowed({ teamId: null }, ["teamA"])).toBe(false);
  });
});

describe("scopeFromRequestScope — carries sub-department restriction", () => {
  it("propagates subDepartmentTeamIds into a tenant scope", () => {
    expect(
      scopeFromRequestScope({ tenantIds: ["tenant-A"], subDepartmentTeamIds: ["teamA"] }),
    ).toEqual({ kind: "tenant", tenantIds: ["tenant-A"], subDepartmentTeamIds: ["teamA"] });
  });
  it("omits it when absent", () => {
    expect(scopeFromRequestScope({ tenantIds: ["tenant-A"] })).toEqual({
      kind: "tenant",
      tenantIds: ["tenant-A"],
    });
  });
});

describe("extension — SD-06 enforcement end to end", () => {
  it("injects tenant + sub-department predicates into a ticket findMany", async () => {
    const registered = registerScope();
    const calls: { where?: unknown }[] = [];
    const run = (args: { where?: unknown }) => {
      calls.push(args);
      return Promise.resolve([]);
    };
    await runWithScope({ tenantIds: ["tenant-A"], subDepartmentTeamIds: ["teamA"] }, () =>
      registered.query.ticket.$allOperations({ operation: "findMany", args: {}, query: run } as never),
    );
    expect(calls[0].where).toEqual({
      AND: [{ tenantId: { in: ["tenant-A"] } }, { teamId: { in: ["teamA"] } }],
    });
  });

  it("does NOT sub-department-filter non-ticket models", async () => {
    const registered = registerScope();
    const calls: { where?: unknown }[] = [];
    const run = (args: { where?: unknown }) => {
      calls.push(args);
      return Promise.resolve([]);
    };
    await runWithScope({ tenantIds: ["tenant-A"], subDepartmentTeamIds: ["teamA"] }, () =>
      registered.query.project.$allOperations({ operation: "findMany", args: {}, query: run } as never),
    );
    expect(calls[0].where).toEqual({ tenantId: { in: ["tenant-A"] } });
  });

  it("post-filters a ticket findUnique out of the caller's sub-department → null (negative)", async () => {
    const registered = registerScope();
    const run = () => Promise.resolve({ id: "t1", tenantId: "tenant-A", teamId: "teamB" });
    const res = await runWithScope({ tenantIds: ["tenant-A"], subDepartmentTeamIds: ["teamA"] }, () =>
      registered.query.ticket.$allOperations({ operation: "findUnique", args: {}, query: run } as never),
    );
    expect(res).toBeNull();
  });

  it("keeps a ticket findUnique inside the caller's sub-department", async () => {
    const registered = registerScope();
    const row = { id: "t1", tenantId: "tenant-A", teamId: "teamA" };
    const res = await runWithScope({ tenantIds: ["tenant-A"], subDepartmentTeamIds: ["teamA"] }, () =>
      registered.query.ticket.$allOperations({ operation: "findUnique", args: {}, query: () => Promise.resolve(row) } as never),
    );
    expect(res).toEqual(row);
  });
})
