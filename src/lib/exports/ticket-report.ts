import type { BoardCardData } from "@/components/board/board-types";
import type { ExportColumn, ExportDoc } from "./report-doc";
import { exportFileName } from "./report-doc";

export type ReportRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  project: string;
  module: string;
  assignee: string;
  coAssignees: string;
  creator: string;
  labels: string;
  subtasks: string;
  comments: number;
  attachments: number;
  estimatedMins: number | null;
  logged: string;
  created: string;
  start: string;
  due: string;
};

export const TICKET_COLUMNS: ExportColumn[] = [
  { key: "id",            header: "Ticket ID",   width: 14, pdf: true },
  { key: "title",         header: "Title",       width: 44, pdf: true },
  { key: "status",        header: "Status",      width: 16, pdf: true },
  { key: "priority",      header: "Priority",    width: 12, pdf: true },
  { key: "source",        header: "Source",      width: 12 },
  { key: "project",       header: "Project",     width: 22, pdf: true },
  { key: "module",        header: "Module",      width: 18 },
  { key: "assignee",      header: "Assignee",    width: 20, pdf: true },
  { key: "coAssignees",   header: "Co-assignees", width: 24 },
  { key: "creator",       header: "Creator",     width: 20 },
  { key: "labels",        header: "Labels",      width: 24 },
  { key: "subtasks",      header: "Subtasks",    width: 12 },
  { key: "comments",      header: "Comments",    width: 10 },
  { key: "attachments",   header: "Attachments", width: 10 },
  { key: "estimatedMins", header: "Est. (min)",  width: 10 },
  { key: "logged",        header: "Logged",      width: 12 },
  { key: "created",       header: "Created",     width: 14, pdf: true },
  { key: "start",         header: "Start",       width: 14 },
  { key: "due",           header: "Due",         width: 14, pdf: true },
];

function formatLogged(totalSecs: number): string {
  if (!totalSecs) return "";
  const mins = Math.round(totalSecs / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function toReportRow(card: BoardCardData): ReportRow {
  return {
    id: card.humanId,
    title: card.title,
    status: card.status,
    priority: capitalize(card.priority),
    source: card.hasIntake ? "Support" : "Manual",
    project: card.project,
    module: card.moduleName ?? "",
    assignee: card.assigneeName ?? "Unassigned",
    coAssignees: card.coAssignees.map((a) => a.name).join(", "),
    creator: card.creatorName,
    labels: card.labels.join(", "),
    subtasks: card.subTotal ? `${card.subDone}/${card.subTotal}` : "",
    comments: card.comments,
    attachments: card.attachments,
    estimatedMins: card.estimatedTime,
    logged: formatLogged(card.totalLoggedSecs),
    created: card.createdIso ? card.createdIso.slice(0, 10) : "",
    start: card.startDateIso ?? "",
    due: card.dueDateIso ?? "",
  };
}

export function toReportRows(cards: BoardCardData[]): ReportRow[] {
  return cards.map(toReportRow);
}

export function buildTicketExportDoc(cards: BoardCardData[]): ExportDoc {
  const rows = toReportRows(cards);
  return {
    title: "Ticket Report",
    subtitle: `${rows.length} ticket${rows.length === 1 ? "" : "s"} · Generated ${new Date().toLocaleString()}`,
    sheets: [{ name: "Tickets", columns: TICKET_COLUMNS, rows }],
  };
}

export { exportFileName };
