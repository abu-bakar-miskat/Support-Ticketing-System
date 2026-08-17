import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import {
  EMAIL_NOTIFY_KEYS,
  getEmailConfig,
  getDepartmentNotifyOverrides,
} from "@/lib/email-config";

export async function GET(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");

  if (!departmentId && profile!.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const deptScope = managerDeptScope(profile!);
  if (departmentId && deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 });
  }

  const workspaceConfig = await getEmailConfig();
  const overrides = departmentId ? await getDepartmentNotifyOverrides(departmentId) : {};

  const notifications = EMAIL_NOTIFY_KEYS.map((key) => ({
    key,
    default: workspaceConfig[key],
    override: departmentId ? (overrides[key] ?? null) : null,
  }));

  return NextResponse.json({ notifications });
}
