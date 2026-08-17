# API Overview

All routes require the user to be **logged in**. Routes marked **Admin only** also require the user to have the `admin` role.

---

## Tickets

### `POST /api/tickets`
Create a new ticket.
- **Who:** Any logged-in user (must be assigned to a team)
- **Body:** `title`, `type` (Bug / Feature / Task / Chore), `priority` (Low / Medium / High / Urgent), `projectId`, `assigneeId` (optional)
- **What happens:** Creates the ticket with status `Backlog`. If an assignee is set, sends them an email notification.

### `PATCH /api/tickets/[id]`
Update a ticket's assignee.
- **Who:** Any logged-in user
- **Body:** `assigneeId` (can be `null` to unassign)
- **What happens:** Changes who the ticket is assigned to and logs the change. Sends an email to the new assignee.

### `PATCH /api/tickets/[id]/status`
Advance a ticket's status to the next stage.
- **Who:** Only the person currently assigned to the ticket
- **Body:** `to` — the next status you want to move to
- **Allowed flow:** `Backlog → InProgress → PullRequest → Live`
- **What happens:** Updates the status. A database trigger logs the activity automatically.

---

## Comments

### `POST /api/tickets/[id]/comments`
Add a comment to a ticket.
- **Who:** Any logged-in user
- **Body:** `body` (the comment text)
- **What happens:** Saves the comment, logs the activity, and sends email notifications to any `@mentioned` users.

### `PATCH /api/comments/[id]`
Edit your own comment.
- **Who:** The comment's author only
- **Body:** `body` (new text)
- **What happens:** Updates the comment text, marks it as edited. Re-processes `@mentions` but skips people who were already notified.

### `DELETE /api/comments/[id]`
Soft-delete your own comment.
- **Who:** The comment's author only
- **What happens:** Sets `deletedAt` timestamp — the comment is hidden but not permanently removed.

---

## Attachments

### `POST /api/attachments`
Upload a file and attach it to a ticket.
- **Who:** Any logged-in user
- **Body:** `multipart/form-data` — `file`, `ticketId`, `commentId` (optional)
- **What happens:** Uploads the file to Supabase Storage, saves the attachment record, and logs the activity.

---

## Admin — Projects *(Admin only)*

### `GET /api/admin/projects`
List all projects (also accessible by any logged-in user — needed for the ticket creation form).

### `POST /api/admin/projects`
Create a new project.
- **Body:** `name`, `slug` (optional — auto-generated from name if not provided)

### `DELETE /api/admin/projects/[id]`
Delete a project.
- **Blocked if:** The project still has tickets.

---

## Admin — Teams *(Admin only)*

### `GET /api/admin/teams`
List all teams (with their department and ticket count).

### `POST /api/admin/teams`
Create a new team.
- **Body:** `name`, `prefix` (2–5 uppercase letters, used in ticket IDs like `ENG-42`), `departmentId`

### `DELETE /api/admin/teams/[id]`
Delete a team.
- **Blocked if:** The team still has tickets.

---

## Admin — Users *(Admin only)*

### `GET /api/admin/users`
List all users with their team info.

### `PATCH /api/admin/users/[id]`
Update a user's role or team assignment.
- **Body:** `role` (`admin` or `developer`), `teamId` (or `null` to remove from team)

---

## Admin — Departments *(Admin only)*

### `GET /api/admin/departments`
List all departments (with team count per department).

### `POST /api/admin/departments`
Create a new department.
- **Body:** `name`

### `DELETE /api/admin/departments/[id]`
Delete a department (no safety check — deletes immediately).

---

## Auth Rules Summary

| Access Level | What it means |
|---|---|
| Logged in | Valid session required |
| Admin only | Must have `role = admin` in their profile |
| Owner only | Must be the author/assignee of that specific record |
