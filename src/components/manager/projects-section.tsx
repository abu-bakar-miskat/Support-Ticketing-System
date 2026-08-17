"use client";

import { useState } from "react";
import { Folder } from "lucide-react";
import { RailCard } from "./rail-card";
import type { ProjectHealth } from "./aggregate";

const VISIBLE = 5;

function ProjectRow({ p }: { p: ProjectHealth }) {
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  const barColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#0a76b9" : "#f97316";
  return (
    <div className="flex flex-col gap-1.5 border-b border-pen-card-border/40 px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="block size-[7px] shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
        <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-semibold text-pen-foreground">{p.name}</span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-pen-muted">
          {p.done}<span className="text-pen-subtle">/{p.total}</span>
        </span>
        <span className="w-[38px] shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums" style={{ color: barColor }}>
          {pct}%
        </span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-pen-surface">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <div className="flex items-center gap-3">
        {p.overdue > 0 && <span className="font-sans text-[10.5px] text-red-500">{p.overdue} overdue</span>}
        {p.active > 0 && <span className="font-sans text-[10.5px] text-pen-blue">{p.active} in progress</span>}
        {p.overdue === 0 && p.active === 0 && <span className="font-sans text-[10.5px] text-emerald-500">on track</span>}
      </div>
    </div>
  );
}

export function ProjectsSection({ projects }: { projects: ProjectHealth[] }) {
  const [showAll, setShowAll] = useState(false);
  if (projects.length === 0) return null;

  // Projects needing attention first: overdue desc, then in-progress desc.
  const sorted = [...projects].sort(
    (a, b) => (b.overdue - a.overdue) || (b.active - a.active) || (b.total - a.total),
  );
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE);
  const hidden = sorted.length - VISIBLE;

  return (
    <RailCard
      id="projects"
      icon={Folder}
      accent="#0a76b9"
      title="Projects"
      defaultOpen={false}
      aside={<span className="font-sans text-[11px] text-pen-subtle">{projects.length} in scope</span>}
    >
      <div className="max-h-[min(420px,48vh)] overflow-y-auto overscroll-contain">
        {visible.map((p) => <ProjectRow key={p.projectId ?? "none"} p={p} />)}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full px-4 py-2.5 text-center font-sans text-[11.5px] font-medium text-pen-muted transition-colors hover:bg-pen-surface/50 hover:text-pen-foreground"
        >
          {showAll ? "Show fewer projects" : `Show all ${projects.length} projects`}
        </button>
      )}
    </RailCard>
  );
}
