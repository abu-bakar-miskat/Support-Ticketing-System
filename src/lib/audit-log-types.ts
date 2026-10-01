/**
 * Unified audit-log shape. Both the per-ticket `ActivityLog` and the admin
 * `AuditEvent` tables are normalized into this at read time (see
 * lib/audit-log-feed.ts) so one feed can show every action side by side.
 *
 * Types only — safe to import from both client components and server code.
 */

export type AuditSource = "ticket" | "admin";

export type AuditScopeKind = "department" | "platform";

export type AuditActor = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type AuditTicketRef = {
  id: string;
  humanId: string;
  title: string;
  status: string;
  priority: string;
  subDepartmentName: string;
  projectName: string | null;
  projectColor: string | null;
};

export type AuditTargetRef = {
  type: string;
  id: string;
  /** Resolved display name (a person, template, or feature). Null when unknown. */
  name: string | null;
};

export type AuditLogEntry = {
  /** Globally-unique across both sources (source-prefixed) — also the cursor key. */
  id: string;
  source: AuditSource;
  /** Raw action: ActivityAction enum (ticket) or TARGET_VERB string (admin). */
  action: string;
  createdAt: string;
  actor: AuditActor | null;
  tenant: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  // Ticket-source only
  ticket: AuditTicketRef | null;
  metadata: Record<string, unknown> | null;
  // Admin-source only
  target: AuditTargetRef | null;
  before: unknown;
  after: unknown;
};

export type AuditFeedResponse = {
  entries: AuditLogEntry[];
  nextCursor: string | null;
};

export type AuditFilterOption = { id: string; name: string };
