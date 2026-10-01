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

describe("features marketplace nav", () => {
  it("shows the features marketplace to a tenant admin or manager inside a department", () => {
    expect(hrefs("admin", true)).toContain("/settings/features")
    expect(hrefs("manager", true)).toContain("/settings/features")
    expect(hrefs("admin", true)).not.toContain("/settings/templates-catalogue")
  })

  it("hides it outside a department and from staff", () => {
    expect(hrefs("admin", false)).not.toContain("/settings/features")
    expect(hrefs("agent", true)).not.toContain("/settings/features")
  })
})
