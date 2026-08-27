Business Requirements Document 
Multi-Tenant Support Ticketing Platform 
Table of Contents 
Right-click the table below and choose “Update Field” (or press F9) if section titles do not appear automatically. 
​​ 
​​ 

 

1. Introduction & Purpose 
   This document defines the business and functional requirements for a multi-tenant support ticketing platform. A Super Admin manages multiple client tenancies from a single system. Each tenant can adopt one or more service templates — starting with a Support template — which departments then configure independently: their own workflow, branded communications, forms, SLAs, and assignment logic. 
   This is version 0.3 of the BRD. It incorporates the business's answers to the Section 11 questions raised in both v0.1 and v0.2 (full record in Appendix D), plus several new requirements raised alongside those answers. Items marked “Recommended” or “Interpretation” are still additions or readings proposed by the analyst, not yet confirmed — they remain collected in Section 8 and Section 11 (now a short, fresh list). 
2. Business Objectives 
   Give the platform owner centralised control over tenant onboarding, commercial agreements, feature access, and available templates. 
   Let each tenant discover and request the templates relevant to their needs, without requiring platform-level involvement for every enablement. 
   Allow each department to run its own support operation — workflow, branding, forms, SLAs and staffing — without needing changes at platform or tenant level. 
   Give customers a consistent, branded communication experience regardless of which department handles their query. 
   Distribute ticket workload fairly and predictably across available agents, respecting their working hours and planned absence. 
   Give managers one place to see, and act on, both customer-facing and internal ticket conversation, plus the reporting to understand how their department is performing. 
3. Scope 
   3.1 In Scope 
   Super Admin: tenancy management, agreement records, user access control, per-tenant feature control, template catalogue management. 
   Template Marketplace: template listing, enablement, and tenant-side request-access workflow. 
   Support Template Package: Project Admin, Department Admin and Sub-department Manager roles; department boards; department settings (branding / email / notification templates); email-to-ticket intake; dynamic forms; rules engine; SLA management; ticket assignment, reassignment and transfer; working hours and leave; unified comment feed. 
   Per-department reporting & analytics, including custom reports built on form fields. 
   Board-level filtering and generic search. 
   Additional items proposed for consideration — see Section 8. 
   3.2 Out of Scope / Assumed — To Confirm 
   Billing or payment processing for tenant agreements — this BRD treats “agreement” as a contractual/administrative record, not an invoicing engine. 
   The internal functionality of any future template other than Support — only its existence at catalogue level is covered here. 
   Native mobile apps — a responsive web interface is assumed unless stated otherwise. 
   Migration of data from any existing ticketing tool. 
   Customer self-service portal — confirmed out of scope for this phase; all customer interaction is via email (stakeholder decision, see Appendix D). 
4. Glossary 
   Term 
   Definition 
   Tenant 
   A client organisation onboarded onto the platform by the Super Admin, with its own users, agreement, and enabled features/templates. Confirmed to represent an external client organisation. 
   Template 
   A pre-built package of functionality (e.g. “Support”) that a tenant can enable and configure for its own use. 
   Project Admin 
   The tenant-level administrator for a given template, responsible for users and departments within it. 
   Department Admin 
   The administrator for a single department: users, sub-departments, board, settings, forms, rules, SLAs and assignment. 
   Sub-department 
   An optional subdivision within a department, with its own manager (or the Department Admin by default) and optionally its own dedicated shared mailbox. 
   Board 
   A department's visual workflow, made up of columns representing ticket stages. 
   Escalated (column) 
   A default board column for tickets needing manager attention, e.g. following an SLA breach or manual escalation. 
   Internal Note 
   A comment on a ticket visible only to agents, not to the customer. 
   Waiting for Customer / Waiting for Support 
   A sub-status shown on a ticket, set automatically based on whether the customer or an agent sent the most recent visible reply (internal notes are not counted). 
   Shared Mailbox 
   A mailbox accessible to multiple users rather than one individual, which can be connected to a department or sub-department so incoming email automatically creates tickets. 
   Round Robin 
   An assignment method that cycles tickets evenly across a list of agents in turn. 
   Workload-Based Assignment 
   An assignment method that routes each new ticket to the agent with the lowest current open-ticket count. 
   Working Hours 
   The days/times an agent is considered available for ticket assignment. 
   SLA (Service Level Agreement) 
   A target time (e.g. first response, resolution) a ticket is expected to meet; can vary by criteria such as priority or form field values. 
