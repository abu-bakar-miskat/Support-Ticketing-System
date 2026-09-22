import { describe, expect, it } from "vitest"
import { getFilteredNav } from "./settings-nav"

const hrefs = (
  role: string,
  hasActiveDept: boolean,
  isDepartmentAdmin = false,
) =>
  getFilteredNav(role, {}, false, false, "ALL", hasActiveDept, undefined, isDepartmentAdmin)
    .flatMap((group) => group.items)
    .map((item) => item.href)

describe("template marketplace nav", () => {
  it("shows the marketplace to a tenant admin in and out of a department", () => {
    expect(hrefs("admin", false)).toContain("/settings/templates-catalogue")
    expect(hrefs("admin", true)).toContain("/settings/templates-catalogue")
  })

  it("hides the marketplace from department heads", () => {
    expect(hrefs("manager", true, true)).not.toContain("/settings/templates-catalogue")
  })

  it("shows Support template configuration to a department head inside their department", () => {
    expect(hrefs("manager", true, true)).toContain("/settings/support-template")
  })

  it("hides Support template configuration from a plain manager", () => {
    expect(hrefs("manager", true, false)).not.toContain("/settings/support-template")
  })
})
