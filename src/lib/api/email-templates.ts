export type EmailTemplateOverrideDraft = {
  subject: string;
  heading: string;
  bodyHtml: string;
};

export type EmailTemplateInfo = {
  key: string;
  label: string;
  description: string;
  placeholders: string[];
  default: EmailTemplateOverrideDraft;
  override: EmailTemplateOverrideDraft | null;
};

function scopeParams(departmentId: string, subDepartmentId?: string | null): string {
  const params = new URLSearchParams({ departmentId });
  if (subDepartmentId) params.set("subDepartmentId", subDepartmentId);
  return `?${params.toString()}`;
}

export async function fetchEmailTemplates(
  departmentId: string,
  subDepartmentId?: string | null,
): Promise<EmailTemplateInfo[]> {
  const res = await fetch(`/api/admin/email-templates${scopeParams(departmentId, subDepartmentId)}`);
  if (!res.ok) throw new Error("Failed to load email templates");
  const data = await res.json();
  return data.templates;
}

export async function saveEmailTemplate(
  key: string,
  draft: EmailTemplateOverrideDraft,
  departmentId: string,
  subDepartmentId?: string | null,
) {
  const res = await fetch(`/api/admin/email-templates/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...draft, departmentId, ...(subDepartmentId ? { subDepartmentId } : {}) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to save template");
  }
}

export async function resetEmailTemplate(key: string, departmentId: string, subDepartmentId?: string | null) {
  const res = await fetch(`/api/admin/email-templates/${key}${scopeParams(departmentId, subDepartmentId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to reset template");
}

export async function previewEmailTemplate(
  key: string,
  draft: Partial<EmailTemplateOverrideDraft>,
  departmentId: string,
  subDepartmentId?: string | null,
): Promise<{ subject: string; html: string }> {
  const res = await fetch("/api/admin/email-templates/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      ...draft,
      departmentId,
      ...(subDepartmentId ? { subDepartmentId } : {}),
    }),
  });
  if (!res.ok) throw new Error("Failed to render preview");
  return res.json();
}
