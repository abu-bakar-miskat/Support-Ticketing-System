import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Columns3,
  FileStack,
  GanttChart,
  History,
  Inbox,
  KeyRound,
  Network,
  Tags,
  Timer,
  UserRoundCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Per-feature icon for template/marketplace cards, keyed by TemplateFeatureKey.
 * Shared by the Features marketplace and the Template Catalogue so both render
 * the same icon/graphic for a given feature. Falls back to `Tags`.
 */
export const FEATURE_ICONS: Record<string, LucideIcon> = {
  timeline: GanttChart,
  reports: BarChart3,
  subDepartmentReports: Network,
  calendar: CalendarDays,
  sharedMailboxes: Inbox,
  board: Columns3,
  activity: History,
  tagsLabels: Tags,
  workflows: Workflow,
  ticketTemplates: FileStack,
  assignmentMethods: UserRoundCheck,
  apiKeys: KeyRound,
  slaPolicies: Timer,
  supportForm: ClipboardList,
};

/** The icon for a feature key, or `Tags` when the key has no dedicated icon. */
export function featureIcon(key: string): LucideIcon {
  return FEATURE_ICONS[key] ?? Tags;
}

/**
 * Gradient preview header used on template cards. Renders a mini graphic for
 * the first feature key (or a fallback icon) over a tinted gradient.
 */
export function TemplatePreview({ featureKeys }: { featureKeys: string[] }) {
  const featureKey = featureKeys[0] ?? null;
  return (
    <div className="relative h-full w-full overflow-hidden bg-sts-surface">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--sts-blue) 20%, transparent), transparent 62%)",
        }}
      />
      <div className="relative flex h-full items-center justify-center px-6">
        <PreviewGraphic featureKey={featureKey} />
      </div>
    </div>
  );
}

