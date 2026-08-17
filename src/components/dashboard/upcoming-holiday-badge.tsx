"use client"

import { useQuery } from "@tanstack/react-query"
import { differenceInCalendarDays, format } from "date-fns"
import { Cake, CalendarClock, Palmtree, PartyPopper, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { calendarKeys } from "@/hooks/queries/keys"
import { fetchUpcomingHolidays, type CalendarEventType } from "@/lib/api/calendar"
import { cn } from "@/lib/utils"

function relativeLabel(startDate: string, endDate: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  const end = new Date(endDate)
  // Ongoing (started already, still running).
  if (start <= today && end >= today) return "today"
  const days = differenceInCalendarDays(start, today)
  if (days <= 0) return "today"
  if (days === 1) return "tomorrow"
  if (days <= 6) return format(start, "EEEE") // within this week → weekday name
  return `in ${days} days`
}

/** "Aug 11" for a single day, "Aug 11–13" / "Aug 30 – Sep 1" for a range. */
function dateLabel(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (startDate.slice(0, 10) === endDate.slice(0, 10)) return format(start, "MMM d")
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  return `${format(start, "MMM d")}–${sameMonth ? format(end, "d") : format(end, "MMM d")}`
}

const EVENT_META: Record<CalendarEventType, { icon: LucideIcon; chip: string }> = {
  birthday: { icon: Cake, chip: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-400/20 dark:bg-pink-400/10 dark:text-pink-300" },
  anniversary: { icon: PartyPopper, chip: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300" },
  meeting: { icon: Users, chip: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300" },
  other: { icon: CalendarClock, chip: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-300" },
}

const CHIP_BASE = "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium"

export function UpcomingCalendarBadges({ className }: { className?: string }) {
  const { data } = useQuery({
    queryKey: calendarKeys.upcoming(),
    queryFn: fetchUpcomingHolidays,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const holidays = data?.holidays ?? []
  const events = data?.events ?? []
  if (holidays.length === 0 && events.length === 0) return null

  const nextHoliday = holidays[0]
  const moreHolidays = holidays.length - 1
  const nextEvent = events[0]
  const moreEvents = events.length - 1
  const EventIcon = nextEvent ? EVENT_META[nextEvent.type].icon : null

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {nextHoliday && (
        <div
          className={cn(
            CHIP_BASE,
            "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
          )}
          title={holidays
            .map((h) => `${h.name} (${dateLabel(h.startDate, h.endDate)})`)
            .join(", ")}
        >
          <Palmtree className="size-3.5 shrink-0" />
          <span className="max-w-[8rem] truncate">{nextHoliday.name}</span>
          <span className="shrink-0 font-semibold">· {dateLabel(nextHoliday.startDate, nextHoliday.endDate)}</span>
          {moreHolidays > 0 && <span className="shrink-0 opacity-70">+{moreHolidays}</span>}
        </div>
      )}
      {nextEvent && EventIcon && (
        <div
          className={cn(CHIP_BASE, EVENT_META[nextEvent.type].chip)}
          title={events
            .map((e) => `${e.title} (${dateLabel(e.startDate, e.endDate)})`)
            .join(", ")}
        >
          <EventIcon className="size-3.5 shrink-0" />
          <span className="max-w-[8rem] truncate">{nextEvent.title}</span>
          <span className="shrink-0 font-semibold">· {dateLabel(nextEvent.startDate, nextEvent.endDate)}</span>
          <span className="shrink-0 opacity-70">({relativeLabel(nextEvent.startDate, nextEvent.endDate)})</span>
          {moreEvents > 0 && <span className="shrink-0 opacity-70">+{moreEvents}</span>}
        </div>
      )}
    </div>
  )
}