5. Stakeholders 
   Stakeholder 
   Interest / Role 
   Super Admin / Platform Owner 
   Owns commercial and platform-level relationships with every tenant; needs confidence in access control and feature governance. 
   Project Admin (tenant side) 
   Owns the tenant's use of the Support template; needs to onboard departments and users quickly, and see performance across the tenant. 
   Department Admin 
   Runs day-to-day support operations for a department; needs full self-service configuration without depending on IT. 
   Sub-department Manager 
   Runs a sub-department day to day, where one has been assigned; otherwise the Department Admin covers this. 
   Agent 
   Works tickets day to day; needs a clear, fast interface for responding and collaborating internally. 
   Customer / Requester 
   Raises and follows up on tickets by email; needs clear, branded, timely communication. 
   IT / Delivery team 
   Builds and maintains the platform; needs an unambiguous, testable set of requirements. 
6. User Roles & Permissions Overview 
   Role 
   Scope 
   Key Permissions 
   Super Admin 
   Platform-wide 
   Create/suspend tenants; manage agreements; restrict tenant/user access; toggle features per tenant; manage template catalogue and access requests. 
   Project Admin 
   Tenant (within a template) 
   Create and manage tenant users; create departments; assign Department Admins; reporting-only visibility across all departments (no board/ticket access). 
   Department Admin 
   Single department 
   Manage department users and sub-departments; configure board, branding, mailboxes, notification templates, forms, rules, SLAs, assignment method, working hours; view department reporting. 
   Sub-department Manager 
   Single sub-department 
   Manages users and day-to-day work within their sub-department; role defaults to the Department Admin if not separately assigned. 
   Agent 
   Department or sub-department 
   Work assigned tickets; reply to customers; add internal notes; transfer or reassign where permitted. 
   Customer / Requester 
   Own tickets only 
   Raise tickets and reply, by email. 

7. Functional Requirements 
   Requirements are grouped by module and numbered for traceability (e.g. SA-01). An entry marked “Recommended” in the Notes column is a proposed addition, not an explicit instruction; an entry marked “Interpretation” flags a reading of an ambiguous original requirement — both should be confirmed with the business before build. 
   7.1 Super Admin — Tenancy & Platform Management 
   ID 
   Requirement 
   Notes 
   SA-01 
   The Super Admin shall be able to create, edit, suspend and delete tenant accounts. 

 