function PreviewGraphic({ featureKey }: { featureKey: string | null }) {
  if (featureKey === "timeline") {
    return (
      <div className="flex w-full max-w-52 flex-col gap-2">
        <PreviewBar width="92%" />
        <PreviewBar width="58%" offset />
        <PreviewBar width="74%" />
      </div>
    );
  }
  if (featureKey === "reports") {
    const heights = ["42%", "78%", "55%", "92%", "64%"];
    return (
      <div className="flex h-16 w-full max-w-44 items-end gap-1.5">
        {heights.map((height) => (
          <div key={height} className="flex-1 rounded-sm bg-sts-blue/80" style={{ height }} />
        ))}
      </div>
    );
  }
  if (featureKey === "subDepartmentReports") {
    return (
      <div className="w-full max-w-44 font-sans text-[11px] text-sts-foreground">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-sts-blue" />
          <span className="h-2 w-16 rounded-full bg-sts-foreground/80" />
        </div>
        <div className="mt-1.5 ml-0.5 border-l border-sts-blue/40 pl-3">
          <div className="flex items-center gap-2 py-1">
            <span className="size-1.5 rounded-full bg-sts-blue/70" />
            <span className="h-1.5 w-12 rounded-full bg-sts-muted/70" />
          </div>
          <div className="flex items-center gap-2 py-1">
            <span className="size-1.5 rounded-full bg-sts-blue/70" />
            <span className="h-1.5 w-14 rounded-full bg-sts-muted/70" />
          </div>
        </div>
      </div>
    );
  }
  if (featureKey === "calendar") {
    return (
      <div className="grid w-full max-w-40 grid-cols-7 gap-1">
        {Array.from({ length: 21 }, (_, index) => (
          <span
            key={index}
            className={cn(
              "aspect-square rounded-[3px]",
              [3, 8, 9, 15, 16].includes(index) ? "bg-sts-blue" : "bg-sts-foreground/10",
            )}
          />
        ))}
      </div>
    );
  }
  if (featureKey === "sharedMailboxes") {
    return (
      <div className="flex w-full max-w-48 flex-col gap-1.5">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-2 rounded-md bg-sts-card/80 px-2 py-1.5">
            <span className="size-4 shrink-0 rounded-full bg-sts-blue/80" />
            <span className="h-1.5 flex-1 rounded-full bg-sts-foreground/15" />
          </div>
        ))}
      </div>
    );
  }
  if (featureKey === "tagsLabels") {
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="rounded-full bg-sts-blue px-2.5 py-1 font-sans text-[11px] font-medium text-white dark:text-gray-900">
          Urgent
        </span>
        <span className="rounded-full bg-sts-blue/20 px-2.5 py-1 font-sans text-[11px] font-medium text-sts-blue">
          Billing
        </span>
        <span className="rounded-full bg-sts-foreground/10 px-2.5 py-1 font-sans text-[11px] font-medium text-sts-foreground">
          VIP
        </span>
      </div>
    );
  }
  if (featureKey === "workflows") {
    return (
      <div className="flex w-full max-w-52 items-center">
        {["Open", "Doing", "Done"].map((label, index) => (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <span className={cn("size-3 rounded-full", index === 2 ? "bg-sts-blue" : "bg-sts-blue/35")} />
              <span className="font-sans text-[10px] text-sts-muted">{label}</span>
            </div>
            {index < 2 && <span className="mx-1 mb-4 h-px flex-1 bg-sts-blue/40" />}
          </div>
        ))}
      </div>
    );
  }
  if (featureKey === "ticketTemplates") {
    return (
      <div className="relative h-14 w-full max-w-40">
        <div className="absolute inset-x-3 top-0 h-12 rounded-md border border-sts-card-border bg-sts-card/70" />
        <div className="absolute inset-x-1.5 top-2 h-12 rounded-md border border-sts-card-border bg-sts-card px-2.5 py-2">
          <div className="h-1.5 w-10 rounded-full bg-sts-blue" />
          <div className="mt-1.5 h-1 w-full rounded-full bg-sts-foreground/15" />
          <div className="mt-1 h-1 w-2/3 rounded-full bg-sts-foreground/10" />
        </div>
      </div>
    );
  }
  if (featureKey === "assignmentMethods") {
    return (
      <div className="flex items-center gap-2">
        <span className="size-8 rounded-full bg-sts-blue/80" />
        <span className="h-px w-8 bg-sts-blue/50" />
        <span className="h-8 w-16 rounded-md bg-sts-card px-2 py-1.5 shadow-sm">
          <span className="block h-1.5 w-8 rounded-full bg-sts-foreground/20" />
          <span className="mt-1 block h-1 w-5 rounded-full bg-sts-blue/70" />
        </span>
      </div>
    );
  }
  if (featureKey === "board") {
    return (
      <div className="flex w-full max-w-52 gap-1.5">
        {["To do", "Doing", "Done"].map((label) => (
          <div key={label} className="flex flex-1 flex-col gap-1 rounded-md bg-sts-card/80 p-1.5">
            <span className="font-sans text-[10px] text-sts-muted">{label}</span>
            <span className="h-6 rounded-sm bg-sts-blue/25" />
            <span className="h-6 rounded-sm bg-sts-foreground/10" />
          </div>
        ))}
      </div>
    );
  }
  if (featureKey === "activity") {
    return (
      <div className="flex w-full max-w-48 flex-col gap-1.5">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full bg-sts-blue/70" />
            <span className="h-1.5 flex-1 rounded-full bg-sts-foreground/15" />
          </div>
        ))}
      </div>
    );
  }
  if (featureKey === "slaPolicies") {
    return (
      <div className="flex w-full max-w-44 flex-col gap-2">
        <div className="h-2 overflow-hidden rounded-full bg-sts-foreground/10">
          <div className="h-full w-2/3 rounded-full bg-sts-blue" />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sts-foreground/10">
          <div className="h-full w-1/3 rounded-full bg-sts-blue/60" />
        </div>
      </div>
    );
  }
  if (featureKey === "supportForm") {
    return (
      <div className="w-full max-w-40 rounded-lg bg-sts-card px-3 py-2.5 shadow-sm">
        <div className="h-1.5 w-16 rounded-full bg-sts-blue" />
        <div className="mt-2 h-5 rounded-md border border-sts-card-border" />
        <div className="mt-1.5 h-5 rounded-md border border-sts-card-border" />
      </div>
    );
  }
  if (featureKey === "apiKeys") {
    return (
      <div className="w-full max-w-48 rounded-lg bg-sts-card px-3 py-2 font-mono text-[12px] text-sts-foreground shadow-sm">
        sk_live_••••••••
      </div>
    );
  }
  const Icon = (featureKey && FEATURE_ICONS[featureKey]) || Tags;
  return (
    <span className="flex size-12 items-center justify-center rounded-2xl bg-sts-blue-tint text-sts-blue">
      <Icon className="size-6" />
    </span>
  );
}

function PreviewBar({ width, offset = false }: { width: string; offset?: boolean }) {
  return (
    <div className={cn("h-2.5 rounded-full bg-sts-foreground/10", offset && "ml-6")}>
      <div className="h-full rounded-full bg-sts-blue" style={{ width }} />
    </div>
  );
}
