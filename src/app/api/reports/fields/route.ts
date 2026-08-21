import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveReportScope } from "@/lib/reporting/report-scope";

// RPT-04: list the form fields a Department Admin can group/filter a custom
// report by. Scope-bound: department admins see their own department's forms;
// Project Admins (cross-department) see every department in the active tenant.
// `file`/`richtext` fields are omitted — they aren't meaningful to group by.
export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const scope = await resolveReportScope(profile!);
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let departmentIds: string[];
  if (scope.kind === "cross_department") {
    const depts = await prisma.department.findMany({
      where: { tenantId: scope.tenantId },
      select: { id: true },
    });
    departmentIds = depts.map((d) => d.id);
  } else {
    const subs = await prisma.subDepartment.findMany({
      where: { id: { in: scope.subDepartmentIds } },
      select: { departmentId: true },
    });
    departmentIds = [...new Set(subs.map((s) => s.departmentId).filter((x): x is string => !!x))];
  }

  const forms = await prisma.intakeFormConfig.findMany({
    where: { departmentId: { in: departmentIds } },
    select: {
      name: true,
      fields: {
        where: { type: { notIn: ["file", "richtext"] } },
        orderBy: { order: "asc" },
        select: { id: true, label: true, type: true, options: true },
      },
    },
  });

  // Dedupe by field id (a field id is unique per form; different forms can share
  // labels but not ids).
  const byId = new Map<string, { id: string; label: string; type: string; options: string[]; formName: string }>();
  for (const form of forms) {
    for (const f of form.fields) {
      if (!byId.has(f.id)) {
        byId.set(f.id, { id: f.id, label: f.label, type: f.type, options: f.options, formName: form.name });
      }
    }
  }

  return NextResponse.json({ fields: [...byId.values()] });
}
