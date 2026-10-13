import { describe, expect, it } from "vitest"
import { localDateTime, nextScheduledRun, scheduledReportRange } from "./schedule-calendar"
import { scheduleInputSchema, scheduleSettingsSchema } from "./schedule-settings"
const settings = scheduleSettingsSchema.parse({ timezone: "Europe/London", runTime: "09:00" })

describe("scheduled report calendar", () => {
  it("keeps the preferred local time across daylight-saving changes", () => {
    expect(nextScheduledRun("DAILY", settings, new Date("2026-10-23T12:00:00Z")).toISOString()).toBe("2026-10-24T08:00:00.000Z")
    expect(nextScheduledRun("DAILY", settings, new Date("2026-10-24T12:00:00Z")).toISOString()).toBe("2026-10-25T09:00:00.000Z")
  })
  it("resolves nonexistent and repeated local times without scheduling two runs", () => {
    expect(localDateTime(new Date("2026-03-29"), "01:30", "Europe/London").toISOString()).toBe("2026-03-29T01:30:00.000Z")
    expect(localDateTime(new Date("2026-10-25"), "01:30", "Europe/London").toISOString()).toBe("2026-10-25T00:30:00.000Z")
    expect(nextScheduledRun("DAILY", { ...settings, runTime: "01:30" }, new Date("2026-10-25T00:45:00Z")).toISOString()).toBe("2026-10-26T01:30:00.000Z")
  })
  it("uses the selected weekday and advances past an exact run boundary", () => {
    expect(nextScheduledRun("WEEKLY", settings, new Date("2026-10-13T08:00:00Z")).toISOString()).toBe("2026-10-19T08:00:00.000Z")
    expect(nextScheduledRun("WEEKLY", settings, new Date("2026-10-19T08:00:00Z")).toISOString()).toBe("2026-10-26T09:00:00.000Z")
  })
  it("clamps monthly dates to the month end without drifting the next month", () => {
    const monthly = { ...settings, timezone: "UTC", monthDay: 31 }
    const february = nextScheduledRun("MONTHLY", monthly, new Date("2026-01-31T09:00:00Z"))
    expect(february.toISOString()).toBe("2026-02-28T09:00:00.000Z")
    expect(nextScheduledRun("MONTHLY", monthly, february).toISOString()).toBe("2026-03-31T09:00:00.000Z")
  })
  it("uses complete local days, including 23-hour daylight-saving days", () => {
    const range = scheduledReportRange({ ...settings, period: "previous_day" }, 30, new Date("2026-03-30T08:00:00Z"))
    expect(range.start.toISOString()).toBe("2026-03-29T00:00:00.000Z")
    expect(range.end.toISOString()).toBe("2026-03-29T23:00:00.000Z")
  })
  it("uses Monday-to-Monday weeks and previous calendar months", () => {
    const weekly = scheduledReportRange(settings, 30, new Date("2026-10-13T08:00:00Z"))
    expect(weekly.start.toISOString()).toBe("2026-10-04T23:00:00.000Z")
    expect(weekly.end.toISOString()).toBe("2026-10-11T23:00:00.000Z")
    const monthly = scheduledReportRange({ ...settings, period: "previous_month" }, 30, new Date("2026-04-01T08:00:00Z"))
    expect(monthly.start.toISOString()).toBe("2026-03-01T00:00:00.000Z")
    expect(monthly.end.toISOString()).toBe("2026-03-31T23:00:00.000Z")
  })
  it("retains rolling windows for legacy schedules", () => {
    const now = new Date("2026-10-13T09:15:00Z")
    const range = scheduledReportRange(null, 30, now)
    expect(range.end).toBe(now)
    expect(range.start.toISOString()).toBe("2026-09-13T09:15:00.000Z")
  })
  it("rejects invalid timezones, times, monthly dates, and incompatible filters", () => {
    expect(scheduleSettingsSchema.safeParse({ timezone: "Unknown/Town" }).success).toBe(false)
    expect(scheduleSettingsSchema.safeParse({ runTime: "25:10" }).success).toBe(false)
    expect(scheduleSettingsSchema.safeParse({ monthDay: 32 }).success).toBe(false)
    expect(scheduleInputSchema.safeParse({ name: "Test", reportType: "volume", settings: { personId: "person" } }).success).toBe(false)
    expect(scheduleInputSchema.safeParse({ name: "Test", reportType: "cross_department", settings: { departmentId: "dept" } }).success).toBe(false)
  })
})
