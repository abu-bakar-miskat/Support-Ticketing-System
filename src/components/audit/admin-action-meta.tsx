import {
  History,
  Plus,
  Minus,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  Ban,
  ToggleLeft,
  ToggleRight,
  RotateCw,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Presentation metadata + change-diff rendering for admin `AuditEvent` rows.
// Shared by the platform audit log and the unified audit feed.

// Every targetType string currently written via lib/audit-log.ts recordAuditEvent.
export const TARGET_TYPES = [
  "Agreement",
  "AgreementDocument",
  "AssignmentRule",
  "DepartmentManager",
  "EmailTemplate",
  "FeatureFlag",
  "Profile",
  "SlaPolicy",
  "Tenant",
  "TenantTemplate",
  "TemplateRequest",
] as const;

// Audit actions follow a `TARGET_VERB` shape (SLA_POLICY_CREATED, FEATURE_FLAG_
// DISABLED, …). The trailing verb drives the icon + colour so new actions get a
// sensible badge for free.
const VERB_META: Record<string, { icon: LucideIcon; color: string }> = {
  CREATED: { icon: Plus, color: "#059669" },
  ADDED: { icon: Plus, color: "#059669" },
  GRANTED: { icon: UserPlus, color: "#059669" },
  ENABLED: { icon: ToggleRight, color: "#059669" },
  RESTORED: { icon: RotateCw, color: "#059669" },
  REACTIVATED: { icon: RotateCw, color: "#059669" },
  UPDATED: { icon: Pencil, color: "#0a76b9" },
  CHANGED: { icon: Pencil, color: "#0a76b9" },
  DELETED: { icon: Trash2, color: "#dc2626" },
  REMOVED: { icon: Minus, color: "#dc2626" },
  REVOKED: { icon: UserMinus, color: "#dc2626" },
  DISABLED: { icon: ToggleLeft, color: "#dc2626" },
  SUSPENDED: { icon: Ban, color: "#f97316" },
};
const FALLBACK_META = { icon: History, color: "#64748b" };

// Words kept upper-case when a raw action is turned into a readable phrase.
const ACRONYMS = new Set(["SLA", "QA", "PR"]);

export function adminActionMeta(action: string) {
  const verb = action.split("_").pop() ?? "";
  return VERB_META[verb] ?? FALLBACK_META;
}

/** "FEATURE_FLAG_DISABLED" → "disabled feature flag" */
export function humanizeAction(action: string): string {
  const parts = action.split("_");
  if (parts.length === 0) return action.toLowerCase();
  const verb = parts[parts.length - 1].toLowerCase();
  const target = parts
    .slice(0, -1)
    .map((w) => (ACRONYMS.has(w) ? w : w.toLowerCase()))
    .join(" ");
  return target ? `${verb} ${target}` : verb;
}

// ── Before/after diff ───────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Compact, human-readable rendering of a single field value. */
function formatValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "—";
  if (typeof v === "string") return v.length ? v : '""';
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Top-level keys whose value actually changed between before and after. */
function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

const preClass =
  "overflow-x-auto rounded-lg border border-sts-card-border bg-sts-surface p-2.5 font-mono text-[11px] leading-relaxed text-sts-muted";

/**
 * Show only what changed. For two plain objects we render a field-level
 * "before → after" table (the common case). Create/delete events (one side
 * null) list the present object's fields. Arrays / primitives fall back to a
 * compact JSON view.
 */
export function ChangeDiff({ before, after }: { before: unknown; after: unknown }) {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = changedKeys(before, after);
    if (keys.length === 0) {
      return <p className="font-sans text-[11.5px] text-sts-subtle">No field changes recorded.</p>;
    }
    return (
      <div className="overflow-hidden rounded-lg border border-sts-card-border">
        {keys.map((k, i) => (
          <div
            key={k}
            className={cn(
              "grid grid-cols-[minmax(90px,140px)_1fr] gap-2 px-2.5 py-1.5",
              i > 0 && "border-t border-sts-card-border/60",
            )}
          >
            <span className="truncate font-mono text-[11px] text-sts-subtle" title={k}>{k}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <span className="break-all text-sts-muted line-through decoration-sts-red/50">
                {formatValue(before[k])}
              </span>
              <ArrowRight className="size-3 shrink-0 text-sts-subtle" />
              <span className="break-all font-medium text-sts-foreground">{formatValue(after[k])}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Create (before null) or delete (after null) with an object payload.
  const present = isPlainObject(after) ? after : isPlainObject(before) ? before : null;
  if (present && (before == null || after == null)) {
    return (
      <div className="overflow-hidden rounded-lg border border-sts-card-border">
        {Object.entries(present).map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              "grid grid-cols-[minmax(90px,140px)_1fr] gap-2 px-2.5 py-1.5",
              i > 0 && "border-t border-sts-card-border/60",
            )}
          >
            <span className="truncate font-mono text-[11px] text-sts-subtle" title={k}>{k}</span>
            <span className="min-w-0 break-all font-mono text-[11px] text-sts-foreground">{formatValue(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  // Fallback for arrays / primitives — compact JSON, side by side.
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {before != null && (
        <div>
          <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-subtle">Before</p>
          <pre className={preClass}>{JSON.stringify(before, null, 2)}</pre>
        </div>
      )}
      {after != null && (
        <div>
          <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-subtle">After</p>
          <pre className={preClass}>{JSON.stringify(after, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
