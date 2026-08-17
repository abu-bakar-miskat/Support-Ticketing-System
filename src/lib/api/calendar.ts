export type CalendarMemberHoliday = { id: string; date: string; reason: string | null }

export type CalendarMemberSchedule = {
  workingDays: number[]
  workStartTime: string
  workEndTime: string
}

export type CalendarMember = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  schedule: CalendarMemberSchedule | null
  holidays: CalendarMemberHoliday[]
}

export type CalendarDepartmentHoliday = {
  id: string
  name: string
  startDate: string
  endDate: string
}

export type CalendarEventType = "birthday" | "anniversary" | "meeting" | "other"

export type CalendarEvent = {
  id: string
  title: string
  type: CalendarEventType
  startDate: string
  endDate: string
}

export type CalendarResponse = {
  canManage: boolean
  members: CalendarMember[]
  departmentHolidays: CalendarDepartmentHoliday[]
  events: CalendarEvent[]
}

export async function fetchUpcomingHolidays(): Promise<{
  holidays: CalendarDepartmentHoliday[]
  events: CalendarEvent[]
}> {
  const res = await fetch("/api/departments/upcoming-holidays")
  if (!res.ok) throw new Error("Failed to load upcoming calendar items")
  return res.json()
}

export async function fetchDepartmentCalendar(
  deptId: string,
  from: string,
  to: string,
): Promise<CalendarResponse> {
  const res = await fetch(`/api/departments/${deptId}/calendar?from=${from}&to=${to}`)
  if (!res.ok) throw new Error("Failed to load calendar")
  return res.json()
}

export async function createDepartmentHoliday(
  deptId: string,
  body: { name: string; startDate: string; endDate: string },
): Promise<CalendarDepartmentHoliday> {
  const res = await fetch(`/api/departments/${deptId}/holidays`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to add holiday")
  }
  return res.json()
}

export async function importDepartmentHolidays(
  deptId: string,
  holidays: unknown,
): Promise<{ imported: number }> {
  const res = await fetch(`/api/departments/${deptId}/holidays/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(holidays),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to import holidays")
  }
  return res.json()
}

export async function deleteDepartmentHoliday(deptId: string, holidayId: string): Promise<void> {
  const res = await fetch(`/api/departments/${deptId}/holidays/${holidayId}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete holiday")
}

export async function createDepartmentEvent(
  deptId: string,
  body: { title: string; type: CalendarEventType; startDate: string; endDate: string },
): Promise<CalendarEvent> {
  const res = await fetch(`/api/departments/${deptId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to add event")
  }
  return res.json()
}

export async function deleteDepartmentEvent(deptId: string, eventId: string): Promise<void> {
  const res = await fetch(`/api/departments/${deptId}/events/${eventId}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete event")
}

export async function addMemberOffDays(
  userId: string,
  body: { startDate: string; endDate: string; reason?: string },
): Promise<void> {
  const res = await fetch(`/api/admin/members/${userId}/holidays`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? "Failed to mark off-days")
  }
}
