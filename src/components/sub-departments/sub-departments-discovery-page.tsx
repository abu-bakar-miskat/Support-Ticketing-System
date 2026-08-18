"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DepartmentIcon } from "@/components/icons/department-icon"
import { DepartmentIconVisual } from "@/components/icons/department-icon-visual"
import { CheckCircle2, Clock, LogIn } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/ui/page-header"

type Department = {
  id: string
  name: string
  teamCount: number
  memberCount: number
  isPending: boolean
  isMember: boolean
}

export function DepartmentsDiscoveryPage({
  departments,
  userName,
}: {
  departments: Department[]
  userName: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState<Set<string>>(
    new Set(departments.filter((d) => d.isPending).map((d) => d.id)),
  )
  const [loading, setLoading] = useState<string | null>(null)

  async function requestJoin(departmentId: string) {
    setLoading(departmentId)
    try {
      const res = await fetch(`/api/departments/${departmentId}/join-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setPending((prev) => new Set([...prev, departmentId]))
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-pen-background p-6">
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title={`Welcome, ${userName}`}
          icon={DepartmentIcon}
          iconClassName="text-pen-blue"
          description="Request to join a department. A manager will review and assign you to a team."
          className="mb-8"
        />

        <div className="flex flex-col gap-3">
          {departments.map((dept) => {
            const isMember = dept.isMember
            const isPending = pending.has(dept.id)
            const isLoading = loading === dept.id

            return (
              <div
                key={dept.id}
                className={cn(
                  "pen-glass-panel flex items-center gap-4 rounded-xl border p-4",
                  isMember && "border-pen-green/30 bg-pen-green/5",
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-pen-blue-tint">
                  <DepartmentIconVisual
                    name={dept.name}
                    id={dept.id}
                    size="lg"
                    className="text-pen-id"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="pen-text-card-title">
                    {dept.name}
                  </p>
                  <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
                    {dept.teamCount} team{dept.teamCount !== 1 ? "s" : ""} · {dept.memberCount} member{dept.memberCount !== 1 ? "s" : ""}
                  </p>
                </div>

                {isMember ? (
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="flex items-center gap-1.5 rounded-lg bg-pen-green px-3 py-1.5 font-sans text-[12px] font-medium text-white"
                  >
                    <LogIn className="size-3.5" />
                    Go to Dashboard
                  </button>
                ) : isPending ? (
                  <span className="flex items-center gap-1.5 rounded-lg bg-pen-blue-tint px-3 py-1.5 font-sans text-[12px] text-pen-id">
                    <Clock className="size-3.5" />
                    Pending
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void requestJoin(dept.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-pen-id px-3 py-1.5 font-sans text-[12px] font-medium text-white disabled:opacity-60"
                  >
                    {isLoading ? (
                      <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    Request to Join
                  </button>
                )}
              </div>
            )
          })}

          {departments.length === 0 && (
            <div className="rounded-xl border border-pen-card-border p-8 text-center">
              <p className="font-sans text-sm text-pen-subtle">No departments available yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
