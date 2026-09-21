import {
  Activity,
  AtSign,
  Calendar,
  CalendarDays,
  Folder,
  ListTree,
  MessageCircle,
  MoveRight,
  Paperclip,
  Plus,
  Tag,
  Text,
  Timer,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
  Zap,
} from "lucide-react";

// Presentation metadata for per-ticket ActivityLog actions. Shared by the
// classic /activity feed and the unified audit log so the two never drift.

export type ActivityAction =
  | "STATUS_CHANGED"
  | "ASSIGNED"
  | "CO_ASSIGNEE_ADDED"
  | "CO_ASSIGNEE_REMOVED"
  | "QA_ASSIGNEE_ADDED"
  | "QA_ASSIGNEE_REMOVED"
  | "COMMENT_ADDED"
  | "ATTACHMENT_ADDED"
  | "MENTION"
  | "DATE_CHANGED"
  | "FORWARDED"
  | "TICKET_DELETED"
  | "TICKET_CREATED"
  | "TITLE_CHANGED"
  | "PRIORITY_CHANGED"
  | "DESCRIPTION_CHANGED"
  | "STORY_POINTS_CHANGED"
  | "ESTIMATED_TIME_CHANGED"
  | "SPRINT_CHANGED"
  | "PROJECT_CHANGED"
  | "LABELS_CHANGED"
  | "MODULE_CHANGED"
  | "SUBTICKET_ADDED"
  | "TIMER_RESET"
  | "QA_TIME_LOGGED"
  | "PR_MERGED"
  | "FIELD_CHANGED"
  | "ASSIGNMENT_FAILED";

export const ACTION_META: Record<ActivityAction, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  STATUS_CHANGED:         { icon: MoveRight,     color: "#0a76b9", bg: "#0a76b915", label: "Status changed"         },
  ASSIGNED:               { icon: UserCheck,     color: "#7c3aed", bg: "#7c3aed15", label: "Assigned"               },
  CO_ASSIGNEE_ADDED:      { icon: UserPlus,      color: "#7c3aed", bg: "#7c3aed15", label: "Co-assignee added"      },
  CO_ASSIGNEE_REMOVED:    { icon: UserMinus,     color: "#7c3aed", bg: "#7c3aed15", label: "Co-assignee removed"    },
  QA_ASSIGNEE_ADDED:      { icon: UserPlus,      color: "#0d9488", bg: "#0d948815", label: "QA added"               },
  QA_ASSIGNEE_REMOVED:    { icon: UserMinus,     color: "#0d9488", bg: "#0d948815", label: "QA removed"             },
  COMMENT_ADDED:          { icon: MessageCircle, color: "#059669", bg: "#05966915", label: "Comment"                },
  ATTACHMENT_ADDED:       { icon: Paperclip,     color: "#f97316", bg: "#f9731615", label: "Attachment"             },
  MENTION:                { icon: AtSign,        color: "#0a76b9", bg: "#0a76b915", label: "Mention"                },
  DATE_CHANGED:           { icon: Calendar,      color: "#ec4899", bg: "#ec489915", label: "Date changed"           },
  FORWARDED:              { icon: Zap,           color: "#f97316", bg: "#f9731615", label: "Forwarded"              },
  TICKET_DELETED:         { icon: X,             color: "#dc2626", bg: "#dc262615", label: "Deleted"                },
  TICKET_CREATED:         { icon: Plus,          color: "#059669", bg: "#05966915", label: "Ticket created"         },
  TITLE_CHANGED:          { icon: Text,          color: "#64748b", bg: "#64748b15", label: "Title changed"          },
  PRIORITY_CHANGED:       { icon: TrendingUp,    color: "#f97316", bg: "#f9731615", label: "Priority changed"       },
  DESCRIPTION_CHANGED:    { icon: Text,          color: "#64748b", bg: "#64748b15", label: "Description changed"    },
  STORY_POINTS_CHANGED:   { icon: Activity,      color: "#0a76b9", bg: "#0a76b915", label: "Story points changed"   },
  ESTIMATED_TIME_CHANGED: { icon: Timer,         color: "#0a76b9", bg: "#0a76b915", label: "Estimated time changed" },
  SPRINT_CHANGED:         { icon: CalendarDays,  color: "#ec4899", bg: "#ec489915", label: "Sprint changed"         },
  PROJECT_CHANGED:        { icon: Folder,        color: "#7c3aed", bg: "#7c3aed15", label: "Project changed"        },
  LABELS_CHANGED:         { icon: Tag,           color: "#059669", bg: "#05966915", label: "Labels changed"         },
  MODULE_CHANGED:         { icon: Folder,        color: "#0a76b9", bg: "#0a76b915", label: "Module changed"         },
  SUBTICKET_ADDED:        { icon: ListTree,      color: "#059669", bg: "#05966915", label: "Sub-ticket added"       },
  TIMER_RESET:            { icon: Timer,         color: "#dc2626", bg: "#dc262615", label: "Timer reset"            },
  QA_TIME_LOGGED:         { icon: Timer,         color: "#0d9488", bg: "#0d948815", label: "QA time logged"         },
  PR_MERGED:              { icon: Zap,           color: "#7c3aed", bg: "#7c3aed15", label: "PR merged"              },
  FIELD_CHANGED:          { icon: Text,          color: "#64748b", bg: "#64748b15", label: "Field changed"          },
  ASSIGNMENT_FAILED:      { icon: Zap,           color: "#dc2626", bg: "#dc262615", label: "Assignment failed"      },
};

