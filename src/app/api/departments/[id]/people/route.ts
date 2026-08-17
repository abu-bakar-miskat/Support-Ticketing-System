import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { departmentIdInScope } from "@/lib/dept-scope";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id: departmentId } = await params;
  // Admins may create projects in any department, so they must be able to load
  // any department's people for the member picker — even while a specific
  // department is active in their session scope.
  if (profile.role !== "admin" && !(await departmentIdInScope(profile, departmentId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const people = await fetchProjectDepartmentPeople(departmentId);
  return NextResponse.json({ people });
}
