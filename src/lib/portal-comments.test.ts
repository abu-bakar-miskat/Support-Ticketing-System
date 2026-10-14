import { describe, expect, it } from "vitest"
import { PORTAL_COMMENT_VISIBILITY, presentPortalComment } from "./portal-comments"

describe("presentPortalComment", () => {
  it("uses the visibility contract expected by requester portals", () => {
    expect(PORTAL_COMMENT_VISIBILITY).toBe("public")
  })

  it("shows the requester name and strips the internal portal marker", () => {
    expect(presentPortalComment({
      body: "[Portal — Abdur Rahim]\nPlease help me",
      authorId: "integration-owner",
      apiKeyCreatedById: "integration-owner",
      submitterName: "Abdur Rahim",
    })).toEqual({
      isPortalRequester: true,
      body: "Please help me",
      authorName: "Abdur Rahim",
      visibility: "public",
    })
  })

  it("does not let an ordinary staff comment spoof a requester", () => {
    expect(presentPortalComment({
      body: "[Portal — Abdur Rahim]\nSpoofed comment",
      authorId: "staff-user",
      apiKeyCreatedById: "integration-owner",
      submitterName: "Abdur Rahim",
    })).toEqual({
      isPortalRequester: false,
      body: "[Portal — Abdur Rahim]\nSpoofed comment",
      authorName: null,
      visibility: "public",
    })
  })

  it("does not relabel a marker with a different requester name", () => {
    expect(presentPortalComment({
      body: "[Portal — Someone Else]\nComment",
      authorId: "integration-owner",
      apiKeyCreatedById: "integration-owner",
      submitterName: "Abdur Rahim",
    }).isPortalRequester).toBe(false)
  })
})
