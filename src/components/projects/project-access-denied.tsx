"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";

export function ProjectAccessDenied({
  projectName,
  deptName,
}: {
  projectName?: string | null;
  deptName?: string | null;
}) {
  const body = deptName
    ? `This project belongs to the "${deptName}" department. You're not a member of it and don't have cross-department access to view it. Ask a manager of that department to add you to the project or grant you access.`
    : "This project is outside your access. Ask a manager of the owning department to add you to the project or grant you cross-department access.";

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 py-16">
      <div className="flex max-w-[440px] flex-col items-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20">
          <DepartmentIcon className="size-6 text-red-500" />
        </span>

        <div className="flex flex-col gap-1.5">
          <h1 className="pen-text-page-title">You don&apos;t have access to this project</h1>
          <p className="font-sans text-[13px] leading-relaxed text-pen-muted">{body}</p>
        </div>

        <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-1.5">
          <ShieldOff className="size-3.5 shrink-0 text-pen-subtle" />
          <span className="font-sans text-[11.5px] text-pen-subtle">
            {projectName ? (
              <>
                Project <span className="font-semibold text-pen-foreground">{projectName}</span> — access denied
              </>
            ) : (
              "Access denied"
            )}
          </span>
        </div>

        <Link
          href="/"
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-xl bg-pen-blue px-5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:text-gray-900"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
