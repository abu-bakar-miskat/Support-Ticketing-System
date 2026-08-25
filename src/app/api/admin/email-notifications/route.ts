import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EMAIL_NOTIFY_KEYS,
  getEmailConfig,
  getDepartmentNotifyOverrides,
} from "@/lib/email-config";

export async function GET(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager();
  if (error) return error;

  const departmentId = request.nextUrl.searchParams.get("departmentId");
  const subDepartmentId = request.nextUrl.searchParams.get("subDepartmentId");

  if (!departmentId && profile!.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const deptScope = managerDeptScope(profile!);
  if (departmentId && deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 });
  }
  if (subDepartmentId) {
    if (!departmentId) return NextResponse.json({ error: "departmentId is required with subDepartmentId" }, { status: 400 });
    const sub = await prisma.subDepartment.findFirst({ where: { id: subDepartmentId, departmentId }, select: { id: true } });
    if (!sub) return NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 });
  }

  // The "default" is what this scope inherits: the department's effective config
  // for a sub-department, otherwise the workspace defaults.
  const baseConfig = subDepartmentId ? await getEmailConfig(departmentId) : await getEmailConfig();
  const overrides = subDepartmentId
    ? await getDepartmentNotifyOverrides(departmentId!, subDepartmentId)
    : departmentId
      ? await getDepartmentNotifyOverrides(departmentId)
      : {};

  const notifications = EMAIL_NOTIFY_KEYS.map((key) => ({
    key,
    default: baseConfig[key],
    override: departmentId || subDepartmentId ? (overrides[key] ?? null) : null,
  }));

  return NextResponse.json({ notifications });
}
