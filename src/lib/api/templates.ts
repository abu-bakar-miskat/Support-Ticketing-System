export interface TicketTemplate {
  id: string
  name: string
  customFields: any[]
  createdBy: {
    id: string
    name: string
    email: string
  }
  createdAt: string
  updatedAt?: string
}

export interface CreateTemplateBody {
  name: string
  customFields?: any[]
}

export async function getTemplates(): Promise<TicketTemplate[]> {
  const response = await fetch("/api/templates");
  if (!response.ok) throw new Error("Failed to fetch templates");
  return response.json();
}

export async function createTemplate(body: CreateTemplateBody): Promise<TicketTemplate> {
  const response = await fetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create template");
  }
  return response.json();
}

export async function updateTemplate(
  id: string,
  body: Partial<CreateTemplateBody>,
): Promise<TicketTemplate> {
  const response = await fetch(`/api/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update template");
  }
  return response.json();
}

export async function deleteTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/templates/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete template");
  }
}
