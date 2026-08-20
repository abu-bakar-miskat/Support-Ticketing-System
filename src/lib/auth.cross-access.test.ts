import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { checkIsCrossAccessDept, getNativeDepartmentIds } from "@/lib/auth";
import type { AuthProfile } from "@/lib/auth";

function profile(partial: Partial<AuthProfile>): AuthProfile {
  return partial as AuthProfile;
}

describe("checkIsCrossAccessDept", () => {
  it("treats full-access grants as cross-access when not a native member", () => {
    const user = profile({
      role: "manager",
      managedDepartmentIds: [],
      grantedAccessDeptIds: ["dept-sw"],
      fullAccessGrantedDeptIds: ["dept-sw"],
      directMemberDeptIds: ["dept-web"],
      memberships: [
        { subDepartment: { id: "t1", name: "T1", prefix: "T1", department: { id: "dept-web", name: "Web Development" } } },
      ] as AuthProfile["memberships"],
    });

    expect(checkIsCrossAccessDept(user, "dept-sw")).toBe(true);
    expect(checkIsCrossAccessDept(user, "dept-web")).toBe(false);
    expect(getNativeDepartmentIds(user).has("dept-sw")).toBe(false);
  });

  it("does not treat granted native departments as cross-access", () => {
    const user = profile({
      role: "agent",
      grantedAccessDeptIds: ["dept-web"],
      memberships: [
        { subDepartment: { id: "t1", name: "T1", prefix: "T1", department: { id: "dept-web", name: "Web Development" } } },
      ] as AuthProfile["memberships"],
    });

    expect(checkIsCrossAccessDept(user, "dept-web")).toBe(false);
  });
});
