"use client";

import { useEffect, useState } from "react";

type VolumeBucket = { category: string; type: string; count: number };
type VolumeReport = {
  current: VolumeBucket[];
  preceding: VolumeBucket[];
};
type ResolutionStats = { count: number; meanMins: number | null; medianMins: number | null };
type ResolutionReport = {
  current: Record<string, ResolutionStats>;
  preceding: Record<string, ResolutionStats>;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function sumCounts(buckets: VolumeBucket[]): number {
  return buckets.reduce((n, b) => n + b.count, 0);
}

/**
 * RPT-01/02/06: live volume and resolution-time panels on /reports.
 */
export function OpsReportPanels() {
  const [volume, setVolume] = useState<VolumeReport | null>(null);
  const [resolution, setResolution] = useState<ResolutionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const start = isoDaysAgo(30);
    const end = new Date().toISOString();
    const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    let cancelled = false;
    Promise.all([
      fetch(`/api/reports/query?reportType=volume&${qs}`).then((r) => r.json()),
      fetch(`/api/reports/query?reportType=resolution_time&${qs}`).then((r) => r.json()),
    ])
      .then(([vol, res]) => {
        if (cancelled) return;
        if (vol?.error || res?.error) {
          setError(vol?.error ?? res?.error ?? "Failed to load reports");
          return;
        }
        setVolume(vol);
        setResolution(res);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load reports");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentVolume = volume ? sumCounts(volume.current) : null;
  const precedingVolume = volume ? sumCounts(volume.preceding) : null;

  return (
    <section className="border-b border-sts-card-border px-6 py-5">
      <h2 className="font-sans text-sm font-semibold text-sts-foreground">Operations (last 30 days)</h2>
      {error && (
        <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">{error}</p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sts-card-border bg-sts-card p-4">
          <p className="font-sans text-[11.5px] font-medium uppercase tracking-wide text-sts-subtle">Volume</p>
          <p className="mt-1 font-sans text-2xl font-semibold text-sts-foreground">
            {currentVolume ?? "—"}
          </p>
          <p className="mt-1 font-sans text-[12px] text-sts-subtle">
            Preceding period: {precedingVolume ?? "—"}
          </p>
          {volume && volume.current.length > 0 && (
            <ul className="mt-3 space-y-1">
              {volume.current.slice(0, 6).map((b) => (
                <li key={`${b.category}-${b.type}`} className="flex justify-between font-sans text-[12.5px] text-sts-foreground">
                  <span className="truncate">{b.category} · {b.type}</span>
                  <span className="text-sts-subtle">{b.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-sts-card-border bg-sts-card p-4">
          <p className="font-sans text-[11.5px] font-medium uppercase tracking-wide text-sts-subtle">Resolution time</p>
          {resolution ? (
            <ul className="mt-3 space-y-1.5">
              {Object.entries(resolution.current).map(([priority, stats]) => (
                <li key={priority} className="flex justify-between font-sans text-[12.5px] text-sts-foreground">
                  <span className="capitalize">{priority}</span>
                  <span className="text-sts-subtle">
                    {stats.medianMins != null ? `${Math.round(stats.medianMins)}m median` : "—"}
                    {stats.meanMins != null ? ` · ${Math.round(stats.meanMins)}m mean` : ""}
                    {" · "}{stats.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">Loading…</p>
          )}
        </div>
      </div>
    </section>
  );
}
