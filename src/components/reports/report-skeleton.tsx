import { ChartColumn } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import styles from "./report-layout.module.css"

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`${styles.shimmer} ${className}`} />
}

export function ReportContentSkeleton() {
  return (
    <div role="status" aria-label="Loading performance report">
      <span className="sr-only">Loading user performance and ticket metrics…</span>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className={styles.surface}>
          <div className={styles.metrics}>
            {Array.from({ length: 4 }, (_, index) => <div key={index} className={styles.metric}>
              <Shimmer className="h-3 w-28" /><Shimmer className="mb-3 mt-4 h-9 w-20" /><Shimmer className="h-2.5 w-36 max-w-full" />
            </div>)}
          </div>
          <div className={styles.sources}>{Array.from({ length: 5 }, (_, index) => <div key={index} className={styles.source}><Shimmer className="h-3 w-20" /><Shimmer className="h-4 w-6" /></div>)}</div>
        </div>
        <div className={`${styles.surface} ${styles.spotlight}`}>
          <div className={styles.spotlightBody}>
            <Shimmer className="h-3 w-28" />
            <div className="mt-5 flex items-center gap-3"><Shimmer className="size-11 shrink-0 rounded-full" /><div className="flex-1"><Shimmer className="h-5 w-36" /><Shimmer className="mt-3 h-2.5 w-44 max-w-full" /></div><Shimmer className="h-8 w-12" /></div>
            <div className="mt-5 flex gap-5 border-t border-sts-card-border pt-4"><Shimmer className="h-3 w-24" /><Shimmer className="h-3 w-24" /></div>
          </div>
          <div className={styles.spotlightBody}>
            <Shimmer className="mb-4 h-3 w-36" />
            {Array.from({ length: 5 }, (_, index) => <div key={index} className={styles.priorityRow}><Shimmer className="h-3 w-12" /><Shimmer className={`h-1.5 ${index % 2 ? "w-3/5" : "w-4/5"}`} /><Shimmer className="h-3 w-5" /></div>)}
          </div>
        </div>
        <div className={styles.surface}>
          <div className={styles.sectionHeader}><div><Shimmer className="h-4 w-40" /><Shimmer className="mt-3 h-3 w-64 max-w-full" /></div><Shimmer className="h-9 w-48" /></div>
          <div className={styles.tableScroll}>
            <div className="min-w-[1000px]">
              <div className="grid grid-cols-[220px_repeat(7,minmax(0,1fr))] gap-5 border-y border-sts-card-border bg-sts-surface px-5 py-4">{Array.from({ length: 8 }, (_, index) => <Shimmer key={index} className="h-2.5 w-16" />)}</div>
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="grid grid-cols-[220px_repeat(7,minmax(0,1fr))] items-center gap-5 border-b border-sts-card-border px-5 py-[18px] last:border-b-0">
                <div className="flex items-center gap-3"><Shimmer className="h-3 w-4" /><Shimmer className="size-[30px] shrink-0 rounded-full" /><div><Shimmer className={`h-3 ${index % 2 ? "w-24" : "w-28"}`} /><Shimmer className="mt-2 h-2 w-20" /></div></div>
                {Array.from({ length: 7 }, (_, cell) => <div key={cell}><Shimmer className={`h-3 ${cell < 2 || cell === 6 ? "w-6" : "w-16"}`} />{cell > 0 && cell < 6 && <Shimmer className="mt-2 h-2 w-12" />}</div>)}
              </div>)}
            </div>
          </div>
          <div className={styles.footer}><Shimmer className="h-2.5 w-64 max-w-full" /><Shimmer className="h-2.5 w-24" /></div>
          <div className="px-6 pb-5"><Shimmer className="h-3 w-44" /></div>
        </div>
        <div className={`${styles.surface} ${styles.sectionHeader}`}><div><Shimmer className="h-4 w-36" /><Shimmer className="mt-3 h-2.5 w-64 max-w-full" /></div><Shimmer className="h-4 w-4" /></div>
      </div>
    </div>
  )
}

export function ReportPageSkeleton() {
  return <div className="sts-page-pad h-full overflow-y-auto bg-sts-bg/80"><div className={styles.page}>
    <PageHeader className="[&_h1]:text-2xl [&_h1]:tracking-tight" title="Reports" icon={ChartColumn} iconClassName="text-sts-blue" description="User completions, priorities, SLA reliability, and customer reply times." badge={<span className="rounded-md bg-sts-surface px-2 py-1 text-[10px] font-medium text-sts-muted">Performance</span>} />
    <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-3"><Shimmer className="h-11 w-64" /><div className="flex gap-2"><Shimmer className="h-9 w-40" /><Shimmer className="h-9 w-40" /><Shimmer className="h-9 w-24" /></div></div>
    <Shimmer className="-mt-2 h-3 w-56" />
    <ReportContentSkeleton />
  </div></div>
}