// Fallback so an activity row with an action not present in ACTION_META (e.g. a
// newly added DB enum value the client hasn't shipped yet) renders as a generic
// entry instead of throwing `Cannot read properties of undefined (reading 'icon')`
// — which previously crashed the entire feed to a blank screen.
export const FALLBACK_ACTION_META = { icon: Activity, color: "#64748b", bg: "#64748b15", label: "Activity" };

export const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#ff4500", Critical: "#dc2626", High: "#f97316", Medium: "#ec4899", Low: "#94a3b8",
};

export const ACTION_FILTER_OPTIONS: { value: ActivityAction | ""; label: string }[] = [
  { value: "",                       label: "All actions"           },
  { value: "TICKET_CREATED",         label: "Tickets created"       },
  { value: "STATUS_CHANGED",         label: "Status changes"        },
  { value: "ASSIGNED",               label: "Assignments"           },
  { value: "CO_ASSIGNEE_ADDED",      label: "Co-assignee added"     },
  { value: "CO_ASSIGNEE_REMOVED",    label: "Co-assignee removed"   },
  { value: "COMMENT_ADDED",          label: "Comments"              },
  { value: "ATTACHMENT_ADDED",       label: "Attachments"           },
  { value: "MENTION",                label: "Mentions"              },
  { value: "DATE_CHANGED",           label: "Date changes"          },
  { value: "FORWARDED",              label: "Forwarded"             },
  { value: "TICKET_DELETED",         label: "Deleted"               },
  { value: "TITLE_CHANGED",          label: "Title changes"         },
  { value: "PRIORITY_CHANGED",       label: "Priority changes"      },
  { value: "DESCRIPTION_CHANGED",    label: "Description changes"   },
  { value: "STORY_POINTS_CHANGED",   label: "Story point changes"   },
  { value: "ESTIMATED_TIME_CHANGED", label: "Estimate changes"      },
  { value: "SPRINT_CHANGED",         label: "Sprint changes"        },
  { value: "PROJECT_CHANGED",        label: "Project changes"       },
  { value: "LABELS_CHANGED",         label: "Label changes"         },
  { value: "MODULE_CHANGED",         label: "Module changes"        },
  { value: "SUBTICKET_ADDED",        label: "Sub-tickets added"     },
  { value: "TIMER_RESET",            label: "Timer resets"          },
];

