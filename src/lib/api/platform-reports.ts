export type OrganizationMetrics = {
  created: number
  completed: number
  openCreated: number
  slaMet: number
  slaBreached: number
  slaPending: number
  noPolicy: number
  avgCompletionSecs: number | null
  completionSamples: number
}

export type OrganizationReportRow = OrganizationMetrics & {
  id: string
  name: string
  tenantId: string
  tenantName: string
  departmentId?: string
  departmentName?: string
}

export type PlatformReportsResponse = {
  summary: OrganizationMetrics
  tenants: { id: string; name: string }[]
  departments: { id: string; name: string; tenantId: string }[]
  subDepartments: { id: string; name: string; tenantId: string; departmentId: string }[]
  tenantReports: OrganizationReportRow[]
  departmentReports: OrganizationReportRow[]
  subDepartmentReports: OrganizationReportRow[]
}

export type PlatformTenantCard = {
  logoUrl?: string | null
  id: string
  name: string
  type: string
  status: string
  ticketCount: number
  departmentCount: number
  subDepartmentCount: number
}

export type PlatformTenantCardsResponse = {
  mode: "tenants"
  tenants: PlatformTenantCard[]
}

export type PlatformReportsResult = PlatformTenantCardsResponse | (PlatformReportsResponse & { mode: "tenant" })
