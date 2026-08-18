"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, Plus, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { TIMEZONES } from "@/lib/timezones";
import { toast } from "sonner";
import { useAvailabilityRefresh } from "@/components/providers/availability-provider";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ScheduleData = {
  workingDays: number[];
  workStartTime: string;
  workEndTime: string;
};

type HolidayEntry = {
  id: string;
  date: string;
  reason?: string | null;
};

/** Minimal member shape needed to configure availability */
export type MemberConfigTarget = {
  id: string;
  name: string;
  email: string;
  location?: string | null;
  timezone?: string | null;
  subDepartmentMemberships?: { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[];
};

export function MemberConfigPanel({
  member,
  onClose,
}: {
  member: MemberConfigTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const refreshAvailability = useAvailabilityRefresh();
  const [schedule, setSchedule] = useState<ScheduleData>({
    workingDays: [1, 2, 3, 4, 5],
    workStartTime: "09:00",
    workEndTime: "17:00",
  });
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [location, setLocation] = useState(member.location ?? "");
  const [timezone, setTimezone] = useState(member.timezone ?? "Europe/London");
  const [subDepartmentMemberships, setSubDepartmentMemberships] = useState(
    member.subDepartmentMemberships ?? []
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newHolidayRange, setNewHolidayRange] = useState<DateRange | undefined>(undefined);
  const [newHolidayReason, setNewHolidayReason] = useState("");
  const [addingHoliday, setAddingHoliday] = useState(false);

  const timezoneOptions = TIMEZONES.some((t) => t.value === timezone)
    ? TIMEZONES
    : [{ value: timezone, label: timezone }, ...TIMEZONES];

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/members/${member.id}/schedule`);
        if (res.ok) {
          const data = await res.json();
          if (data.schedule) setSchedule(data.schedule);
          if (data.holidays) setHolidays(data.holidays);
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [member.id]);

  function toggleDay(day: number) {
    const next = schedule.workingDays.includes(day)
      ? schedule.workingDays.filter((d) => d !== day)
      : [...schedule.workingDays, day].sort();
    setSchedule((s) => ({ ...s, workingDays: next }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const [scheduleRes, profileRes] = await Promise.all([
        fetch(`/api/admin/members/${member.id}/schedule`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(schedule),
        }),
        fetch(`/api/admin/users/${member.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: location || null,
            timezone: timezone || null,
          }),
        }),
      ]);
      if (!scheduleRes.ok || !profileRes.ok) {
        toast.error("Failed to save member settings");
        return;
      }
      toast.success(`Updated availability for ${member.name}`);
      refreshAvailability();
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function addHoliday() {
    if (!newHolidayRange?.from) return;
    setAddingHoliday(true);
    try {
      const startDate = format(newHolidayRange.from, "yyyy-MM-dd");
      const endDate = format(newHolidayRange.to ?? newHolidayRange.from, "yyyy-MM-dd");
      const res = await fetch(`/api/admin/members/${member.id}/holidays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, reason: newHolidayReason || undefined }),
      });
      if (res.ok) {
        const created: HolidayEntry[] = await res.json();
        const createdIds = new Set(created.map((h) => h.id));
        setHolidays((prev) =>
          [...prev.filter((h) => !createdIds.has(h.id)), ...created].sort((a, b) =>
            a.date.localeCompare(b.date)
          )
        );
        setNewHolidayRange(undefined);
        setNewHolidayReason("");
        refreshAvailability();
      } else {
        toast.error("Failed to add holiday");
      }
    } finally {
      setAddingHoliday(false);
    }
  }

  async function removeHoliday(holidayId: string) {
    await fetch(`/api/admin/members/${member.id}/holidays/${holidayId}`, { method: "DELETE" });
    setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
    refreshAvailability();
  }

  async function toggleDoNotAssign(subDepartmentId: string, current: boolean) {
    const next = !current;
    // Optimistic update
    setSubDepartmentMemberships((prev) =>
      prev.map((t) => (t.subDepartmentId === subDepartmentId ? { ...t, doNotAssign: next } : t))
    );
    try {
      const res = await fetch(`/api/admin/sub-departments/${subDepartmentId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, doNotAssign: next }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      // Revert on failure and surface the reason
      setSubDepartmentMemberships((prev) =>
        prev.map((t) => (t.subDepartmentId === subDepartmentId ? { ...t, doNotAssign: current } : t))
      );
      toast.error(
        err instanceof Error ? err.message : "Failed to update assignment blocking",
      );
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50 flex justify-end pen-overlay-backdrop">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-pen-card shadow-xl border-l border-pen-card-border overflow-hidden">
        <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4 shrink-0">
          <div className="min-w-0">
            <p className="font-sans text-[14px] font-semibold text-pen-foreground truncate">
              Configure — {member.name}
            </p>
            <p className="font-sans text-[11.5px] text-pen-subtle truncate">{member.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-pen-subtle" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 px-5 py-5">
              <section>
                <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                  Location
                </p>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Dhaka, BD or Remote"
                  className="h-9 w-full rounded-[6px] border border-pen-card-border bg-pen-bg px-2.5 font-sans text-[12.5px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue/60"
                />
              </section>

              <section>
                <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                  Timezone
                </p>
                <SearchableSelect
                  value={timezone}
                  onChange={setTimezone}
                  options={timezoneOptions}
                  searchable
                  searchPlaceholder="Search timezone…"
                  className="bg-pen-bg"
                  aria-label="Timezone"
                />
                <p className="mt-1.5 font-sans text-[11px] text-pen-subtle">
                  Used for rota availability and working-hours checks.
                </p>
              </section>

              <section>
                <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                  Working days
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={cn(
                        "h-8 w-11 rounded-[6px] border font-sans text-[12px] font-medium transition-colors",
                        schedule.workingDays.includes(i)
                          ? "border-pen-blue bg-pen-blue text-white"
                          : "border-pen-card-border bg-pen-surface text-pen-muted hover:border-pen-blue/40 hover:text-pen-foreground"
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                  Working hours
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={schedule.workStartTime}
                    onChange={(e) => setSchedule((s) => ({ ...s, workStartTime: e.target.value }))}
                    className="h-9 rounded-[6px] border border-pen-card-border bg-pen-bg px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue/60"
                  />
                  <span className="font-sans text-[12px] text-pen-subtle">to</span>
                  <input
                    type="time"
                    value={schedule.workEndTime}
                    onChange={(e) => setSchedule((s) => ({ ...s, workEndTime: e.target.value }))}
                    className="h-9 rounded-[6px] border border-pen-card-border bg-pen-bg px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue/60"
                  />
                </div>
              </section>

              {subDepartmentMemberships.length > 0 && (
                <section>
                  <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                    Assignment blocking
                  </p>
                  <div className="flex flex-col gap-2">
                    {subDepartmentMemberships.map((tm) => (
                      <div key={tm.subDepartmentId} className="flex items-center justify-between rounded-[8px] border border-pen-card-border bg-pen-bg px-3 py-2.5">
                        <div>
                          <p className="font-sans text-[12.5px] font-medium text-pen-foreground">
                            {tm.subDepartmentName}
                          </p>
                          <p className="font-sans text-[11px] text-pen-subtle">
                            {tm.doNotAssign ? "Excluded from assignment" : "Active in rotation"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDoNotAssign(tm.subDepartmentId, tm.doNotAssign)}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                            tm.doNotAssign ? "bg-red-500" : "bg-pen-blue"
                          )}
                          role="switch"
                          aria-checked={!tm.doNotAssign}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform",
                              tm.doNotAssign ? "translate-x-4" : "translate-x-0"
                            )}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                  Individual holidays
                </p>

                {holidays.length > 0 && (
                  <div className="mb-3 flex flex-col gap-1.5">
                    {holidays.map((h) => (
                      <div key={h.id} className="flex items-center justify-between rounded-[6px] border border-pen-card-border bg-pen-bg px-3 py-2">
                        <div>
                          <p className="font-sans text-[12.5px] font-medium text-pen-foreground">
                            {new Date(h.date.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { dateStyle: "medium" })}
                          </p>
                          {h.reason && (
                            <p className="font-sans text-[11px] text-pen-subtle">{h.reason}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeHoliday(h.id)}
                          className="ml-2 inline-flex size-6 items-center justify-center rounded text-pen-subtle hover:text-red-500"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 rounded-[8px] border border-dashed border-pen-card-border p-3">
                  <p className="font-sans text-[11px] text-pen-subtle">Add a holiday date range</p>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger
                        className={cn(
                          "flex h-8 flex-1 items-center gap-1.5 rounded-[6px] border border-pen-card-border",
                          "bg-pen-bg px-2 font-sans text-[12px] text-pen-foreground",
                          "outline-none focus:border-pen-blue/60"
                        )}
                      >
                        <CalendarDays className="size-3.5 shrink-0 text-pen-subtle" />
                        {newHolidayRange?.from ? (
                          <span className="truncate">
                            {format(newHolidayRange.from, "MMM d, yyyy")}
                            {newHolidayRange.to && (
                              <> {"→"} {format(newHolidayRange.to, "MMM d, yyyy")}</>
                            )}
                          </span>
                        ) : (
                          <span className="text-pen-subtle">Pick date range</span>
                        )}
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="range"
                          selected={newHolidayRange}
                          onSelect={setNewHolidayRange}
                          disabled={{ before: new Date(today + "T00:00:00") }}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                    <input
                      type="text"
                      value={newHolidayReason}
                      onChange={(e) => setNewHolidayReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="h-8 flex-1 rounded-[6px] border border-pen-card-border bg-pen-bg px-2 font-sans text-[12px] text-pen-foreground placeholder:text-pen-subtle outline-none focus:border-pen-blue/60"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!newHolidayRange?.from || addingHoliday}
                    onClick={addHoliday}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] bg-pen-blue px-3 font-sans text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {addingHoliday ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    Add holiday
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {!loading && (
          <div className="shrink-0 border-t border-pen-card-border px-5 py-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[7px] border border-pen-card-border bg-pen-surface px-4 font-sans text-[12.5px] font-medium text-pen-muted hover:text-pen-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-pen-blue px-4 font-sans text-[12.5px] font-medium text-white disabled:opacity-60"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