export function describeTicketAction(action: ActivityAction, meta: Record<string, unknown>): string {
  switch (action) {
    case "STATUS_CHANGED":
      if (meta.source === "github")
        return `moved to "${meta.to ?? "?"}" · PR merged to ${meta.base ?? "main"}`;
      return meta.from && meta.to ? `moved from "${meta.from}" to "${meta.to}"` : `changed status to "${meta.to ?? "?"}"`;
    case "ASSIGNED":               return meta.toName ? `assigned to ${String(meta.toName)}` : "unassigned";
    case "CO_ASSIGNEE_ADDED":      return meta.userName ? `added ${String(meta.userName)} as co-assignee` : "added a co-assignee";
    case "CO_ASSIGNEE_REMOVED":    return meta.userName ? `removed ${String(meta.userName)} as co-assignee` : "removed a co-assignee";
    case "QA_ASSIGNEE_ADDED":      return meta.userName ? `assigned ${String(meta.userName)} to QA` : "added a QA assignee";
    case "QA_ASSIGNEE_REMOVED":    return meta.userName ? `removed ${String(meta.userName)} from QA` : "removed a QA assignee";
    case "COMMENT_ADDED":          return "added a comment";
    case "ATTACHMENT_ADDED":       return meta.fileName ? `attached "${meta.fileName}"` : "attached a file";
    case "MENTION":                return meta.mentionedName ? `mentioned ${String(meta.mentionedName)}` : "mentioned someone";
    case "DATE_CHANGED":           return meta.to ? `set due date to ${String(meta.to)}` : "changed the due date";
    case "FORWARDED":              return meta.toSubDepartmentName ? `forwarded to ${String(meta.toSubDepartmentName)}` : "forwarded";
    case "TICKET_DELETED":         return "deleted the ticket";
    case "TICKET_CREATED": {
      // Support-form / mailbox tickets are authored by "System"; surface the
      // requester's email alongside the created ticket.
      const email = (meta.submitterEmail ?? meta.fromEmail) as string | undefined;
      const base = meta.humanId ? `created ticket ${meta.humanId}` : "created the ticket";
      return email ? `${base} for ${email}` : base;
    }

    case "TITLE_CHANGED":          return meta.to ? `renamed to "${meta.to}"` : "changed the title";
    case "PRIORITY_CHANGED":       return meta.from && meta.to ? `changed priority from ${meta.from} to ${meta.to}` : `changed priority to ${meta.to ?? "?"}`;
    case "DESCRIPTION_CHANGED":    return meta.hadDescription ? "updated the description" : "added a description";
    case "STORY_POINTS_CHANGED":   return meta.to != null ? `set story points to ${meta.to}` : "cleared story points";
    case "ESTIMATED_TIME_CHANGED": return meta.to != null ? `set estimate to ${meta.to}h` : "cleared estimate";
    case "SPRINT_CHANGED":         return meta.toName ? `moved to sprint "${meta.toName}"` : "removed from sprint";
    case "PROJECT_CHANGED":        return meta.toName ? `moved to project "${meta.toName}"` : "removed from project";
    case "LABELS_CHANGED":         return "changed labels";
    case "MODULE_CHANGED":         return meta.toName ? `moved to module "${meta.toName}"` : "removed from module";
    case "SUBTICKET_ADDED":        return meta.humanId ? `added sub-ticket ${meta.humanId}` : "added a sub-ticket";
    case "TIMER_RESET":            return "manually reset their development timer";
    case "QA_TIME_LOGGED": {
      const secs = typeof meta.durationSecs === "number" ? meta.durationSecs : 0;
      if (secs <= 0) return "logged QA time";
      if (secs < 60) return `logged ${secs}s of QA time`;
      const mins = Math.round(secs / 60);
      return mins >= 60
        ? `logged ${Math.floor(mins / 60)}h ${mins % 60}m of QA time`
        : `logged ${mins}m of QA time`;
    }
    case "PR_MERGED":              return meta.base ? `merged a PR to ${String(meta.base)}` : "merged a pull request";
    case "FIELD_CHANGED":          return "updated a field";
    case "ASSIGNMENT_FAILED":      return "could not be auto-assigned";
    default:                       return "updated the ticket";
  }
}
