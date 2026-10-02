import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { ensureDefaultFeatureTemplates, listSavedFeatures } from "@/lib/saved-features";
import { FeatureBoardsAdmin } from "@/components/platform/feature-boards-admin";

export const dynamic = "force-dynamic";

export default async function FeatureBoardsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.isSuperAdmin) redirect("/");

  await ensureDefaultFeatureTemplates(profile.id);
  const saved = await listSavedFeatures();

  return <FeatureBoardsAdmin saved={saved} />;
}
