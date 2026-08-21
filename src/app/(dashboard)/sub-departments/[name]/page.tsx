import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getSubDepartmentAboutData } from "@/lib/sub-department-access";
import { SubDepartmentAbout } from "@/components/sub-departments/sub-department-about";

export const metadata = { title: "About Sub Department — Support Ticketing System" };

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const { name } = await params;
  const subDepartment = await getSubDepartmentAboutData(decodeURIComponent(name), profile);
  if (!subDepartment) notFound();

  return <SubDepartmentAbout subDepartment={subDepartment} />;
}
