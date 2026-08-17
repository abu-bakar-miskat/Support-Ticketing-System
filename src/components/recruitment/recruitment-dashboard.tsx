"use client"

import { useMemo, useState } from "react"
import { Archive, ArrowRight, History, Star, TrendingUp, UserCheck, UserX, Users, MailX, Hourglass } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { CHIP_DOT_CLASSES } from "./cells"
import type { BoardStats, RecruitmentStats } from "@/lib/recruitment-stats"

function fmtDate(day: string | null): string {
  if (!day) return "—"
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  tone?: "green" | "red" | "yellow" | "blue" | "gray"
}) {
  const tones: Record<string, string> = {
    green: "text-emerald-500",
    red: "text-red-500",
    yellow: "text-yellow-500",
    blue: "text-blue-500",
    gray: "text-muted-foreground",
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn("size-3.5", tone ? tones[tone] : "")} />
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** Horizontal bar row: label left, thin colored bar, count right. Identity is in the label, not color alone. */
function BarRow({
  label,
  count,
  max,
  dotClass,
  barClass,
}: {
  label: string
  count: number
  max: number
  dotClass?: string
  barClass: string
}) {
  const pct = max > 0 ? Math.max((count / max) * 100, 2) : 0
  return (
    <div className="flex items-center gap-2.5" title={`${label}: ${count}`}>
      <div className="flex w-28 min-w-0 shrink-0 items-center gap-1.5 sm:w-44">
        {dotClass && <span className={cn("size-2 shrink-0 rounded-full", dotClass)} />}
        <span className="truncate text-xs text-foreground">{label}</span>
      </div>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
    </div>
  )
}

function Card({ title, children, empty }: { title: string; children?: React.ReactNode; empty?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {empty ? <p className="py-4 text-center text-xs text-muted-foreground">No data yet</p> : children}
    </div>
  )
}

/** Weekly intake as a compact column chart (single hue, magnitude job). */
function WeeklyChart({ weeks }: { weeks: BoardStats["byWeek"] }) {
  const max = Math.max(...weeks.map((w) => w.count), 1)
  return (
    <div className="flex h-28 items-end gap-1 overflow-x-auto [scrollbar-width:thin]">
      {weeks.map((w) => (
        <div key={w.week} className="group flex min-w-8 flex-1 flex-col items-center gap-1" title={`Week of ${fmtDate(w.week)}: ${w.count}`}>
          <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {w.count}
          </span>
          <div
            className="w-full max-w-8 rounded-t bg-blue-500/80"
            style={{ height: `${Math.max((w.count / max) * 80, 4)}px` }}
          />
          <span className="truncate text-[9px] text-muted-foreground">
            {new Date(`${w.week}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        </div>
      ))}
    </div>
  )
}

export function RecruitmentDashboard({
  stats,
  onOpenBoard,
}: {
  stats: RecruitmentStats
  onOpenBoard: (id: string) => void
}) {
  const [scope, setScope] = useState<string>("overall")
  const current = useMemo(
    () => (scope === "overall" ? stats.overall : stats.boards.find((b) => b.id === scope) ?? stats.overall),
    [scope, stats],
  )
  const activeBoards = stats.boards.filter((b) => !b.archived)
  const past = stats.boards.filter((b) => b.archived)
  const scopedArchived = past.find((b) => b.id === scope)
  const maxStage = Math.max(...current.stages.map((s) => s.count), 1)
  const maxReason = Math.max(...current.rejectReasons.map((r) => r.count), 1)
  const maxRating = Math.max(...current.ratings, 1)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      {/* Scope filter */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[{ id: "overall", name: "All recruitments" }, ...activeBoards].map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setScope(b.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm",
              scope === b.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {b.name}
          </button>
        ))}
        {scopedArchived && (
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-muted px-2.5 py-1 text-sm font-medium text-foreground">
            <Archive className="size-3 text-muted-foreground" /> {scopedArchived.name}
          </span>
        )}
        {past.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-sm text-muted-foreground outline-none hover:bg-muted/60">
              <History className="size-3.5" /> History
              <span className="text-xs">{past.length}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                  Archived boards
                </DropdownMenuLabel>
                {past.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => setScope(b.id)}>
                    <Archive className="size-3.5" /> {b.name}
                    <span className="ml-auto text-xs text-muted-foreground">{b.total}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Headline tiles */}
      <div className="grid shrink-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={Users} label="Candidates" value={current.total} sub={`${fmtDate(current.firstDate)} → ${fmtDate(current.lastDate)}`} />
        <StatTile icon={UserCheck} label="Hired" value={current.hired} tone="green" sub={current.total ? `${Math.round((current.hired / current.total) * 100)}% of pipeline` : undefined} />
        <StatTile icon={Hourglass} label="In progress" value={current.inProgress} tone="blue" />
        <StatTile icon={UserX} label="Rejected" value={current.rejected} tone="red" sub={current.total ? `${Math.round((current.rejected / current.total) * 100)}% of pipeline` : undefined} />
        <StatTile icon={MailX} label="Never replied" value={current.noReply} tone="gray" />
        <StatTile icon={Star} label="Avg rating" value={current.avgRating ?? "—"} tone="yellow" sub={current.ratedCount ? `${current.ratedCount} rated` : "no ratings yet"} />
      </div>

      {/* Charts */}
      <div className="grid gap-2.5 lg:grid-cols-2">
        <Card title="Pipeline by stage" empty={current.stages.length === 0}>
          <div className="flex flex-col gap-1.5">
            {current.stages.map((s) => (
              <BarRow
                key={s.label}
                label={s.label}
                count={s.count}
                max={maxStage}
                dotClass={CHIP_DOT_CLASSES[s.color] ?? CHIP_DOT_CLASSES.gray}
                barClass={CHIP_DOT_CLASSES[s.color] ?? CHIP_DOT_CLASSES.gray}
              />
            ))}
          </div>
        </Card>

        <Card title="Reject reasons" empty={current.rejectReasons.length === 0}>
          <div className="flex flex-col gap-1.5">
            {current.rejectReasons.map((r) => (
              <BarRow key={r.label} label={r.label} count={r.count} max={maxReason} barClass="bg-orange-500/80" />
            ))}
          </div>
        </Card>

        <Card title="Rating distribution" empty={current.ratedCount === 0}>
          <div className="flex flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((r) => (
              <BarRow
                key={r}
                label={`${r} star${r > 1 ? "s" : ""}`}
                count={current.ratings[r - 1]}
                max={maxRating}
                dotClass="bg-yellow-500"
                barClass="bg-yellow-500/80"
              />
            ))}
          </div>
        </Card>

        <Card title="Candidates shortlisted per week" empty={current.byWeek.length === 0}>
          <WeeklyChart weeks={current.byWeek} />
        </Card>
      </div>

      {/* Past recruitments — only on the "All recruitments" overview */}
      {scope === "overall" && (
      <Card title="Past recruitments" empty={past.length === 0}>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {past.map((b) => (
            <div key={b.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3.5 py-3">
              <div className="flex items-center gap-1.5">
                <Archive className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{b.name}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {fmtDate(b.firstDate)} → {fmtDate(b.lastDate)}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1"><Users className="size-3 text-muted-foreground" /> {b.total}</span>
                <span className="flex items-center gap-1 text-emerald-500"><UserCheck className="size-3" /> {b.hired} hired</span>
                {b.avgRating !== null && (
                  <span className="flex items-center gap-1 text-yellow-500"><Star className="size-3" /> {b.avgRating}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenBoard(b.id)}
                className="mt-1 flex items-center gap-1 self-start text-xs text-blue-500 hover:underline"
              >
                Open board <ArrowRight className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </Card>
      )}

      {stats.boards.length > 1 && scope === "overall" && (
        <Card title="Per recruitment">
          <div className="flex flex-col gap-1.5">
            {stats.boards.map((b) => (
              <BarRow
                key={b.id}
                label={b.name}
                count={b.total}
                max={Math.max(...stats.boards.map((x) => x.total), 1)}
                dotClass={b.archived ? "bg-zinc-400" : "bg-blue-500"}
                barClass={b.archived ? "bg-zinc-400/70" : "bg-blue-500/80"}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <TrendingUp className="size-3" />
        Stats are computed from each board&apos;s Stage, Reject Reason, Rating, and date columns.
      </div>
    </div>
  )
}
