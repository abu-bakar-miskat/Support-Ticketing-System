export type EmailNotificationInfo = {
  key: string;
  default: boolean;
  override: boolean | null;
};

function scopeParams(departmentId?: string | null, subDepartmentId?: string | null): string {
  const params = new URLSearchParams();
  if (departmentId) params.set("departmentId", departmentId);
  if (subDepartmentId) params.set("subDepartmentId", subDepartmentId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchEmailNotifications(
  departmentId?: string | null,
  subDepartmentId?: string | null,
): Promise<EmailNotificationInfo[]> {
  const res = await fetch(`/api/admin/email-notifications${scopeParams(departmentId, subDepartmentId)}`);
  if (!res.ok) throw new Error("Failed to load email notification settings");
  const data = await res.json();
  return data.notifications;
}

export async function setEmailNotificationOverride(
  key: string,
  value: boolean,
  departmentId: string,
  subDepartmentId?: string | null,
) {
  const res = await fetch(`/api/admin/email-notifications/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, departmentId, ...(subDepartmentId ? { subDepartmentId } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to update notification setting");
  }
}

export async function resetEmailNotificationOverride(
  key: string,
  departmentId: string,
  subDepartmentId?: string | null,
) {
  const res = await fetch(`/api/admin/email-notifications/${key}${scopeParams(departmentId, subDepartmentId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to reset notification setting");
}

export type EmailIdentityInfo = {
  defaultFromName: string;
  defaultFromEmail: string;
  overrideFromName: string | null;
  overrideFromEmail: string | null;
};

export async function fetchEmailIdentity(
  departmentId?: string | null,
  subDepartmentId?: string | null,
): Promise<EmailIdentityInfo> {
  const res = await fetch(`/api/admin/email-identity${scopeParams(departmentId, subDepartmentId)}`);
  if (!res.ok) throw new Error("Failed to load email identity settings");
  return res.json();
}

/** Saves only the field(s) present in `fields` — omit a key to leave it untouched. */
export async function setEmailIdentity(
  fields: { fromName?: string; fromEmail?: string },
  departmentId: string,
  subDepartmentId?: string | null,
) {
  const res = await fetch("/api/admin/email-identity", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...fields, departmentId, ...(subDepartmentId ? { subDepartmentId } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to update email identity");
  }
}

export type DomainStatusInfo = {
  domain: string | null;
  status:
    | "verified"
    | "pending"
    | "failed"
    | "not_started"
    | "partially_verified"
    | "partially_failed"
    | "unknown"
    | "not_configured";
};

export async function checkDomainStatus(email: string): Promise<DomainStatusInfo> {
  const res = await fetch(`/api/admin/email-identity/domain-status?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error("Failed to check domain status");
  return res.json();
}

export type EmailBrandingInfo = {
  defaults: {
    brandColor: string;
    headerColor: string;
    logoUrl: string;
    footerText: string;
  };
  override: {
    brandColor: string | null;
    headerColor: string | null;
    logoUrl: string | null;
    footerText: string | null;
  };
  hasOverride: boolean;
};

export async function fetchEmailBranding(
  departmentId: string,
  subDepartmentId?: string | null,
): Promise<EmailBrandingInfo> {
  const res = await fetch(`/api/admin/email-branding${scopeParams(departmentId, subDepartmentId)}`);
  if (!res.ok) throw new Error("Failed to load email branding");
  return res.json();
}

export async function setEmailBranding(
  departmentId: string,
  branding: {
    brandColor: string;
    headerColor: string;
    logoUrl: string;
    footerText: string;
  },
  subDepartmentId?: string | null,
) {
  const res = await fetch("/api/admin/email-branding", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...branding, departmentId, ...(subDepartmentId ? { subDepartmentId } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to update email branding");
  }
}

export async function resetEmailBranding(departmentId: string, subDepartmentId?: string | null) {
  const res = await fetch(`/api/admin/email-branding${scopeParams(departmentId, subDepartmentId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to reset email branding");
}
