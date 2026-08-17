import { describe, it, expect } from "vitest"
import { repoFromGitHubUrl } from "./repo-from-url"

describe("repoFromGitHubUrl", () => {
  it("parses owner/name from PR, commit, and tree URLs", () => {
    expect(
      repoFromGitHubUrl(
        "https://github.com/PlanetEducationNetworks/PEN-WEBSITES-CMS/pull/52",
      ),
    ).toBe("PlanetEducationNetworks/PEN-WEBSITES-CMS")
    expect(
      repoFromGitHubUrl(
        "https://github.com/PlanetEducationNetworks/educateu-platform/commit/abc",
      ),
    ).toBe("PlanetEducationNetworks/educateu-platform")
    expect(
      repoFromGitHubUrl("https://github.com/org/repo"),
    ).toBe("org/repo")
  })

  it("returns null for empty or non-GitHub URLs", () => {
    expect(repoFromGitHubUrl(null)).toBeNull()
    expect(repoFromGitHubUrl(undefined)).toBeNull()
    expect(repoFromGitHubUrl("")).toBeNull()
    expect(repoFromGitHubUrl("https://gitlab.com/org/repo/pull/1")).toBeNull()
  })
})
