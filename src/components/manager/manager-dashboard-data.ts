import type { OverdueGroup, ReviewGroup, SubDeptGroup, JoinRequest } from "@/components/manager/attention-section";
import type { SubDepartmentSummary } from "@/components/manager/sub-departments-section";
import type { ActivityItem } from "@/components/manager/activity-today-section";
import type { MailboxSummary, SupportFormSummary } from "@/components/manager/support-channels-section";
import type { Distribution, MemberWorkload } from "@/components/manager/aggregate";

export type ManagerDashboardData = {
  managerName: string;
  departmentName: string | null;
  digest: string;
  stats: {
    overdue: number;
    worstDaysLate: number;
    review: number;
    prCount: number;
    unassigned: number;
    movedToday: number;
    requests: number;
  };
  distribution: Distribution;
  overdueGroups: OverdueGroup[];
  unassignedGroups: SubDeptGroup[];
  reviewGroups: ReviewGroup[];
  joinRequests: JoinRequest[];
  members: MemberWorkload[];
  mailboxes: MailboxSummary[];
  supportForms: SupportFormSummary[];
  canManageForms: boolean;
  subDepartments: SubDepartmentSummary[];
  activity: ActivityItem[];
  activityTotal: number;
  noSubDepartments: boolean;
};

export function emptyManagerDashboard(managerName: string): ManagerDashboardData {
  return {
    managerName,
    departmentName: null,
    digest: "Loading your department…",
    stats: {
      overdue: 0,
      worstDaysLate: 0,
      review: 0,
      prCount: 0,
      unassigned: 0,
      movedToday: 0,
      requests: 0,
    },
    distribution: { total: 0, done: 0, review: 0, active: 0, overdue: 0, todo: 0 },
    overdueGroups: [],
    unassignedGroups: [],
    reviewGroups: [],
    joinRequests: [],
    members: [],
    mailboxes: [],
    supportForms: [],
    canManageForms: false,
    subDepartments: [],
    activity: [],
    activityTotal: 0,
    noSubDepartments: false,
  };
}
