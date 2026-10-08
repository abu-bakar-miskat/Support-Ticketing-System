"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, Plus, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { toastResponseError } from "@/lib/toast-error";
import { useAvailabilityRefresh } from "@/components/providers/availability-provider";

export type OwnSubDepartmentMembership = {
  subDepartmentId: string;
  subDepartmentName: string;
  departmentName: string | null;
  doNotAssign: boolean;
};

export type OwnHoliday = {
  id: string;
  date: string;
  reason?: string | null;
};

const SWITCH_CLASS =
  "h-[22px] w-[38px] shrink-0 data-checked:bg-sts-blue data-unchecked:bg-sts-muted/45 dark:data-unchecked:bg-sts-muted/60 [&_[data-slot=switch-thumb]]:size-4 [&_[data-slot=switch-thumb]]:bg-white! [&_[data-slot=switch-thumb]]:shadow-sm [&_[data-slot=switch-thumb]]:data-checked:translate-x-[calc(100%-2px)]";

/**
 * Self-service assignment blocking + individual holidays for the signed-in user.
 * Mirrors the admin MemberConfigPanel but writes through /api/profile/*.
 */
export function ProfileAvailabilitySection({
  subDepartmentMemberships: initialMemberships,
  holidays: initialHolidays,
}: {
  subDepartmentMemberships: OwnSubDepartmentMembership[];
  holidays: OwnHoliday[];
}) {
  const router = useRouter();
  const refreshAvailability = useAvailabilityRefresh();
  const [memberships, setMemberships] = useState(initialMemberships);
  const [holidays, setHolidays] = useState(initialHolidays);
  const [newHolidayRange, setNewHolidayRange] = useState<DateRange | undefined>(
    undefined,
  );
  const [newHolidayReason, setNewHolidayReason] = useState("");
  const [addingHoliday, setAddingHoliday] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  async function toggleDoNotAssign(subDepartmentId: string, current: boolean) {
    const next = !current;
    setMemberships((prev) =>
      prev.map((m) =>
        m.subDepartmentId === subDepartmentId ? { ...m, doNotAssign: next } : m,
      ),
    );
    const res = await fetch("/api/profile/assignment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subDepartmentId, doNotAssign: next }),
    });
    if (!res.ok) {
      setMemberships((prev) =>
        prev.map((m) =>
          m.subDepartmentId === subDepartmentId
            ? { ...m, doNotAssign: current }
            : m,
        ),
      );
      await toastResponseError(res, "Failed to update assignment blocking");
      return;
    }
    router.refresh();
  }

  async function addHoliday() {
    if (!newHolidayRange?.from) return;
    setAddingHoliday(true);
    try {
      const startDate = format(newHolidayRange.from, "yyyy-MM-dd");
      const endDate = format(
        newHolidayRange.to ?? newHolidayRange.from,
        "yyyy-MM-dd",
      );
      const res = await fetch("/api/profile/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          reason: newHolidayReason || undefined,
        }),
      });
      if (!res.ok) {
        await toastResponseError(res, "Failed to add holiday");
        return;
      }
      const created: OwnHoliday[] = await res.json();
      const createdIds = new Set(created.map((h) => h.id));
      setHolidays((prev) =>
        [...prev.filter((h) => !createdIds.has(h.id)), ...created].sort(
          (a, b) => a.date.localeCompare(b.date),
        ),
      );
      setNewHolidayRange(undefined);
      setNewHolidayReason("");
      toast.success("Holiday added");
      refreshAvailability();
    } finally {
      setAddingHoliday(false);
    }
  }

  async function removeHoliday(holidayId: string) {
    const res = await fetch(`/api/profile/holidays/${holidayId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      await toastResponseError(res, "Failed to remove holiday");
      return;
    }
    setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
    refreshAvailability();
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-px">
          <h2 className="font-sans text-sm font-semibold text-sts-foreground">
            Assignment blocking
          </h2>
          <p className="font-sans text-[11.5px] text-sts-subtle">
            Turn off a sub department to stop new tickets being auto-assigned to
            you there.
          </p>
        </div>
        {memberships.length === 0 ? (
          <p className="rounded-md border border-dashed border-sts-card-border px-3 py-2.5 font-sans text-[11.5px] text-sts-subtle">
            You aren&apos;t a member of any sub department, so tickets
            aren&apos;t auto-assigned to you.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {memberships.map((m) => (
              <div
                key={m.subDepartmentId}
                className="flex items-center justify-between gap-3 rounded-md border border-sts-card-border bg-sts-bg px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-sans text-[12.5px] font-medium text-sts-foreground">
                    {m.subDepartmentName}
                    {m.departmentName && (
                      <span className="font-normal text-sts-subtle">
                        {" "}
                        · {m.departmentName}
                      </span>
                    )}
                  </p>
                  <p className="font-sans text-[11px] text-sts-subtle">
                    {m.doNotAssign
                      ? "Excluded from assignment"
                      : "Active in rotation"}
                  </p>
                </div>
                <Switch
                  checked={!m.doNotAssign}
                  onCheckedChange={() =>
                    toggleDoNotAssign(m.subDepartmentId, m.doNotAssign)
                  }
                  aria-label={`Auto-assignment in ${m.subDepartmentName}`}
                  className={SWITCH_CLASS}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-px">
          <h2 className="font-sans text-sm font-semibold text-sts-foreground">
            Individual holidays
          </h2>
          <p className="font-sans text-[11.5px] text-sts-subtle">
            You won&apos;t be auto-assigned tickets on these days.
          </p>
        </div>

        {holidays.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {holidays.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-md border border-sts-card-border bg-sts-bg px-3 py-2"
              >
                <div>
                  <p className="font-sans text-[12.5px] font-medium text-sts-foreground">
                    {new Date(
                      h.date.slice(0, 10) + "T00:00:00",
                    ).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </p>
                  {h.reason && (
                    <p className="font-sans text-[11px] text-sts-subtle">
                      {h.reason}
                    </p>
                  )}
                </div>
                <Tip label="Remove holiday">
                  <button
                    aria-label="Remove holiday"
                    type="button"
                    onClick={() => removeHoliday(h.id)}
                    className="ml-2 inline-flex size-6 items-center justify-center rounded text-sts-subtle hover:text-red-500"
                  >
                    <X className="size-3.5" />
                  </button>
                </Tip>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-md border border-dashed border-sts-card-border p-3">
          <p className="font-sans text-[11px] text-sts-subtle">
            Add a holiday date range
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Popover>
              <PopoverTrigger
                className={cn(
                  "flex h-9 flex-1 items-center gap-1.5 rounded-md border border-sts-card-border",
                  "bg-sts-bg px-[11px] font-sans text-[12.5px] text-sts-foreground",
                  "outline-none focus:border-sts-blue/60",
                )}
              >
                <CalendarDays className="size-3.5 shrink-0 text-sts-subtle" />
                {newHolidayRange?.from ? (
                  <span className="truncate">
                    {format(newHolidayRange.from, "MMM d, yyyy")}
                    {newHolidayRange.to && (
                      <>
                        {" "}
                        {"→"} {format(newHolidayRange.to, "MMM d, yyyy")}
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-sts-subtle">Pick date range</span>
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
              className="h-9 flex-1 rounded-md border border-sts-card-border bg-sts-bg px-[11px] font-sans text-[12.5px] text-sts-foreground placeholder:text-sts-subtle outline-none focus:border-sts-blue/60"
            />
          </div>
          <button
            type="button"
            disabled={!newHolidayRange?.from || addingHoliday}
            onClick={addHoliday}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[12.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
          >
            {addingHoliday ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Add holiday
          </button>
        </div>
      </div>
    </>
  );
}
