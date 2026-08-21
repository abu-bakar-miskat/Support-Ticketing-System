import Link from "next/link";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export type DepartmentMailboxUsage = {
  departmentId: string;
  name: string;
  /** Total mailbox connections in the department. */
  total: number;
  /** Connections currently healthy (ACTIVE). */
  active: number;
  /** Connections needing attention (AUTH_ERROR + UNREACHABLE). */
  issues: number;
};

/**
 * Tenant-wide view of how many shared mailboxes each department is using,
 * shown on the all-departments admin page. Enter a department to manage its
 * mailboxes on /mailboxes.
 */
export function DepartmentsMailboxes({ rows }: { rows: DepartmentMailboxUsage[] }) {
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  // Busiest departments first, then alphabetical so empty ones stay grouped.
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return (
    <div className="px-6 py-6 sm:px-10">
      <div className="mb-4 flex items-center gap-2">
        <Mail className="size-4 text-pen-muted" />
        <p className="font-sans text-[13px] text-pen-muted">
          <span className="font-semibold text-pen-foreground">{total}</span> shared mailbox
          {total === 1 ? "" : "es"} connected across this tenant.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Mailboxes</TableHead>
              <TableHead className="text-right">Healthy</TableHead>
              <TableHead className="text-right">Need attention</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center font-sans text-[12.5px] text-pen-muted">
                  No departments yet.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.departmentId}>
                  <TableCell className="font-sans text-[13px] font-medium text-pen-foreground">
                    {r.name}
                  </TableCell>
                  <TableCell className="text-right font-sans text-[13px] font-semibold tabular-nums text-pen-foreground">
                    {r.total}
                  </TableCell>
                  <TableCell className="text-right font-sans text-[13px] tabular-nums text-pen-muted">
                    {r.active}
                  </TableCell>
                  <TableCell className="text-right font-sans text-[13px] tabular-nums">
                    {r.issues > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">{r.issues}</span>
                    ) : (
                      <span className="text-pen-subtle">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className={cn("mt-3 font-sans text-[11.5px] text-pen-subtle")}>
        Enter a department and open{" "}
        <Link href="/mailboxes" className="font-medium text-pen-blue hover:underline">
          Shared Mailboxes
        </Link>{" "}
        to connect or manage its inboxes.
      </p>
    </div>
  );
}
