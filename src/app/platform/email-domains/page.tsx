import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { listProjectManagedDomains } from "@/lib/platform-email-domains";
import { PlatformEmailDomains } from "@/components/platform/platform-email-domains";

export const dynamic = "force-dynamic";

export const metadata = { title: "Email domains — Global Support Portal" };

export default async function PlatformEmailDomainsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.isSuperAdmin) redirect("/");

  const result = await listProjectManagedDomains();
  const domains = "error" in result ? [] : result;
  const loadError = "error" in result ? result.error : null;

  return <PlatformEmailDomains initialDomains={domains} loadError={loadError} />;
}
