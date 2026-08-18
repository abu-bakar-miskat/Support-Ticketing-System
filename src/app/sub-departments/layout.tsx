import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"

export default async function SubDepartmentsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  return <>{children}</>
}
