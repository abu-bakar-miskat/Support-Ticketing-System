"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  type LifecycleStage,
  LIFECYCLE_STAGE_COLORS,
} from "@/lib/project-lifecycle";

export type NewLifecycleStageInput = {
  label: string;
  startDate: string | null;
  endDate: string | null;
  color: string;
};

// ── Date helpers ────────────────────────────────────────────────────────────

function parseStageDate(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatStageDate(value: string | null): string {
  const d = parseStageDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function durationLabel(start: string | null, end: string | null): string | null {
  const s = parseStageDate(start);
  if (!s) return null;
  const e = parseStageDate(end) ?? new Date();
  const days = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
  if (days < 1) return "<1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  const rem = days % 30;
  return rem > 0 ? `${months}mo ${rem}d` : `${months}mo`;
}

function stageRangeText(stage: LifecycleStage, isLast: boolean): {
  rangeText: string;
  duration: string | null;
} {
  const single = !!stage.startDate && !stage.endDate && isLast;
  const duration = single ? null : durationLabel(stage.startDate, stage.endDate);
  const rangeText = !stage.startDate
    ? "—"
    : single
      ? formatStageDate(stage.startDate)
      : `${formatStageDate(stage.startDate)} – ${stage.endDate ? formatStageDate(stage.endDate) : "now"}`;
  return { rangeText, duration };
}

// ── Lifecycle stepper ─────────────────────────────────────────────────────────

/**
 * Status select + lifecycle timeline/editor. Current stage is chosen from the
 * Status dropdown; the matching stage expands for name/color/date editing.
 * Adding a stage opens an inline form (name + dates) before save.
 */
export function LifecycleStepper({
  stages,
  status,
  canEdit,
  onSelectStatus,
  onUpdateStage,
  onMoveStage,
  onDeleteStage,
  onAddStage,
}: {
  stages: LifecycleStage[];
  status: string;
  canEdit: boolean;
  onSelectStatus: (id: string) => void;
  onUpdateStage: (id: string, patch: Partial<LifecycleStage>) => void;
  onMoveStage: (index: number, dir: -1 | 1) => void;
  onDeleteStage: (id: string) => void;
  onAddStage: (input: NewLifecycleStageInput) => void;
}) {
  const matchedIndex = stages.findIndex((s) => s.id === status);
  const activeIndex = matchedIndex >= 0 ? matchedIndex : 0;
  const activeStage = stages[activeIndex] ?? null;

  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState<string>(LIFECYCLE_STAGE_COLORS[0]);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  function openAddForm() {
    setDraftLabel("");
    setDraftColor(LIFECYCLE_STAGE_COLORS[stages.length % LIFECYCLE_STAGE_COLORS.length]);
    setDraftStart("");
    setDraftEnd("");
    setAdding(true);
  }

  function cancelAddForm() {
    setAdding(false);
    setDraftLabel("");
    setDraftStart("");
    setDraftEnd("");
    setSavingDraft(false);
  }

  function saveAddForm() {
    const label = draftLabel.trim();
    if (!label || savingDraft) return;
    setSavingDraft(true);
    onAddStage({
      label,
      color: draftColor,
      startDate: draftStart || null,
      endDate: draftEnd || null,
    });
    setAdding(false);
    setDraftLabel("");
    setDraftStart("");
    setDraftEnd("");
    setSavingDraft(false);
  }

  useEffect(() => {
    if (adding) labelInputRef.current?.focus();
  }, [adding]);

  return (
    <div className="mb-3 flex flex-col gap-3">
      {/* Current stage select */}
      <div className="flex flex-col gap-1.5">
        <label className="pen-text-label">Status</label>
        {canEdit ? (
          <SearchableSelect
            aria-label="Current stage"
            value={activeStage?.id ?? ""}
            onChange={(v) => {
              if (v && v !== status) onSelectStatus(v);
            }}
            options={stages.map((s) => ({
              value: s.id,
              label: s.label,
              color: s.color,
            }))}
            placeholder="Select stage…"
            searchable={stages.length > 8}
            leadingDot
            className="bg-pen-surface"
          />
        ) : (
          <div className="flex h-9 items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-3">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: activeStage?.color ?? "#94a3b8" }}
            />
            <span className="font-sans text-[13px] text-pen-foreground">
              {activeStage?.label ?? "—"}
            </span>
          </div>
        )}
      </div>

      {/* Timeline + editor */}
      <div className="flex flex-col gap-2">
        <label className="pen-text-label">Lifecycle</label>

        <div className="rounded-lg border border-pen-card-border bg-pen-surface px-2 py-2">
          {stages.length === 0 && !adding && (
            <span className="block px-1.5 py-1 font-sans text-[12px] text-pen-subtle">
              No stages yet.
            </span>
          )}

          <ol className="flex flex-col">
            {stages.map((stage, i) => {
              const isActive = i === activeIndex;
              const isPast = i < activeIndex;
              const isLast = i === stages.length - 1 && !adding;
              const { rangeText, duration } = stageRangeText(stage, isLast);

              return (
                <li key={stage.id} className="relative flex gap-2.5">
                  <div className="flex w-4 shrink-0 flex-col items-center pt-2.5">
                    <span
                      className={cn(
                        "relative z-1 size-2.5 shrink-0 rounded-full ring-2 ring-pen-surface",
                        isActive && "size-3",
                      )}
                      style={
                        isActive
                          ? { backgroundColor: stage.color }
                          : isPast
                            ? { backgroundColor: stage.color, opacity: 0.55 }
                            : {
                                backgroundColor: "transparent",
                                border: `1.5px solid ${stage.color}`,
                                opacity: 0.55,
                              }
                      }
                      aria-hidden
                    />
                    {(!isLast || adding) && (
                      <span
                        className="mt-1 min-h-3 w-px flex-1 bg-pen-card-border"
                        aria-hidden
                      />
                    )}
                  </div>

                  <div
                    className={cn(
                      "mb-1 min-w-0 flex-1 rounded-lg px-2 py-1.5",
                      isActive && "bg-pen-bg/80 dark:bg-white/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "truncate font-sans text-[12.5px]",
                            isActive
                              ? "font-semibold text-pen-foreground"
                              : "font-medium text-pen-muted",
                          )}
                        >
                          {stage.label}
                        </span>
                        {isActive && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-px font-sans text-[10px] font-semibold uppercase tracking-[0.3px]"
                            style={{
                              backgroundColor: `${stage.color}22`,
                              color: stage.color,
                            }}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-pen-muted">
                        <span>{rangeText}</span>
                        {duration && (
                          <span className="text-pen-subtle">· {duration}</span>
                        )}
                      </span>
                    </div>

                    {canEdit && isActive && (
                      <div className="mt-2.5 flex flex-col gap-2 border-t border-pen-card-border/70 pt-2.5">
                        <div className="flex items-center gap-2">
                          <label
                            className="relative size-5 shrink-0 cursor-pointer rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: stage.color }}
                            title="Stage color"
                          >
                            <input
                              type="color"
                              value={stage.color}
                              onChange={(e) =>
                                onUpdateStage(stage.id, { color: e.target.value })
                              }
                              className="absolute inset-0 cursor-pointer opacity-0"
                            />
                          </label>
                          <input
                            type="text"
                            key={`${stage.id}-${stage.label}`}
                            defaultValue={stage.label}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== stage.label) {
                                onUpdateStage(stage.id, { label: v });
                              }
                            }}
                            placeholder="Stage name"
                            className="h-8 min-w-0 flex-1 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue"
                          />
                          <button
                            type="button"
                            onClick={() => onMoveStage(i, -1)}
                            disabled={i === 0}
                            aria-label="Move up"
                            className="inline-flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-pen-card hover:text-pen-foreground disabled:opacity-30"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveStage(i, 1)}
                            disabled={i === stages.length - 1}
                            aria-label="Move down"
                            className="inline-flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-pen-card hover:text-pen-foreground disabled:opacity-30"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStage(stage.id)}
                            aria-label="Delete stage"
                            className="inline-flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-pen-red/10 hover:text-pen-red"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-sans text-[10.5px] uppercase tracking-[0.5px] text-pen-subtle">
                              Start
                            </label>
                            <input
                              type="date"
                              value={stage.startDate ?? ""}
                              onChange={(e) =>
                                onUpdateStage(stage.id, {
                                  startDate: e.target.value || null,
                                })
                              }
                              className="h-8 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-sans text-[10.5px] uppercase tracking-[0.5px] text-pen-subtle">
                              End{" "}
                              <span className="normal-case text-pen-subtle/70">
                                (optional)
                              </span>
                            </label>
                            <input
                              type="date"
                              value={stage.endDate ?? ""}
                              onChange={(e) =>
                                onUpdateStage(stage.id, {
                                  endDate: e.target.value || null,
                                })
                              }
                              className="h-8 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}

            {adding && (
              <li className="relative flex gap-2.5">
                <div className="flex w-4 shrink-0 flex-col items-center pt-2.5">
                  <span
                    className="relative z-1 size-2.5 shrink-0 rounded-full ring-2 ring-pen-surface"
                    style={{ backgroundColor: draftColor }}
                    aria-hidden
                  />
                </div>
                <div className="mb-1 min-w-0 flex-1 rounded-lg bg-pen-bg/80 px-2 py-2 dark:bg-white/5">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <label
                        className="relative size-5 shrink-0 cursor-pointer rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: draftColor }}
                        title="Stage color"
                      >
                        <input
                          type="color"
                          value={draftColor}
                          onChange={(e) => setDraftColor(e.target.value)}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                      <input
                        ref={labelInputRef}
                        type="text"
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveAddForm();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelAddForm();
                          }
                        }}
                        placeholder="Stage name"
                        className="h-8 min-w-0 flex-1 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-blue"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="font-sans text-[10.5px] uppercase tracking-[0.5px] text-pen-subtle">
                          Start
                        </label>
                        <input
                          type="date"
                          value={draftStart}
                          onChange={(e) => setDraftStart(e.target.value)}
                          className="h-8 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-sans text-[10.5px] uppercase tracking-[0.5px] text-pen-subtle">
                          End{" "}
                          <span className="normal-case text-pen-subtle/70">
                            (optional)
                          </span>
                        </label>
                        <input
                          type="date"
                          value={draftEnd}
                          onChange={(e) => setDraftEnd(e.target.value)}
                          className="h-8 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelAddForm}
                        className="h-7 rounded-lg border border-pen-card-border px-3 font-sans text-[11.5px] text-pen-muted transition-colors hover:bg-pen-card hover:text-pen-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveAddForm}
                        disabled={!draftLabel.trim() || savingDraft}
                        className="flex h-7 items-center gap-1.5 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:text-gray-900"
                      >
                        {savingDraft ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )}
          </ol>
        </div>

        {canEdit && !adding && (
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-pen-card-border py-2 font-sans text-[12px] font-medium text-pen-muted transition-colors hover:border-pen-blue/40 hover:text-pen-foreground"
          >
            <Plus className="size-3.5" /> Add stage
          </button>
        )}
      </div>
    </div>
  );
}
