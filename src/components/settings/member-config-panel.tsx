"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, Plus, CalendarDays, ArrowRightLeft } from "lucide-react";
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

type ReassignContext = {
  departmentId: string;
  teams: { id: string; name: string }[];
  agents: { id: string; name: string }[];
};

type ReassignTargetType = "SINGLE_AGENT" | "GROUP" | "DEPARTMENT_POOL";

export function MemberConfigPanel({
  member,
  onClose,
  reassignContext = null,
}: {
  member: MemberConfigTarget;
  onClose: () => void;
  reassignContext?: ReassignContext | null;
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

  const [reassignType, setReassignType] = useState<ReassignTargetType>("DEPARTMENT_POOL");
  const [reassignAgentId, setReassignAgentId] = useState("");
  const [reassignTeamId, setReassignTeamId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignResult, setReassignResult] = useState<string | null>(null);

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

  async function handleReassign() {
    if (!reassignContext) return;
    if (reassignType === "SINGLE_AGENT" && !reassignAgentId) return;
    if (reassignType === "GROUP" && !reassignTeamId) return;
    setReassigning(true);
    setReassignResult(null);
    try {
      const res = await fetch("/api/admin/tickets/bulk-reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: reassignContext.departmentId,
          sourceAssigneeId: member.id,
          targetType: reassignType,
          targetAgentId: reassignType === "SINGLE_AGENT" ? reassignAgentId : undefined,
          targetTeamId: reassignType === "GROUP" ? reassignTeamId : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Bulk reassign failed");

      const { jobId, ticketCount } = json as { jobId: string; ticketCount: number };
      if (ticketCount === 0) {
        setReassignResult("No open tickets to reassign.");
        return;
      }

      // Poll the job until it finishes.
      const deadline = Date.now() + 60_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const pollRes = await fetch(`/api/admin/tickets/bulk-reassign/${jobId}`);
        if (!pollRes.ok) break;
        const job = await pollRes.json();
        if (job.status === "COMPLETED" || job.status === "FAILED") {
          const succeeded = job.succeeded ?? 0;
          const total = job.total ?? ticketCount;
          const failed = total - succeeded;
          setReassignResult(
            job.status === "FAILED"
              ? `Job failed after reassigning ${succeeded}/${total}.`
              : `Reassigned ${succeeded} of ${total} ticket${total === 1 ? "" : "s"}${failed > 0 ? ` (${failed} could not be routed)` : ""}.`,
          );
          toast.success(`Reassigned ${succeeded} of ${total} tickets`);
          router.refresh();
          break;
        }
        if (Date.now() > deadline) {
          setReassignResult("Reassignment is still running — check back shortly.");
          break;
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk reassign failed");
    } finally {
      setReassigning(false);
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

              {reassignContext && (
                <section>
                  <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
                    Reassign open tickets
                  </p>
                  <p className="mb-2.5 font-sans text-[11px] text-pen-subtle">
                    Move all of {member.name}&apos;s open tickets in this department to another
                    agent, a team, or back into the department pool (auto-routed by the
                    department&apos;s assignment method).
                  </p>

                  <div className="flex flex-col gap-2 rounded-[8px] border border-pen-card-border bg-pen-bg p-3">
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ["DEPARTMENT_POOL", "Dept pool"],
                        ["SINGLE_AGENT", "Agent"],
                        ["GROUP", "Team"],
                      ] as [ReassignTargetType, string][]).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => { setReassignType(val); setReassignResult(null); }}
                          className={cn(
                            "h-8 rounded-[6px] border font-sans text-[12px] font-medium transition-colors",
                            reassignType === val
                              ? "border-pen-blue bg-pen-blue text-white"
                              : "border-pen-card-border bg-pen-surface text-pen-muted hover:border-pen-blue/40 hover:text-pen-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {reassignType === "SINGLE_AGENT" && (
                      <SearchableSelect
                        value={reassignAgentId}
                        onChange={setReassignAgentId}
                        options={reassignContext.agents.map((a) => ({ value: a.id, label: a.name }))}
                        placeholder="Select an agent…"
                        searchPlaceholder="Search agents…"
                        emptyLabel="No other agents"
                        className="bg-pen-bg"
                      />
                    )}
                    {reassignType === "GROUP" && (
                      <SearchableSelect
                        value={reassignTeamId}
                        onChange={setReassignTeamId}
                        options={reassignContext.teams.map((t) => ({ value: t.id, label: t.name }))}
                        placeholder="Select a team…"
                        searchPlaceholder="Search teams…"
                        emptyLabel="No teams"
                        className="bg-pen-bg"
                      />
                    )}

                    <button
                      type="button"
                      disabled={
                        reassigning ||
                        (reassignType === "SINGLE_AGENT" && !reassignAgentId) ||
                        (reassignType === "GROUP" && !reassignTeamId)
                      }
                      onClick={handleReassign}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] bg-pen-blue px-3 font-sans text-[12px] font-medium text-white disabled:opacity-50"
                    >
                      {reassigning ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
                      Reassign tickets
                    </button>

                    {reassignResult && (
                      <p className="font-sans text-[11.5px] text-pen-foreground">{reassignResult}</p>
                    )}
                  </div>
                </section>
              )}
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
