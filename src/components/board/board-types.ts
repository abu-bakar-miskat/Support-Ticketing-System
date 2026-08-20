// Client-safe shared types for board/task surfaces fed by real ticket data.

export type UiPriority = "urgent" | "critical" | "high" | "medium" | "low"

export const UI_PRIORITIES: UiPriority[] = ["urgent", "critical", "high", "medium", "low"]

export const UI_TO_DB_PRIORITY: Record<UiPriority, string> = {
  urgent: "Urgent",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

const DB_TO_UI_PRIORITY: Record<string, UiPriority> = {
  Urgent: "urgent",
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
}

export function uiPriorityFromDb(priority: string): UiPriority {
  return DB_TO_UI_PRIORITY[priority] ?? "medium"
}

/** Pulse urgent/critical priority on open workflow statuses. */
export function shouldPulseCriticalPriority(priority: UiPriority, status: string): boolean {
  if (priority !== "critical" && priority !== "urgent") return false
  const normalized = normalizeStatus(status)
  return normalized === "In Progress" || normalized === "To Do"
}

export type PriorityStyle = {
  dot: string
  pillBg: string
  pillText: string
  label: string
}

export const UI_PRIORITY_DOT_HEX: Record<UiPriority, string> = {
  urgent: "#ff4500",
  critical: "#dc2626",
  high: "#f97316",
  medium: "#ec4899",
  low: "#94a3b8",
}

export const UI_PRIORITY_STYLE: Record<UiPriority, PriorityStyle> = {
  urgent: {
    dot: "bg-[#ff4500]",
    pillBg: "bg-[#fff1ec] dark:bg-[#40200f]",
    pillText: "text-[#dd3300] dark:text-[#ff9466]",
    label: "Urgent",
  },
  critical: {
    dot: "bg-[#dc2626]",
    pillBg: "bg-pen-red-tint dark:bg-[#3a2220]",
    pillText: "text-[#b91c1c] dark:text-[#fca5a5]",
    label: "Critical",
  },
  high: {
    dot: "bg-[#f97316]",
    pillBg: "bg-[#fff7ed] dark:bg-[#3a2818]",
    pillText: "text-[#c2410c] dark:text-[#fdba74]",
    label: "High",
  },
  medium: {
    dot: "bg-[#ec4899]",
    pillBg: "bg-[#fdf2f8] dark:bg-[#3a1c2c]",
    pillText: "text-[#be185d] dark:text-[#f9a8d4]",
    label: "Medium",
  },
  low: {
    dot: "bg-[#94a3b8]",
    pillBg: "bg-[#f1f5f9] dark:bg-[#2a2e36]",
    pillText: "text-[#64748b] dark:text-[#94a3b8]",
    label: "Low",
  },
}

export type UiStatus = string

export const UI_STATUSES: UiStatus[] = [
  "To Do",
  "In Progress",
  "Pull Request",
  "Live",
  "Blocked",
]

export const CANONICAL_STATUSES = [
  "To Do",
  "In Progress",
  "Pull Request",
  "Live",
  "Blocked",
] as const

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number]

const STATUS_ALIASES: Record<string, CanonicalStatus> = {
  // legacy canonical name
  "Not Started": "To Do",
  // todo variants
  Backlog: "To Do",
  Queue: "To Do",
  Queued: "To Do",
  Pending: "To Do",
  Todo: "To Do",
  Open: "To Do",
  New: "To Do",
  // in-progress variants
  InProgress: "In Progress",
  Working: "In Progress",
  Active: "In Progress",
  Ongoing: "In Progress",
  Doing: "In Progress",
  "In Dev": "In Progress",
  Development: "In Progress",
  Started: "In Progress",
  // review/pr variants
  PullRequest: "Pull Request",
  "In Review": "Pull Request",
  Review: "Pull Request",
  "Code Review": "Pull Request",
  Testing: "Pull Request",
  QA: "Pull Request",
  "In Testing": "Pull Request",
  // complete variants
  Done: "Live",
  Completed: "Live",
  Closed: "Live",
  Shipped: "Live",
  Resolved: "Live",
  Released: "Live",
  // underscore/lowercase variants
  not_started: "To Do",
  backlog: "To Do",
  in_progress: "In Progress",
  pull_request: "Pull Request",
  live: "Live",
  blocked: "Blocked",
  // New default status labels (uppercase) → canonical buckets. ESCALATED/PAUSED
  // have no distinct canonical, so they collapse to "Blocked" (non-active,
  // non-complete); RESOLVED is the complete bucket.
  OPEN: "To Do",
  "IN PROGRESS": "In Progress",
  PAUSED: "Blocked",
  ESCALATED: "Blocked",
  RESOLVED: "Live",
}

/** Map legacy DB / API values to the canonical display label. */
export function normalizeStatus(status: string): CanonicalStatus {
  if ((CANONICAL_STATUSES as readonly string[]).includes(status)) {
    return status as CanonicalStatus
  }
  return STATUS_ALIASES[status] ?? "To Do"
}

export function statusLabel(status: string): string {
  return normalizeStatus(status)
}

