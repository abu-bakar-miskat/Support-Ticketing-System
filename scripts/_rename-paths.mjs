import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  "grep -rEl \"team\" src scripts --include='*.ts' --include='*.tsx'",
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !f.includes("src/generated"));

// Literal, order-sensitive replacements for URL paths + import specifiers.
const literals = [
  ["/api/active-team", "/api/active-sub-department"],
  ["/api/admin/teams", "/api/admin/sub-departments"],
  ["/api/reports/team-time", "/api/reports/sub-department-time"],
  ["/api/teams", "/api/sub-departments"],
  ["/settings/teams", "/settings/sub-departments"],
  ["@/components/settings/settings-teams-page", "@/components/settings/settings-sub-departments-page"],
  ["@/components/teams/teams-discovery-page", "@/components/sub-departments/sub-departments-discovery-page"],
  ["@/components/manager/team-today-section", "@/components/manager/sub-department-today-section"],
  ["@/components/time/team-time-page", "@/components/time/sub-department-time-page"],
  ["@/hooks/queries/sync-team-status-caches", "@/hooks/queries/sync-sub-department-status-caches"],
  ["@/hooks/queries/use-team-statuses", "@/hooks/queries/use-sub-department-statuses"],
  ["@/lib/api/teams", "@/lib/api/sub-departments"],
  ["@/lib/team-manage", "@/lib/sub-department-manage"],
];

let changed = 0;
for (const file of files) {
  let src = readFileSync(file, "utf8");
  const before = src;
  for (const [from, to] of literals) src = src.split(from).join(to);
  // Standalone app page route "/teams" (quoted or backticked, end or subpath).
  src = src.replace(/(["'`])\/teams(?=["'`\/])/g, "$1/sub-departments");
  if (src !== before) {
    writeFileSync(file, src);
    changed++;
  }
}
console.log(`paths updated in ${changed} files`);
