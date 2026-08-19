"use client";

import { UserCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AvatarVisual } from "@/components/ui/user-avatar";

type PlatformProfilePageProps = {
  name: string;
  email: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
};

export function PlatformProfilePage({
  name,
  email,
  avatarUrl,
  isSuperAdmin,
}: PlatformProfilePageProps) {
  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={UserCircle}
          title="My profile"
          description="Your account details for the platform area."
        />

        <div className="mt-6 max-w-md rounded-xl border border-pen-id/30 bg-pen-card px-5 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <AvatarVisual name={name} avatarUrl={avatarUrl} size={48} />
            <div className="min-w-0">
              <p className="truncate font-sans text-sm font-semibold text-pen-foreground">
                {name}
              </p>
              <p className="truncate font-sans text-[12.5px] text-pen-subtle">
                {email}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-pen-id/20 pt-4">
            <span className="font-sans text-[12.5px] text-pen-subtle">Access level</span>
            <span className="rounded-sm bg-pen-blue/15 px-1.5 py-px font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-blue">
              {isSuperAdmin ? "Super admin" : "Tenant admin"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
