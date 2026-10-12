import type { ExportDoc, ExportSheet } from "./report-doc";
import type { ReportsOverview, SubDepartmentTimeResponse } from "@/lib/api/reports";

type NamedCountLike = { name: string; count: number };

function namedCountSheet(name: string, rows: NamedCountLike[]): ExportSheet {
  return {
    name,
    columns: [
      { key: "name", header: "Name", width: 32 },
      { key: "count", header: "Count", width: 12 },
    ],
    rows: rows.map((r) => ({ name: r.name, count: r.count })),
  };
}

/**
 * Assembles the Reports page's already-loaded data into a multi-sheet export
 * document. Only sheets with data are included. Runs in the browser.
 */
export function buildReportsExportDoc(args: {
  subDepartmentTime?: SubDepartmentTimeResponse;
  overview?: ReportsOverview;
  rangeLabel: string;
  scopeLabel?: string;
}): ExportDoc {
  const { subDepartmentTime, overview, rangeLabel, scopeLabel } = args;
  const sheets: ExportSheet[] = [];

  if (subDepartmentTime) {
    if (subDepartmentTime.stats.length) {
      sheets.push({
        name: "Dev Summary",
        columns: [
          { key: "label", header: "Metric", width: 22 },
          { key: "value", header: "Value", width: 14 },
          { key: "detail", header: "Detail", width: 30 },
        ],
        rows: subDepartmentTime.stats.map((s) => ({ label: s.label, value: s.value, detail: s.detail })),
      });
    }
    if (subDepartmentTime.members.length) {
      sheets.push({
        name: "Dev Members",
        columns: [
          { key: "name", header: "Name", width: 24 },
          { key: "role", header: "Role", width: 14 },
          { key: "location", header: "SubDepartment", width: 18 },
          { key: "weekHours", header: "Hours", width: 12 },
          { key: "weekProgress", header: "Progress %", width: 12 },
          { key: "closed", header: "Closed", width: 10 },
          { key: "topProject", header: "Top Project", width: 22 },
          { key: "active", header: "Last Active", width: 14 },
        ],
        rows: subDepartmentTime.members.map((m) => ({
          name: m.name,
          role: m.role,
          location: m.location,
          weekHours: m.weekHours,
          weekProgress: m.weekProgress,
          closed: m.closed,
          topProject: m.topProject,
          active: m.active,
        })),
      });
    }
    if (subDepartmentTime.projects.length) {
      sheets.push({
        name: "Time by Project",
        columns: [
          { key: "name", header: "Project", width: 30 },
          { key: "hours", header: "Hours", width: 12 },
          { key: "share", header: "Share %", width: 10 },
          { key: "contributors", header: "Contributors", width: 14 },
        ],
        rows: subDepartmentTime.projects.map((p) => ({
          name: p.name,
          hours: p.hours,
          share: p.share,
          contributors: p.contributors,
        })),
      });
    }
  }

  if (overview) {
    sheets.push({
      name: "Ticket Sources",
      columns: [
        { key: "source", header: "Ticket Source", width: 28 },
        { key: "count", header: "Tickets", width: 12 },
      ],
      rows: [
        { source: "Total tickets", count: overview.totals.total },
        { source: "Custom / manual", count: overview.ticketSources.manual },
        { source: "Support", count: overview.ticketSources.support },
        { source: "Portal", count: overview.ticketSources.portal },
        { source: "Shared mailbox", count: overview.ticketSources.mailbox },
      ],
    });
    sheets.push({
      name: "Person Performance",
      columns: [
        { key: "name", header: "Person", width: 26 },
        { key: "assigned", header: "Assigned", width: 12 },
        { key: "completed", header: "Completed", width: 12 },
        { key: "slaMet", header: "SLA met", width: 12 },
        { key: "slaMissed", header: "SLA missed", width: 12 },
        { key: "slaPending", header: "SLA pending", width: 12 },
        { key: "noSla", header: "No SLA", width: 12 },
      ],
      rows: overview.personPerformance.map((person) => ({ ...person })),
    });
    sheets.push({
      name: "Totals",
      columns: [
        { key: "open", header: "Open", width: 12 },
        { key: "closed", header: "Closed", width: 12 },
        { key: "total", header: "Total", width: 12 },
      ],
      rows: [{ open: overview.totals.open, closed: overview.totals.closed, total: overview.totals.total }],
    });
    if (overview.statusDist.length) {
      sheets.push({
        name: "Status Distribution",
        columns: [
          { key: "label", header: "Status", width: 20 },
          { key: "count", header: "Count", width: 12 },
        ],
        rows: overview.statusDist.map((d) => ({ label: d.label, count: d.count })),
      });
    }
    if (overview.priorityDist.length) {
      sheets.push({
        name: "Priority Distribution",
        columns: [
          { key: "label", header: "Priority", width: 20 },
          { key: "count", header: "Count", width: 12 },
        ],
        rows: overview.priorityDist.map((d) => ({ label: d.label, count: d.count })),
      });
    }
    if (overview.created.length) sheets.push(namedCountSheet("Tickets Created", overview.created));
    if (overview.resolved.length) sheets.push(namedCountSheet("Tickets Resolved", overview.resolved));
    if (overview.workload.length) sheets.push(namedCountSheet("Open Workload", overview.workload));
    if (overview.projectTickets.length) {
      sheets.push({
        name: "Tickets by Project",
        columns: [
          { key: "project", header: "Project", width: 30 },
          { key: "open", header: "Open", width: 10 },
          { key: "total", header: "Total", width: 10 },
        ],
        rows: overview.projectTickets.map((p) => ({ project: p.project, open: p.open, total: p.total })),
      });
    }
    if (overview.moduleTickets.length) {
      sheets.push({
        name: "Tickets by Module",
        columns: [
          { key: "module", header: "Module", width: 30 },
          { key: "open", header: "Open", width: 10 },
          { key: "total", header: "Total", width: 10 },
        ],
        rows: overview.moduleTickets.map((m) => ({ module: m.module, open: m.open, total: m.total })),
      });
    }
    if (overview.bugResolution.length) {
      sheets.push({
        name: "Bug Resolution Speed",
        columns: [
          { key: "module", header: "Module", width: 30 },
          { key: "days", header: "Avg Days", width: 12 },
        ],
        rows: overview.bugResolution.map((b) => ({ module: b.module, days: b.days })),
      });
    }
    if (overview.commentLoad.length) {
      sheets.push({
        name: "Comment Load",
        columns: [
          { key: "module", header: "Module", width: 26 },
          { key: "least", header: "Least Commented", width: 22 },
          { key: "most", header: "Most Commented", width: 22 },
        ],
        rows: overview.commentLoad.map((c) => ({
          module: c.module,
          least: c.least ? `${c.least.humanId} (${c.least.count})` : "—",
          most: c.most ? `${c.most.humanId} (${c.most.count})` : "—",
        })),
      });
    }
  }

  const subtitleParts = [rangeLabel];
  if (scopeLabel) subtitleParts.push(scopeLabel);
  subtitleParts.push("Ticket metrics use tickets created in the selected period and current assignees. SLA met: completed without a breach; SLA missed: breached; pending: open without a breach; no SLA: no applicable policy. Each co-assignee receives credit.");
  subtitleParts.push(`Generated ${new Date().toLocaleString()}`);

  return {
    title: "SubDepartment & Reports Summary",
    subtitle: subtitleParts.join(" · "),
    sheets,
  };
}
