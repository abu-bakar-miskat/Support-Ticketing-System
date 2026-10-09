import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"
vi.mock("@/components/tickets/sla-indicator-badge", async (importOriginal) => ({
  ...await importOriginal<typeof import("./sla-indicator-badge")>(), useSlaIndicator: vi.fn(),
}))
import { useSlaIndicator } from "./sla-indicator-badge"
import { SlaDetailsSection } from "./sla-details-section"
beforeEach(() => vi.clearAllMocks())
it("renders the reported manual estimate, tracked time and overtime with no first response", () => {
  vi.mocked(useSlaIndicator).mockReturnValue({ indicator: null, live: (metric) => metric, manual: {
    estimatedMins: 5, trackedSecs: 496, overtimeSecs: 196, status: "BREACHED", runningCount: 0,
    asOf: "2026-10-09T13:26:29Z", details: { firstWorkedAt: "2026-10-09T13:18:03Z", resolvedAt: "2026-10-09T13:26:29Z", breaches: [] },
  } })
  const html = renderToStaticMarkup(<SlaDetailsSection ticketId="manual-1" />)
  expect(html).toContain("SLA overview")
  expect(html).toContain("8m 16s")
  expect(html).toContain("5m")
  expect(html).toContain("3m 16s")
  expect(html).toContain("Breached")
  expect(html).not.toContain("First response")
})
it("hides the privileged overview when API details are omitted", () => {
  vi.mocked(useSlaIndicator).mockReturnValue({ indicator: null, live: (metric) => metric, manual: {
    estimatedMins: 5, trackedSecs: 496, overtimeSecs: 196, status: "BREACHED", runningCount: 0, asOf: "2026-10-09T13:26:29Z",
  } })
  expect(renderToStaticMarkup(<SlaDetailsSection ticketId="manual-1" />)).toBe("")
})

it("renders both configured mailbox targets and resolution overview", () => {
  const metric = { status: "ON_TRACK" as const, elapsedMs: 60000, remainingMs: 3540000, targetMs: 3600000, running: true }
  vi.mocked(useSlaIndicator).mockReturnValue({ manual: null, live: (value) => value, indicator: {
    source: "mailbox", completed: false, firstResponse: metric,
    resolution: { ...metric, targetMs: 7200000, remainingMs: 7140000 }, overall: "ON_TRACK", asOf: "2026-10-09T14:30:05Z",
    details: { policyName: null, firstResponseStartedAt: "2026-10-09T14:29:05Z", resolutionStartedAt: "2026-10-09T14:29:05Z", firstResponseStoppedAt: null, resolutionStoppedAt: null, breaches: [] },
  } })
  const html = renderToStaticMarkup(<SlaDetailsSection ticketId="mailbox-1" />)
  expect(html).toContain("SLA overview")
  expect(html).toContain("First response")
  expect(html).toContain("Resolution")
  expect(html).toContain("target 1h")
  expect(html).toContain("target 2h")
})

it("shows a pending resolution clock without an initial started timestamp", () => {
  const metric = { status: "ON_TRACK" as const, elapsedMs: 0, remainingMs: 7200000, targetMs: 7200000, running: false }
  vi.mocked(useSlaIndicator).mockReturnValue({ manual: null, live: (value) => value, indicator: {
    source: "mailbox", completed: false, firstResponse: { ...metric, elapsedMs: 960000, targetMs: 3600000, remainingMs: 2640000, running: true }, resolution: metric,
    overall: "ON_TRACK", asOf: "2026-10-09T14:45:05Z",
    details: { policyName: "Shared mailbox SLA", firstResponseStartedAt: "2026-10-09T14:29:05Z", resolutionStartedAt: null, firstResponseStoppedAt: null, resolutionStoppedAt: null, breaches: [] },
  } })
  const html = renderToStaticMarkup(<SlaDetailsSection ticketId="mailbox-1" />)
  expect(html).toContain("Awaiting agent work")
  expect(html).toContain("Not started")
  expect(html).toContain("2h left")
  expect(html.match(/>Started</g)).toHaveLength(1)
})
