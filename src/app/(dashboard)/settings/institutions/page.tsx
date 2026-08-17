import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import {
  SettingsInstitutionsPage,
  type InstitutionRow,
} from "@/components/settings/settings-institutions-page";

export const metadata = { title: "Institutions — Ticketing System" };

const INSTITUTION_COLORS = [
  "#0a76b9",
  "#7c3aed",
  "#16a34a",
  "#c2410c",
  "#1ba0e2",
];

export default async function SettingsInstitutionsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Only admins can manage institutions
  if (profile.role !== "admin") redirect("/settings");

  const dbInstitutions = await prisma.institution.findMany({
    orderBy: { createdAt: "asc" },
  });

  const institutions: InstitutionRow[] = dbInstitutions.map(
    (institution, index) => ({
      id: institution.id,
      name: institution.name,
      color: INSTITUTION_COLORS[index % INSTITUTION_COLORS.length],
      domain: institution.domain,
      students: "—",
      status: institution.active ? "live" : "onboarding",
    }),
  );

  return <SettingsInstitutionsPage institutions={institutions} />;
}
