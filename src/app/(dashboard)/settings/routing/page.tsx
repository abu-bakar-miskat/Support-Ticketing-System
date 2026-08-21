import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import {
  SettingsRoutingRulesPage,
  type RoutingRule,
} from "@/components/settings/settings-routing-rules-page";

export const metadata = { title: "Routing rules — Support Ticketing System" };

const CONDITION_LABELS: Record<string, string> = {
  subject_contains: "subject contains",
  from_domain: "sender domain",
  body_contains: "body contains",
  otherwise: "otherwise",
};

const SUB_DEPARTMENT_DOT_CLASSES = [
  "bg-[#1ba0e2]",
  "bg-[#7c3aed]",
  "bg-[#0a76b9]",
  "bg-[#16a34a]",
  "bg-[#c2410c]",
];

const UNASSIGNED_DOT_CLASS = "bg-[#94a3b8]";

export default async function SettingsRoutingRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Only admins can manage routing rules
  if (profile.role !== "admin") redirect("/settings");

  // Scope to the active tenant via the rule's team. (Team-less catch-all rules
  // have no tenant link and would need a RoutingRule.tenantId to isolate fully.)
  const tenantId = profile.activeTenantId ?? "__no_tenant__";
  const dbRules = await prisma.routingRule.findMany({
    where: { subDepartment: { tenantId } },
    orderBy: { position: "asc" },
    include: { subDepartment: { select: { name: true } } },
  });

  const subDepartmentDotClasses = new Map<string, string>();
  const rules: RoutingRule[] = dbRules.map((rule, index) => {
    const subDepartmentName = rule.subDepartment?.name ?? "Unassigned";
    if (rule.subDepartment && !subDepartmentDotClasses.has(subDepartmentName)) {
      subDepartmentDotClasses.set(
        subDepartmentName,
        SUB_DEPARTMENT_DOT_CLASSES[subDepartmentDotClasses.size % SUB_DEPARTMENT_DOT_CLASSES.length],
      );
    }
    return {
      id: rule.id,
      index: index + 1,
      conditionType:
        CONDITION_LABELS[rule.conditionType] ??
        rule.conditionType.replaceAll("_", " "),
      conditionValue: rule.conditionValue,
      subDepartment: subDepartmentName,
      subDepartmentDotClassName: subDepartmentDotClasses.get(subDepartmentName) ?? UNASSIGNED_DOT_CLASS,
      priority: rule.priority,
      enabled: rule.enabled,
    };
  });

  return <SettingsRoutingRulesPage rules={rules} />;
}