export function statusDotColor(status: string): string {
  return UI_STATUS_DOT[normalizeStatus(status)]
}

export const UI_STATUS_DOT: Record<CanonicalStatus, string> = {
  "To Do": "#94a3b8",
  "In Progress": "#0a76b9",
  "Pull Request": "#7c3aed",
  Live: "#16a34a",
  Blocked: "#dc2626",
}

export type SubDepartmentStatusConfig = {
  id: string
  label: string
  color: string
  order: number
  isComplete?: boolean
  allowedLabels?: string[]
}

export const DEFAULT_STATUSES: SubDepartmentStatusConfig[] = [
  { id: "open",        label: "OPEN",        color: "#94a3b8", order: 0, isComplete: false },
  { id: "in-progress", label: "IN PROGRESS", color: "#0a76b9", order: 1, isComplete: false },
  { id: "paused",      label: "PAUSED",      color: "#f59e0b", order: 2, isComplete: false },
  { id: "escalated",   label: "ESCALATED",   color: "#dc2626", order: 3, isComplete: false },
  { id: "resolved",    label: "RESOLVED",    color: "#16a34a", order: 4, isComplete: true },
]

export type SubCardData = {
  dbId: string
  humanId: string
  title: string
  status: string
  /** True when the sub-ticket's status is flagged complete on its team. */
  done: boolean
  priority: UiPriority
  assigneeId: string | null
  assigneeName: string | null
  avatarColor: string | null
  assigneeAvatarUrl?: string | null
  startDateIso: string | null
  dueDateIso: string | null
}

export type BoardCardData = {
  dbId: string
  humanId: string
  title: string
  priority: UiPriority
  status: string
  subDepartment: string
  subDepartmentId: string
  project: string
  projectId: string
  projectKind: string
  projectColor: string | null
  projectAvatarUrl?: string | null
  moduleId: string | null
  moduleName: string | null
  labels: string[]
  comments: number
  messages: number
  attachments: number
  subDone: number
  subTotal: number
  subTicketCards: SubCardData[]
  assigneeId: string | null
  assigneeName: string | null
  avatarColor: string | null
  assigneeAvatarUrl?: string | null
  coAssignees: { id: string; name: string; color: string; avatarUrl?: string | null }[]
  qaAssignees: { id: string; name: string; color: string; avatarUrl?: string | null }[]
  creatorId: string
  creatorName: string
  creatorAvatarUrl?: string | null
  time: string | null
  totalLoggedSecs: number
  /** Current user's logged seconds on this ticket (excludes subtasks). */
  userLoggedSecs: number
  /** Estimated time in minutes. */
  estimatedTime: number | null
  startDate: string | null
  startDateIso: string | null
  due: string | null
  dueDateIso: string | null
  dueUrgent: boolean
  dueOverdue: boolean
  /** All assignees' personal target dates (yyyy-MM-dd), for the target-date filter. */
  targetDateIsos: string[]
  createdIso: string
  hasIntake: boolean
  isComplete: boolean
  lastMessageDirection: "inbound" | "outbound" | null
}

export type SubDepartmentBoardGroup = {
  subDepartmentId: string
  subDepartmentName: string
  cards: BoardCardData[]
  statuses: SubDepartmentStatusConfig[]
}

export type StatusStyle = {
  dot: string
  pillBg: string
  pillText: string
  filterBg: string
  filterText: string
  filterCount: string
  filterActiveBg: string
  filterActiveBorder: string
  filterActiveText: string
}

export function statusStyle(status: string): StatusStyle {
  return UI_STATUS_STYLE[normalizeStatus(status)]
}

