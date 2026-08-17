"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { Cake, CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, PartyPopper, Plus, Settings2, Sparkles, Upload, UserMinus, Users, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { MemberConfigPanel } from "@/components/settings/member-config-panel"
import { useAvailabilityRefresh } from "@/components/providers/availability-provider"
import { calendarKeys } from "@/hooks/queries/keys"
import {
  addMemberOffDays,
  createDepartmentEvent,
  createDepartmentHoliday,
  deleteDepartmentEvent,
  deleteDepartmentHoliday,
  fetchDepartmentCalendar,
  importDepartmentHolidays,
  type CalendarEventType,
  type CalendarResponse,
} from "@/lib/api/calendar"
import { cn } from "@/lib/utils"

const EVENT_TYPES: { value: CalendarEventType; label: string; icon: LucideIcon; chip: string; dot: string }[] = [
  { value: "birthday", label: "Birthday", icon: Cake, chip: "bg-pink-100 text-pink-700", dot: "bg-pink-400" },
  { value: "anniversary", label: "Anniversary", icon: PartyPopper, chip: "bg-violet-100 text-violet-700", dot: "bg-violet-400" },
  { value: "meeting", label: "Meeting", icon: Users, chip: "bg-sky-100 text-sky-700", dot: "bg-sky-400" },
  { value: "other", label: "Other", icon: CalendarClock, chip: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
]
const EVENT_TYPE_MAP = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t])) as Record<CalendarEventType, (typeof EVENT_TYPES)[number]>

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const iso = (d: Date) => format(d, "yyyy-MM-dd")

