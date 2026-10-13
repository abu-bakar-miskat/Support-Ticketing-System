import { expect, it } from "vitest"
import { formatPerformanceDuration, summarizeUserPerformance, type UserPerformanceSample } from "./user-performance"
const start = new Date("2026-10-01"), end = new Date("2026-11-01")
const alice = { id: "alice", name: "Alice" }, bob = { id: "bob", name: "Bob" }
const sample: UserPerformanceSample = {
  id: "one", title: "Example", ticketNumber: 1, subDepartment: { prefix: "SUP" }, priority: "Urgent",
  assignee: alice, assignees: [{ user: alice }], intake: null, activityLogs: [], slaTimer: { source: "mailbox" },
  createdAt: new Date("2026-09-30T23:00:00Z"), closedAt: new Date("2026-10-01T01:00:00Z"), completed: true,
  responseStoppedAt: new Date("2026-10-01T00:00:00Z"), replyAt: new Date("2026-10-01T00:30:00Z"),
  sla: { overall: "BREACHED", firstResponse: { status: "BREACHED", elapsedMs: 3600000, targetMs: 1800000, remainingMs: -1800000 }, resolution: { status: "ON_TRACK", elapsedMs: 600000, targetMs: 1800000, remainingMs: 1200000 } },
}
it("includes older tickets completed in the period and splits response and resolution outcomes", () => {
  const result = summarizeUserPerformance([sample], [alice], start, end)
  expect(result.userPerformance[0]).toMatchObject({ completed: 1, priorities: { Urgent: 1 }, responseSla: { breached: 1, met: 0 }, resolutionSla: { breached: 0, met: 1 }, avgReplySecs: 5400, avgCompletionSecs: 7200, avgSlaResolutionSecs: 600, replySamples: 1 })
  expect(result.performanceDetails[0]).toMatchObject({ completionSecs: 7200, replySecs: 5400, slaResolutionSecs: 600 })
})
it("counts reply events independently of completion and leaves missing measurements unknown", () => {
  const result = summarizeUserPerformance([{ ...sample, closedAt: null, completed: false, sla: null }], [alice], start, end)
  expect(result.userPerformance[0]).toMatchObject({ completed: 0, avgReplySecs: 5400, avgCompletionSecs: null, score: null, rank: null })
  expect(result.userPerformance[0].responseSla.noPolicy).toBe(1)
})
it("excludes out-of-period events and never credits pending SLA as met", () => {
  const result = summarizeUserPerformance([{ ...sample, createdAt: new Date("2026-10-02"), completed: false, closedAt: null, responseStoppedAt: null, replyAt: null, sla: { ...sample.sla!, overall: "ON_TRACK", firstResponse: { ...sample.sla!.firstResponse, status: "ON_TRACK" } } }], [alice], start, end)
  expect(result.userPerformance[0].responseSla).toEqual({ pending: 1, met: 0, breached: 0, noPolicy: 0 })
  expect(result.userPerformance[0].resolutionSla.pending).toBe(1)
  expect(result.userPerformance[0].avgReplySecs).toBeNull()
  expect(summarizeUserPerformance([{ ...sample, closedAt: new Date("2026-09-30"), responseStoppedAt: null, replyAt: null }], [], start, end).performanceDetails).toEqual([])
})
it("ranks higher volume, fewer breaches, and faster policy-normalized completion above lower performance", () => {
  const good = { ...sample, sla: { ...sample.sla!, overall: "ON_TRACK" as const, firstResponse: { ...sample.sla!.firstResponse, status: "ON_TRACK" as const, elapsedMs: 300000 } } }
  const slow = { ...sample, id: "bob-ticket", assignee: bob, assignees: [], sla: { ...sample.sla!, resolution: { ...sample.sla!.resolution, status: "BREACHED" as const, elapsedMs: 3600000 } } }
  const samples = [good, { ...good, id: "two" }, slow]
  const all = summarizeUserPerformance(samples, [alice, bob], start, end)
  expect(all.userPerformance.map((p) => [p.name, p.rank])).toEqual([["Alice", 1], ["Bob", 2]])
  const filtered = summarizeUserPerformance(samples, [alice, bob], start, end, "bob")
  expect(filtered.userPerformance[0].score).toBe(all.userPerformance[1].score)
  expect(filtered.userPerformance[0].rank).toBe(2)
  expect(filtered.performanceDetails.map((t) => t.id)).toEqual(["bob-ticket"])
})
it("does not treat no-policy tickets as SLA successes or invent a performance score", () => {
  const result = summarizeUserPerformance([{ ...sample, sla: null }], [alice, bob], start, end)
  expect(result.userPerformance[0]).toMatchObject({ completed: 1, rank: null, score: null })
  expect(result.userPerformance[0].resolutionSla).toEqual({ met: 0, breached: 0, pending: 0, noPolicy: 1 })
  expect(formatPerformanceDuration(null)).toBe("—")
  expect(formatPerformanceDuration(0)).toBe("0s")
  expect(formatPerformanceDuration(3661)).toBe("1h 1m 1s")
})
