"use client";

import Link from "next/link";
import { ShieldOff, Lock } from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";

type Reason =
  | "no_dept_access"      // user's role doesn't cover the ticket's department
  | "no_team_access"      // lead/staff not on the team, not assignee/creator
  | "cross_access_needed" // user is from a different dept but no grant exists;
  | "not_project_member"; // user has limited cross-access but isn't on the project

export function TicketAccessDenied({
  reason,
  ticketRef,
  deptName,
  teamName,
}: {
  reason: Reason;
  ticketRef: string;
  deptName?: string | null;
  teamName?: string | null;
}) {
  const messages: Record<Reason, { title: string; body: string }> = {
    no_dept_access: {
      title: "Department access required",
      body: deptName
        ? `This ticket belongs to the "${deptName}" department. You are not a manager of that department and have not been granted cross-department access to it.`
        : "This ticket belongs to a department you don't have access to. Ask a manager of that department to grant you cross-department access.",
    },
    no_team_access: {
      title: "Team access required",
      body: teamName
        ? `This ticket is managed by the "${teamName}" team. You are not a member of that team, not assigned to this ticket, and don't have cross-department access to view it.`
        : "You are not a member of the team that owns this ticket, not assigned to it, and don't have cross-department access to view it.",
    },
    cross_access_needed: {
      title: "You're outside this department",
      body: deptName
        ? `This ticket belongs to the "${deptName}" department. You need a cross-department access grant from a manager of that department before you can view it.`
        : "This ticket belongs to a department outside your access. Request cross-department access from that department's manager.",
    },
    not_project_member: {
      title: "You don't have access to this project",
      body: deptName
        ? `This ticket belongs to a project in the "${deptName}" department. Your access there is limited to projects you're a member of — ask a manager to add you to this project or grant you full department access.`
        : "This ticket belongs to a project you're not a member of. Your cross-department access is limited to projects you're assigned to — ask a manager to add you to this project.",
    },
  };

  const { title, body } = messages[reason];

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 py-16">
      <div className="flex flex-col items-center gap-5 text-center max-w-[440px]">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20">
          {reason === "no_dept_access" || reason === "cross_access_needed" ? (
            <DepartmentIcon className="size-6 text-red-500" />
          ) : (
            <Lock className="size-6 text-red-500" />
          )}
        </span>

        <div className="flex flex-col gap-1.5">
          <h1 className="pen-text-page-title">
            {title}
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-pen-muted">
            {body}
          </p>
        </div>

        <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-1.5">
          <ShieldOff className="size-3.5 shrink-0 text-pen-subtle" />
          <span className="font-sans text-[11.5px] text-pen-subtle">
            Ticket <span className="font-semibold text-pen-foreground">{ticketRef}</span> — access denied
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
