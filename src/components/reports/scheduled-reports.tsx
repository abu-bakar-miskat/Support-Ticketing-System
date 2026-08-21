"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Download, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

type Schedule = {
  id: string;
  name: string;
  reportType: string;
  format: string;
  frequency: string;
  rangeDays: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
};

type ExportJob = {
  id: string;
  reportType: string;
  format: string;
  status: string;
  resultUrl: string | null;
  createdAt: string;
  completedAt: string | null;
};

const REPORT_TYPE_OPTIONS = [
  { value: "cross_department", label: "Cross-department" },
  { value: "volume", label: "Ticket volume" },
  { value: "resolution_time", label: "Resolution time" },
];
const FORMAT_OPTIONS = [
  { value: "PDF", label: "PDF" },
  { value: "CSV", label: "CSV" },
  { value: "XLSX", label: "Excel (.xlsx)" },
];
const FREQ_OPTIONS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
];

const REPORT_TYPE_LABEL: Record<string, string> = {
  cross_department: "Cross-department",
  volume: "Ticket volume",
  resolution_time: "Resolution time",
  custom_field: "Custom field",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ScheduledReports() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exportsList, setExportsList] = useState<ExportJob[]>([]);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [reportType, setReportType] = useState("cross_department");
  const [format, setFormat] = useState("PDF");
  const [frequency, setFrequency] = useState("WEEKLY");
  const [rangeDays, setRangeDays] = useState(30);

  const load = useCallback(async () => {
    const res = await fetch("/api/reports/schedules");
    if (res.status === 403) {
      setAuthorized(false);
      return;
    }
    setAuthorized(true);
    if (res.ok) {
      const d = await res.json();
      setSchedules(d.schedules ?? []);
    }
    const exRes = await fetch("/api/reports/exports");
    if (exRes.ok) {
      const d = await exRes.json();
      setExportsList(d.exports ?? []);
    }
  }, []);

  useEffect(() => {
    load().catch(() => setAuthorized(false));
  }, [load]);

  async function createSchedule() {
    if (!name.trim()) {
      toast.error("Give the schedule a name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/reports/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, reportType, format, frequency, rangeDays }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create schedule");
      setName("");
      toast.success("Schedule created");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create schedule");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(s: Schedule) {
    setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    const res = await fetch(`/api/reports/schedules/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    if (!res.ok) {
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: s.enabled } : x)));
      toast.error("Could not update schedule");
    }
  }

  async function remove(id: string) {
    setSchedules((prev) => prev.filter((x) => x.id !== id));
    const res = await fetch(`/api/reports/schedules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete schedule");
      load();
    }
  }

  if (authorized !== true) return null;

  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-card">
      <div className="flex items-center gap-2 border-b border-pen-card-border px-4 py-2.5 sm:px-[18px]">
        <CalendarClock className="size-3.5 text-pen-blue" />
        <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
          SCHEDULED REPORTS
        </p>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-[18px]">
        {/* Create form */}
        <div className="flex flex-col gap-2 rounded-lg border border-pen-card-border bg-pen-bg p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.8px] text-pen-subtle">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekly cross-dept summary"
                className="h-9 w-[220px] rounded-lg border border-pen-card-border bg-pen-card px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue/60"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.8px] text-pen-subtle">Report</label>
              <SearchableSelect value={reportType} onChange={setReportType} options={REPORT_TYPE_OPTIONS} className="w-[170px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.8px] text-pen-subtle">Format</label>
              <SearchableSelect value={format} onChange={setFormat} options={FORMAT_OPTIONS} className="w-[130px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.8px] text-pen-subtle">Frequency</label>
              <SearchableSelect value={frequency} onChange={setFrequency} options={FREQ_OPTIONS} className="w-[120px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.8px] text-pen-subtle">Window (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value))}
                className="h-9 w-[90px] rounded-lg border border-pen-card-border bg-pen-card px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue/60"
              />
            </div>
            <button
              type="button"
              disabled={creating}
              onClick={createSchedule}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-pen-blue px-3 font-sans text-[12px] font-medium text-white disabled:opacity-50"
            >
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add schedule
            </button>
          </div>
        </div>

        {/* Schedules list */}
        {schedules.length > 0 && (
          <div className="flex flex-col divide-y divide-pen-card-border/60 rounded-lg border border-pen-card-border">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-[12.5px] font-medium text-pen-foreground">{s.name}</p>
                  <p className="font-sans text-[11px] text-pen-subtle">
                    {REPORT_TYPE_LABEL[s.reportType] ?? s.reportType} · {s.format} · {s.frequency === "WEEKLY" ? "Weekly" : "Daily"} · last {s.rangeDays}d · next {fmtDate(s.nextRunAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold",
                    s.enabled ? "bg-pen-green/10 text-pen-green" : "bg-pen-surface text-pen-subtle",
                  )}
                >
                  {s.enabled ? "Enabled" : "Paused"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-pen-subtle hover:text-red-500"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Recent generated reports */}
        <div>
          <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
            Recent generated reports
          </p>
          {exportsList.length === 0 ? (
            <p className="font-sans text-[12px] text-pen-subtle">No reports generated yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-pen-card-border/60 rounded-lg border border-pen-card-border">
              {exportsList.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[12.5px] text-pen-foreground">
                      {REPORT_TYPE_LABEL[e.reportType] ?? e.reportType} · {e.format}
                    </p>
                    <p className="font-sans text-[11px] text-pen-subtle">{fmtDate(e.completedAt ?? e.createdAt)}</p>
                  </div>
                  {e.status === "COMPLETED" && e.resultUrl ? (
                    <a
                      href={e.resultUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[11.5px] font-medium text-pen-foreground hover:bg-pen-bg"
                    >
                      <Download className="size-3.5" />
                      Download
                    </a>
                  ) : (
                    <span className="shrink-0 font-sans text-[11px] text-pen-subtle">
                      {e.status === "FAILED" ? "Failed" : "Generating…"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
