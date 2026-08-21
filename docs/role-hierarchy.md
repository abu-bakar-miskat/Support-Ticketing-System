# Role hierarchy

Product decision (2026-08-21). This is the authorization contract. It **supersedes SRS-PA-04** (Project Admin reporting-only across departments).

GitHub: [#21](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/21) (parent), [#22](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/22) Super Admin, [#23](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/23) Admin, [#24](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/24) Manager, [#25](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/25) Sub-manager, [#26](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/26) Agent. RoleAssignment cutover: [#4](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/4).

Roles are **scoped assignments**. A user may hold more than one. Power applies only at the scopes they were added to. Server-side checks are the authority; UI hiding is convenience.

| Role | Scope | Summary |
| --- | --- | --- |
| **Super Admin** | Platform | All tenants, tenant settings, department templates. |
| **Admin** | Tenant and/or department, where added as admin | Full department power: change, settings, delete. |
| **Manager** | Department, where assigned as manager | Operational power over that department. No department delete, no admin-only settings. |
| **Sub-manager** | Sub-department, where added | Operational power over that sub-department only. |
| **Agent** | Department or sub-department, where added | Normal staff: work tickets in scope. No settings, no user admin. |

The canonical record is `RoleAssignment(userId, role, scopeType, scopeId)` with `scopeType` ∈ `PLATFORM` | `TENANT` | `DEPARTMENT` | `SUB_DEPARTMENT`.

---

## Super Admin (`PLATFORM`)

Manages the platform, not a substitute for being added as Admin/Manager of a department.

**Can**
- Create, edit, suspend, restore, and soft-delete tenants
- Tenant-level settings: feature flags, agreements, branding at tenant scope
- Template catalogue: create, edit, publish/unpublish, enable/disable per tenant, approve/reject access requests
- Open the platform console (tenants, templates, activity, platform settings)
- Switch into a tenant for platform administration

**Cannot**
- Be the only check that grants department settings — department change/delete still requires an Admin assignment on that tenant or department (Super Admin may grant those assignments)
- Publish or edit templates from a tenant-admin screen; that stays on the platform catalogue

---

## Admin (`admin` at `TENANT` or `DEPARTMENT`)

Full department-level power **only where they were added as admin**.

- **Tenant-scoped admin** — every department in that tenant: create, configure, and delete departments; all settings; assign Admins, Managers, Sub-managers, Agents.
- **Department-scoped admin** — those departments only. Cannot create or delete sibling departments they were not added to.

**Can (in assigned scope)**
- Change department configuration: branding, senders, notification templates, SLA, rules, forms, mailbox, board columns, assignment method, working hours defaults
- Delete (or deactivate) the department
- Create, edit, delete sub-departments
- Manage all users in that department and its sub-departments
- Full board, ticket, and message access
- Department reports and exports

**Cannot**
- Other tenants
- Departments they were not added to as admin (or as tenant admin of that tenant)
- Platform template catalogue write (Super Admin)
- Feature flags / agreements (Super Admin)

---

## Manager (`manager` at `DEPARTMENT`)

Power over departments **where assigned as manager**. Day-to-day operation, not ownership.

**Can (in assigned departments)**
- Add, remove, and manage Agents and Sub-managers (not Admins)
- Tickets, board moves, assignment, bulk reassign, transfer
- Working hours and unavailability for members
- Create and edit sub-departments; assign a sub-manager
- Operational labels/tags as today for managers
- Department reports for assigned departments

**Cannot**
- Delete the department
- Admin-only settings: branding, SLA policies, rules engine, intake forms, mailbox connection, notification templates
- Tenant or platform settings, templates, feature flags
- Other departments

---

## Sub-manager (`sub_manager` at `SUB_DEPARTMENT`)

Power over sub-departments **where they were added**. Parent department forms, SLAs, and rules still apply; sub-managers do not define them.

**Can (in assigned sub-departments)**
- Manage Agents in that sub-department
- Work, assign, and transfer tickets in that sub-department
- Sub-department mailbox (if connected)
- See only tickets in granted sub-departments (SD-06)

**Cannot**
- Other sub-departments in the same department
- Parent department settings, delete, or user admin outside the sub-department
- When no sub-manager is assigned, the parent Department Admin (then Manager) is the effective manager for notify/authz

---

## Agent (`agent` at `DEPARTMENT` or `SUB_DEPARTMENT`)

Normal staff.

**Can (in assigned scope)**
- View the board and tickets in scope
- Comment (internal note / reply), attach files, @mention colleagues who also have access
- Transfer or reassign tickets they can access
- Update their own profile, appearance, notifications, schedule

**Cannot**
- Settings, members, SLA, rules, forms, mailbox, branding
- Create or delete departments or sub-departments
- See tickets outside granted sub-department scope

---

## Implementation notes (current gaps)

- `deriveEffectiveRole` maps a **department-scoped admin** to `manager`, so Admin and Manager collapse.
- `departmentAdminIds` treats admin and manager as the same.
- Many routes authorize with global `profile.role === "admin"` instead of “admin assignment on this tenant/department”.
- Tenant admin currently has unrestricted ticket access; that stays **in-scope full power** (this hierarchy), not reporting-only.
- Platform layout currently lets tenant admins into `/platform`; template write must stay Super Admin.