export const UI_STATUS_STYLE: Record<CanonicalStatus, StatusStyle> = {
  "To Do": {
    dot: "bg-[#94a3b8]",
    pillBg: "bg-[#f1f5f9] dark:bg-[#2a2e36]",
    pillText: "text-[#64748b] dark:text-[#94a3b8]",
    filterBg: "bg-[#f1f5f9] dark:bg-[#2a2e36]",
    filterText: "text-[#64748b] dark:text-[#94a3b8]",
    filterCount: "text-[#94a3b8] dark:text-[#64748b]",
    filterActiveBg: "bg-[#e2e8f0] dark:bg-[#343a44]",
    filterActiveBorder: "border-[#94a3b8]/45 dark:border-[#94a3b8]/55",
    filterActiveText: "text-[#475569] dark:text-[#cbd5e1]",
  },
  "In Progress": {
    dot: "bg-pen-blue",
    pillBg: "bg-pen-blue-tint dark:bg-[#1a3444]",
    pillText: "text-[#0369a1] dark:text-[#7dd3fc]",
    filterBg: "bg-pen-blue-tint dark:bg-[#1a3444]",
    filterText: "text-[#0369a1] dark:text-[#7dd3fc]",
    filterCount: "text-[#0369a1]/70 dark:text-[#7dd3fc]/70",
    filterActiveBg: "bg-pen-blue-tint dark:bg-[#1f3d50]",
    filterActiveBorder: "border-pen-blue/40 dark:border-[#7dd3fc]/40",
    filterActiveText: "text-[#0369a1] dark:text-[#7dd3fc]",
  },
  "Pull Request": {
    dot: "bg-pen-purple",
    pillBg: "bg-pen-purple-tint dark:bg-[#2a2440]",
    pillText: "text-[#6d28d9] dark:text-[#c4b5fd]",
    filterBg: "bg-pen-purple-tint dark:bg-[#2a2440]",
    filterText: "text-[#6d28d9] dark:text-[#c4b5fd]",
    filterCount: "text-[#6d28d9]/70 dark:text-[#c4b5fd]/70",
    filterActiveBg: "bg-pen-purple-tint dark:bg-[#322a4a]",
    filterActiveBorder: "border-pen-purple/40 dark:border-[#c4b5fd]/40",
    filterActiveText: "text-[#6d28d9] dark:text-[#c4b5fd]",
  },
  Live: {
    dot: "bg-pen-green",
    pillBg: "bg-pen-green-tint dark:bg-[#152a20]",
    pillText: "text-[#15803d] dark:text-[#6ee7a0]",
    filterBg: "bg-pen-green-tint dark:bg-[#152a20]",
    filterText: "text-[#15803d] dark:text-[#6ee7a0]",
    filterCount: "text-[#15803d]/70 dark:text-[#6ee7a0]/70",
    filterActiveBg: "bg-pen-green-tint dark:bg-[#1a3328]",
    filterActiveBorder: "border-pen-green/40 dark:border-[#6ee7a0]/40",
    filterActiveText: "text-[#15803d] dark:text-[#6ee7a0]",
  },
  Blocked: {
    dot: "bg-pen-red",
    pillBg: "bg-pen-red-tint dark:bg-[#3a2220]",
    pillText: "text-[#b91c1c] dark:text-[#fca5a5]",
    filterBg: "bg-pen-red-tint dark:bg-[#3a2220]",
    filterText: "text-[#b91c1c] dark:text-[#fca5a5]",
    filterCount: "text-[#b91c1c]/70 dark:text-[#fca5a5]/70",
    filterActiveBg: "bg-pen-red-tint dark:bg-[#442828]",
    filterActiveBorder: "border-pen-red/40 dark:border-[#fca5a5]/40",
    filterActiveText: "text-[#b91c1c] dark:text-[#fca5a5]",
  },
}

export type LabelStyle = {
  dot: string
  bg: string
  text: string
}

const LABEL_STYLES: LabelStyle[] = [
  {
    dot: "#0a76b9",
    bg: "bg-pen-blue-tint dark:bg-[#1a3444]",
    text: "text-[#0369a1] dark:text-[#7dd3fc]",
  },
  {
    dot: "#16a34a",
    bg: "bg-pen-green-tint dark:bg-[#152a20]",
    text: "text-[#15803d] dark:text-[#6ee7a0]",
  },
  {
    dot: "#ea580c",
    bg: "bg-[#fff7ed] dark:bg-[#3a2818]",
    text: "text-[#c2410c] dark:text-[#fdba74]",
  },
  {
    dot: "#dc2626",
    bg: "bg-pen-red-tint dark:bg-[#3a2220]",
    text: "text-[#b91c1c] dark:text-[#fca5a5]",
  },
  {
    dot: "#7c3aed",
    bg: "bg-pen-purple-tint dark:bg-[#2a2440]",
    text: "text-[#6d28d9] dark:text-[#c4b5fd]",
  },
  {
    dot: "#0891b2",
    bg: "bg-[#ecfeff] dark:bg-[#143038]",
    text: "text-[#0e7490] dark:text-[#67e8f9]",
  },
  {
    dot: "#d97706",
    bg: "bg-[#fffbeb] dark:bg-[#3a3018]",
    text: "text-[#b45309] dark:text-[#fcd34d]",
  },
]

function labelHash(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0
  return Math.abs(hash)
}

export function labelStyle(label: string): LabelStyle {
  return LABEL_STYLES[labelHash(label) % LABEL_STYLES.length]
}

/** Accent dot color — prefer `labelStyle` for full pill styling. */
export function labelColor(label: string): string {
  return labelStyle(label).dot
}

/** Format seconds into "1h 30m", "45m", "2h" etc. Returns null for 0. */
export function formatLoggedTime(secs: number): string | null {
  if (secs <= 0) return null
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** Format estimated minutes into "1h 30m", "45m", etc. Returns null when unset. */
export function formatEstimatedTime(mins: number | null | undefined): string | null {
  if (mins == null || mins <= 0) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** Task list TIME column: "38m / 2h", "— / 1h", or "38m" when no estimate. */
export function formatTaskTimeDisplay(
  loggedSecs: number,
  estimatedMins: number | null | undefined,
): string {
  const logged = formatLoggedTime(loggedSecs)
  const estimated = formatEstimatedTime(estimatedMins)
  if (logged && estimated) return `${logged} / ${estimated}`
  if (logged) return logged
  if (estimated) return `— / ${estimated}`
  return "—"
}
