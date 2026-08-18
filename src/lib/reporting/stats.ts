/** RPT-02: mean/median helpers over a set of elapsed-time samples (minutes). */

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export type ResolutionStats = { count: number; meanMins: number | null; medianMins: number | null };

export function summarizeResolutionMinutes(minutes: number[]): ResolutionStats {
  return { count: minutes.length, meanMins: mean(minutes), medianMins: median(minutes) };
}
