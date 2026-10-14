import { z } from "zod"

export const SCHEDULE_REPORT_TYPES = ["user_performance", "volume", "resolution_time", "cross_department"] as const
export const SCHEDULE_PERIODS = ["previous_day", "previous_week", "previous_month", "rolling"] as const
export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const
export const PERIOD_LABELS = { previous_day: "Previous day", previous_week: "Previous week", previous_month: "Previous month", rolling: "Rolling window" } as const
export const REPORT_LABELS = { user_performance: "User performance", volume: "Ticket volume", resolution_time: "Resolution time", cross_department: "Cross-department" } as const
export function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true } catch { return false }
}
export const scheduleSettingsSchema = z.object({
  departmentId: z.string().min(1).default("all"),
  personId: z.string().min(1).default("all"),
  period: z.enum(SCHEDULE_PERIODS).default("previous_week"),
  timezone: z.string().refine(validTimezone, "Choose a valid timezone").default("Europe/London"),
  runTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Run time must use HH:mm").default("09:00"),
  weekday: z.number().int().min(0).max(6).default(1),
  monthDay: z.number().int().min(1).max(31).default(1),
})
export type ScheduleSettings = z.infer<typeof scheduleSettingsSchema>
export const scheduleInputSchema = z.object({
  name: z.string().trim().min(1, "Give the schedule a name").max(120),
  reportType: z.enum(SCHEDULE_REPORT_TYPES).default("user_performance"),
  format: z.enum(["PDF", "CSV", "XLSX"]).default("XLSX"),
  frequency: z.enum(FREQUENCIES).default("WEEKLY"),
  rangeDays: z.number().int().min(1).max(365).default(30),
  settings: scheduleSettingsSchema.default(() => scheduleSettingsSchema.parse({})),
}).superRefine((value, ctx) => {
  if (value.reportType !== "user_performance" && value.settings.personId !== "all") ctx.addIssue({ code: "custom", message: "Person filtering is available for user performance reports", path: ["settings", "personId"] })
  if (value.reportType === "cross_department" && value.settings.departmentId !== "all") ctx.addIssue({ code: "custom", message: "Cross-department reports require all departments", path: ["settings", "departmentId"] })
})
export type ScheduleInput = z.infer<typeof scheduleInputSchema>
export type ScheduleFrequency = ScheduleInput["frequency"]

/** Legacy schedules retain their rolling-window and interval-based behavior. */
export function readScheduleSettings(settings: unknown): ScheduleSettings | null {
  if (settings == null) return null
  return scheduleSettingsSchema.parse(settings)
}
