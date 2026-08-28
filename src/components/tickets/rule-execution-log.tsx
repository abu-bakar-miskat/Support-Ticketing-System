"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

type Log = {
  id: string;
  ruleName: string;
  matched: boolean;
  stopProcessing: boolean;
  createdAt: string;
};

export function RuleExecutionLog({ ticketId }: { ticketId: string }) {
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${ticketId}/rule-executions`)
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((data: { logs?: Log[] }) => {
        if (!cancelled) setLogs(data.logs ?? []);
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (!logs || logs.length === 0) return null;

  return (
    <div className="rounded-lg border border-sts-card-border bg-sts-surface/40 px-3.5 py-3">
      <p className="mb-2 flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-sts-subtle">
        <ListChecks className="size-3.5" />
        Automation
      </p>
      <ul className="flex flex-col gap-1.5">
        {logs.slice(0, 12).map((log) => (
          <li key={log.id} className="flex items-start gap-2 font-sans text-[12px]">
            <span
              className={cn(
                "mt-1 size-1.5 shrink-0 rounded-full",
                log.matched ? "bg-sts-green" : "bg-sts-subtle",
              )}
            />
            <span className="min-w-0 flex-1 text-sts-foreground">
              <span className="font-medium">{log.ruleName}</span>
              <span className="text-sts-muted">
                {log.matched ? " matched" : " did not match"}
                {log.stopProcessing ? " · stopped later rules" : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
