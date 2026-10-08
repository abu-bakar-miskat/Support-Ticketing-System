import { describe, expect, it } from "vitest"
import {
  DEFAULT_ACCENT,
  contrastRatio,
  deriveAccentPalette,
  normalizeHex,
  tenantAccentCss,
} from "./tenant-accent"
import { sanitizeTenantBranding, resolveTenantBranding } from "./tenant-branding"

const DARK_SURFACE = "#0e0d0c"

describe("normalizeHex", () => {
  it("expands shorthand and lowercases", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc")
    expect(normalizeHex(" #1D4ED8 ")).toBe("#1d4ed8")
  })

  it("rejects non-hex input", () => {
    expect(normalizeHex("red")).toBeNull()
    expect(normalizeHex("#12345")).toBeNull()
    expect(normalizeHex("#fff;}body{")).toBeNull()
    expect(normalizeHex(42)).toBeNull()
  })
})

describe("deriveAccentPalette", () => {
  it("keeps the product default unchanged in both modes", () => {
    const p = deriveAccentPalette(DEFAULT_ACCENT)!
    expect(p.light.accent).toBe(DEFAULT_ACCENT)
    expect(p.dark.accent).toBe(DEFAULT_ACCENT)
    expect(p.light.fg).toBe("#ffffff")
  })

  it("darkens a pale brand color for light mode and uses dark ink on it", () => {
    const p = deriveAccentPalette("#facc15")! // yellow
    expect(p.adjustedLight).toBe(true)
    expect(contrastRatio(p.light.accent, "#ffffff")).toBeGreaterThanOrEqual(3)
    expect(p.dark.fg).toBe("#111827")
  })

  it("lightens a dark brand color for dark mode", () => {
    const p = deriveAccentPalette("#1e3a8a")! // navy
    expect(p.adjustedLight).toBe(false)
    expect(p.adjustedDark).toBe(true)
    expect(contrastRatio(p.dark.accent, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(p.dark.id, DARK_SURFACE)).toBeGreaterThanOrEqual(7)
  })

  it("always yields readable on-accent text", () => {
    for (const hex of ["#000000", "#ffffff", "#22c55e", "#7c3aed", "#06b6d4", "#facc15"]) {
      const p = deriveAccentPalette(hex)!
      expect(contrastRatio(p.light.accent, p.light.fg)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(p.dark.accent, p.dark.fg)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe("tenantAccentCss", () => {
  it("emits nothing for the default or an invalid color", () => {
    expect(tenantAccentCss(undefined)).toBeNull()
    expect(tenantAccentCss(DEFAULT_ACCENT)).toBeNull()
    expect(tenantAccentCss("</style><script>")).toBeNull()
  })

  it("overrides light and dark tokens for a custom color", () => {
    const css = tenantAccentCss("#1d4ed8")!
    expect(css).toContain(":root{--sts-accent:#1d4ed8")
    expect(css).toContain("html.dark")
    expect(css).toContain("--primary:")
  })
})

describe("tenant branding accentColor", () => {
  it("is sanitized and resolved", () => {
    expect(sanitizeTenantBranding({ accentColor: "#ABC" })).toEqual({ accentColor: "#aabbcc" })
    expect(sanitizeTenantBranding({ accentColor: "nope" })).toBeNull()
    expect(resolveTenantBranding({ accentColor: "#1d4ed8" }).accentColor).toBe("#1d4ed8")
    expect(resolveTenantBranding({}).accentColor).toBeNull()
  })
})