export function CalendarView({
  deptId,
  deptName,
  initialData,
}: {
  deptId: string
  deptName: string
  initialData?: CalendarResponse
}) {
  const queryClient = useQueryClient()
  const refreshAvailability = useAvailabilityRefresh()
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()))
  const [configMember, setConfigMember] = useState<{ id: string; name: string; email: string } | null>(null)

  const gridStart = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 0 })
  const fromStr = iso(gridStart)
  const toStr = iso(gridEnd)

  const { data, isLoading } = useQuery({
    queryKey: calendarKeys.month(deptId, fromStr, toStr),
    queryFn: () => fetchDepartmentCalendar(deptId, fromStr, toStr),
    initialData:
      initialData && iso(startOfWeek(startOfMonth(new Date()), { weekStartsOn: 0 })) === fromStr
        ? initialData
        : undefined,
    staleTime: 30_000,
  })

  const canManage = data?.canManage ?? false
  const members = data?.members ?? []
  const deptHolidays = data?.departmentHolidays ?? []
  const events = data?.events ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar", deptId] })
    queryClient.invalidateQueries({ queryKey: calendarKeys.upcoming() })
    refreshAvailability()
  }

  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [fromStr, toStr])

  // Fast lookups keyed by yyyy-MM-dd.
  const offByDay = useMemo(() => {
    const map = new Map<string, { name: string; reason: string | null }[]>()
    for (const m of members) {
      for (const h of m.holidays) {
        const key = h.date.slice(0, 10)
        const list = map.get(key) ?? []
        list.push({ name: m.name, reason: h.reason })
        map.set(key, list)
      }
    }
    return map
  }, [members])

  const holidaysByDay = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>()
    for (const day of days) {
      const key = iso(day)
      const hits = deptHolidays
        .filter((h) => key >= h.startDate.slice(0, 10) && key <= h.endDate.slice(0, 10))
        .map((h) => ({ id: h.id, name: h.name }))
      if (hits.length > 0) map.set(key, hits)
    }
    return map
  }, [deptHolidays, days])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { id: string; title: string; type: CalendarEventType }[]>()
    for (const day of days) {
      const key = iso(day)
      const hits = events
        .filter((e) => key >= e.startDate.slice(0, 10) && key <= e.endDate.slice(0, 10))
        .map((e) => ({ id: e.id, title: e.title, type: e.type }))
      if (hits.length > 0) map.set(key, hits)
    }
    return map
  }, [events, days])

  const deleteHoliday = useMutation({
    mutationFn: (holidayId: string) => deleteDepartmentHoliday(deptId, holidayId),
    onSuccess: () => {
      toast.success("Holiday removed")
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove holiday"),
  })

  const deleteEvent = useMutation({
    mutationFn: (eventId: string) => deleteDepartmentEvent(deptId, eventId),
    onSuccess: () => {
      toast.success("Event removed")
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove event"),
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar (pinned) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-6 pb-3 sm:px-8 lg:px-10">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonthAnchor((m) => addMonths(m, -1))}>
            <ChevronLeft />
          </Button>
          <h2 className="min-w-[9rem] text-center font-poppins text-[17px] font-semibold text-pen-foreground">
            {format(monthAnchor, "MMMM yyyy")}
          </h2>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonthAnchor((m) => addMonths(m, 1))}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonthAnchor(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[12px] text-pen-muted sm:inline">{deptName}</span>
          {canManage && (
            <>
              <AddEventPopover deptId={deptId} onDone={invalidate} />
              <AddHolidayPopover deptId={deptId} onDone={invalidate} />
              <ImportHolidaysPopover deptId={deptId} onDone={invalidate} />
              <MarkOffPopover deptId={deptId} members={members} onDone={invalidate} />
            </>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 sm:px-8 lg:px-10">
      {/* Month grid */}
      <div className="shrink-0 overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        <div className="grid grid-cols-7 border-b border-pen-card-border bg-pen-surface">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={cn(
                "px-2 py-2 text-center font-poppins text-[11px] font-semibold uppercase tracking-wide",
                i === 0 || i === 6 ? "text-pen-blue" : "text-pen-subtle",
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = iso(day)
            const inMonth = isSameMonth(day, monthAnchor)
            const weekend = isWeekend(day)
            const isToday = isSameDay(day, new Date())
            const holidays = holidaysByDay.get(key) ?? []
            const offs = offByDay.get(key) ?? []
            const dayEvents = eventsByDay.get(key) ?? []
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[104px] border-b border-r border-pen-card-border p-1.5 last:border-r-0",
                  !inMonth && "bg-pen-surface/40",
                  inMonth && weekend && "bg-pen-surface/60",
                  isToday && "bg-pen-blue-tint/60",
                )}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-[12px]",
                      isToday
                        ? "bg-pen-blue font-semibold text-white"
                        : inMonth
                          ? "text-pen-foreground"
                          : "text-pen-subtle",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {holidays.map((h) => (
                    <div
                      key={h.id}
                      className="group flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800"
                      title={h.name}
                    >
                      <span className="truncate">{h.name}</span>
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`Remove ${h.name}`}
                          className="ml-auto opacity-0 transition group-hover:opacity-100"
                          onClick={() => deleteHoliday.mutate(h.id)}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {dayEvents.map((ev) => {
                    const meta = EVENT_TYPE_MAP[ev.type] ?? EVENT_TYPE_MAP.other
                    const Icon = meta.icon
                    return (
                      <div
                        key={ev.id}
                        className={cn("group flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium", meta.chip)}
                        title={`${meta.label}: ${ev.title}`}
                      >
                        <Icon className="size-3 shrink-0" />
                        <span className="truncate">{ev.title}</span>
                        {canManage && (
                          <button
                            type="button"
                            aria-label={`Remove ${ev.title}`}
                            className="ml-auto opacity-0 transition group-hover:opacity-100"
                            onClick={() => deleteEvent.mutate(ev.id)}
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {offs.map((o, i) => (
                    <div
                      key={`${o.name}-${i}`}
                      className="flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10.5px] text-rose-600"
                      title={o.reason ? `${o.name} — ${o.reason}` : `${o.name} off`}
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />
                      <span className="truncate">{o.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Team availability */}
      <div className="shrink-0 rounded-xl border border-pen-card-border bg-pen-card p-4">
        <h3 className="mb-3 font-poppins text-[13px] font-semibold text-pen-foreground">Team availability</h3>
        {isLoading && members.length === 0 ? (
          <p className="text-[12.5px] text-pen-muted">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-[12.5px] text-pen-muted">No members in this department yet.</p>
        ) : (
          <ul className="divide-y divide-pen-card-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-pen-foreground">{m.name}</p>
                  <p className="truncate text-[11.5px] text-pen-muted">
                    {m.schedule
                      ? `Works ${m.schedule.workingDays.map((d) => DAY_LABELS[d]).join(", ")} · ${m.schedule.workStartTime}–${m.schedule.workEndTime}`
                      : "Default schedule (Mon–Fri, 09:00–17:00)"}
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfigMember({ id: m.id, name: m.name, email: m.email })}
                  >
                    <Settings2 className="size-3.5" />
                    Manage
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>

      {configMember && (
        <MemberConfigPanel
          member={configMember}
          onClose={() => {
            setConfigMember(null)
            invalidate()
          }}
        />
      )}
    </div>
  )
}

function AddEventPopover({ deptId, onDone }: { deptId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<CalendarEventType>("birthday")
  const [start, setStart] = useState(iso(new Date()))
  const [end, setEnd] = useState(iso(new Date()))

  const mutation = useMutation({
    mutationFn: () =>
      createDepartmentEvent(deptId, { title: title.trim(), type, startDate: start, endDate: end }),
    onSuccess: () => {
      toast.success("Event added")
      setTitle("")
      setOpen(false)
      onDone()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add event"),
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <Sparkles className="size-3.5" />
        Add event
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="font-poppins text-[12.5px] font-semibold text-pen-foreground">Calendar event</p>
        <FieldLabel>Type</FieldLabel>
        <SearchableSelect
          value={type}
          onChange={(v) => setType(v as CalendarEventType)}
          options={EVENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          searchable={false}
          size="sm"
        />
        <FieldLabel>Title</FieldLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "birthday" ? "e.g. Sam's birthday" : "e.g. Team lunch"}
          className="w-full rounded-md border border-pen-card-border bg-pen-bg px-2 py-1.5 text-[12.5px] outline-none focus:border-pen-accent"
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <FieldLabel>From</FieldLabel>
            <DateInput value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v) }} />
          </div>
          <div className="flex-1">
            <FieldLabel>To</FieldLabel>
            <DateInput value={end} min={start} onChange={setEnd} />
          </div>
        </div>
        <Button
          size="sm"
          className="mt-1 w-full"
          disabled={!title.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Plus className="size-3.5" />
          Add event
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function AddHolidayPopover({ deptId, onDone }: { deptId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [start, setStart] = useState(iso(new Date()))
  const [end, setEnd] = useState(iso(new Date()))

  const mutation = useMutation({
    mutationFn: () => createDepartmentHoliday(deptId, { name: name.trim(), startDate: start, endDate: end }),
    onSuccess: () => {
      toast.success("Holiday added")
      setName("")
      setOpen(false)
      onDone()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add holiday"),
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
        <CalendarPlus className="size-3.5" />
        Add holiday
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="font-poppins text-[12.5px] font-semibold text-pen-foreground">Department holiday</p>
        <FieldLabel>Name</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Eid holiday"
          className="w-full rounded-md border border-pen-card-border bg-pen-bg px-2 py-1.5 text-[12.5px] outline-none focus:border-pen-accent"
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <FieldLabel>From</FieldLabel>
            <DateInput value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v) }} />
          </div>
          <div className="flex-1">
            <FieldLabel>To</FieldLabel>
            <DateInput value={end} min={start} onChange={setEnd} />
          </div>
        </div>
        <Button
          size="sm"
          className="mt-1 w-full"
          disabled={!name.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Plus className="size-3.5" />
          Add holiday
        </Button>
      </PopoverContent>
    </Popover>
  )
}

const IMPORT_PLACEHOLDER = `[
  { "name": "Eid holiday", "startDate": "2026-08-11", "endDate": "2026-08-13" },
  { "name": "Founders Day", "startDate": "2026-09-01" }
]`

function ImportHolidaysPopover({ deptId, onDone }: { deptId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")

  const mutation = useMutation({
    mutationFn: () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error("That isn't valid JSON — check for a missing comma or quote.")
      }
      return importDepartmentHolidays(deptId, parsed)
    },
    onSuccess: ({ imported }) => {
      toast.success(`Imported ${imported} holiday${imported === 1 ? "" : "s"}`)
      setText("")
      setOpen(false)
      onDone()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to import holidays"),
  })

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setText(await file.text())
    e.target.value = ""
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <Upload className="size-3.5" />
        Import JSON
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="font-poppins text-[12.5px] font-semibold text-pen-foreground">Import holidays</p>
        <p className="text-[11px] text-pen-muted">
          Paste a JSON array of <code>{"{ name, startDate, endDate? }"}</code>. Dates as YYYY-MM-DD.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={IMPORT_PLACEHOLDER}
          rows={7}
          spellCheck={false}
          className="w-full rounded-md border border-pen-card-border bg-pen-bg px-2 py-1.5 font-mono text-[11.5px] outline-none focus:border-pen-accent"
        />
        <label className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer justify-center")}>
          <Upload className="size-3.5" />
          Upload .json file
          <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        </label>
        <Button
          size="sm"
          className="mt-1 w-full"
          disabled={!text.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Plus className="size-3.5" />
          Import
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function MarkOffPopover({
  deptId,
  members,
  onDone,
}: {
  deptId: string
  members: { id: string; name: string }[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState("")
  const [start, setStart] = useState(iso(new Date()))
  const [end, setEnd] = useState(iso(new Date()))
  const [reason, setReason] = useState("")

  const mutation = useMutation({
    mutationFn: () => addMemberOffDays(userId, { startDate: start, endDate: end, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success("Off-days added")
      setReason("")
      setUserId("")
      setOpen(false)
      onDone()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to mark off-days"),
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <UserMinus className="size-3.5" />
        Mark someone off
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="font-poppins text-[12.5px] font-semibold text-pen-foreground">Mark unavailable</p>
        <FieldLabel>Member</FieldLabel>
        <SearchableSelect
          value={userId}
          onChange={setUserId}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
          placeholder="Select a member"
          size="sm"
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <FieldLabel>From</FieldLabel>
            <DateInput value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v) }} />
          </div>
          <div className="flex-1">
            <FieldLabel>To</FieldLabel>
            <DateInput value={end} min={start} onChange={setEnd} />
          </div>
        </div>
        <FieldLabel>Reason (optional)</FieldLabel>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Annual leave"
          className="w-full rounded-md border border-pen-card-border bg-pen-bg px-2 py-1.5 text-[12.5px] outline-none focus:border-pen-accent"
        />
        <Button
          size="sm"
          className="mt-1 w-full"
          disabled={!userId || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <Plus className="size-3.5" />
          Mark off
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mt-1 block text-[11px] font-medium text-pen-subtle">{children}</label>
}

function DateInput({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-pen-card-border bg-pen-bg px-2 py-1.5 text-[12.5px] outline-none focus:border-pen-accent"
    />
  )
}
