import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { selectBestManagedDomain, type ManagedDomain } from "./resend-domains"

const domain = (overrides: Partial<ManagedDomain>): ManagedDomain => ({
  id: "domain-1",
  name: "mail.example.com",
  status: "not_started",
  region: "us-east-1",
  capabilities: { sending: "enabled", receiving: "disabled" },
  createdAt: null,
  records: [],
  ...overrides,
})

describe("selectBestManagedDomain", () => {
  it("prefers a receiving-enabled regional domain over a sending-only duplicate", () => {
    const selected = selectBestManagedDomain([
      domain({ id: "duplicate", status: "verified" }),
      domain({
        id: "inbound",
        status: "partially_verified",
        region: "eu-west-1",
        capabilities: { sending: "enabled", receiving: "enabled" },
      }),
    ], "MAIL.EXAMPLE.COM")

    expect(selected?.id).toBe("inbound")
  })

  it("returns undefined when the domain is not registered", () => {
    expect(selectBestManagedDomain([domain({})], "other.example.com")).toBeUndefined()
  })
})
