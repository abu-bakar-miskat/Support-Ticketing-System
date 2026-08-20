import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { prisma } from "@/lib/db"
import { CalendarView } from "@/components/calendar/calendar-view"

export const metadata = { title: "Calendar — Support Ticketing System" }
export const dynamic = "force-dynamic"

export default async function CalendarPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const deptScope = await getProfileDeptScope(profile)
  if (!deptScope) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="pen-text-page-title">Select a department</h1>
          <p className="mt-2 font-sans text-[13px] text-pen-muted">
            The calendar is department-specific. Choose a department from the sidebar to see its
            holidays and team availability.
          </p>
        </div>
      </div>
    )
  }

  const department = await prisma.department.findUnique({
    where: { id: deptScope.activeDeptId },
    select: { name: true },
  })

  return (
    <CalendarView deptId={deptScope.activeDeptId} deptName={department?.name ?? "Department"} />
  )
}
