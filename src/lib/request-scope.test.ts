import { describe, expect, it } from "vitest";
import {
  getRequestScope,
  runAsSystem,
  runWithScope,
} from "@/lib/request-scope";

function lazyScopeRead() {
  return {
    then<TResult1 = ReturnType<typeof getRequestScope>>(
      resolve: (value: ReturnType<typeof getRequestScope>) => TResult1,
    ) {
      return Promise.resolve(resolve(getRequestScope()));
    },
  };
}

describe("request scope", () => {
  it("consumes a lazy thenable inside system scope", async () => {
    const observed = await runAsSystem(() => lazyScopeRead());

    expect(observed).toEqual({ system: true, tenantIds: [] });
    expect(getRequestScope()).toBeNull();
  });

  it("consumes a lazy thenable inside an explicit tenant scope", async () => {
    const scope = { tenantIds: ["tenant-1"], subDepartmentTeamIds: ["sub-1"] };
    const observed = await runWithScope(scope, () => lazyScopeRead());

    expect(observed).toEqual(scope);
    expect(getRequestScope()).toBeNull();
  });
});
