// Project lifecycle stages: an ordered, per-project editable list. Each stage
// has a name, color, and an optional date period (start + optional end).
// Stored in Project.lifecycleStages (JSON). Older projects fall back to the
// built-in defaults, backfilled from the legacy pipeline/development/live date
// columns so existing data still renders.

export type LifecycleStage = {
  id: string;
  label: string;
  color: string;
  startDate: string | null; // "YYYY-MM-DD" or null
  endDate: string | null; // "YYYY-MM-DD" or null
};

export const LIFECYCLE_STAGE_COLORS = [
  "#94a3b8", // slate
  "#f97316", // orange
  "#059669", // green
  "#0a76b9", // blue
  "#8b5cf6", // violet
  "#e11d48", // rose
  "#eab308", // amber
  "#14b8a6", // teal
] as const;

export const DEFAULT_LIFECYCLE_STAGES: LifecycleStage[] = [
  { id: "pipeline", label: "Pipeline", color: "#94a3b8", startDate: null, endDate: null },
  { id: "in_development", label: "In Development", color: "#f97316", startDate: null, endDate: null },
  { id: "live", label: "Live", color: "#059669", startDate: null, endDate: null },
];

// ISO datetime / Date / "YYYY-MM-DD" → "YYYY-MM-DD" (or null)
function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (isNaN(value.getTime())) return null;
  // Prefer local Y-M-D for Date objects from legacy columns / drivers.
  const y = value.getFullYear();
  const mo = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function isValidStage(v: unknown): v is LifecycleStage {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.label === "string" && typeof s.color === "string";
}

/**
 * Sanitize an arbitrary value (from the client / DB JSON) into a clean stage
 * array. Returns null when the input isn't a usable array.
 */
export function sanitizeLifecycleStages(value: unknown): LifecycleStage[] | null {
  if (!Array.isArray(value)) return null;
  const cleaned = value.filter(isValidStage).map((s) => {
    const raw = s as Record<string, unknown>;
    return {
      id: String(s.id),
      label: String(s.label).slice(0, 60),
      color: String(s.color),
      startDate: toDateOnly(
        typeof raw.startDate === "string" || raw.startDate instanceof Date
          ? (raw.startDate as string | Date)
          : null,
      ),
      endDate: toDateOnly(
        typeof raw.endDate === "string" || raw.endDate instanceof Date
          ? (raw.endDate as string | Date)
          : null,
      ),
    };
  });
  return cleaned.length > 0 ? cleaned : null;
}

type LifecycleSource = {
  lifecycleStages?: unknown;
  pipelineStartedAt?: string | Date | null;
  developmentStartedAt?: string | Date | null;
  liveAt?: string | Date | null;
};

/**
 * Resolve the stages to display for a project: stored custom stages when
 * present, otherwise the defaults backfilled from the legacy date columns.
 */
export function resolveLifecycleStages(project: LifecycleSource): LifecycleStage[] {
  const stored = sanitizeLifecycleStages(project.lifecycleStages);
  if (stored) return stored;

  const pipelineStart = toDateOnly(project.pipelineStartedAt);
  const devStart = toDateOnly(project.developmentStartedAt);
  const live = toDateOnly(project.liveAt);

  return [
    { ...DEFAULT_LIFECYCLE_STAGES[0], startDate: pipelineStart, endDate: devStart },
    { ...DEFAULT_LIFECYCLE_STAGES[1], startDate: devStart, endDate: live },
    { ...DEFAULT_LIFECYCLE_STAGES[2], startDate: live, endDate: null },
  ];
}

// Parse "YYYY-MM-DD" (or ISO) as a local Date.
function parseStageDateLocal(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Short date range for a stage, e.g. "Aug 5 – Aug 28, 2026", or just the start
 * date when there's no end ("Aug 5, 2026"). Returns null when there's no start.
 */
export function formatStageRange(stage: LifecycleStage | null | undefined): string | null {
  const start = parseStageDateLocal(stage?.startDate ?? null);
  if (!start) return null;
  const end = parseStageDateLocal(stage?.endDate ?? null);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  if (!end) return startStr;
  // Drop the year on the start when both dates share it, to stay compact.
  const startShort =
    start.getFullYear() === end.getFullYear()
      ? start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : startStr;
  return `${startShort} – ${end.toLocaleDateString("en-US", opts)}`;
}

/** The stage matching the project's current status, or the first stage. */
export function resolveCurrentStage(
  stages: LifecycleStage[],
  projectStatus: string | null | undefined,
): LifecycleStage | null {
  if (stages.length === 0) return null;
  return stages.find((s) => s.id === projectStatus) ?? stages[0];
}

/** Stable API shape for a lifecycle stage (always includes date fields). */
export type LifecycleStageApi = {
  id: string;
  label: string;
  color: string;
  startDate: string | null;
  endDate: string | null;
};

export function toLifecycleStageApi(stage: LifecycleStage): LifecycleStageApi {
  return {
    id: stage.id,
    label: stage.label,
    color: stage.color,
    startDate: stage.startDate ?? null,
    endDate: stage.endDate ?? null,
  };
}

export function toLifecycleStagesApi(stages: LifecycleStage[]): LifecycleStageApi[] {
  return stages.map(toLifecycleStageApi);
}

/**
 * Staff/leads only get the current stage; admins/managers get the full list.
 */
export function visibleLifecycleStages(
  stages: LifecycleStage[],
  projectStatus: string | null | undefined,
  canViewFull: boolean,
): LifecycleStage[] {
  if (canViewFull) return stages;
  const current = resolveCurrentStage(stages, projectStatus);
  return current ? [current] : [];
}
