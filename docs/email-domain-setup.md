# Email domains and shared mailboxes

Domain registration, DNS verification, and receiving configuration are managed directly in Resend using the account connected to this application's API key.

Workspace admins add an existing domain and assign it to a department or sub-department. The application checks its live Resend status before saving the assignment. Only `verified` domains are accepted; unknown, pending, partially verified, failed, and unavailable lookups are rejected. Manager domain requests follow the same check at submission and approval.

Mailbox and sender addresses are also checked on the server before saving. Shared mailboxes additionally require receiving to be enabled in Resend. Sender addresses require domain verification. A domain lookup checks the exact domain, including subdomains.

The platform domain page displays the domains used by this project and their live Resend status. Refreshing status reads Resend; it does not initiate DNS verification. Removing a workspace domain deletes its local assignment only and preserves its Resend configuration.
