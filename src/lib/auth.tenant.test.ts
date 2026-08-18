import { describe, it, expect } from "vitest"
import { canAccessTicket } from "./auth"
import type { AuthProfile } from "./auth"

function profile(overrides: Partial<AuthProfile> = {}): AuthProfile {
  return {
    id: "user-1",
    role: "staff",
    subDepartmentId: "team-1",
    subDepartmentIds: ["team-1"],
    activeTenantId: "tenant-A",
    isSuperAdmin: false,
    tenantIds: ["tenant-A"],
    managedDepartmentIds: [],
    fullAccessGrantedDeptIds: [],
    ...overrides,
  } as unknown as AuthProfile
}

const baseTicket = {
  subDepartmentId: "team-1",
  assigneeId: "user-1",
  creatorId: "user-1",
  deletedAt: null,
  tenantId: "tenant-A",
}

describe("canAccessTicket — tenant gate", () => {
  it("allows a same-tenant participant", () => {
    expect(canAccessTicket(profile(), baseTicket)).toBe(true)
  })

  it("rejects a cross-tenant ticket even for the creator/assignee", () => {
    expect(
      canAccessTicket(profile(), { ...baseTicket, tenantId: "tenant-B" }),
    ).toBe(false)
  })

  it("rejects a cross-tenant ticket for an admin", () => {
    expect(
      canAccessTicket(profile({ role: "admin" }), {
        ...baseTicket,
        assigneeId: null,
        creatorId: "someone-else",
        tenantId: "tenant-B",
      }),
    ).toBe(false)
  })

  it("gates super-admins by their active tenant too", () => {
    expect(
      canAccessTicket(
        profile({ role: "admin", isSuperAdmin: true }),
        { ...baseTicket, assigneeId: null, creatorId: "x", tenantId: "tenant-B" },
      ),
    ).toBe(false)
  })

  it("skips the gate when there is no active tenant context", () => {
    expect(
      canAccessTicket(profile({ activeTenantId: null }), {
        ...baseTicket,
        tenantId: "tenant-B",
      }),
    ).toBe(true)
  })

  it("skips the gate when the ticket carries no tenant (caller didn't select it)", () => {
    expect(
      canAccessTicket(profile(), { ...baseTicket, tenantId: undefined }),
    ).toBe(true)
  })
})
