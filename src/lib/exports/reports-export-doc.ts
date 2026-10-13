import { PERFORMANCE_METHOD, formatPerformanceDuration } from "@/lib/reporting/user-performance";
import type { ExportDoc, ExportSheet } from "./report-doc";
import type { ReportsOverview, SubDepartmentTimeResponse } from "@/lib/api/reports";

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
    const people = overview.userPerformance;
    sheets.push({
      name: "Person Performance",
      columns: [
        { key: "name", header: "Person", width: 26 },
        { key: "rank", header: "Rank", width: 10 },
        { key: "score", header: "Score / 100", width: 12 },
        { key: "completed", header: "Completed", width: 12 },
        { key: "assigned", header: "Assigned (created)", width: 18 },
        ...["Urgent", "Critical", "High", "Medium", "Low"].map((priority) => ({ key: priority, header: priority, width: 12 })),
      ],
      rows: people.map((p) => ({ name: p.name, rank: p.rank, score: p.score, completed: p.completed, assigned: p.assigned, ...Object.fromEntries(["Urgent", "Critical", "High", "Medium", "Low"].map((priority) => [priority, p.priorities[priority] ?? 0])) })),
    });
    for (const [label, key] of [["Response SLA", "responseSla"], ["Resolution SLA", "resolutionSla"]] as const) {
      sheets.push({
        name: label,
        columns: [{ key: "name", header: "Person", width: 26 }, ...["met", "breached", "pending", "noPolicy"].map((key) => ({ key, header: key === "noPolicy" ? "No policy" : key, width: 14 }))],
        rows: people.map((person) => ({ name: person.name, ...person[key] })),
      });
    }
    sheets.push({
      name: "User Timing",
      columns: [
        { key: "name", header: "Person", width: 26 },
        { key: "reply", header: "Avg actual reply", width: 22 },
        { key: "replySamples", header: "Reply samples", width: 14 },
        { key: "completion", header: "Avg completion", width: 22 },
        { key: "completionSamples", header: "Completion samples", width: 16 },
        { key: "resolution", header: "Avg SLA resolution", width: 22 },
        { key: "slaResolutionSamples", header: "SLA samples", width: 14 },
      ],
      rows: people.map((p) => ({ ...p, reply: formatPerformanceDuration(p.avgReplySecs), completion: formatPerformanceDuration(p.avgCompletionSecs), resolution: formatPerformanceDuration(p.avgSlaResolutionSecs) })),
    });
    sheets.push({
      name: "Ticket Timing Details",
      columns: [
        { key: "ticket", header: "Ticket", width: 16, pdf: true },
        { key: "title", header: "Title", width: 36 },
        { key: "people", header: "People", width: 24, pdf: true },
        { key: "priority", header: "Priority", width: 12, pdf: true },
        { key: "completedAt", header: "Completed at (UTC)", width: 28 },
        { key: "repliedAt", header: "First reply at (UTC)", width: 28 },
        { key: "responseSla", header: "Response SLA", width: 16, pdf: true },
        { key: "resolutionSla", header: "Resolution SLA", width: 16, pdf: true },
        { key: "reply", header: "Reply time", width: 22, pdf: true },
        { key: "completion", header: "Completion time", width: 22, pdf: true },
        { key: "resolution", header: "SLA resolution time", width: 22, pdf: true },
        { key: "replySecs", header: "Reply seconds", width: 18 },
        { key: "completionSecs", header: "Completion seconds", width: 18 },
        { key: "slaResolutionSecs", header: "SLA resolution seconds", width: 20 },
      ],
      rows: overview.performanceDetails.map((t) => ({ ...t, reply: formatPerformanceDuration(t.replySecs), completion: formatPerformanceDuration(t.completionSecs), resolution: formatPerformanceDuration(t.slaResolutionSecs) })),
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
  }

  const subtitleParts = [rangeLabel];
  if (scopeLabel) subtitleParts.push(scopeLabel);
  subtitleParts.push("Source counts: created in period. Performance: completion and first response events in period, plus open SLA outcomes for tickets created in period. Current co-assignees share credit. Actual times are elapsed from creation; SLA times respect calendars and pauses.");
  subtitleParts.push(PERFORMANCE_METHOD);
  subtitleParts.push(`Generated ${new Date().toLocaleString()}`);

  return {
    title: "User Performance Report",
    subtitle: subtitleParts.join(" · "),
    sheets,
  };
}
