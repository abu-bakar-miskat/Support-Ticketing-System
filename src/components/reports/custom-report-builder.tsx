"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X, FileText, Table2 } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";

type ReportField = {
  id: string;
  label: string;
  type: string;
  options: string[];
  formName: string;
};

type Bucket = { value: string; count: number };
type FilterRow = { fieldId: string; value: string };

function isoStart(day: string) {
  return `${day}T00:00:00.000Z`;
}
function isoEnd(day: string) {
  return `${day}T23:59:59.999Z`;
}

/**
 * RPT-04: ephemeral custom-report builder. A Department Admin picks one of their
 * own form fields to group ticket counts by (+ optional field/value filters),
 * previews the result for the selected range, and exports it as CSV or PDF.
 */
export function CustomReportBuilder({ from, to }: { from: string; to: string }) {
  const [fields, setFields] = useState<ReportField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [groupByFieldId, setGroupByFieldId] = useState("");
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<"CSV" | "PDF" | null>(null);

  useEffect(() => {
    fetch("/api/reports/fields")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load fields"))))
      .then((d: { fields: ReportField[] }) => setFields(d.fields))
      .catch(() => toast.error("Could not load form fields"))
      .finally(() => setFieldsLoading(false));
  }, []);

  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const cleanFilters = filters.filter((f) => f.fieldId && f.value.trim());

  function buildQuery() {
    const params = new URLSearchParams({
      reportType: "custom_field",
      start: isoStart(from),
      end: isoEnd(to),
      groupByFieldId,
    });
    if (cleanFilters.length) params.set("filters", JSON.stringify(cleanFilters));
    return params.toString();
  }

  async function runPreview() {
    if (!groupByFieldId) return;
    setRunning(true);
    setBuckets(null);
    try {
      const res = await fetch(`/api/reports/query?${buildQuery()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Report failed");
      setBuckets(json.buckets ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    } finally {
      setRunning(false);
    }
  }

  async function exportReport(format: "CSV" | "PDF") {
    if (!groupByFieldId) return;
    setExporting(format);
    try {
      const res = await fetch("/api/reports/export-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "custom_field",
          format,
          start: isoStart(from),
          end: isoEnd(to),
          groupByFieldId,
          filters: cleanFilters,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Export failed");
      }
      const blob = await res.blob();
      const label = fieldById.get(groupByFieldId)?.label ?? "custom-report";
      const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${format.toLowerCase()}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const maxCount = buckets && buckets.length ? Math.max(...buckets.map((b) => b.count)) : 1;

  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-card">
      <div className="border-b border-pen-card-border px-4 py-2.5 sm:px-[18px]">
        <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
          CUSTOM REPORT
        </p>
        <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
          Group ticket counts by one of your form fields for the selected range.
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4 sm:px-[18px]">
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
            Group by field
          </label>
          <SearchableSelect
            value={groupByFieldId}
            onChange={(v) => { setGroupByFieldId(v); setBuckets(null); }}
            options={fields.map((f) => ({ value: f.id, label: `${f.label} · ${f.formName}` }))}
            placeholder={fieldsLoading ? "Loading fields…" : "Select a form field…"}
            searchPlaceholder="Search fields…"
            emptyLabel={fieldsLoading ? "Loading…" : "No custom fields found"}
            disabled={fieldsLoading}
            className="w-full sm:w-[360px]"
          />
        </div>

        {/* Optional filters */}
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[0.9px] text-pen-subtle">
            Filters (optional)
          </label>
          {filters.map((row, i) => {
            const field = fieldById.get(row.fieldId);
            return (
              <div key={i} className="flex items-center gap-2">
                <SearchableSelect
                  value={row.fieldId}
                  onChange={(v) =>
                    setFilters((prev) => prev.map((r, idx) => (idx === i ? { ...r, fieldId: v, value: "" } : r)))
                  }
                  options={fields.map((f) => ({ value: f.id, label: f.label }))}
                  placeholder="Field…"
                  className="w-[180px]"
                />
                {field && field.options.length > 0 ? (
                  <SearchableSelect
                    value={row.value}
                    onChange={(v) =>
                      setFilters((prev) => prev.map((r, idx) => (idx === i ? { ...r, value: v } : r)))
                    }
                    options={field.options.map((o) => ({ value: o, label: o }))}
                    placeholder="Value…"
                    className="w-[180px]"
                  />
                ) : (
                  <input
                    value={row.value}
                    onChange={(e) =>
                      setFilters((prev) => prev.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))
                    }
                    placeholder="Value…"
                    className="h-9 w-[180px] rounded-lg border border-pen-card-border bg-pen-bg px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue/60"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setFilters((prev) => prev.filter((_, idx) => idx !== i))}
                  className="inline-flex size-7 items-center justify-center rounded-md text-pen-subtle hover:text-red-500"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setFilters((prev) => [...prev, { fieldId: "", value: "" }])}
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] font-medium text-pen-muted hover:text-pen-foreground"
          >
            <Plus className="size-3.5" />
            Add filter
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!groupByFieldId || running}
            onClick={runPreview}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white disabled:opacity-50"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Table2 className="size-3.5" />}
            Run preview
          </button>
          <button
            type="button"
            disabled={!groupByFieldId || exporting !== null}
            onClick={() => exportReport("CSV")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-3 font-sans text-[12px] font-medium text-pen-foreground hover:bg-pen-bg disabled:opacity-50"
          >
            {exporting === "CSV" ? <Loader2 className="size-3.5 animate-spin" /> : <Table2 className="size-3.5" />}
            Export CSV
          </button>
          <button
            type="button"
            disabled={!groupByFieldId || exporting !== null}
            onClick={() => exportReport("PDF")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-3 font-sans text-[12px] font-medium text-pen-foreground hover:bg-pen-bg disabled:opacity-50"
          >
            {exporting === "PDF" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
            Export PDF
          </button>
        </div>

        {/* Preview */}
        {buckets && (
          buckets.length === 0 ? (
            <p className="font-sans text-[12px] text-pen-subtle">No tickets matched for this range.</p>
          ) : (
            <div className="mt-1 flex flex-col divide-y divide-pen-card-border/60 rounded-lg border border-pen-card-border">
              {buckets.map((b) => (
                <div key={b.value} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">{b.value}</span>
                  <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-pen-surface sm:block">
                    <div className="h-full rounded-full bg-pen-blue" style={{ width: `${Math.max(4, Math.round((b.count / maxCount) * 100))}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-pen-foreground">{b.count}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
