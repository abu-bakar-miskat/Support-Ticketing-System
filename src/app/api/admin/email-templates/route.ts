import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import {
  EMAIL_TEMPLATE_KEYS,
  getWorkspaceTemplateOverrides,
  getDepartmentTemplateOverrides,
} from "@/lib/email-config";
import { DEFAULT_TEMPLATES } from "@/lib/email-templates/defaults";

export async function GET(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");
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

  // "default" = what this department falls back to if its override is cleared
  // (workspace override if any, otherwise the built-in template).
  const workspaceOverrides = await getWorkspaceTemplateOverrides();
  const departmentOverrides = await getDepartmentTemplateOverrides(departmentId);

  const templates = EMAIL_TEMPLATE_KEYS.map((key) => {
    const builtIn = {
      subject: DEFAULT_TEMPLATES[key].subject,
      heading: DEFAULT_TEMPLATES[key].heading,
      bodyHtml: DEFAULT_TEMPLATES[key].bodyHtml,
    };
    const inheritedDefault = { ...builtIn, ...workspaceOverrides[key] };
    const override = departmentOverrides[key] ?? null;
    return {
      key,
      label: DEFAULT_TEMPLATES[key].label,
      description: DEFAULT_TEMPLATES[key].description,
      placeholders: DEFAULT_TEMPLATES[key].placeholders,
      default: inheritedDefault,
      override,
    };
  });

  return NextResponse.json({ templates });
}
