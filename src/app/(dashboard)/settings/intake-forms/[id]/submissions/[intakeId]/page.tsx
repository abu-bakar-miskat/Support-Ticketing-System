import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Clock,
  CalendarDays,
  CalendarClock,
  Users,
  Ticket as TicketIcon,
} from "lucide-react"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { IntakeCard, type IntakeResponseEntry } from "@/components/tickets/intake-card"
import { IntakeSubmissionDeleteButton } from "@/components/settings/intake-submission-delete-button"
import { BreadcrumbRegistrar } from "@/components/dashboard/breadcrumb-registrar"
import { AvatarVisual } from "@/components/ui/user-avatar"
import { UI_PRIORITY_STYLE, uiPriorityFromDb } from "@/components/board/board-types"
import { cn } from "@/lib/utils"

export const metadata = { title: "Submission — Support Ticketing System" }

export default async function SettingsIntakeSubmissionDetailRoute({
  params,
}: {
  params: Promise<{ id: string; intakeId: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  if (!isAdmin && !isManager) redirect("/settings")

  const { id: formId, intakeId } = await params

  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    include: {
      formConfig: {
        select: { id: true, name: true, departmentId: true },
      },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          startDate: true,
          dueDate: true,
          deletedAt: true,
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          assignees: {
            select: {
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  })

  if (!intake || intake.formConfigId !== formId) notFound()

  // Scope check for managers
  if (!isAdmin) {
    const managedIds = new Set([
      ...(profile.managedDepartmentIds ?? []),
      ...(profile.grantedAccessDeptIds ?? []),
    ])
    if (!managedIds.has(intake.formConfig.departmentId)) {
      redirect("/settings/intake-forms")
    }
  }

  const responses: IntakeResponseEntry[] = (
    intake.responses as Array<{
      fieldId?: string
      label?: string
      type?: string
      value?: string
    }>
  )
    .filter((r) => r.fieldId && r.label && r.value)
    .map((r) => ({
      fieldId: r.fieldId as string,
      label: r.label as string,
      type: r.type ?? "text",
      value: r.value as string,
    }))

  const ticket = intake.ticket && !intake.ticket.deletedAt ? intake.ticket : null
  const fmtDate = (d: Date | null) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—"

  const submittedDate = intake.createdAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  const priorityStyle = UI_PRIORITY_STYLE[uiPriorityFromDb(intake.priority)]

  const workers = ticket
    ? [
        ...(ticket.assignee ? [ticket.assignee] : []),
        ...ticket.assignees
          .map((a) => a.user)
          .filter((u) => u.id !== ticket.assignee?.id),
      ]
    : []

  return (
    <>
      <BreadcrumbRegistrar
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Support forms", href: "/settings/intake-forms" },
          { label: intake.formConfig.name, href: `/settings/intake-forms/${formId}` },
          { label: "Submissions", href: `/settings/intake-forms/${formId}/submissions` },
          { label: intake.submitterName, href: `/settings/intake-forms/${formId}/submissions/${intakeId}` },
        ]}
      />
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8 lg:px-12 lg:py-12">
      <div className="flex flex-col gap-5">
        <Link
          href={`/settings/intake-forms/${formId}/submissions`}
          className="inline-flex w-fit items-center gap-1 font-sans text-[12px] font-medium text-pen-muted hover:text-pen-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          {intake.formConfig.name} submissions
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="pen-text-admin-title">
                  {intake.submitterName}
                </h1>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold",
                    priorityStyle.pillBg,
                    priorityStyle.pillText,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", priorityStyle.dot)} />
                  {priorityStyle.label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-[12px] text-pen-muted">
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3.5" />
                  {intake.submitterEmail}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  Submitted {submittedDate}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {ticket ? (
              <Link
                href={`/tickets/${ticket.id}`}
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface px-3 py-1.5 font-sans text-[12px] font-semibold text-pen-foreground hover:border-pen-id hover:text-pen-id transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Ticket #{ticket.ticketNumber}
              </Link>
            ) : null}
            <IntakeSubmissionDeleteButton
              intakeId={intake.id}
              submitterName={intake.submitterName}
              backHref={`/settings/intake-forms/${formId}/submissions`}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex-1">
          <IntakeCard
            intake={{
              submitterName: intake.submitterName,
              submitterEmail: intake.submitterEmail,
              submittedAt: intake.createdAt.toISOString(),
              formName: intake.formConfig.name,
              responses,
            }}
          />
        </div>

        {ticket ? (
          <div className="flex flex-1 flex-col rounded-xl border border-pen-card-border bg-pen-card">
            {/* Card header */}
            <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-pen-blue-tint text-pen-id">
                  <TicketIcon className="size-3.5" />
                </span>
                <div>
                  <p className="pen-text-label">
                    Linked ticket
                  </p>
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="font-sans text-[12.5px] font-semibold text-pen-id hover:underline"
                  >
                    #{ticket.ticketNumber}
                  </Link>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-surface px-2.5 py-1 font-sans text-[11px] font-semibold text-pen-foreground">
                <span className="size-1.5 rounded-full bg-pen-id" />
                {ticket.status}
              </span>
            </div>

            <div className="flex flex-col gap-5 px-5 py-5">
              {/* Title */}
              <div>
                <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                  Title
                </p>
                <p className="font-sans text-[13px] font-medium text-pen-foreground">
                  {ticket.title}
                </p>
              </div>

              {/* Working on it */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                  <Users className="size-3.5" />
                  Working on it
                </p>
                {workers.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {workers.map((w) => (
                      <div key={w.id} className="flex items-center gap-2">
                        <AvatarVisual
                          name={w.name}
                          avatarUrl={w.avatarUrl}
                          size={22}
                        />
                        <span className="font-sans text-[12.5px] text-pen-foreground">
                          {w.name}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-sans text-[12.5px] italic text-pen-muted">
                    Unassigned
                  </p>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3 border-t border-pen-card-border pt-5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-7 items-center justify-center rounded-lg bg-pen-surface text-pen-muted">
                    <CalendarDays className="size-3.5" />
                  </span>
                  <div>
                    <p className="font-sans text-[11px] text-pen-subtle">
                      Start date
                    </p>
                    <p className="font-sans text-[12.5px] font-medium text-pen-foreground">
                      {fmtDate(ticket.startDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-7 items-center justify-center rounded-lg bg-pen-surface text-pen-muted">
                    <CalendarClock className="size-3.5" />
                  </span>
                  <div>
                    <p className="font-sans text-[11px] text-pen-subtle">
                      Due date
                    </p>
                    <p className="font-sans text-[12.5px] font-medium text-pen-foreground">
                      {fmtDate(ticket.dueDate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
    </>
  )
}
