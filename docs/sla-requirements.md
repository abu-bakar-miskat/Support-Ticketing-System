We have two levels of SLA: **Tenant-level SLA** and **Department-level SLA**.

If a Department-level SLA is found for a ticket, then the Department-level SLA will replace the Tenant-level SLA. If there is no Department-level SLA, then the Tenant-level SLA will be used.

### SLA Working Days and Hours

SLA time will only count during the configured working days and working hours.

For example:

**Monday to Friday, 8:30 AM to 5:00 PM UK time.**

If a ticket is created or submitted during these working hours, the SLA timer will start counting.

If a ticket is created outside the working hours, the SLA timer will stay paused and automatically start when the next working period begins.

The SLA timer should also pause outside working hours and continue again when working hours start.

### Manual Ticket

There are different ways a ticket can be created. One way is a **Manual Ticket**.

A user can create a ticket for themselves, or someone else can create the ticket and assign it to another user.

For a Manual Ticket, the user will provide an **Estimated Time**.

Time Tracking will be used to track how much time is spent on the ticket. If the Time Tracking exceeds the Estimated Time before the ticket is resolved, it will be considered a **Resolution Breach**.

The manager will receive a notification about the Resolution Breach.

After the Estimated Time is exceeded, the system should also continue counting and record the overtime so we can see how many extra minutes or hours were required to resolve the ticket.

### Shared Mailbox / Support Ticket

We also have tickets that are created from the **Shared Mailbox**.

For these tickets, SLA has two time limits:

- **Time to First Response**
- **Time to Resolution**

The SLA is associated with a specific issue. If a ticket is created with that issue, the corresponding SLA will automatically apply to the ticket.

### Time to First Response SLA

If the assigned agent does not respond to the ticket within the defined First Response time, the manager should receive a notification that the ticket has breached the **First Response SLA**.

The system should also record that the ticket has breached the First Response SLA.

Even after the SLA is breached, the First Response timer should continue counting. This will allow us to see how many additional minutes or hours passed before the agent responded.

Once the assigned agent replies to the ticket or changes the ticket status appropriately, the First Response SLA timer should stop.

### Time Tracking

Then comes **Time Tracking**.

Time Tracking has some specific rules.

If the assigned agent replies, sends a message, email, or comment on a Support Ticket or Portal Ticket and changes the ticket status to **Waiting for Customer**, the Time Tracking should automatically stop.

When the customer replies, the Time Tracking should automatically start again.

This means that the time spent waiting for the customer should not be counted against the agent's Resolution SLA.

### Time to Resolution SLA

The assigned agent must resolve the ticket within the defined **Time to Resolution SLA**.

If the total tracked time exceeds the Resolution SLA, the ticket will be considered as having breached the **Resolution SLA**.

When the Resolution SLA is breached, the manager should receive a notification.

The system should also continue counting the overtime after the SLA has been breached so we can see exactly how many additional minutes or hours were required to resolve the ticket.
