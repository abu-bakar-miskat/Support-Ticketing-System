import { describe, it, expect } from "vitest"
import { LogIn, LogOut } from "lucide-react"
import { adminActionMeta, humanizeAction } from "./admin-action-meta"

describe("admin action meta — session events", () => {
  it("humanizes login/logout into readable phrases", () => {
    expect(humanizeAction("USER_LOGGED_IN")).toBe("logged in")
    expect(humanizeAction("USER_LOGGED_OUT")).toBe("logged out")
  })

  it("gives login/logout dedicated icons", () => {
    expect(adminActionMeta("USER_LOGGED_IN").icon).toBe(LogIn)
    expect(adminActionMeta("USER_LOGGED_OUT").icon).toBe(LogOut)
  })

  it("still humanizes standard TARGET_VERB actions", () => {
    expect(humanizeAction("FEATURE_FLAG_DISABLED")).toBe("disabled feature flag")
    expect(humanizeAction("SLA_POLICY_CREATED")).toBe("created SLA policy")
  })
})
