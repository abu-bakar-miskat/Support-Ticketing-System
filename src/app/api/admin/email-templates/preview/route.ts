import { NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import { EMAIL_TEMPLATE_KEYS, type EmailTemplateKey, brandingFrom, getEmailConfig } from "@/lib/email-config";
import { DEFAULT_TEMPLATES } from "@/lib/email-templates/defaults";
import { applyPlaceholders, layout, normalizeTemplateBodyHtml } from "@/lib/email-templates/_shared";

function isTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === "string" ? body.key : "";
  if (!isTemplateKey(key)) {
    return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  }

  const departmentId =
    typeof body?.departmentId === "string" && body.departmentId.trim()
      ? body.departmentId.trim()
      : null;
  if (!departmentId) {
    return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  }
  const deptScope = managerDeptScope(profile!);
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json(
      { error: "Forbidden: department is outside your scope" },
      { status: 403 },
    );
  }
  const subDepartmentId =
    typeof body?.subDepartmentId === "string" && body.subDepartmentId.trim()
      ? body.subDepartmentId.trim()
      : null;

  const def = DEFAULT_TEMPLATES[key];
  const subject = typeof body?.subject === "string" && body.subject.trim() ? body.subject : def.subject;
  const heading = typeof body?.heading === "string" && body.heading.trim() ? body.heading : def.heading;
  const bodyHtml = typeof body?.bodyHtml === "string" && body.bodyHtml.trim() ? body.bodyHtml : def.bodyHtml;

  const config = await getEmailConfig(departmentId, subDepartmentId);
  const branding = brandingFrom(config);

  const renderedSubject = applyPlaceholders(subject, def.sample);
  const renderedHeading = applyPlaceholders(heading, def.sample);
  const renderedBody = normalizeTemplateBodyHtml(
    applyPlaceholders(bodyHtml, def.sample),
    branding,
  );

  const html = layout({
    heading: renderedHeading,
    bodyHtml: renderedBody,
    preheader: renderedSubject,
    branding,
  });

  return NextResponse.json({ subject: renderedSubject, html });
}