SA-02 
The Super Admin shall be able to record and manage the commercial agreement for each tenant, including start/end date, renewal status and supporting documents. 

 
SA-03 
The Super Admin shall be able to restrict or re-enable access for a tenant, or for individual users within a tenant, without deleting their data. 

 
SA-04 
The Super Admin shall be able to enable or disable specific platform features on a per-tenant basis. 

 
SA-05 
The Super Admin shall have a summary view of all tenants and their status (e.g. active, suspended, trial, expired). 
Recommended 
SA-06 
The Super Admin shall be notified ahead of a tenant agreement's renewal or expiry date. 
Recommended 
7.2 Template Marketplace 
ID 
Requirement 
Notes 
TM-01 
The Super Admin shall be able to create and manage multiple templates (e.g. “Support”), each a distinct package of functionality. 

 
TM-02 
The Super Admin shall be able to enable one or more templates for a given tenant. 

 
TM-03 
A tenant's authorised users shall be able to view a catalogue of all available templates. 

 
TM-04 
A tenant's authorised users shall be able to request access to a template not yet enabled for their tenancy. 

 
TM-05 
The Super Admin shall be able to review and approve or reject template access requests. 
Recommended 
TM-06 
A tenant shall be able to have multiple templates active at the same time. 

 
7.3 Project Admin & Department Admin Roles 
ID 
Requirement 
Notes 
PA-01 
The Project Admin shall be able to create and manage users within their tenant's Support template. 

 
PA-02 
The Project Admin shall be able to create departments within the Support template. 

 
PA-03 
The Project Admin shall be able to assign one or more Department Admins to each department. 

 
PA-04 
The Project Admin shall have reporting-level visibility across all departments within their tenancy (see Section 7.14), but shall not have direct access to ticket boards, individual tickets, or ticket communications unless separately granted. 

 
DA-01 
The Department Admin shall be able to add and manage users within their own department only. 

 
DA-02 
A Department Admin shall not be able to view or manage users, boards or settings belonging to another department. 
Recommended — isolation follow-on from DA-01 
7.4 Sub-Departments 
ID 
Requirement 
Notes 
SD-01 
A Department Admin shall be able to create one or more sub-departments within their department. 

 
SD-02 
Each sub-department shall have its own manager. Where none is assigned, the parent Department Admin acts as the sub-department's manager by default. 

 
SD-03 
A sub-department shall be able to have its own dedicated shared mailbox (see Section 7.7), so that email sent to it raises tickets only for that sub-department. 

 
SD-04 
Access shall be controllable at sub-department level: a Department Admin shall be able to grant a colleague access to one or multiple sub-departments, or to the whole department — both grant levels shall be supported. 

 
SD-05 
A sub-department shall inherit its parent department's forms, SLAs and rules; it shall not define its own. 

 
SD-06 
Where a user's access is scoped to one or more specific sub-departments rather than the whole department, they shall not be able to view tickets belonging to other sub-departments within the same parent department. 

 
Why this matters: sub-departments inherit their parent's forms, SLAs and rules by design, and access can be granted at department or sub-department level. The one hard rule any technical approach must satisfy is SD-06: a user scoped to a sub-department must never see another sub-department's tickets. Whether that is built as separate boards or as one board with permission-filtered views is a technical choice, but it affects how filtering (Section 7.15) and reporting (Section 7.14) get built, so worth settling early. 
7.5 Board Management 
ID 
Requirement 
Notes 
BD-01 
Each department shall have its own board, created automatically when the department is set up. 

 
BD-02 
Every new board shall default to five columns: To Do, In Progress, On Hold, Escalated, Done. 

 
BD-03 
The Department Admin shall be able to add custom columns to their board. 

 
BD-04 
The Department Admin shall be able to rename any column, including the default five. 

 
BD-05 
Each column shall map to a fixed underlying status category (e.g. Open, Paused, Escalated, Resolved), independent of its display name. 
Recommended 
BD-06 
The Department Admin shall be able to reorder and delete non-default columns. 
Recommended 
BD-07 
Each ticket shall display a sub-status of either “Waiting for Customer” or “Waiting for Support,” set automatically from whichever side — customer or agent — sent the most recent visible reply. Internal notes are ignored for this calculation. 

 
BD-08 
A ticket shall move to the Escalated column only via manual action by an agent or manager, not automatically on SLA breach. 

 
BD-09 
If a customer replies to a ticket that is in the Done column, the ticket shall move back to the To Do column and receive a “Reopened” label. 

 
Why this matters: because column names are fully customisable, the system needs a fixed, non-editable status type behind each column so SLA countdowns and cross-department reporting stay accurate even when one department calls a column “Awaiting Parts” and another calls the equivalent column “Blocked.” 
7.6 Department Settings — Branding, Email & Notification Templates 
ID 
Requirement 
Notes 
DS-01 
The Department Admin shall be able to upload department-level branding (logo and colour scheme) for use on customer-facing communications. 

 
DS-02 
The Department Admin shall be able to configure one or more sender/reply-to email addresses for outbound ticket correspondence. 

 
DS-03 
The Department Admin shall be able to create and edit a notification template for each stage of the ticket lifecycle, including at minimum: ticket raised, status change/in progress, reply received, and resolved/closed. 

 
DS-04 
Notification templates shall support dynamic placeholder fields (e.g. customer name, ticket ID, department name, agent name) replaced with real values on send. 

 
DS-05 
Each notification template shall have its own customisable footer. 

 
DS-06 
The platform shall support a system-wide default footer, used wherever a template does not define its own. 
Interpretation — see Section 11 
DS-07 
Outbound sender email addresses shall be domain-verified before use, to reduce the risk of messages being marked as spam. 
Recommended 
DS-08 
The platform shall provide suggested default notification templates for a new department. Where no board has yet been created and initial setup has not been reviewed, the Department Admin shall be hard-blocked from proceeding until that review is complete. 

 
DS-09 
Where a department is already active and a new manager joins it, the platform shall instead show a non-blocking, step-by-step overview of the department's current configuration, rather than forcing a full setup review. 

 
DS-10 
This setup overview/walkthrough shall also be available on demand at any time, and the user shall be able to choose which step to start from. 

 
7.7 Email Intake & Shared Mailboxes 
ID 
Requirement 
Notes 
EM-01 
The Department Admin shall be able to connect a mailbox to their department, such that any email received in it automatically creates a new ticket. 

 
EM-02 
The system shall support connecting shared mailboxes, not only individual/personal mailboxes, for this purpose. 

 
EM-03 
A sub-department shall be able to have its own dedicated shared mailbox, so ticket creation from that mailbox routes only to that sub-department. 

 
EM-04 
A reply from the customer to the connected mailbox shall be threaded onto the existing ticket rather than creating a duplicate. 
Recommended 
EM-05 
Connecting a mailbox shall use authentication appropriate to the provider (e.g. OAuth for Microsoft 365/Google Workspace, or IMAP credentials). 
Recommended 
7.8 Dynamic Forms 
ID 
Requirement 
Notes 
FM-01 
The Department Admin shall be able to build multiple custom forms for their department (e.g. one for staff, one for students). 

 
FM-02 
Forms shall support, at minimum: single-line text, multi-line text, dropdown/select, checkbox, radio button, date, number and file upload fields. 

 
FM-03 
Each field shall support validation rules: required/optional, minimum/maximum length, numeric range, and format (e.g. email address). 

 
FM-04 
The Department Admin shall be able to add, remove and reorder fields on a form. 

 
FM-05 
The form builder shall support conditional field visibility (e.g. show Field B only when Field A has a specific value). 
Recommended 
FM-06 
Each form shall be published at its own distinct URL. 

 
7.9 Rules Engine 
ID 
Requirement 
Notes 
RE-01 
The Department Admin shall be able to create rules that trigger on submitted form field values. 

 
RE-02 
Rule actions shall include, at minimum: assign to agent/team, set priority, set category/tag, apply an SLA, change status, send a notification. 
Proposed action list — confirm 
RE-03 
Where more than one rule could match the same ticket, the Department Admin shall be able to set the order in which rules are evaluated. 
Recommended 
RE-04 
The Department Admin shall be able to test a rule against sample data before activating it. 
Recommended 
7.10 SLA Management 
ID 
Requirement 
Notes 
SLA-01 
The Department Admin shall be able to define one or more SLA policies for their department. 

 
SLA-02 
SLA policies shall be configurable based on form field values (e.g. Priority = High triggers a shorter response target). 

 
SLA-03 
SLA timers shall be calculated from ticket creation time, with separate targets for first response and resolution. 

 
SLA-04 
The Department Admin shall be able to configure whether SLA timers pause outside their department's working hours (Section 7.12) or continue counting down regardless — this is a per-department setting, not fixed platform behaviour. 

 
SLA-05 
The Department Admin shall be notified when a ticket is at risk of, or has, breached its SLA. 
Recommended 
SLA-06 
The ticket view shall show a visual SLA countdown or status indicator (on track / at risk / breached). 
Recommended 
7.11 Ticket Assignment & Reassignment 
ID 
Requirement 
Notes 
ASG-01 
The system shall support multiple configurable assignment methods per department: rule-based (by form field), round robin, workload-based, and manual. 

 
ASG-02 
If automatic assignment fails (e.g. no eligible agent available), the system shall display an error to the Department Admin. 

 
ASG-03 
Where automatic assignment fails, the system shall immediately notify the Department Admin so the ticket can be manually escalated or reassigned — it shall not be left silently unrouted. 

 
ASG-04 
Automatic assignment methods shall take agent working hours into account, so tickets are not routed to agents currently off-shift. 

 
ASG-05 
The Department Admin shall be able to bulk reassign tickets from one agent to: a single other agent, a defined group, or the whole department. 

 
ASG-06 
An agent shall be able to transfer a ticket to a different department or sub-department, while retaining visibility to track its subsequent progress. 

 
7.12 Working Hours & Availability 
ID 
Requirement 
Notes 
WH-01 
The Department Admin shall be able to define working hours (days, times, timezone) for each user in their department. 

 
WH-02 
The Department Admin shall be able to mark a user as unavailable (e.g. on leave) for one or more specific dates. 

 
WH-03 
The system shall not automatically assign new tickets to a user during their marked unavailable dates. 

 
WH-04 
Tickets already assigned to a user at the point they become unavailable shall be flagged (e.g. “Waiting — agent unavailable”) so the team can identify and act on them. 

 
WH-05 
The Department Admin shall be able to define a department-level default business calendar, used for SLA calculation when no agent-specific hours apply. 
Recommended 
7.13 Comments & Communication Feed 
ID 
Requirement 
Notes 
CM-01 
All communication on a ticket — customer messages and agent responses — shall appear together in a single chronological feed on the ticket. 

 
CM-02 
When posting a comment, the agent shall choose whether it is an Internal Note (visible only within the department) or a Reply (visible to the customer, sent via the relevant notification template). 

 
CM-03 
Internal notes and customer-visible replies shall be visually distinguished from one another in the feed. 
Recommended 
CM-04 
Comments shall support rich text formatting and file attachments. 
Recommended 
CM-05 
Agents shall be able to @mention a colleague within an internal note to draw their attention to it. 
Recommended 
7.14 Reporting & Analytics 
ID 
Requirement 
Notes 
RPT-01 
Each department shall have a reporting section showing ticket volumes by type/category. 

 
RPT-02 
The reporting section shall show resolution time broken down by ticket priority. 

 
RPT-03 
The reporting section shall allow performance to be viewed and compared across user-selectable time ranges. 

 
RPT-04 
The Department Admin shall be able to build custom reports based on their department's own form fields. 

 
RPT-05 
Reports shall be exportable in both CSV and PDF formats. 

 
RPT-06 
The Project Admin's cross-department visibility (PA-04) shall be served by both a live, real-time dashboard and periodic exportable reports, aggregated across departments. 
Reading “yes” as confirming both — flag if only one was intended 
7.15 Board Filtering & Search 
ID 
Requirement 
Notes 
FLT-01 
Each board shall support filtering tickets by assignee. 

 
FLT-02 
Each board shall support filtering tickets by any custom form field. 

 
FLT-03 
Each board shall provide a generic free-text search across tickets. 

 
FLT-04 
Common filters — status, sub-status, priority, and date range — should be available alongside the custom field filters above. 
Recommended 

  8. Additional Recommended Requirements (Proposed) 
