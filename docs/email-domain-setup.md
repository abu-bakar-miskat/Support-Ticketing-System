# Email domains and shared mailboxes

Domain registration, DNS verification, and receiving configuration are managed directly in Resend using the account connected to this application's API key.

Workspace admins enter an existing domain and click Check. After Resend confirms verification, the department selector appears, followed by the sub-department selector after choosing a department. Editing the domain clears the check and team selection. The application checks its live Resend status before saving the assignment. Only `verified` domains are accepted; unknown, pending, partially verified, failed, and unavailable lookups are rejected. Manager domain requests follow the same check at submission and approval.

Mailbox and sender addresses are also checked on the server before saving. Shared mailboxes additionally require receiving to be enabled in Resend. Sender addresses require domain verification. A domain lookup checks the exact domain, including subdomains.

The platform domain page displays the domains used by this project and their live Resend status. Checking a domain reads Resend; it does not initiate DNS verification. Removing a workspace domain deletes its local assignment only and preserves its Resend configuration.

Choose **All departments and sub-departments** to share a verified domain across the entire workspace, including future teams. Each team adds its own mailbox address using a unique local part (for example, `support@domain.com` and `sales@domain.com`). The application rejects duplicate mailbox addresses. Mailboxes route tickets to their selected sub-department.
