# Global Support Portal — SLA Workflow

We have two levels of SLA:

- **Tenant-level SLA**
- **Department-level SLA**

If a Department-level SLA is available for the ticket, it will override the Tenant-level SLA.

If no Department-level SLA is found, then the Tenant-level SLA will be used.

## SLA Working Days and Hours

SLA time will only count during the configured working days and working hours.

For example:

**Monday to Friday, 8:30 AM to 5:00 PM UK time.**

If a ticket is created during working hours, the SLA timer will start immediately.

If a ticket is created outside working hours, the SLA timer will stay paused and automatically start when the next working period begins.

The SLA timer will also pause when working hours end and continue again when the next working period starts.

## Ticket Types

We have four types of tickets:

1. **Manual Ticket**
2. **Mailbox Ticket**
3. **Support Ticket**
4. **Portal Ticket**

## Manual Ticket

A Manual Ticket can be created by a user for themselves, or someone can create the ticket and assign it to another user.

For a Manual Ticket, the user will provide an **Estimated Time**.

Time Tracking will track how much time is actually spent on the ticket.

If the tracked time exceeds the Estimated Time before the ticket is resolved, it will be considered a **Resolution Breach**.

The manager will receive a notification when the Resolution Breach happens.

After the Estimated Time is exceeded, the timer will continue counting so we can see how much extra time was required to resolve the ticket.

## Mailbox Ticket

Mailbox Tickets are created from a **Shared Mailbox**.

The SLA is not connected to a specific issue. The same SLA rules will apply to all tickets created from that shared mailbox.

A Mailbox SLA has:

- **Time to First Response**
- **Time to Resolution**

When the ticket is created, the corresponding SLA will automatically apply.

## Support Ticket

A Support Ticket is created from a Support Form.

The user selects an issue, fills in the form, and submits it.

Each issue can have its own:

- **Time to First Response**
- **Time to Resolution**

When a ticket is created with that issue, the SLA configured for that issue will automatically apply.

Confirmed on 2026-10-12: First Response starts at ticket creation. Resolution remains at zero until work tracking starts, then counts from the first work-tracking session. A reply or active-status change alone does not start resolution; an active-status change that actually starts work tracking does.

## Portal Ticket

A Portal Ticket works the same way as a Support Ticket.

The difference is that the user submits the Support Form from another portal using our API.

The SLA is still based on the selected issue, and the same First Response and Resolution rules will apply.

## First Response SLA

The First Response SLA starts when the ticket is created during working hours.

If the ticket is created outside working hours, the timer starts when the next working period begins.

Before the First Response SLA is fully breached, the system can send an early warning based on a configurable percentage.

For example, if the warning percentage is **80%**, and the assignee has not responded or taken any action, the manager will receive a notification that the First Response SLA is almost breached.

If the full First Response time is reached without a response:

- The manager will receive a breach notification.
- The ticket will be marked as escalated.
- The ticket status can also be changed to **Escalated**.
- The system will record that the First Response SLA was breached.
- The timer will continue counting overtime.

The First Response timer will stop when the assignee responds to the ticket or changes the ticket to the required active status, such as **In Progress**.

The actual response time will then be recorded.

## Time Tracking and Waiting for Customer

Time Tracking is mainly used for the Resolution SLA.

When the assignee sends a reply, email, message, or comment to the customer and the ticket changes to **Waiting for Customer**, the Resolution timer should pause.

The time spent waiting for the customer should not count against the assignee.

When the customer replies:

- The ticket changes to **Waiting for Assignee**.
- The Resolution timer starts again.

This process can continue until the ticket is resolved.

## Resolution SLA

The assignee must resolve the ticket within the configured **Time to Resolution**.

If the total tracked resolution time exceeds the allowed Resolution SLA:

- The ticket will be considered a **Resolution SLA Breach**.
- The manager will receive a notification.
- The system will record the breach.
- The overtime timer will continue counting.

The timer will continue until the ticket is resolved or the resolution countdown is stopped according to the ticket workflow.

The final record should show both:

- The allowed Resolution SLA time.
- The additional overtime required to resolve the ticket.

## Summary of SLA Flow

For Mailbox, Support, and Portal Tickets, the basic SLA flow is:

**Ticket Created → First Response Timer Starts → Early Warning → First Response Breach if needed → Agent Responds → First Response Timer Stops → Resolution Timer Continues → Waiting for Customer Pauses Timer → Customer Replies → Timer Continues → Ticket Resolved → Resolution Timer Stops**

This allows us to clearly track:

- How long it took the assignee to first respond.
- Whether the First Response SLA was met or breached.
- How much active time was spent resolving the ticket.
- How long the ticket was waiting for the customer.
- Whether the Resolution SLA was met or breached.
- How much overtime was required after an SLA breach.

## Confirmed lifecycle decisions — 2026-10-12

- A customer reply to a closed ticket does not automatically reopen it or restart clocks. The assignee moves it to **In Progress** to start a fresh SLA and work-tracking cycle.
- Reopen resets both SLA allowances and their warning/breach guards. Original targets and saved calendar remain unchanged. In Progress immediately satisfies first response when it is a configured active status. Support/Portal resolution still requires a persisted work session; mailbox resolution retains agent-active-status/work activation.
- Current-cycle tracked work starts from zero, including manual estimated-time compliance. Previous work entries and breach history are retained, not deleted. Each new cycle may warn/breach once again.
- **Waiting for Customer / Waiting for Assignee are labels only.** Public conversation direction controls the labels and pause/resume behavior; it does not automatically change the main workflow status.