Reporting and board-level search, previously proposed here as AR-01 and AR-10 in v0.1, have been confirmed by the business and are now specified in Sections 7.14 and 7.15. The items below remain proposed only — not explicitly requested, but commonly expected in a platform of this kind — and should be reviewed and either pulled into scope or explicitly parked. 
ID 
Area 
Recommendation 
AR-01 
Notifications 
In-app and email notifications for assignment, mentions, SLA breaches and status changes, with per-user preferences. 
AR-02 
Customer Self-Service Portal 
Deferred: confirmed out of scope for this phase, email-only (see Appendix D). Worth revisiting as a future phase. 
AR-03 
Knowledge Base 
Department-level help articles/FAQs to deflect repetitive tickets. 
AR-04 
Escalation Management 
Now partly covered by the Escalated column (BD-02/07) and SLA breach alerts (SLA-05); still open is whether breaching tickets escalate automatically or only manually. 
AR-05 
Attachments 
File upload on tickets, forms and comments, with size/type restrictions. 
AR-06 
Merge & Split Tickets 
Merge duplicate tickets; split a multi-issue ticket into separate ones. 
AR-07 
Macros / Canned Responses 
Predefined response snippets agents can insert to speed up replies. 
AR-08 
CSAT Survey 
Optional post-resolution satisfaction rating sent to the customer. 
AR-09 
Audit Log 
Platform-wide log of key admin actions (user, permission, SLA and rule changes) for accountability. 
AR-10 
Integrations / API 
Webhooks or a REST API for connecting to other systems (e.g. CRM, Slack/Teams). 
AR-11 
Data Retention & Compliance 
A defined retention policy and UK GDPR compliance (data export, right to erasure). 
AR-12 
Multi-language Support 
Localisation of templates and portal where tenants/customers operate in different languages. 
AR-13 
Standard Priority & Category Fields 
Fixed priority/category fields alongside custom form fields, so reporting stays comparable across departments with different forms. 
AR-14 
Mobile Responsiveness 
Agent and customer interfaces usable on mobile browsers.  9. Non-Functional Requirements 
ID 
Requirement 
NFR-01 
Tenant data shall be logically isolated; no tenant or department shall be able to access another's data. 
NFR-02 
Role-based access control shall be enforced at the API level, not just in the interface. 
NFR-03 
Data shall be encrypted at rest and in transit. 
NFR-04 
Authentication shall support single sign-on and multi-factor authentication. 
NFR-05 
Core ticket and board views shall load within an acceptable time under expected concurrent load (target to be agreed). 
NFR-06 
The platform shall support growth in tenant count, ticket volume and concurrent users without redesign. 
NFR-07 
An availability/uptime target shall be agreed and documented. 
NFR-08 
The platform shall comply with UK GDPR / Data Protection Act requirements for any personal data it processes. 
NFR-09 
Key administrative and configuration actions shall be logged for audit purposes. 
NFR-10 
Customer-facing forms and portal should meet WCAG 2.1 AA accessibility guidelines.  10. Assumptions 
“Agreement” management is treated as a contractual/administrative record, not a billing or invoicing engine. 
A responsive web interface is assumed; native mobile apps are not in scope unless confirmed otherwise. 
Only the Support template's internal functionality is specified here; other templates are assumed to exist only at catalogue level for now. 
No data migration from an existing ticketing tool is assumed.  11. Open Questions for Stakeholder Review 
Should the deferred customer self-service portal be tracked as a named future phase, or left fully out of scope for now? (Carried forward — not yet answered.) 
Is the system-wide default footer (DS-06) an editable fallback the Super Admin or Department Admin can configure, or a fixed platform-level legal disclaimer? 
When a closed ticket is reopened by a customer reply (BD-09), does its SLA timer restart, resume from where it left off, or does a fresh SLA apply? 
Can any agent manually move a ticket to Escalated (BD-08), or is that restricted to managers/Department Admins? 
Does the “Reopened” label (BD-09) clear automatically once an agent responds, or does it need to be manually cleared? 

  12. Appendix 
