export type PortalSubmissionRow = {
  id: string
  submitterName: string
  submitterEmail: string
  responses: unknown
  createdAt: Date
  formConfig: { id: string; name: string }
  ticket: null | {
    id: string
    ticketNumber: number
    title: string
    status: string
    updatedAt: Date
    subDepartment: {
      id: string
      name: string
      prefix: string
      department: { id: string; name: string }
    }
    activityLogs: Array<{ createdAt: Date }>
  }
}

export function latestPortalActivityAt(
  ticketUpdatedAt: Date,
  latestActivityAt?: Date | null,
): Date {
  return latestActivityAt && latestActivityAt > ticketUpdatedAt
    ? latestActivityAt
    : ticketUpdatedAt
}

export function toSubmissionJson(submission: PortalSubmissionRow) {
  const ticket = submission.ticket
  return {
    id: submission.id,
    submitterName: submission.submitterName,
    submitterEmail: submission.submitterEmail,
    responses: Array.isArray(submission.responses)
      ? submission.responses.filter((item) => !(item && typeof item === "object" && "_ikey" in item))
      : submission.responses,
    createdAt: submission.createdAt,
    form: submission.formConfig,
    ticket: ticket
      ? {
          id: ticket.id,
          reference: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
          title: ticket.title,
          department: ticket.subDepartment.department,
          subDepartment: { id: ticket.subDepartment.id, name: ticket.subDepartment.name },
          status: ticket.status,
          updatedAt: ticket.updatedAt,
          lastActivityAt: latestPortalActivityAt(
            ticket.updatedAt,
            ticket.activityLogs[0]?.createdAt,
          ),
        }
      : null,
  }
}
