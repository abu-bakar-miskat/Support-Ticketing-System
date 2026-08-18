/**
 * RPT-03: "compared to the preceding equivalent range" — given the report's
 * requested [start, end), returns the immediately-preceding window of the
 * same length, so every report can show current-vs-previous deltas.
 */
export function precedingEquivalentRange(start: Date, end: Date): { start: Date; end: Date } {
  const lengthMs = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - lengthMs),
    end: new Date(start.getTime()),
  };
}