A. Default Board Columns 
Column 
Underlying Status Type 
To Do 
Open 
In Progress 
Open 
On Hold 
Paused 
Escalated 
Escalated 
Done 
Resolved 
B. Example Dynamic Field Types 
Field Type 
Example Use 
Single-line text 
Ticket subject 
Multi-line text 
Issue description 
Dropdown 
Category selection 
Checkbox 
“I confirm this is urgent” 
Radio button 
Contact preference 
Date 
Preferred callback date 
Number 
Number of affected users 
File upload 
Screenshot attachment 
C. Example SLA Matrix (illustrative only) 
Priority 
First Response Target 
Resolution Target 
Urgent 
1 hour 
4 hours 
High 
4 hours 
1 business day 
Medium 
1 business day 
3 business days 
Low 
2 business days 
5 business days 
D. Stakeholder Decisions Log (v0.1 → v0.2) 
Original Question 
Decision 
Does a tenant represent an external client, or an internal division? 
Confirmed: external client organisation. 
Can a department have more than one form? 
Confirmed: multiple forms allowed, each with its own distinct URL (e.g. staff vs students). 
Should SLA timers pause outside working hours? 
Configurable per department, at the Department Admin's discretion (SLA-04). 
Should automatic assignment exclude off-shift agents? 
Extended: Department Admin can mark a user unavailable for specific dates; no new tickets assigned during that window; tickets already assigned are flagged (WH-02–WH-04). 
What happens when automatic assignment fails? 
Escalate immediately (ASG-03). 
Does the Project Admin need reporting visibility across departments? 
Reporting visibility only — no access to ticket boards or communications (PA-04). 
Is a customer self-service portal required? 
Not for this phase; email only. 
Should branding and notification templates be shareable across departments? 
Suggested/default templates are provided; on first login the Department Admin must review all templates and other initial settings (DS-08). 
Do sub-departments share a board, or have their own? 
Technical implementation is flexible — but sub-department-scoped access must never expose another sub-department's tickets (SD-06). 
Do sub-departments have their own forms/SLAs/rules? 
No — they inherit the parent department's (SD-05). 
Does the SD-04 access grant operate at department or sub-department level? 
Both are supported. 
What triggers the Escalated column? 
Manual action only, not automatic SLA breach (BD-08). Also newly added: a customer reply on a closed ticket reopens it to To Do with a Reopened label (BD-09). 
What must be reviewed before setup counts as done? 
Hard block only for a brand-new department with no board yet created (DS-08). An existing department with a newly-joined manager instead gets a non-blocking step-by-step overview (DS-09), plus an on-demand walkthrough revisitable from any step (DS-10). 
Reporting export formats and Project Admin view type? 
Both CSV and PDF export; both a live dashboard and periodic reports for the Project Admin's cross-department view (RPT-05, RPT-06).
