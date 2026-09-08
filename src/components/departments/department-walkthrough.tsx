"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Users, Gauge, ListChecks, FileText, Mail, Check } from "lucide-react";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Members & assignment",
    href: "/settings/departments",
    icon: Users,
    body: "Invite agents, set managers, and choose how new tickets are assigned.",
  },
  {
    title: "SLA policies",
    href: "/settings/sla",
    icon: Gauge,
    body: "Define first-response and resolution targets for each issue type.",
  },
  {
    title: "Automation rules",
    href: "/settings/rules",
    icon: ListChecks,
    body: "Route, tag, and assign tickets from the answers on your forms.",
  },
  {
    title: "Support forms",
    href: "/support-forms",
    icon: FileText,
    body: "Publish the public form customers use to reach this department.",
  },
  {
    title: "Email",
    href: "/settings/email",
    icon: Mail,
    body: "Confirm sender identity, branding, and which notifications go out.",
  },
] as const;

export function DepartmentWalkthroughModal({
  departmentId,
  departmentName,
  open,
  onOpenChange,
  dismissOnDone = false,
}: {
  departmentId: string;
  departmentName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissOnDone?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    if (dismissOnDone) {
      setBusy(true);
      await fetch(`/api/admin/departments/${departmentId}/walkthrough`, { method: "POST" }).catch(
        () => undefined,
      );
      setBusy(false);
    }
    onOpenChange(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-labelledby="walkthrough-title"
        className="relative w-full max-w-lg rounded-2xl border border-sts-card-border bg-sts-card p-5 shadow-xl"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-md p-1 text-sts-subtle hover:text-sts-foreground"
          aria-label="Close walkthrough"
        >
          <X className="size-4" />
        </button>
        <h2 id="walkthrough-title" className="sts-text-modal-title pr-8">
          Set up {departmentName ?? "this department"}
        </h2>
        <p className="mt-1 font-sans text-[12.5px] text-sts-muted">
          Walk through the pieces that make the department operational. You can reopen this any time.
        </p>
        <ol className="mt-4 flex flex-col gap-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.href}>
                <Link
                  href={step.href}
                  onClick={dismiss}
                  className="flex items-start gap-3 rounded-xl border border-sts-card-border bg-sts-surface px-3 py-2.5 hover:border-sts-id/40"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sts-blue/10 text-sts-blue">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-sans text-[12.5px] font-semibold text-sts-foreground">
                      {i + 1}. {step.title}
                    </span>
                    <span className="mt-0.5 block font-sans text-[11.5px] text-sts-muted">
                      {step.body}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={dismiss}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg bg-sts-blue px-3 font-sans text-[12px] font-semibold text-white hover:bg-sts-blue/90 disabled:opacity-60 dark:text-gray-900",
            )}
          >
            <Check className="size-3.5" />
            {dismissOnDone ? "Got it" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Auto-shows DS-09 overview for a newly assigned manager of an active department. */
export function DepartmentWalkthroughHost() {
  const { activeDeptId, departments, isManagerOfActiveDept } = useDashboardContext();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDeptId || !isManagerOfActiveDept) return;
    if (checked === activeDeptId) return;
    let cancelled = false;
    fetch(`/api/admin/departments/${activeDeptId}/walkthrough`)
      .then((r) => (r.ok ? r.json() : { needsOverview: false }))
      .then((data: { needsOverview?: boolean }) => {
        if (cancelled) return;
        setChecked(activeDeptId);
        if (data.needsOverview) setOpen(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(activeDeptId);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDeptId, isManagerOfActiveDept, checked]);

  if (!activeDeptId) return null;
  const name = departments.find((d) => d.id === activeDeptId)?.name;

  return (
    <DepartmentWalkthroughModal
      departmentId={activeDeptId}
      departmentName={name}
      open={open}
      onOpenChange={setOpen}
      dismissOnDone
    />
  );
}
