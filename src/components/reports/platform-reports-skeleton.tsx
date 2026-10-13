import styles from "./report-layout.module.css"

export function PlatformReportsSkeleton({ view = "tenants" }: { view?: "tenants" | "detail" }) {
  if (view === "tenants") return <div role="status" aria-label="Loading tenant summaries"><span className="sr-only">Loading tenant summaries…</span><div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className={`${styles.surface} p-6`}><div className={`${styles.shimmer} h-10 w-10 rounded-lg`} /><div className={`${styles.shimmer} mt-4 h-4 w-3/4`} /><div className={`${styles.shimmer} mt-6 h-8 w-16`} /><div className={`${styles.shimmer} mt-3 h-3 w-2/3`} /><div className={`${styles.shimmer} mt-6 h-3 w-full`} /><div className={`${styles.shimmer} mt-5 h-3 w-24`} /></div>)}</div></div>
  return <div role="status" aria-label="Loading organizational reports" className="flex flex-col gap-5">
    <span className="sr-only">Loading tenant, department, and subdepartment reports…</span>
    <div aria-hidden="true" className={styles.surface}><div className={styles.metrics}>{Array.from({ length: 4 }, (_, index) => <div key={index} className={styles.metric}><div className={`${styles.shimmer} h-3 w-28`} /><div className={`${styles.shimmer} mt-4 h-8 w-20`} /></div>)}</div></div>
    {Array.from({ length: 2 }, (_, index) => <div aria-hidden="true" key={index} className={styles.surface}><div className={styles.sectionHeader}><div className={`${styles.shimmer} h-4 w-44`} /></div>{Array.from({ length: 4 }, (_, row) => <div key={row} className="flex gap-8 border-t border-sts-card-border px-6 py-5"><div className={`${styles.shimmer} h-3 w-1/3`} /><div className={`${styles.shimmer} h-3 flex-1`} /><div className={`${styles.shimmer} h-3 flex-1`} /></div>)}</div>)}
  </div>
}
